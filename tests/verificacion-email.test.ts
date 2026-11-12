import { describe, expect, it } from 'vitest'

import {
  TOKEN_VIDA_SEGUNDOS,
  armarUrlVerificacion,
  fechaExpiracionToken,
  generarTokenVerificacion,
  hashearTokenVerificacion,
} from '@/lib/verificacion-email'

describe('generarTokenVerificacion', () => {
  it('genera 32 bytes en base64url', () => {
    // 32 bytes en base64 son 44 caracteres con padding; base64url lo saca.
    expect(generarTokenVerificacion()).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('no repite tokens', () => {
    const tokens = new Set(Array.from({ length: 200 }, generarTokenVerificacion))

    expect(tokens.size).toBe(200)
  })
})

describe('hashearTokenVerificacion', () => {
  it('es estable y devuelve 64 caracteres hexadecimales', () => {
    const token = 'token-de-prueba'

    expect(hashearTokenVerificacion(token)).toBe(hashearTokenVerificacion(token))
    expect(hashearTokenVerificacion(token)).toMatch(/^[a-f0-9]{64}$/)
  })

  it('no devuelve el token en claro', () => {
    const token = generarTokenVerificacion()

    expect(hashearTokenVerificacion(token)).not.toBe(token)
  })

  it('distingue tokens distintos', () => {
    expect(hashearTokenVerificacion('token-a')).not.toBe(hashearTokenVerificacion('token-b'))
  })
})

describe('fechaExpiracionToken', () => {
  it('vence a las 24 horas', () => {
    const ahora = new Date('2026-01-01T00:00:00.000Z')
    const vence = fechaExpiracionToken(ahora)

    expect(TOKEN_VIDA_SEGUNDOS).toBe(24 * 60 * 60)
    expect(vence.getTime() - ahora.getTime()).toBe(TOKEN_VIDA_SEGUNDOS * 1000)
  })
})

describe('armarUrlVerificacion', () => {
  it('arma el enlace con NEXTAUTH_URL y el token codificado', () => {
    expect(armarUrlVerificacion('abc-_123')).toBe(
      'http://localhost:3000/verificar-email?token=abc-_123',
    )
  })
})
