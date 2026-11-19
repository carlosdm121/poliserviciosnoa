import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { decryptField, encryptField } from '@/lib/db/encrypt'
import { editarWhatsappManual } from '@/services/admin'

/**
 * Edición manual del WhatsApp desde el panel de admin.
 *
 * Es una puerta sensible: cambia el número al que llegan los clientes de un
 * perfil. Se prueba que las validaciones corten antes de tocar la base, que
 * la auditoría quede con números enmascarados y que un número ya usado por
 * otra cuenta no pase.
 */

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  auditCreate: vi.fn(),
  sincronizar: vi.fn(),
}))

vi.mock('@/lib/prisma', () => {
  const tx = {
    profile: { update: mocks.update },
    auditLog: { create: mocks.auditCreate },
  }

  return {
    prisma: {
      profile: { findUnique: mocks.findUnique },
      $transaction: vi.fn(async (fn: (cliente: typeof tx) => Promise<unknown>) => fn(tx)),
    },
  }
})

vi.mock('@/services/publicacion', () => ({
  sincronizarPublicacion: mocks.sincronizar,
}))

const ACTOR = { id: 'admin-1', email: 'admin@test.com' }
const NUEVO = '5493814123456'

function editar(overrides: Partial<Parameters<typeof editarWhatsappManual>[0]> = {}) {
  return editarWhatsappManual({
    profileId: 'p1',
    telefono: '3814123456',
    verificar: true,
    motivo: 'Cargó mal el número',
    actor: ACTOR,
    ...overrides,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.sincronizar.mockResolvedValue({ ok: true, data: true })
})

describe('editarWhatsappManual', () => {
  it('rechaza un número que no parece celular argentino', async () => {
    const r = await editar({ telefono: 'no-es-un-numero' })

    expect(r).toMatchObject({ ok: false, code: 'VALIDACION' })
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.sincronizar).not.toHaveBeenCalled()
  })

  it('rechaza un motivo vacío o demasiado corto', async () => {
    const r = await editar({ motivo: 'ab' })

    expect(r).toMatchObject({ ok: false, code: 'VALIDACION' })
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('devuelve NO_ENCONTRADO si el perfil no existe', async () => {
    mocks.findUnique.mockResolvedValue(null)

    const r = await editar()

    expect(r).toMatchObject({ ok: false, code: 'NO_ENCONTRADO' })
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('guarda el número cifrado, su hash y la verificación, y lo audita', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'p1', whatsappE164: encryptField('5493815559999') })

    const r = await editar()

    expect(r.ok).toBe(true)

    const data = mocks.update.mock.calls[0]![0].data as Record<string, unknown>
    expect(decryptField(data.whatsappE164 as string)).toBe(NUEVO)
    expect(data.whatsappHash).toMatch(/^[0-9a-f]{64}$/)
    expect(data.whatsappVerifiedAt).toBeInstanceOf(Date)
    expect(data.whatsappVerifiedBy).toBe('MANUAL:admin@test.com')

    const auditoria = mocks.auditCreate.mock.calls[0]![0].data as Record<string, any>
    expect(auditoria.action).toBe('whatsapp.editar_numero')
    expect(auditoria.after.numero).not.toContain(NUEVO)
    expect(auditoria.before.numero).not.toContain('5493815559999')
    expect(auditoria.after.motivo).toBe('Cargó mal el número')

    expect(mocks.sincronizar).toHaveBeenCalledWith('p1')
  })

  it('sin el chequeo de verificar deja el número sin verificación previa', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'p1', whatsappE164: encryptField(NUEVO) })

    const r = await editar({ verificar: false })

    expect(r.ok).toBe(true)

    const data = mocks.update.mock.calls[0]![0].data as Record<string, unknown>
    expect(data.whatsappVerifiedAt).toBeNull()
    expect(data.whatsappVerifiedBy).toBeNull()
    expect(data.whatsappHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('traduce el duplicado (el número ya usa otra cuenta) a un error legible', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'p1', whatsappE164: null })
    mocks.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: '6.2.1',
      }),
    )

    const r = await editar()

    expect(r).toMatchObject({ ok: false, code: 'DUPLICADO' })
    expect(mocks.auditCreate).not.toHaveBeenCalled()
    expect(mocks.sincronizar).not.toHaveBeenCalled()
  })
})
