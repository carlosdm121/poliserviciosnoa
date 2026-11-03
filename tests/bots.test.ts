import { describe, expect, it } from 'vitest'

import { esBot } from '@/lib/bots'

/**
 * Detección de bots para no inflar el contador de WhatsApp.
 *
 * Los previews de WhatsApp y Telegram son los que más importan: cada vez que
 * alguien pega el link de un perfil en un chat, esos servicios lo abren para
 * armar la tarjeta. Si contaran como clic, el ranking se llenaría de perfiles
 * compartidos y no de perfiles contactados.
 */
describe('esBot', () => {
  it('detecta los previews de mensajería', () => {
    expect(esBot('WhatsApp/2.23.20.0 A')).toBe(true)
    expect(esBot('TelegramBot (like TwitterBot)')).toBe(true)
    expect(esBot('facebookexternalhit/1.1')).toBe(true)
  })

  it('detecta buscadores y clientes HTTP', () => {
    expect(esBot('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true)
    expect(esBot('curl/8.4.0')).toBe(true)
    expect(esBot('python-requests/2.31')).toBe(true)
  })

  it('no confunde un navegador real con un bot', () => {
    expect(
      esBot(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
      ),
    ).toBe(false)
    expect(esBot('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15')).toBe(false)
  })

  it('sin user-agent cuenta como visitante, no como bot', () => {
    expect(esBot(null)).toBe(false)
    expect(esBot(undefined)).toBe(false)
    expect(esBot('')).toBe(false)
  })
})
