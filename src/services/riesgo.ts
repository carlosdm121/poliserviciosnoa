import { Prisma } from '@prisma/client'

import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'

/**
 * Señales de riesgo.
 *
 * Ninguna señal bloquea por sí sola. Se acumulan y alguien las mira.
 *
 * El error clásico de este tipo de sistema es bloquear por heurística: se
 * termina echando a profesionales legítimos y el portal empieza a parecer que
 * no confía en nadie. La plataforma necesita volumen de professionals más que
 * necesita filtrar tramposos, porque un mercado chico vive de que haya gente
 * listada.
 *
 * Por eso `EMAIL_DESECHABLE` es señal y no bloqueo: un email desechable es
 * mucho más común entre aportadores sueltos que entre profesionales que se
 * registran con el email del trabajo y se les olvida.
 */

/**
 * Dominios de email desechables.
 *
 * Lista corta y a propósito. Los dominios de mail temporal rotan rápido y
 * bloquearlos todos es bloquear a cualquiera. Se agrupan los que aparecen de
 * verdad en capturas de profesionales que después no aparecen nunca.
 */
const DOMINIOS_DESEHABLES = new Set([
  '10minutemail.com',
  'dispostable.com',
  'fakeinbox.com',
  'getnada.com',
  'guerrillamail.com',
  'guerrillamail.info',
  'maildrop.cc',
  'mailinator.com',
  'mailnesia.com',
  'mintemail.com',
  'mytemp.email',
  'sharklasers.com',
  'temp-mail.org',
  'tempmail.com',
  'tempmailo.com',
  'throwawaymail.com',
  'trashmail.com',
  'yopmail.com',
])

/** Tope de señales equivalentes que se guardan por perfil. */
const MAXIMO_POR_TIPO = 10

/**
 * ¿El dominio del email es de los que se usan para throwaway?
 *
 * `dominiosExtra` son los que el administrador agregó desde el panel. Se
 * reciben como parámetro y no se leen de la base acá: esta función es pura y
 * la usan también los tests sin levantar Prisma.
 */
export function esEmailDesechable(
  email: string,
  dominiosExtra: Iterable<string> = [],
): boolean {
  const arroba = email.lastIndexOf('@')

  if (arroba < 0) return false

  const dominio = email.slice(arroba + 1).toLowerCase()
  const extra = new Set(Array.from(dominiosExtra, (item) => item.toLowerCase()))

  // mailinator.com y sus subdominios son el mismo servicio.
  const raiz = dominio.split('.').slice(-2).join('.')

  return (
    DOMINIOS_DESEHABLES.has(dominio) ||
    DOMINIOS_DESEHABLES.has(raiz) ||
    extra.has(dominio) ||
    extra.has(raiz)
  )
}

/**
 * Registra una señal.
 *
 * Nunca tira: una señal de riesgo es información de acceso, no una función
 * crítica. Si falla, el registro tiene que funcionar igual.
 *
 * @param details Contexto sin datos personales. Un ejemplo: `{ dominio:
 *   'mailinator.com' }`. **Nunca** un teléfono o un email en claro.
 */
export async function registrarRiesgo(
  profileId: string,
  type:
    | 'EMAIL_DESECHABLE'
    | 'MULTIPLES_ALTAS_MISMA_IP'
    | 'DESCRIPCION_CON_CONTACTO_EXTERNO'
    | 'NO_FUI_YO'
    | 'REPORTES_MULTIPLES'
    | 'CAMBIO_DE_CUIT_TARDIO'
    | 'CAMBIO_DE_IP_POSTERIOR_AL_ALTA'
    | 'MUCHOS_VOTOS_MISMO_CLIENTE'
    | 'VOTOS_DOMINIO_DESECHABLE',
  details?: Prisma.InputJsonValue,
): Promise<void> {
  try {
    await prisma.riskSignal.create({
      data: { profileId, type, details: details ?? undefined },
    })

    logger.info('riesgo: señal registrada', { profileId, type, details })
  } catch (error: unknown) {
    logger.error('riesgo: no se pudo registrar la señal', {
      profileId,
      type,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Señales de un perfil, con las resueltas aparte.
 *
 * Un perfil con 30 señales todas vistas es distinto de uno con dos sin
 * resolver: el volumen importa tanto como el tipo.
 */
export async function riesgosDePerfil(
  profileId: string,
): Promise<{ pendientes: number; resueltas: number; total: number }> {
  const [pendientes, resueltas] = await Promise.all([
    prisma.riskSignal.count({ where: { profileId, resolvedAt: null } }),
    prisma.riskSignal.count({ where: { profileId, resolvedAt: { not: null } } }),
  ])

  return { pendientes, resueltas, total: pendientes + resueltas }
}

/** Señales sin resolver de un perfil, para el panel de administración. */
export async function listarRiesgos(profileId: string) {
  return prisma.riskSignal.findMany({
    where: { profileId, resolvedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { id: true, type: true, details: true, createdAt: true },
  })
}

/**
 * Marca una señal como resuelta.
 *
 * No la borra: queda archivada. Una señal resuelta cuenta como antecedente si
 * el mismo perfil reincide, y sin el historial no hay forma de ver que ya se
 * le dio una oportunidad.
 */
export async function resolverRiesgo(signalId: string, resolucion: string): Promise<void> {
  await prisma.riskSignal.update({
    where: { id: signalId },
    data: { resolvedAt: new Date(), resolution: resolucion.trim() },
  })
}

/**
 * Conta altas recientes desde una misma IP.
 *
 * La IP no se guarda en claro: se hashea con el pepper y se guarda el hash. Sirve
 * para comparar cuántos registros salieron de una conexión, no para saber de
 * dónde vino, y con el pepper en `.env` el hash no se puede revertir desde la
 * base.
 *
 * Se guarda la IP hasheada en el alta, no el string de IP. Si se guardara el
 * hash en el momento de contar, dos altas distintas de la misma persona
 * generarían hashes distintos y la señal nunca saltaría.
 */
export async function registrarAltaDesdeIp(ipHash: string | null, profileId: string): Promise<void> {
  if (!ipHash) return

  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const altas = await prisma.user.count({
    where: { createdAt: { gte: desde }, signupIpHash: ipHash },
  })

  // Umbral alto a propósito. Con la verificación de WhatsApp ya hay un filtro
  // fuerte; esto solo tiene que detectar a alguien abriendo veinte cuentas en
  // un minuto, no ser el filtro principal.
  if (altas < 5) return

  await registrarRiesgo(profileId, 'MULTIPLES_ALTAS_MISMA_IP', { altas24h: altas })
}

/** Limpia señales muy viejas ya resueltas. Corre en el cron. */
export async function purgarRiesgosResueltos(dias = 180): Promise<number> {
  const { count } = await prisma.riskSignal.deleteMany({
    where: {
      resolvedAt: { not: null, lt: new Date(Date.now() - dias * 24 * 60 * 60 * 1000) },
    },
  })

  return count
}