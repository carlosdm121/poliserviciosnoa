import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Los mensajes del alta.
 *
 * Un P2002 sobre `whatsappHash`, `cuitHash` o `slug` tenía que caer en su
 * mensaje propio: antes se comparaba con 'whatsapp' y 'cuit' (sin el sufijo
 * `Hash`), que nunca coinciden con el nombre real de la columna unique, y
 * cualquier colisión terminaba en el genérico "No pudimos crear tu cuenta".
 *
 * También cubre que el bcrypt salga de la transacción: adentro se comía el
 * timeout por defecto de 5 s y la transacción moría con P2028.
 */

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  findMany: vi.fn(),
  transaction: vi.fn(),
  userCreate: vi.fn(),
  profileCreate: vi.fn(),
  rateLimit: vi.fn(),
  estaBloqueado: vi.fn(),
  hashearPassword: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock('next/headers', () => ({ headers: mocks.headers }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    category: { findMany: mocks.findMany },
    $transaction: mocks.transaction,
  },
}))
vi.mock('@/lib/peticion', () => ({ ipHasheada: vi.fn(async () => 'ip-hash') }))
vi.mock('@/lib/ratelimit', () => ({ rateLimit: mocks.rateLimit }))
vi.mock('@/lib/password', () => ({ hashearPassword: mocks.hashearPassword }))
vi.mock('@/lib/db/encrypt', () => ({ encryptField: vi.fn(() => 'v1:enc') }))
vi.mock('@/lib/hash', () => ({ hashValor: vi.fn(() => 'hash-valor') }))
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: mocks.loggerError,
  },
}))
vi.mock('@/services/bloqueo', () => ({ estaBloqueado: mocks.estaBloqueado }))
vi.mock('@/services/riesgo', () => ({
  esEmailDesechable: vi.fn(async () => false),
  registrarAltaDesdeIp: vi.fn(),
  registrarRiesgo: vi.fn(),
}))
vi.mock('@/services/perfil', () => ({
  // La clase tiene que existir en el mock: registro.ts la importa y hace
  // `instanceof` adentro del catch.
  ErrorValidacionPerfil: class extends Error {},
  guardarPerfilEnTx: vi.fn(async () => ({ ok: true, data: null })),
}))

import { registrarProfesional } from '@/app/actions/registro'
import { guardarPerfilEnTx } from '@/services/perfil'
import { err, ERROR_CODES } from '@/types/resultado'
import type { RegistroProfesionalInput } from '@/schemas'

const entrada: RegistroProfesionalInput = {
  type: 'PERSON',
  name: 'Carlos Ramírez',
  description: 'Ofrezco servicios de plomería y gasista con 10 años de experiencia en la zona.',
  company: {},
  ubicacion: {
    province: 'TUCUMAN',
    baseCityId: 'city1234567890123456789012',
    coversWholeProvince: false,
    otherProvinces: [],
    cityIds: [],
  },
  catalogo: {
    primaryCategoryId: 'cat1234567890123456789012',
    subcategoryIds: [],
    licenseNumber: '',
  },
  email: 'carlos@test.com',
  password: 'contraseña123',
  whatsapp: '3811234567',
  aceptaTerminos: true,
}

function p2002(target: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  })
}

/** Deja la transacción fallando con el error dado, como si user.create reventara. */
function transaccionQueFallar(error: Error): void {
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      user: { create: mocks.userCreate.mockRejectedValue(error) },
      profile: { create: mocks.profileCreate },
    }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.headers.mockReturnValue({ get: () => null })
  mocks.findMany.mockResolvedValue([{ id: 'cat1234567890123456789012' }])
  mocks.rateLimit.mockResolvedValue({ limitado: false })
  mocks.estaBloqueado.mockResolvedValue(false)
  mocks.hashearPassword.mockResolvedValue('$2a$12$hash')
})

describe('registrarProfesional — mensajes por colisión unique', () => {
  it('email duplicado', async () => {
    transaccionQueFallar(p2002(['email']))

    const r = await registrarProfesional(entrada)

    if (r.ok) throw new Error('esperaba error')
    expect(r.error).toContain('Ya existe una cuenta con ese email')
  })

  it('whatsappHash duplicado (la columna unique real, no "whatsapp")', async () => {
    transaccionQueFallar(p2002(['whatsappHash']))

    const r = await registrarProfesional(entrada)

    if (r.ok) throw new Error('esperaba error')
    expect(r.error).toContain('WhatsApp')
    expect(r.error).not.toContain('Probá de nuevo en un rato')
  })

  it('cuitHash duplicado (la columna unique real, no "cuit")', async () => {
    transaccionQueFallar(p2002(['cuitHash']))

    const r = await registrarProfesional(entrada)

    if (r.ok) throw new Error('esperaba error')
    expect(r.error).toContain('CUIT')
  })

  it('slug duplicado', async () => {
    transaccionQueFallar(p2002(['slug']))

    const r = await registrarProfesional(entrada)

    if (r.ok) throw new Error('esperaba error')
    expect(r.error).toContain('nombre ya está en uso')
  })

  it('error sin tratamiento: genérico, pero con el código de Prisma en el log', async () => {
    transaccionQueFallar(
      new Prisma.PrismaClientKnownRequestError('Transaction already closed', {
        code: 'P2028',
        clientVersion: 'test',
      }),
    )

    const r = await registrarProfesional(entrada)

    if (r.ok) throw new Error('esperaba error')
    expect(r.error).toBe('No pudimos crear tu cuenta. Probá de nuevo en un rato.')
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'registroProfesional: error inesperado',
      expect.objectContaining({ codigo: 'P2028' }),
    )
  })
})

describe('registrarProfesional — transacción', () => {
  it('hashea la contraseña antes de abrir la transacción y le pasa timeout generoso', async () => {
    transaccionQueFallar(p2002(['email']))

    await registrarProfesional(entrada)

    const ordenHash = mocks.hashearPassword.mock.invocationCallOrder[0] ?? 0
    const ordenTx = mocks.transaction.mock.invocationCallOrder[0] ?? 0
    expect(ordenHash).toBeLessThan(ordenTx)
    expect(mocks.transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ timeout: 15000, maxWait: 5000 }),
    )
  })

  it('si la validación de relaciones falla, revierte el alta y muestra el motivo', async () => {
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        user: { create: mocks.userCreate.mockResolvedValue({ id: 'u1' }) },
        profile: { create: mocks.profileCreate.mockResolvedValue({ id: 'p1' }) },
      }),
    )
    vi.mocked(guardarPerfilEnTx).mockResolvedValueOnce(
      err('Elegí hasta 8 ciudades.', ERROR_CODES.VALIDACION),
    )

    const r = await registrarProfesional(entrada)

    if (r.ok) throw new Error('esperaba error')
    expect(r.error).toBe('Elegí hasta 8 ciudades.')
    expect(r.code).toBe('VALIDACION')
  })
})
