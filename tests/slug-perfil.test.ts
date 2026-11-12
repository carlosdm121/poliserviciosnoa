import { describe, expect, it } from 'vitest'

import { generarSlugPerfil } from '@/lib/constantes'
import { SLUG_PERFIL } from '@/lib/slug-perfil'

describe('SLUG_PERFIL', () => {
  it('acepta lo que genera generarSlugPerfil', () => {
    for (const nombre of ['Ana Pérez', 'Jorge Díaz', 'Ñandú Servicios', '123', '']) {
      expect(SLUG_PERFIL.test(generarSlugPerfil(nombre))).toBe(true)
    }
  })

  it('rechaza rutas fijas de la app', () => {
    for (const ruta of [
      'buscar',
      'login',
      'registro',
      'panel',
      'admin',
      'p',
      'ayuda',
      'politica-de-pagos',
      'publica-tu-servicio',
      'dev-card-preview',
    ]) {
      expect(SLUG_PERFIL.test(ruta)).toBe(false)
    }
  })

  it('rechaza provincias', () => {
    for (const provincia of ['tucuman', 'salta', 'santiago-del-estero', 'catamarca', 'jujuy']) {
      expect(SLUG_PERFIL.test(provincia)).toBe(false)
    }
  })

  it('rechaza rutas de varios segmentos y la raíz', () => {
    expect(SLUG_PERFIL.test('')).toBe(false)
    expect(SLUG_PERFIL.test('ana-perez-x7k2/otra')).toBe(false)
    expect(SLUG_PERFIL.test('buscar/ana-perez-x7k2')).toBe(false)
  })
})
