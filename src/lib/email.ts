import { Resend } from 'resend'

import { env } from '@/lib/env'
import { firmarBaja } from '@/lib/invitacion'
import { NOMBRE_PAGINA } from '@/lib/constantes'
import { formatArs } from '@/lib/dinero'
import { formatearFechaLarga } from '@/lib/fechas'
import { logger } from '@/lib/logger'

/**
 * Envío de emails.
 *
 * Nota: este archivo NO lleva `import 'server-only'`.
 *
 * Parece que debería, pero `server-only` rompe el build cuando el módulo es
 * importado por una Server Action, que Next.js trata como frontera de cliente
 * aunque el código corra en el servidor. La protección real viene de que este
 * módulo nunca se importa desde un componente cliente: la única forma de
 * llegar a la API key es a través de una action, y las actions no se ejecutan
 * en el navegador.
 */

const resend = new Resend(env.RESEND_API_KEY)

type ResultadoEnvio =
  | { ok: true; id: string }
  | { ok: false; error: string }

/**
 * Envía un email y devuelve error explícito.
 *
 * Nunca tira: el flujo de alta tiene que poder seguir aunque Resend esté
 * caído, y un error de email no debería impedir que alguien registre su
 * perfil.
 */
async function enviar(params: {
  to: string
  subject: string
  html: string
  text: string
  adjuntos?: { nombre: string; contenido: Uint8Array }[]
}): Promise<ResultadoEnvio> {
  /**
   * Modo mock para desarrollo y verificación.
   *
   * Sin esto, correr el script de verificación manda emails reales a las
   * direcciones de prueba y consume cuota de Resend. La bandera es explícita y
   * no depende de `NODE_ENV` porque el script corre en desarrollo pero el
   * webhook de producción tiene que mandar de verdad.
   */
  if (process.env.EMAIL_MOCK === '1') {
    return { ok: true, id: 'mock-email' }
  }

  try {
    const respuesta = await resend.emails.send({
      from: env.emailFrom,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
      ...(params.adjuntos?.length
        ? {
            attachments: params.adjuntos.map((adjunto) => ({
              filename: adjunto.nombre,
              content: Buffer.from(adjunto.contenido),
            })),
          }
        : {}),
    })

    if (respuesta.error) {
      return { ok: false, error: respuesta.error.message }
    }

    return { ok: true, id: respuesta.data?.id ?? '' }
  } catch (error: unknown) {
    const mensaje = error instanceof Error ? error.message : 'Error desconocido'

    // Con `logger` y no con `console.error` a pelo: el logger redacta el email
    // del destinatario y el cuerpo del error de Resend, que puede venir con el
    // destinatario adentro. `tests/reglas-proyecto.test.ts` obliga a pasar por
    // acá.
    logger.error('email: fallo al enviar', {
      error,
      motivo: mensaje,
      plantilla: params.subject,
    })

    return { ok: false, error: mensaje }
  }
}

/**
 * Plantilla base.
 *
 * Un solo lugar para el esqueleto evita que cada email se vea distinto. El
 * estilo es inline a propósito: muchos clientes de email ignoran `<style>` en
 * el `<head>`, y un email que llega sin estilos es un email que no se lee.
 */
function plantilla(titulo: string, contenido: string): string {
  return `<!DOCTYPE html>
<html lang="es-AR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titulo}</title>
</head>
<body style="margin:0;padding:0;background:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0A0A0A;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFFFFF;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;border:3px solid #0A0A0A;">
          <tr>
            <td style="background:#0A0A0A;padding:16px 24px;">
              <span style="color:#FFFFFF;font-size:18px;font-weight:900;text-transform:uppercase;letter-spacing:-0.5px;">${NOMBRE_PAGINA}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 24px;">
              <h1 style="margin:0 0 20px;font-size:26px;line-height:1.1;font-weight:900;text-transform:uppercase;">${titulo}</h1>
              ${contenido}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px;border-top:2px solid #0A0A0A;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#6B6B6B;">
                Recibís este email porque creaste una cuenta en ${NOMBRE_PAGINA}.
                <br>PoliserviciosNOA es un intermediario: no prestamos servicios ni respondemos por el trabajo de los profesionales.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/**
 * Email de verificación de cuenta.
 *
 * El enlace lo genera Auth.js con su propio token; acá solo se arma el texto
 * y se delega el envío a `sendVerificationRequest` de la config.
 */
export async function enviarEmailVerificacion(params: {
  email: string
  nombre: string
  token?: string
  url?: string
}): Promise<ResultadoEnvio> {
  const { nombre, email, token, url } = params

  // Si Auth.js ya calculó la URL y el token, se respetan: es la misma que usa
  // internamente y así el enlace de la app y el del email no se divergen.
  const enlace = url ?? `${env.NEXTAUTH_URL}/api/auth/verify-email?token=${token ?? ''}`

  return enviar({
    to: email,
    subject: 'Verificá tu email',
    html: plantilla(
      'Verificá tu email',
      `<p style="margin:0 0 24px;font-size:16px;line-height:1.6;">Hola ${nombre}, tocá el botón para confirmar tu email. Sin verificar no podés entrar al panel.</p>
       <a href="${enlace}" style="display:inline-block;background:#0A0A0A;color:#FFFFFF;text-decoration:none;padding:14px 24px;font-size:15px;font-weight:700;text-transform:uppercase;border:3px solid #0A0A0A;">Verificar email</a>
       <p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#6B6B6B;">Si no lo hacés, tu perfil no puede publicarse.</p>`,
    ),
    text: `Verificá tu email haciendo clic en este enlace: ${enlace}`,
  })
}

/**
 * Email de pago acreditado.
 *
 * Es el único email que confirma que la suscripción arrancó. El monto y la
 * fecha salen de la base y del formateador, nunca escritos en la plantilla: el
 * día que cambie el precio, este texto no puede quedar viejo.
 */
export async function enviarEmailPagoAprobado(params: {
  email: string
  nombre: string
  monto: number
  periodoHasta: Date
}): Promise<ResultadoEnvio> {
  const { email, nombre, monto, periodoHasta } = params
  const importe = formatArs(monto)
  const hasta = formatearFechaLarga(periodoHasta)

  return enviar({
    to: email,
    subject: 'Pago acreditado: tu suscripción está activa',
    html: plantilla(
      'Pago acreditado',
      `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Hola ${nombre}, recibimos tu pago de <strong>${importe}</strong>.</p>
       <p style="margin:0 0 24px;font-size:16px;line-height:1.6;">Tu suscripción está activa hasta el <strong>${hasta}</strong>. El próximo cobro se hace automáticamente con la tarjeta que registraste.</p>
       <a href="${env.NEXTAUTH_URL}/panel" style="display:inline-block;background:#0A0A0A;color:#FFFFFF;text-decoration:none;padding:14px 24px;font-size:15px;font-weight:700;text-transform:uppercase;border:3px solid #0A0A0A;">Ir al panel</a>
       <p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#6B6B6B;">Si no reconocés este pago, respondé este email.</p>`,
    ),
    text: `Hola ${nombre}: recibimos tu pago de ${importe}. Tu suscripción está activa hasta el ${hasta}.`,
  })
}

/**
 * Email con el comprobante fiscal adjunto.
 *
 * El PDF se genera al vuelo desde la base (ver `generarPdfDeFactura`), no se
 * guarda en ningún storage. Es la misma decisión que el resto del proyecto:
 * nada de infraestructura que el cliente tenga que pagar o mantener.
 */
export async function enviarEmailFactura(params: {
  email: string
  nombre: string
  tipoComprobante: string
  puntoVenta: number
  numero: number
  cae: string
  total: number
  archivoNombre: string
  archivoPdf: Uint8Array
}): Promise<ResultadoEnvio> {
  const { email, nombre, tipoComprobante, puntoVenta, numero, cae, total } = params
  const comprobante = `${tipoComprobante} ${String(puntoVenta).padStart(4, '0')}-${String(numero).padStart(8, '0')}`
  const importe = formatArs(total)

  return enviar({
    to: email,
    subject: `Tu comprobante ${comprobante}`,
    html: plantilla(
      'Tu comprobante',
      `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Hola ${nombre}, emitimos el comprobante de tu pago de <strong>${importe}</strong>.</p>
       <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Comprobante <strong>${comprobante}</strong><br>CAE <strong>${cae}</strong></p>
       <p style="margin:0 0 24px;font-size:16px;line-height:1.6;">Lo adjuntamos en PDF. También podés descargarlo desde tu panel cuando quieras.</p>
       <a href="${env.NEXTAUTH_URL}/panel/suscripcion" style="display:inline-block;background:#0A0A0A;color:#FFFFFF;text-decoration:none;padding:14px 24px;font-size:15px;font-weight:700;text-transform:uppercase;border:3px solid #0A0A0A;">Ver mis pagos</a>`,
    ),
    text: `Hola ${nombre}: emitimos el comprobante ${comprobante} por ${importe}. CAE ${cae}. El PDF va adjunto.`,
    adjuntos: [{ nombre: params.archivoNombre, contenido: params.archivoPdf }],
  })
}

/**
 * Confirmación de baja.
 *
 * Dice explícitamente hasta cuándo sigue visible el perfil. Es la única parte
 * que el profesional necesita para no volver a escribir: "me dieron de baja" y
 * "desaparecí de la búsqueda el mismo día" son dos cosas distintas, y la
 * segunda es la que genera el reclamo.
 */
export async function enviarEmailBaja(params: {
  email: string
  nombre: string
  tramite: string
  visibleHasta: Date | null
}): Promise<ResultadoEnvio> {
  const { email, nombre, tramite, visibleHasta } = params
  const hasta = visibleHasta ? formatearFechaLarga(visibleHasta) : null

  const detalle = hasta
    ? `Tu perfil sigue visible hasta el <strong>${hasta}</strong>. Después de esa fecha deja de aparecer en las búsquedas, pero tus datos, fotos e historial quedan guardados.`
    : 'Tu perfil deja de aparecer en las búsquedas. Tus datos, fotos e historial quedan guardados.'

  return enviar({
    to: email,
    subject: 'Confirmamos tu baja',
    html: plantilla(
      'Confirmamos tu baja',
      `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Hola ${nombre}, registramos tu baja. No se te va a cobrar nada más de forma automática.</p>
       <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">${detalle}</p>
       <p style="margin:0 0 24px;font-size:16px;line-height:1.6;">Número de trámite: <strong>${tramite}</strong></p>
       <p style="margin:0;font-size:14px;line-height:1.6;color:#6B6B6B;">Si no pediste esta baja, respondé este email y lo revisamos.</p>`,
    ),
    text: `Hola ${nombre}: registramos tu baja. ${hasta ? `Tu perfil sigue visible hasta el ${hasta}.` : 'Tu perfil deja de aparecer en las búsquedas.'} Número de trámite: ${tramite}.`,
  })
}

/**
 * Constancia de arrepentimiento.
 *
 * Incluye el número de trámite, el monto devuelto y la fecha en que la pasarela
 * registró el reembolso. Es el comprobante que el profesional puede mostrar si
 * el dinero no aparece en su resumen.
 */
export async function enviarEmailArrepentimiento(params: {
  email: string
  nombre: string
  tramite: string
  monto: number
  reembolsadoEn: Date
}): Promise<ResultadoEnvio> {
  const { email, nombre, tramite, monto, reembolsadoEn } = params
  const importe = formatArs(monto)
  const fecha = formatearFechaLarga(reembolsadoEn)

  return enviar({
    to: email,
    subject: 'Confirmamos tu arrepentimiento y el reembolso',
    html: plantilla(
      'Arrepentimiento confirmado',
      `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Hola ${nombre}, registramos tu arrepentimiento y devolvimos <strong>${importe}</strong>.</p>
       <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Mercado Pago registró el reembolso el <strong>${fecha}</strong>. Según el medio de pago, puede tardar algunos días hábiles en verse en tu resumen.</p>
       <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Tu perfil quedó despublicado y el comprobante fiscal fue anulado con una nota de crédito.</p>
       <p style="margin:0 0 24px;font-size:16px;line-height:1.6;">Número de trámite: <strong>${tramite}</strong></p>
       <p style="margin:0;font-size:14px;line-height:1.6;color:#6B6B6B;">Guardá este email como constancia. Si el reembolso no aparece en los próximos días hábiles, respondé este mensaje con el número de trámite.</p>`,
    ),
    text: `Hola ${nombre}: registramos tu arrepentimiento y devolvimos ${importe}. Mercado Pago registró el reembolso el ${fecha}. Tu perfil quedó despublicado y el comprobante fiscal fue anulado. Número de trámite: ${tramite}.`,
  })
}

/** Aviso previo al vencimiento del período pagado. */
export async function enviarEmailAvisoVencimiento(params: {
  email: string
  nombre: string
  precio: string
  vence: Date
  dias: number
}): Promise<ResultadoEnvio> {
  const { email, nombre, precio, vence, dias } = params
  const fecha = formatearFechaLarga(vence)
  const titulo = dias <= 2 ? 'Tu perfil vence en 2 días' : `Tu perfil vence en ${dias} días`

  return enviar({
    to: email,
    subject: titulo,
    html: plantilla(
      titulo,
      `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Hola ${nombre}, tu suscripción vence el <strong>${fecha}</strong>.</p>
       <p style="margin:0 0 24px;font-size:16px;line-height:1.6;">Si la renovación automática sigue activa, no tenés que hacer nada: se cobra ${precio} con la tarjeta que registraste. Si la cancelaste, podés volver a activarla desde tu panel.</p>
       <a href="${env.NEXTAUTH_URL}/panel/suscripcion" style="display:inline-block;background:#0A0A0A;color:#FFFFFF;text-decoration:none;padding:14px 24px;font-size:15px;font-weight:700;text-transform:uppercase;border:3px solid #0A0A0A;">Ver mi suscripción</a>`,
    ),
    text: `Hola ${nombre}: tu suscripción vence el ${fecha}. Si la renovación automática sigue activa, se cobra ${precio} con la tarjeta registrada. Podés verla en ${env.NEXTAUTH_URL}/panel/suscripcion`,
  })
}

/**
 * Aviso interno de una queja nueva.
 *
 * Va al contacto del proveedor, no al reclamante. El texto del reclamo se
 * incluye tal cual porque es lo que hay que leer para responder; no se loguea
 * en ningún otro lado.
 */
export async function enviarEmailReclamo(params: {
  nombre: string
  email: string
  telefono: string | null
  referencia: string | null
  mensaje: string
  numero: string
}): Promise<ResultadoEnvio> {
  const { nombre, email, telefono, referencia, mensaje, numero } = params

  return enviar({
    to: env.contactEmail,
    subject: `Libro de quejas: ${numero}`,
    html: plantilla(
      'Nueva queja',
      `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Entró un reclamo por el libro de quejas.</p>
       <p style="margin:0 0 8px;font-size:15px;line-height:1.6;"><strong>Número:</strong> ${numero}</p>
       <p style="margin:0 0 8px;font-size:15px;line-height:1.6;"><strong>Nombre:</strong> ${nombre}</p>
       <p style="margin:0 0 8px;font-size:15px;line-height:1.6;"><strong>Email:</strong> ${email}</p>
       <p style="margin:0 0 8px;font-size:15px;line-height:1.6;"><strong>Teléfono:</strong> ${telefono ?? '-'}</p>
       <p style="margin:0 0 24px;font-size:15px;line-height:1.6;"><strong>Referencia:</strong> ${referencia ?? '-'}</p>
       <div style="border:3px solid #0A0A0A;padding:16px;font-size:15px;line-height:1.6;white-space:pre-wrap;">${escaparHtml(mensaje)}</div>`,
    ),
    text: `Nueva queja ${numero}\nNombre: ${nombre}\nEmail: ${email}\nTeléfono: ${telefono ?? '-'}\nReferencia: ${referencia ?? '-'}\n\n${mensaje}`,
  })
}

/**
 * Escapa el texto libre antes de meterlo en el HTML del email.
 *
 * El mensaje lo escribe cualquiera: sin esto, un `<script>` en el reclamo se
 * ejecuta en el cliente de correo de quien lo lee. Los campos del sistema no se
 * escapan porque no vienen del usuario.
 */
function escaparHtml(texto: string): string {
  return texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** Aviso de perfil despublicado por suscripción vencida. */
export async function enviarEmailPerfilDespublicado(params: {
  email: string
  nombre: string
  precio: string | null
}): Promise<ResultadoEnvio> {
  const { email, nombre, precio } = params
  const comoReactivar = precio
    ? `Podés reactivarlo cuando quieras por ${precio}.`
    : 'Podés reactivarlo cuando quieras desde tu panel.'

  return enviar({
    to: email,
    subject: 'Tu perfil fue despublicado',
    html: plantilla(
      'Tu perfil fue despublicado',
      `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Hola ${nombre}, tu suscripción terminó y tu perfil dejó de aparecer en las búsquedas.</p>
       <p style="margin:0 0 24px;font-size:16px;line-height:1.6;">Tus datos, fotos e historial siguen guardados. ${comoReactivar}</p>
       <a href="${env.NEXTAUTH_URL}/panel/suscripcion" style="display:inline-block;background:#0A0A0A;color:#FFFFFF;text-decoration:none;padding:14px 24px;font-size:15px;font-weight:700;text-transform:uppercase;border:3px solid #0A0A0A;">Reactivar mi perfil</a>`,
    ),
    text: `Hola ${nombre}: tu suscripción terminó y tu perfil dejó de aparecer en las búsquedas. Tus datos siguen guardados. ${comoReactivar} ${env.NEXTAUTH_URL}/panel/suscripcion`,
  })
}

/**
 * Invitación a valorar a un profesional tras un contacto por WhatsApp.
 *
 * El botón lleva al perfil público; como ya pasaron más de 48 h desde el
 * contacto, el corazón llega habilitado para votar. El enlace de baja va
 * firmado para que nadie pueda darse de baja en nombre de otro cliente.
 */
export async function enviarInvitacionVotar(params: {
  email: string
  nombre: string
  nombreProfesional: string
  slug: string
  clientId: string
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { email, nombre, nombreProfesional, slug, clientId } = params

  const sig = firmarBaja(clientId)
  const enlaceVotar = `${env.NEXTAUTH_URL}/p/${slug}`
  const enlaceBaja = `${env.NEXTAUTH_URL}/api/invitacion/dar-de-baja?clientId=${clientId}&sig=${sig}`

  return enviar({
    to: email,
    subject: `¿Contrataste a ${nombreProfesional}? Contanos cómo te fue`,
    html: plantilla(
      `¿Contrataste a ${nombreProfesional}?`,
      `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Hola ${nombre}, te contactaste por WhatsApp con <strong>${nombreProfesional}</strong>. ¿Te gustaría dejar tu corazón de confianza?</p>
       <p style="margin:0 0 24px;font-size:16px;line-height:1.6;">Tu valoración ayuda a otros clientes de ${NOMBRE_PAGINA} a elegir al profesional adecuado.</p>
       <a href="${enlaceVotar}" style="display:inline-block;background:#0A0A0A;color:#FFFFFF;text-decoration:none;padding:14px 24px;font-size:15px;font-weight:700;text-transform:uppercase;border:3px solid #0A0A0A;">Sí, quiero dejar mi corazón</a>
       <p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#6B6B6B;">
         No querés recibir más invitaciones? <a href="${enlaceBaja}" style="color:#0A0A0A;text-decoration:underline;font-weight:700;">Dar de baja las invitaciones</a>
       </p>`,
    ),
    text: `Hola ${nombre}: te contactaste con ${nombreProfesional}. ¿Querés dejar tu corazón de confianza? Votá acá: ${enlaceVotar}. No querés más invitaciones: ${enlaceBaja}`,
  })
}

/**
 * Notifica al profesional que recibió un reclamo.
 *
 * No revela datos del cliente: solo el motivo, el número de trámite y que
 * puede responder una vez dentro de los 5 días hábiles.
 */
export async function enviarEmailNotificacionReclamo(params: {
  email: string
  nombre: string
  tramite: string
  motivo: string
}): Promise<ResultadoEnvio> {
  const { email, nombre, tramite, motivo } = params

  return enviar({
    to: email,
    subject: `Nuevo reclamo (trámite ${tramite})`,
    html: plantilla(
      `Nuevo reclamo (trámite ${tramite})`,
      `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Hola ${nombre}, recibiste un reclamo de un cliente.</p>
       <p style="margin:0 0 8px;font-size:15px;line-height:1.6;"><strong>Motivo:</strong> ${motivo}</p>
       <p style="margin:0 0 8px;font-size:15px;line-height:1.6;"><strong>Número de trámite:</strong> ${tramite}</p>
       <p style="margin:0 0 24px;font-size:16px;line-height:1.6;">Podés responder una vez dentro de los 5 días hábiles desde tu panel. El cliente no ve tus datos personales.</p>
       <a href="${env.NEXTAUTH_URL}/panel" style="display:inline-block;background:#0A0A0A;color:#FFFFFF;text-decoration:none;padding:14px 24px;font-size:15px;font-weight:700;text-transform:uppercase;border:3px solid #0A0A0A;">Ir al panel</a>`,
    ),
    text: `Hola ${nombre}: recibiste un reclamo (trámite ${tramite}). Motivo: ${motivo}. Podés responder desde tu panel en ${env.NEXTAUTH_URL}/panel`,
  })
}

/**
 * Advertencia por email cuando se acumulan 2 reclamos validados en 90 días.
 */
export async function enviarEmailAdvertenciaReclamos(params: {
  email: string
  nombre: string
  cantidad: number
}): Promise<ResultadoEnvio> {
  const { email, nombre, cantidad } = params

  return enviar({
    to: email,
    subject: `Advertencia: ${cantidad} reclamos validados`,
    html: plantilla(
      `Advertencia: ${cantidad} reclamos validados`,
      `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Hola ${nombre}, se validaron <strong>${cantidad} reclamos</strong> contra tu perfil en los últimos 90 días.</p>
       <p style="margin:0 0 24px;font-size:16px;line-height:1.6;">Si llegás a 3 reclamos validados en ese período, tu perfil será suspendido y quedará a revisión del administrador.</p>
       <a href="${env.NEXTAUTH_URL}/panel" style="display:inline-block;background:#0A0A0A;color:#FFFFFF;text-decoration:none;padding:14px 24px;font-size:15px;font-weight:700;text-transform:uppercase;border:3px solid #0A0A0A;">Ir al panel</a>`,
    ),
    text: `Hola ${nombre}: se validaron ${cantidad} reclamos contra tu perfil en los últimos 90 días. Llegando a 3, tu perfil será suspendido.`,
  })
}

/**
 * Notifica la suspensión preventiva por 3 reclamos validados en 90 días.
 */
export async function enviarEmailSuspensionReclamos(params: {
  email: string
  nombre: string
  perfilId: string
  motivo: string
}): Promise<ResultadoEnvio> {
  const { email, nombre, motivo } = params

  return enviar({
    to: email,
    subject: 'Tu perfil fue suspendido por reclamos',
    html: plantilla(
      'Tu perfil fue suspendido',
      `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Hola ${nombre}, tu perfil fue suspendido tras acumular 3 reclamos validados en 90 días.</p>
       <p style="margin:0 0 8px;font-size:15px;line-height:1.6;"><strong>Motivo:</strong> ${motivo}</p>
       <p style="margin:0 0 24px;font-size:16px;line-height:1.6;">Tu perfil dejó de aparecer en las búsquedas y queda a revisión del administrador. Escribinos si creés que es un error.</p>
       <p style="margin:0;font-size:14px;line-height:1.6;color:#6B6B6B;">${env.contactEmail}</p>`,
    ),
    text: `Hola ${nombre}: tu perfil fue suspendido tras acumular 3 reclamos validados en 90 días. Motivo: ${motivo}. Escribinos a ${env.contactEmail}.`,
  })
}

/**
 * Confirmación de apertura de ticket de soporte.
 *
 * Va al email con el que se abrió el ticket, aunque no haya sesión. El número
 * de trámite es lo único que el cliente necesita para seguir su reclamo.
 */
export async function enviarEmailConfirmacionTicket(params: {
  email: string
  nombre: string
  tramite: string
  categoria: string
}): Promise<ResultadoEnvio> {
  const { email, nombre, tramite, categoria } = params

  return enviar({
    to: email,
    subject: `Ticket de soporte abierto (trámite ${tramite})`,
    html: plantilla(
      `Ticket de soporte (trámite ${tramite})`,
      `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Hola ${nombre}, registramos tu ticket.</p>
       <p style="margin:0 0 8px;font-size:15px;line-height:1.6;"><strong>Categoría:</strong> ${categoria}</p>
       <p style="margin:0 0 8px;font-size:15px;line-height:1.6;"><strong>Número de trámite:</strong> ${tramite}</p>
       <p style="margin:0 0 24px;font-size:16px;line-height:1.6;">Te respondemos por email a esta misma dirección. Guardá el número de trámite: lo necesitas para hacer seguimiento.</p>
       <p style="margin:0;font-size:14px;line-height:1.6;color:#6B6B6B;">Centro de ayuda: ${env.NEXTAUTH_URL}/ayuda</p>`,
    ),
    text: `Hola ${nombre}: registramos tu ticket de soporte. Categoría: ${categoria}. Número de trámite: ${tramite}. Te respondemos por email. Centro de ayuda: ${env.NEXTAUTH_URL}/ayuda`,
  })
}

/**
 * Respuesta del equipo a un ticket.
 * Va al email del cliente con la respuesta escrita por el admin o moderador.
 */
export async function enviarEmailRespuestaTicket(params: {
  email: string
  nombre: string
  tramite: string
  mensaje: string
  autor: string
}): Promise<ResultadoEnvio> {
  const { email, nombre, tramite, mensaje, autor } = params

  return enviar({
    to: email,
    subject: `Respuesta a tu ticket (trámite ${tramite})`,
    html: plantilla(
      `Respuesta a tu ticket (trámite ${tramite})`,
      `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Hola ${nombre}, recibiste una respuesta a tu ticket.</p>
       <p style="margin:0 0 8px;font-size:15px;line-height:1.6;"><strong>Número de trámite:</strong> ${tramite}</p>
       <p style="margin:0 0 8px;font-size:15px;line-height:1.6;"><strong>Respondé por este mismo email</strong> si tenés algo para agregar.</p>
       <div style="border:3px solid #0A0A0A;padding:16px;font-size:15px;line-height:1.6;white-space:pre-wrap;">${escaparHtml(mensaje)}</div>
       <p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#6B6B6B;">Respondió: ${autor}</p>`,
    ),
    text: `Hola ${nombre}: recibiste una respuesta a tu ticket (trámite ${tramite}). Respondió: ${autor}.\n\n${mensaje}`,
  })
}

/**
 * Alerta de SLA vencido al equipo de soporte.
 *
 * El job del cron la manda cuando un ticket superó el plazo de primera
 * respuesta o de resolución sin cerrarse.
 */
export async function enviarEmailAlertaSLA(params: {
  email: string
  tipo: 'primera_respuesta' | 'resolucion'
  tickets: Array<{
    numeroTramite: string
    email: string | null
    nombre: string | null
    diasHabiles: number
    creadoEn: Date
  }>
}): Promise<ResultadoEnvio> {
  const { email, tipo, tickets } = params
  const esPrimera = tipo === 'primera_respuesta'
  const plural = tickets.length > 1

  return enviar({
    to: email,
    subject: `SLA de soporte vencido${plural ? 's' : ''} (${tickets.length} ticket${plural ? 's' : ''})`,
    html: plantilla(
      `SLA de soporte vencido${plural ? 's' : ''}`,
      `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Hola, hay ticket${plural ? 's' : ''} de soporte que superó el SLA de ${esPrimera ? 'primera respuesta' : 'resolución'}.</p>
       <ul style="margin:0 0 24px;padding-left:20px;font-size:15px;line-height:1.8;">
         ${tickets
           .map(
             (t) =>
               `<li>Trámite ${t.numeroTramite} — ${t.nombre ?? 'sin nombre'} (${t.email ?? 'sin email'}) — ${t.diasHabiles} día${t.diasHabiles !== 1 ? 's' : ''} hábil${t.diasHabiles !== 1 ? 'es' : ''}.</li>`,
           )
           .join('')}
       </ul>
       <p style="margin:0;font-size:14px;line-height:1.6;color:#6B6B6B;">Entrá a /admin/soporte para atenderlos.</p>`,
    ),
    text: `Hay ${tickets.length} ticket${plural ? 's' : ''} de soporte que superó el SLA de ${esPrimera ? 'primera respuesta' : 'resolución'}:\n${tickets.map((t) => `- Trámite ${t.numeroTramite} — ${t.nombre ?? 'sin nombre'} (${t.email ?? 'sin email'}) — ${t.diasHabiles} día hábil(es).`).join('\n')}\nEntrá a /admin/soporte para atenderlos.`,
  })
}

/**
 * Aviso de aumento de precio a los suscriptores de un plan.
 *
 * Se envía con al menos 30 días de antelación a la aplicación. Dice el monto
 * nuevo, la fecha en que empieza a cobrarse y cómo cancelar, que es lo que
 * exige la norma de defensa del consumidor en Argentina.
 */
export async function enviarEmailAvisoAumento(params: {
  email: string
  nombre: string
  plan: string
  montoAnterior: string
  montoNuevo: string
  fechaAplicacion: Date
}): Promise<ResultadoEnvio> {
  const { email, nombre, plan, montoAnterior, montoNuevo, fechaAplicacion } = params
  const fecha = formatearFechaLarga(fechaAplicacion)

  return enviar({
    to: email,
    subject: `Tu suscripción de ${plan} va a subir de precio`,
    html: plantilla(
      `Tu suscripción de ${plan} va a subir de precio`,
      `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Hola ${nombre}, te avisamos con anticipación que el precio de tu suscripción de <strong>${plan}</strong> va a aumentar.</p>
       <p style="margin:0 0 8px;font-size:15px;line-height:1.6;"><strong>Precio actual:</strong> ${montoAnterior} por mes.</p>
       <p style="margin:0 0 8px;font-size:15px;line-height:1.6;"><strong>Nuevo precio:</strong> ${montoNuevo} por mes.</p>
       <p style="margin:0 0 8px;font-size:15px;line-height:1.6;"><strong>Se aplica a partir del:</strong> ${fecha}.</p>
       <p style="margin:0 0 24px;font-size:16px;line-height:1.6;">Si no querés seguir con el nuevo precio, podés cancelar tu suscripción desde tu panel antes de esa fecha. Tu perfil seguirá visible hasta que termine el mes que ya pagaste.</p>
       <a href="${env.NEXTAUTH_URL}/panel/suscripcion" style="display:inline-block;background:#0A0A0A;color:#FFFFFF;text-decoration:none;padding:14px 24px;font-size:15px;font-weight:700;text-transform:uppercase;border:3px solid #0A0A0A;">Ver mi suscripción</a>`,
    ),
    text: `Hola ${nombre}: el precio de tu suscripción de ${plan} sube de ${montoAnterior} a ${montoNuevo} por mes a partir del ${fecha}. Si no querés seguir, cancelá desde ${env.NEXTAUTH_URL}/panel/suscripcion antes de esa fecha.`,
  })
}

/**
 * Confirma que el aumento de precio ya se aplicó a una suscripción.
 */
export async function enviarEmailAumentoAplicado(params: {
  email: string
  nombre: string
  montoNuevo: string
}): Promise<ResultadoEnvio> {
  const { email, nombre, montoNuevo } = params

  return enviar({
    to: email,
    subject: 'Tu nuevo precio ya se aplicó',
    html: plantilla(
      'Tu nuevo precio ya se aplicó',
      `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Hola ${nombre}, el nuevo precio de tu suscripción ya se aplicó.</p>
       <p style="margin:0 0 8px;font-size:15px;line-height:1.6;"><strong>Nuevo precio:</strong> ${montoNuevo} por mes.</p>
       <p style="margin:0 0 24px;font-size:16px;line-height:1.6;">Se cobrará con la tarjeta que registraste en la próxima renovación. Si tenés alguna consulta, respondé este email.</p>
       <p style="margin:0;font-size:14px;line-height:1.6;color:#6B6B6B;">${env.contactEmail}</p>`,
    ),
    text: `Hola ${nombre}: el nuevo precio de tu suscripción ya se aplicó (${montoNuevo} por mes). Se cobrará en la próxima renovación. Consultas: ${env.contactEmail}`,
  })
}

/**
 * Confirma la solicitud de supresión de cuenta.
 *
 * Va al email del titular con un enlace firmado que, al abrirse, ejecuta la
 * supresión irreversibly. Tiene 30 días de gracia para confirmar.
 */
export async function enviarEmailConfirmarSupresion(params: {
  email: string
  nombre: string
  tramite: string
  dataRequestId: string
  firma: string
}): Promise<ResultadoEnvio> {
  const { email, nombre, tramite, dataRequestId, firma } = params
  const enlace = `${env.NEXTAUTH_URL}/panel/cuenta/datos/eliminar-confirmar?request=${dataRequestId}&sig=${firma}`
  const fechaLimite = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

  return enviar({
    to: email,
    subject: `Confirmar supresión de cuenta (trámite ${tramite})`,
    html: plantilla(
      `Confirmar supresión de cuenta (trámite ${tramite})`,
      `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Hola ${nombre}, recibimos tu pedido de supresión de cuenta.</p>
       <p style="margin:0 0 8px;font-size:15px;line-height:1.6;"><strong>Número de trámite:</strong> ${tramite}</p>
       <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Si confirmás, se van a borrar o anonimizar tus datos personales: email, nombre, número de WhatsApp, fotos, votos y contactos.</p>
       <p style="margin:0 0 8px;font-size:15px;line-height:1.6;">¿Qué se conserva?</p>
       <ul style="margin:0 0 24px;padding-left:20px;font-size:15px;line-height:1.8;">
         <li>Facturas y comprobantes de pago, por el plazo fiscal exigido por ARCA.</li>
         <li>El hash de tu número de WhatsApp solo si tu perfil fue suspendido por fraude.</li>
       </ul>
       <p style="margin:0 0 8px;font-size:15px;line-height:1.6;"><strong>Tenés 30 días para confirmar.</strong> Después de eso, el pedido se rechaza y tus datos siguen intactos.</p>
       <a href="${enlace}" style="display:inline-block;background:#0A0A0A;color:#FFFFFF;text-decoration:none;padding:14px 24px;font-size:15px;font-weight:700;text-transform:uppercase;border:3px solid #0A0A0A;">Sí, borrar mi cuenta y mis datos</a>
       <p style="margin:24px 0 0;font-size:14px;line-height:1.6;color:#6B6B6B;">
         Si no pediste esta supresión, ignorá este email. Nada se borrará sin tu confirmación.
       </p>`,
    ),
    text: `Hola ${nombre}: recibimos tu pedido de supresión de cuenta (trámite ${tramite}). Para confirmar, entrá a ${enlace}. Tenés 30 días. Si no lo pediste, ignorá este email.`,
  })
}

/**
 * Constancia de que la supresión se completó.
 */
export async function enviarEmailConstanciaSupresion(params: {
  email: string
  nombre: string
  tramite: string
}): Promise<ResultadoEnvio> {
  const { email, nombre, tramite } = params

  return enviar({
    to: email,
    subject: `Cuenta suprimida (trámite ${tramite})`,
    html: plantilla(
      `Cuenta suprimida (trámite ${tramite})`,
      `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Hola ${nombre}, tu cuenta fue suprimida y tus datos personales fueron anonimizados.</p>
       <p style="margin:0 0 8px;font-size:15px;line-height:1.6;"><strong>Número de trámite:</strong> ${tramite}</p>
       <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Qué se borró:</p>
       <ul style="margin:0 0 24px;padding-left:20px;font-size:15px;line-height:1.8;">
         <li>Email, nombre y número de WhatsApp.</li>
         <li>Fotos de tu galería.</li>
         <li>Votos que dejaste y contactos que hiciste.</li>
         <li>Registros de verificación de WhatsApp.</li>
       </ul>
       <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Qué se conserva:</p>
       <ul style="margin:0 0 24px;padding-left:20px;font-size:15px;line-height:1.8;">
         <li>Facturas y comprobantes de pago, por el plazo fiscal.</li>
         <li>El hash de tu número de WhatsApp solo si tu perfil fue suspendido por fraude.</li>
       </ul>
       <p style="margin:0;font-size:14px;line-height:1.6;color:#6B6B6B;">${env.contactEmail}</p>`,
    ),
    text: `Hola ${nombre}: tu cuenta fue suprimida y tus datos personales anonimizados (trámite ${tramite}). Consultas: ${env.contactEmail}`,
  })
}


