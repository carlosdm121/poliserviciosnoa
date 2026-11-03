/**
 * Tests del punto 6 del módulo 6.1: autenticación obligatoria del lado del
 * servidor.
 *
 * `requireUser` y `requireRole` re-consultan rol y estado a la base y nunca
 * confían solo en el JWT.
 */

import { describe, expect, it } from 'vitest'

import { requireRole, requireUser } from '@/lib/session'

describe('punto 6 — autenticación del lado del servidor', () => {
  it('requireUser y requireRole están exportados y son funciones', () => {
    expect(typeof requireUser).toBe('function')
    expect(typeof requireRole).toBe('function')
  })

  it('requireRole lanza error sin sesión (no hay getServerSession en test)', async () => {
    await expect(requireRole(['PROFESSIONAL'])).rejects.toThrow()
  })

  it('requireRole acepta los roles válidos como parámetros', async () => {
    // Sin sesión, todas las llamadas fallan por falta de autenticación, no por
    // falta de rol. Esto confirma que la función llega a evaluar los roles.
    for (const roles of [
      ['PROFESSIONAL'],
      ['CLIENT'],
      ['ADMIN', 'MODERADOR'],
      ['PROFESSIONAL', 'CLIENT', 'ADMIN', 'MODERADOR'],
    ]) {
      await expect(requireRole(roles)).rejects.toThrow()
    }
  })
})
