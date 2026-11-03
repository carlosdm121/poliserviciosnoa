/**
 * Detección de bots por user-agent.
 *
 * No pretende ser perfecta: un bot que se hace pasar por Chrome pasa. Sirve
 * para lo que importa acá, que es no inflar el contador de WhatsApp con los
 * previews de WhatsApp, Telegram, Facebook y los crawlers de buscadores.
 *
 * La lista es deliberadamente corta. Un patrón demasiado agresivo (por ejemplo
 * `headless`) también matchea navegadores reales de gente con poca memoria y
 * esconde clics legítimos.
 */
const PATRONES = [
  'bot',
  'crawler',
  'spider',
  'slurp',
  'facebookexternalhit',
  'whatsapp',
  'telegrambot',
  'discordbot',
  'slackbot',
  'twitterbot',
  'linkedinbot',
  'bingpreview',
  'google-inspectiontool',
  'lighthouse',
  'pingdom',
  'uptimerobot',
  'curl/',
  'wget/',
  'python-requests',
  'go-http-client',
  'axios/',
]

/** True si el user-agent parece de un bot conocido o de un cliente HTTP. */
export function esBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false

  const normalizado = userAgent.toLowerCase()

  return PATRONES.some((patron) => normalizado.includes(patron))
}
