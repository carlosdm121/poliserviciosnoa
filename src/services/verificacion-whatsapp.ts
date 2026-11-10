import { Prisma, type WhatsAppVerification } from '@prisma/client'

import { env } from '@/lib/env'
import { encryptField } from '@/lib/db/encrypt'
import { decryptField } from '@/lib/db/encrypt'
import { extraerCodigo, generarCodigo, hashCodigo, hashTelefono } from '@/lib/hash'
import { hashValor } from '@/lib/hash'
import { logger } from '@/lib/logger'
import { enmascararTelefono, mismoTelefono, normalizarWhatsapp } from '@/lib/phone'
import { limpiarLimite, rateLimit } from '@/lib/ratelimit'
import { NOMBRE_PAGINA } from '@/lib/constantes'
import { getWhatsAppProvider } from '@/lib/whatsapp'
import { prisma } from '@/lib/prisma'
import { estaBloqueado } from '@/services/bloqueo'
import { registrarRiesgo } from '@/services/riesgo'
import { sincronizarPublicacion } from '@/services/publicacion'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

/**
 * Verificación de titularidad del número de WhatsApp.
 *
 * Reemplaza al KYC. No se pide DNI, ni foto, ni reconocimiento facial: se pide
 * que el profesional mande un código desde el número mismo. La razón está en
 * `decisions.md` D1, y es un número: el KYC costaba USD 25 por perfil contra
 * USD 10 de ingreso.
 *
 * Qué prueba esto y qué no: prueba que quien controló el número estaba ahí.
 * No prueba identidad civil. Por eso la insignia es "WhatsApp verificado" y
 * nunca "identidad verificada".
 */

/** Límites. Cambiarlos acá, no magic numbers en el código. */
const MAX_CODIGOS_POR_HORA = 5
const MAX_CODIGOS_POR_DIA = 20

/** Mensajes que se devuelven al remitente por WhatsApp. */
const MENSAJES = {
  exito: `Número verificado. Ya podés volver a ${NOMBRE_PAGINA}.`,
  /**
   * Aviso de suplantación.
   *
   * Va al mismo número que se acaba de verificar. Es la pieza que convierte la
   * verificación en un proceso de dos pasos reales: el titular del número tiene
   * una ventana para decir que no es suyo. Sin este aviso, cargar el número de
   * otra persona y pedirle que mande el código es un ataque que funciona sin
   * que nadie se entere.
   */
  suplantacion: `Se verificó este número en ${NOMBRE_PAGINA}. Si no fuiste vos, respondé NO FUI YO y lo revisamos.`,
  noFuiYo:
    `Listo, liberamos el número y avisamos a quien lo usó. Si creés que fue un error, escribinos desde tu perfil.`,
  noEncontrado:
    'No encontramos ese código. Si tenés uno vigente, reenvialo. Si no, pedilo de nuevo en el panel.',
  numeroDistinto:
    'Ese código no se puede completar desde este número. Reenvialo desde el número que cargaste en el panel.',
  yaUsado: 'Ese código ya se usó. Pedí uno nuevo desde el panel.',
  bloqueado:
    'Demasiados intentos. Pedí un código nuevo desde el panel y reintentá con tu número.',
  numeroEnOtroPerfil:
    `Ese número ya está asociado a otra cuenta de ${NOMBRE_PAGINA}. Si creés que es un error, escribinos desde tu perfil y lo revisamos.`,
  numeroBloqueado:
    `Ese número no se puede usar en ${NOMBRE_PAGINA}. Si creés que es un error, escribinos y lo revisamos.`,
} as const

/**
 * Respuesta del titular: "no fui yo".
 *
 * Se busca tolerante a propósito. Es alguien mirando un teléfono, escribiendo
 * "no fui yo", "NO SOY YO" o "no soy yo ese". Cuanto más estricto sea el
 * patrón, menos gente llega a la protección que están buscando.
 */
const ES_NO_FUI_YO = /\bNO\s+(FUI|SOY)\s+YO\b/

export type EstadoVerificacion = {
  status: WhatsAppVerification['status']
  /** Cuándo vence el código, o `null` si ya no hay código vigente. */
  expiraEn: string | null
  /** Segundos que quedan, para la cuenta regresiva de la UI. */
  restanteSegundos: number | null
  intentosRestantes: number
  /** El número que se está verificando, enmascarado. */
  telefono: string | null
}

/**
 * Genera un código nuevo y deja pendiente la verificación.
 *
 * Cancelar la verificación anterior es obligatorio, no cosmético: si quedan dos
 * PENDING y el profesional elige cuál mandar, el que respondió el otro queda
 * vivo y el número se puede verificar dos veces.
 */
export async function solicitarCodigo(
  profileId: string,
  telefonoEntrada: string,
  ip?: string,
): Promise<Resultado<{ codigo: string; expiraEn: Date; expiraEnIso: string }>> {
  const e164 = normalizarWhatsapp(telefonoEntrada)

  if (!e164) {
    logger.warn('whatsapp: número rechazado por formato inválido', {
      profileId,
      telefonoHash: hashTelefono(telefonoEntrada),
    })

    return err(
      'Ese número no parece un celular de Argentina. Revisá el código de área.',
      ERROR_CODES.VALIDACION,
    )
  }

  // El límite por perfil va primero: el de IP solo tiene sentido si el
  // primero pasó, y consume una clave de Redis.
  const porPerfil = await rateLimit(
    `wa-codigo:perfil:${profileId}`,
    MAX_CODIGOS_POR_HORA,
    3600,
  )

  if (porPerfil.limitado) {
    return err(
      `Pediste demasiados códigos. Esperá ${Math.ceil(porPerfil.restante / 60)} minutos.`,
      ERROR_CODES.RATE_LIMIT,
    )
  }

  if (ip) {
    const porIp = await rateLimit(`wa-codigo:ip:${hashTelefono(ip)}`, MAX_CODIGOS_POR_DIA, 86400)

    if (porIp.limitado) {
      return err('Demasiados códigos desde esta conexión. Probá más tarde.', ERROR_CODES.RATE_LIMIT)
    }
  }

  // Si el número ya es de otro perfil, se dice antes de crear nada.
  const duenio = await prisma.profile.findFirst({
    where: { whatsappHash: hashValor(e164), NOT: { id: profileId } },
    select: { id: true },
  })

  if (duenio) {
    return err(MENSAJES.numeroEnOtroPerfil, ERROR_CODES.DUPLICADO)
  }

  // Lista de bloqueo. Va después de normalizar, porque lo que se bloquea es el
  // hash del E.164 canónico y no sirve de nada hashear "381 15-4123456".
  const bloqueado = await estaBloqueado('WHATSAPP_HASH', e164)

  if (bloqueado) {
    logger.warn('whatsapp: número bloqueado, no se genera código', {
      profileId,
      telefono: enmascararTelefono(e164),
    })

    return err(MENSAJES.numeroBloqueado, ERROR_CODES.SIN_PERMISOS)
  }

  const codigo = generarCodigo()
  const expiraEn = new Date(Date.now() + env.whatsapp.codeMinutes * 60_000)

  // El cambio de número va antes de crear el código. Si va después y falla,
  // queda un código vivo para un número que el perfil no tiene.
  const cambio = await aplicarCambioDeNumero(profileId, e164)

  if (!cambio.ok) return err(cambio.error, cambio.code)

  await prisma.$transaction(async (tx) => {
    // Cancelar lo anterior del mismo perfil antes de crear el nuevo.
    await tx.whatsAppVerification.updateMany({
      where: { profileId, status: 'PENDING' },
      data: { status: 'CANCELED' },
    })

    await tx.whatsAppVerification.create({
      data: {
        profileId,
        phoneE164: e164,
        codeHash: hashCodigo(codigo),
        expiresAt: expiraEn,
        status: 'PENDING',
      },
    })
  })

  logger.info('whatsapp: código generado', {
    profileId,
    telefono: enmascararTelefono(e164),
    expiraEn: expiraEn.toISOString(),
  })

  return ok({ codigo, expiraEn, expiraEnIso: expiraEn.toISOString() })
}

/**
 * Si el número del perfil cambió respecto al verificado, revoca.
 *
 * Se hace fuera de la transacción de la verificación a propósito: es una
 * consecuencia del cambio de número, no de la creación del código.
 *
 * @returns `ok(null)` si no había que cambiar nada, o el error que la UI tiene
 *   que mostrar. No propaga excepciones de duplicado: son el caso esperado.
 */
async function aplicarCambioDeNumero(
  profileId: string,
  e164: string,
): Promise<Resultado<null>> {
  const perfil = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { whatsappE164: true },
  })

  if (!perfil) return ok(null)
  const whatsappActual = decryptField(perfil.whatsappE164)
  if (whatsappActual === e164) return ok(null)

  try {
    await prisma.profile.update({
      where: { id: profileId },
      data: {
        whatsappE164: encryptField(e164),
        whatsappHash: null,
        whatsappVerifiedAt: null,
      },
    })
  } catch (error: unknown) {
    // Carrera: otro perfil se apropió del número entre el chequeo previo y
    // esta actualización. Se traduce al mismo mensaje, porque el profesional
    // merece entender qué pasa en vez de ver un error genérico.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return err(MENSAJES.numeroEnOtroPerfil, ERROR_CODES.DUPLICADO)
    }

    throw error
  }

  // El perfil queda despublicado por la regla de publicación: sin WhatsApp
  // verificado no puede estar visible. Sin esta llamada seguiría publicado con
  // el número viejo, que es justo lo que D4 dice que no puede pasar.
  await sincronizarPublicacion(profileId)

  logger.info('whatsapp: número cambiado, verificación revocada', {
    profileId,
    anterior: enmascararTelefono(whatsappActual ?? ''),
    nuevo: enmascararTelefono(e164),
  })

  return ok(null)
}

/** Estado de la verificación vigente, para el polling de la UI. */
export async function obtenerEstado(profileId: string): Promise<EstadoVerificacion | null> {
  const verificacion = await prisma.whatsAppVerification.findFirst({
    where: { profileId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  })

  if (!verificacion) return null

  // Expirada por reloj: no se espera al cron para mostrarla como vencida. El
  // registro queda PENDING en la base hasta que alguien lo limpie, pero la UI
  // tiene que dejar de hacer la cuenta regresiva.
  const vencida = verificacion.expiresAt.getTime() <= Date.now()

  if (vencida) {
    await prisma.whatsAppVerification.update({
      where: { id: verificacion.id },
      data: { status: 'EXPIRED' },
    })
  }

  return {
    status: vencida ? 'EXPIRED' : verificacion.status,
    expiraEn: vencida ? null : verificacion.expiresAt.toISOString(),
    restanteSegundos: vencida
      ? null
      : Math.max(0, Math.floor((verificacion.expiresAt.getTime() - Date.now()) / 1000)),
    intentosRestantes: Math.max(0, env.whatsapp.maxAttempts - verificacion.attempts),
    telefono: enmascararTelefono(verificacion.phoneE164),
  }
}

/**
 * Procesa un mensaje de WhatsApp entrante.
 *
 * La usan el webhook real y el simulador de desarrollo. Toda la lógica está
 * acá adentro para que el simulador no pueda ejercitar un camino distinto al
 * de producción: si el simulador tuviera su propia lógica, los tests pasarían
 * y el webhook fallaría.
 *
 * @param remitente Número del remitente tal como lo entrega Meta, que a
 *   veces viene con el 9 y a veces sin él.
 * @param texto Cuerpo del mensaje.
 * @param messageId `wamid` de Meta. Es la clave de idempotencia.
 */
export async function procesarMensajeEntrante(
  remitente: string,
  texto: string,
  messageId: string,
): Promise<
  Resultado<{ accion: 'verificado' | 'ignorado' | 'bloqueado' | 'duplicado' | 'liberado' }>
> {
  // Idempotencia antes de nada. Meta reintenta el webhook si no recibe 200, y
  // sin esta guarda un reintento verifica dos veces y manda dos mensajes.
  const yaProcesado = await prisma.webhookEvent.findUnique({ where: { id: messageId } })

  if (yaProcesado) {
    logger.info('whatsapp: webhook repetido, ignorado', { messageId })
    return ok({ accion: 'duplicado' })
  }

  // "NO FUI YO" tiene que chequearse antes que el código: es el mensaje del
  // titular y no trae ningún código. Si fuera después, caería en el caso de
  // "mensaje sin código" y se descartaría.
  if (ES_NO_FUI_YO.test(texto.toUpperCase())) {
    return procesarNoFuiYo(remitente, messageId)
  }

  const codigo = extraerCodigo(texto)

  if (!codigo) {
    await registrarEvento(messageId, 'mensaje_sin_codigo')
    return ok({ accion: 'ignorado' })
  }

  const verificacion = await prisma.whatsAppVerification.findFirst({
    where: { codeHash: hashCodigo(codigo), status: 'PENDING' },
  })

  if (!verificacion) {
    // No se distingue entre "código que no existe" y "código ya usado": con el
    // mismo mensaje para los dos casos no se puede enumerar códigos probados.
    await registrarEvento(messageId, 'codigo_desconocido')
    await responder(remitente, MENSAJES.noEncontrado)
    return ok({ accion: 'ignorado' })
  }

  const vencida = verificacion.expiresAt.getTime() <= Date.now()

  if (vencida) {
    await prisma.whatsAppVerification.update({
      where: { id: verificacion.id },
      data: { status: 'EXPIRED' },
    })
    await registrarEvento(messageId, 'codigo_vencido')
    await responder(remitente, MENSAJES.noEncontrado)
    return ok({ accion: 'ignorado' })
  }

  // El remitente tiene que ser el dueño del número. Comparar contra las
  // variantes porque Meta entrega las dos formas según cómo el número quedó
  // registrado, y exigir una sola rompe con la misma frecuencia.
  if (!mismoTelefono(remitente, verificacion.phoneE164)) {
    return registrarIntentoFallido(verificacion, remitente, messageId)
  }

  const resultado = await confirmar(verificacion, messageId, remitente)

  if (!resultado.ok) {
    await responder(remitente, MENSAJES.numeroEnOtroPerfil)
    return err(resultado.error, resultado.code)
  }

  await responder(remitente, MENSAJES.exito)
  await avisarSuplantacion(remitente)

  return ok({ accion: 'verificado' })
}

/**
 * Avisa al titular que su número quedó verificado y le da salida.
 *
 * Es el paso que hace que la verificación sea de dos partes. Sin este mensaje,
 * cargar el número de otra persona y pedirle que mande el código es un ataque
 * que no deja rastro: el titular nunca se entera y el impostor publica con su
 * número.
 *
 * Va después de confirmar la verificación, y no antes: si el aviso falla, la
 * verificación ya está y avisarle después no la rompe.
 */
async function avisarSuplantacion(remitente: string): Promise<void> {
  const enviado = await responder(remitente, MENSAJES.suplantacion)

  if (!enviado) {
    logger.warn('whatsapp: no se pudo enviar el aviso de suplantación', {
      telefono: enmascararTelefono(remitente),
    })
  }
}

/**
 * El titular dice "no fui yo".
 *
 * Se busca el perfil que tiene verificado ese número, y se lo deja sin poder
 * publicar: se le borra la verificación, vuelve a `PENDING_REVIEW` y se le
 * registra la señal.
 *
 * Sobre liberar el número: el `whatsappE164` sigue asociado al perfil
 * impostor porque es único y obligatorio, así que otro profesional no puede
 * Adoptarlo tal cual. No se cambia por un número inventado porque eso rompe el
 * índice único y ensucia la base con valores falsos. La liberación real la
 * hace el administrador, que es quien puede ver el caso completo.
 */
async function procesarNoFuiYo(
  remitente: string,
  messageId: string,
): Promise<Resultado<{ accion: 'liberado' | 'ignorado' }>> {
  // Se busca por hash y no por E.164 porque Meta puede haber entregado el
  // número con el 9 o sin él, y el hash es de la forma canónica.
  const hash = hashTelefono(remitente)
  const perfil = await prisma.profile.findFirst({
    where: { whatsappHash: hash, whatsappVerifiedAt: { not: null } },
    select: { id: true },
  })

  if (!perfil) {
    // Número sin nada verificado: puede ser cualquiera que escribe. Se
    // responde igual, sin decir si ese número estaba verificado o no.
    await registrarEvento(messageId, 'no_fui_yo_sin_verificacion')
    await responder(remitente, MENSAJES.noFuiYo)

    return ok({ accion: 'ignorado' })
  }

  await prisma.$transaction(async (tx) => {
    await tx.profile.update({
      where: { id: perfil.id },
      data: {
        whatsappVerifiedAt: null,
        whatsappHash: null,
        moderationStatus: 'PENDING_REVIEW',
        moderationReason: 'El titular del número dijo que no es suyo.',
      },
    })

    await tx.webhookEvent.create({
      data: {
        id: messageId,
        provider: 'WHATSAPP',
        eventType: 'no_fui_yo',
        processedAt: new Date(),
      },
    })
  })

  await registrarRiesgo(perfil.id, 'NO_FUI_YO', { telefono: enmascararTelefono(remitente) })

  // Despublica antes de avisar. Si el resincronizado falla, el perfil queda
  // visible con un número que su dueño realGuidó como suyo.
  await sincronizarPublicacion(perfil.id)

  logger.warn('whatsapp: el titular del número dijo que no es suyo', {
    profileId: perfil.id,
    telefono: enmascararTelefono(remitente),
  })

  await responder(remitente, MENSAJES.noFuiYo)

  return ok({ accion: 'liberado' })
}

/** Suma un intento fallido y bloquea si se agotaron. */
async function registrarIntentoFallido(
  verificacion: WhatsAppVerification,
  remitente: string,
  messageId: string,
): Promise<Resultado<{ accion: 'bloqueado' | 'ignorado' }>> {
  const intentos = verificacion.attempts + 1
  const bloqueo = intentos >= env.whatsapp.maxAttempts

  await prisma.whatsAppVerification.update({
    where: { id: verificacion.id },
    data: { attempts: intentos, status: bloqueo ? 'LOCKED' : 'PENDING' },
  })

  await registrarEvento(messageId, bloqueo ? 'intentos_agotados' : 'remitente_distinto')

  logger.warn('whatsapp: código enviado desde un número que no es', {
    profileId: verificacion.profileId,
    remitente: enmascararTelefono(remitente),
    esperado: enmascararTelefono(verificacion.phoneE164),
    intentos,
  })

  await responder(remitente, bloqueo ? MENSAJES.bloqueado : MENSAJES.numeroDistinto)

  return ok({ accion: bloqueo ? 'bloqueado' : 'ignorado' })
}

/**
 * Marca la verificación como superada y escribe el hash en el perfil.
 *
 * Todo en una transacción: si el perfil se actualizara y la verificación no, el
 * código quedaría vivo y se podría reusar. Y si el hash chocara con otro
 * perfil, no queda nada a medias.
 */
async function confirmar(
  verificacion: WhatsAppVerification,
  messageId: string,
  remitente: string,
): Promise<Resultado<null>> {
  const hash = hashTelefono(verificacion.phoneE164)

  try {
    await prisma.$transaction(async (tx) => {
      await tx.whatsAppVerification.update({
        where: { id: verificacion.id },
        data: { status: 'VERIFIED', verifiedAt: new Date(), messageId },
      })

      // Solo una verificación viva por perfil: el código anterior, si había uno,
      // no puede volver a verificar.
      await tx.whatsAppVerification.updateMany({
        where: { profileId: verificacion.profileId, status: 'PENDING' },
        data: { status: 'CANCELED' },
      })

      await tx.profile.update({
        where: { id: verificacion.profileId },
        data: {
          whatsappE164: encryptField(verificacion.phoneE164),
          whatsappHash: hash,
          whatsappVerifiedAt: new Date(),
        },
      })

      // El wamid se marca acá y no después: si se escribiera fuera de la
      // transacción y el proceso se cayera en el medio, el mensaje quedaría
      // sin registrar y un reintento de Meta lo volvería a procesar.
      await tx.webhookEvent.create({
        data: {
          id: messageId,
          provider: 'WHATSAPP',
          eventType: 'verificado',
          processedAt: new Date(),
        },
      })
    })
  } catch (error: unknown) {
    // P2002 sobre whatsappHash: el número ya pertenece a otro perfil. Es el
    // caso de dos personas con el mismo número, o de alguien que intenta
    // verificar el número de otra persona.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      await prisma.whatsAppVerification.update({
        where: { id: verificacion.id },
        data: { status: 'LOCKED' },
      })

      logger.warn('whatsapp: el número ya está en otro perfil', {
        profileId: verificacion.profileId,
        telefono: enmascararTelefono(verificacion.phoneE164),
      })

      return err(MENSAJES.numeroEnOtroPerfil, ERROR_CODES.DUPLICADO)
    }

    throw error
  }

  // Fuera de la transacción: es una lectura de reglas y una escritura derivada,
  // y no tiene sentido que una caída acá revierta una verificación ya
  // confirmada. El cron lo corrige si queda desactualizada.
  await sincronizarPublicacion(verificacion.profileId)
  await limpiarLimite(`wa-codigo:perfil:${verificacion.profileId}`)

  logger.info('whatsapp: número verificado', {
    profileId: verificacion.profileId,
    telefono: enmascararTelefono(verificacion.phoneE164),
  })

  return ok(null)
}

/**
 * Verificación manual del administrador.
 *
 * Para cuando el webhook de Meta no llega: número dedicado sin configurar,
 * problema de entrega, o los primeros días antes de tener el número en regla.
 *
 * Queda en `AuditLog` con el motivo obligatorio. Sin motivo no hay verificación
 * manual: sin rastro no se puede deshacer ni auditar, y esto es exactamente el
 * tipo de puerta trasera que un admindisciplinary no deja abierta.
 */
export async function verificarManualmente(
  profileId: string,
  adminEmail: string,
  motivo: string,
): Promise<Resultado<null>> {
  if (!motivo.trim()) {
    return err('Escribí por qué se verifica a mano. Queda registrado.', ERROR_CODES.VALIDACION)
  }

  const perfil = await prisma.profile.findUnique({ where: { id: profileId } })

  if (!perfil) {
    return err('No encontramos ese perfil.', ERROR_CODES.NO_ENCONTRADO)
  }

  try {
    const whatsappActual = decryptField(perfil.whatsappE164 ?? null)
    await prisma.$transaction(async (tx) => {
      await tx.profile.update({
        where: { id: profileId },
        data: {
          whatsappHash: hashTelefono(whatsappActual ?? ''),
          whatsappVerifiedAt: new Date(),
        },
      })

      await tx.auditLog.create({
        data: {
          actorId: adminEmail,
          actorEmail: adminEmail,
          action: 'whatsapp.verificacion_manual',
          entityType: 'Profile',
          entityId: profileId,
          after: { telefono: enmascararTelefono(whatsappActual ?? ''), motivo: motivo.trim() },
        },
      })
    })
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return err(MENSAJES.numeroEnOtroPerfil, ERROR_CODES.DUPLICADO)
    }

    throw error
  }

  await sincronizarPublicacion(profileId)

  return ok(null)
}

/** Guarda el mensaje en el registro de eventos, para idempotencia y auditoría. */
async function registrarEvento(messageId: string, tipo: string): Promise<void> {
  await prisma.webhookEvent.create({
    data: { id: messageId, provider: 'WHATSAPP', eventType: tipo, processedAt: new Date() },
  })
}

/**
 * Responde al remitente.
 *
 * Un fallo acá no da vuelta lo ya verificado: el profesional va a ver el
 * estado correcto en el panel de todas formas. Perder un texto de WhatsApp es
 * un annoyance; perder la verificación porque Meta está saturado, no.
 *
 * @returns `true` si el mensaje salió.
 */
async function responder(remitente: string, cuerpo: string): Promise<boolean> {
  const resultado = await getWhatsAppProvider().enviarTexto(remitente, { cuerpo })

  if (!resultado.ok) {
    logger.warn('whatsapp: no se pudo responder al remitente', { detalle: resultado.detalle })
  }

  return resultado.ok
}