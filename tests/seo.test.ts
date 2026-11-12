import { ModerationStatus, Province } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import { construirDonde } from '@/server/search'
import {
  construirJsonLdBreadcrumbList,
  construirJsonLdOrganization,
  textoIntroRubroProvincia,
} from '@/lib/perfil-publico'

describe('construirJsonLdOrganization', () => {
  it('es una Organization con nombre y URL del sitio', () => {
    const org = construirJsonLdOrganization('https://poliservicios-noa.com.ar')

    expect(org['@context']).toBe('https://schema.org')
    expect(org['@type']).toBe('Organization')
    expect(org.name).toBe('PoliserviciosNOA')
    expect(org.url).toBe('https://poliservicios-noa.com.ar')
  })

  it('quita la barra final de la URL', () => {
    const org = construirJsonLdOrganization('https://poliservicios-noa.com.ar/')

    expect(org.url).toBe('https://poliservicios-noa.com.ar')
  })
})

describe('construirJsonLdBreadcrumbList', () => {
  it('ordena los ítems y numera las posiciones', () => {
    const pan = construirJsonLdBreadcrumbList([
      { name: 'Inicio', url: '/' },
      { name: 'Tucumán', url: '/tucuman' },
      { name: 'Electricista', url: '/tucuman/electricista' },
      { name: 'Ana Pérez', url: '/ana-perez' },
    ]) as {
      '@context'?: string
      '@type': string
      itemListElement: { '@type': string; position: number; name: string; item: string }[]
    }

    expect(pan['@context']).toBe('https://schema.org')
    expect(pan['@type']).toBe('BreadcrumbList')
    expect(pan.itemListElement).toHaveLength(4)
    expect(pan.itemListElement[0]).toEqual({
      '@type': 'ListItem',
      position: 1,
      name: 'Inicio',
      item: '/',
    })
    expect(pan.itemListElement[3]).toEqual({
      '@type': 'ListItem',
      position: 4,
      name: 'Ana Pérez',
      item: '/ana-perez',
    })
  })
})

describe('textoIntroRubroProvincia', () => {
  it('varía con el rubro, la provincia y la capital', () => {
    const tucuman = textoIntroRubroProvincia(
      'Electricista',
      'Tucumán',
      'San Miguel de Tucumán',
    )
    const salta = textoIntroRubroProvincia('Plomero', 'Salta', 'Salta')

    expect(tucuman).toContain('Electricista')
    expect(tucuman).toContain('Tucumán')
    expect(tucuman).toContain('San Miguel de Tucumán')
    expect(salta).toContain('Plomero')
    expect(salta).toContain('Salta')
    expect(tucuman).not.toBe(salta)
  })

  it('no publica el teléfono ni menciona identidad verificada', () => {
    const texto = textoIntroRubroProvincia(
      'Electricista',
      'Tucumán',
      'San Miguel de Tucumán',
    )

    expect(texto).not.toContain('549')
    expect(texto).not.toContain('identidad verificada')
    expect(texto).not.toContain('WhatsApp verificado')
  })
})

describe('construirDonde', () => {
  it('incluye la condición de perfil público y los filtros de rubro y provincia', () => {
    const donde = construirDonde({
      rubro: 'electricista',
      provincia: Province.TUCUMAN,
    })

    expect(donde.isPublished).toBe(true)
    expect(donde.moderationStatus).toEqual({
      notIn: [ModerationStatus.SUSPENDED, ModerationStatus.REJECTED],
    })
    expect(donde.baseCity).toEqual({
      province: { equals: Province.TUCUMAN },
    })

    const and = donde.AND as {
      categories: {
        some: {
          category: { slug: { equals: string }; isActive: boolean }
        }
      }
    }[]
    expect(Array.isArray(donde.AND)).toBe(true)
    expect(and).toHaveLength(1)
    expect(and.at(0)?.categories).toEqual({
      some: { category: { slug: { equals: 'electricista' }, isActive: true } },
    })
  })

  it('no agrega filtros cuando no se pasan', () => {
    const donde = construirDonde({})

    expect(donde.isPublished).toBe(true)
    expect(donde.AND).toBeUndefined()
    expect(donde.baseCity).toBeUndefined()
  })
})
