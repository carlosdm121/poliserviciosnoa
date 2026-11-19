import { beforeEach, describe, expect, it, vi } from 'vitest'

import { enlaceWhatsApp } from '@/lib/constantes'
import { encryptField } from '@/lib/db/encrypt'

/**
 * La URL que recibe el clic del botón verde de WhatsApp.
 *
 * `whatsappE164` se guarda cifrado con AES-GCM. Si se lee en claro,
 * `.replace(/\D/g, '')` extrae los dígitos del cifrado y el enlace wa.me
 * apunta a un número inventado: WhatsApp responde "no es un número de
 * teléfono válido" y el profesional pierde el contacto.
 */

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { profile: { findFirst: mocks.findFirst } },
}))

import { registrarContacto } from '@/services/contacto'

const NUMERO = '5493814123456'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('registrarContacto', () => {
  it('redirige al número real del perfil, guardado cifrado en la base', async () => {
    mocks.findFirst.mockResolvedValue({
      id: 'p1',
      userId: 'u1',
      whatsappE164: encryptField(NUMERO),
    })

    const r = await registrarContacto({ slug: 'perfil-test', contar: false })

    if (!r.ok) throw new Error(`esperaba ok, llegó ${r.error}`)
    expect(r.data.url).toBe(enlaceWhatsApp(NUMERO))
    // El cifrado jamás debe filtrarse al enlace.
    expect(r.data.url).not.toContain('v1')
  })
})
