import { Province, ProfileType, TeamSize } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import {
  construirJsonLd,
  construirMetadata,
  jsonLdParaScript,
  nombreMostrado,
  provinciasCubiertas,
  resumenPerfil,
  type PerfilParaPublicar,
} from '@/lib/perfil-publico'

/**
 * Fixture de un perfil completo. Se arma a mano y no con Prisma para que el
 * test corra sin base: lo que se prueba es el dato que Google va a leer.
 */
function perfil(overrides: Partial<PerfilParaPublicar> = {}): PerfilParaPublicar {
  return {
    slug: 'ana-perez',
    type: ProfileType.PERSON,
    name: 'Ana Pérez',
    tradeName: null,
    logoUrl: null,
    teamSize: null,
    licenseNumber: null,
    description: 'Instalaciones eléctricas y reparaciones en el día.',
    shortBio: 'Electricista matriculada.',
    companyVerifiedAt: null,
    coversWholeProvince: false,
    coversOtherProvinces: [],
    baseCity: { name: 'Yerba Buena', province: Province.TUCUMAN },
    coverage: [
      { city: { name: 'San Miguel de Tucumán', province: Province.TUCUMAN } },
      { city: { name: 'Yerba Buena', province: Province.TUCUMAN } },
    ],
    images: [
      { url: 'https://res.cloudinary.com/demo/image/upload/foto-1.jpg', width: 1200, height: 900 },
    ],
    categories: [
      {
        isPrimary: true,
        category: {
          name: 'Electricista',
          slug: 'electricista',
          requiresLicense: true,
          licenseLabel: 'Matrícula profesional',
          group: { name: 'Oficios' },
        },
      },
      {
        isPrimary: false,
        category: {
          name: 'Instalaciones',
          slug: 'instalaciones',
          requiresLicense: false,
          licenseLabel: null,
          group: { name: 'Oficios' },
        },
      },
    ],
    subcategories: [
      { subcategory: { name: 'Tableros eléctricos' } },
      { subcategory: { name: 'Luminarias' } },
    ],
    ...overrides,
  }
}

describe('nombreMostrado', () => {
  it('usa el nombre comercial de una empresa y cae en la razón social', () => {
    expect(
      nombreMostrado(
        perfil({ type: ProfileType.COMPANY, name: 'Pérez Servicios S.R.L.', tradeName: 'Pérez Electricidad' }),
      ),
    ).toBe('Pérez Electricidad')

    expect(
      nombreMostrado(
        perfil({ type: ProfileType.COMPANY, name: 'Pérez Servicios S.R.L.', tradeName: null }),
      ),
    ).toBe('Pérez Servicios S.R.L.')
  })

  it('usa el nombre de la persona aunque tenga nombre comercial', () => {
    expect(nombreMostrado(perfil({ tradeName: 'No aplica' }))).toBe('Ana Pérez')
  })
})

describe('cobertura', () => {
  it('deduplica la ciudad base y agrega la provincia entera cuando corresponde', () => {
    const datos = perfil({
      coversWholeProvince: true,
      coversOtherProvinces: [Province.SALTA, Province.TUCUMAN],
    })

    expect(provinciasCubiertas(datos)).toEqual([Province.TUCUMAN, Province.SALTA])
  })

  it('no inventa provincia entera si no hay ciudad base', () => {
    expect(provinciasCubiertas(perfil({ baseCity: null, coversWholeProvince: true }))).toEqual(
      [],
    )
  })
})

describe('JSON-LD', () => {
  it('es un LocalBusiness con areaServed de ciudades y provincias', () => {
    const datos = construirJsonLd(
      perfil({ coversWholeProvince: true, coversOtherProvinces: [Province.SALTA] }),
      'https://poliservicios-noa.com.ar',
    )
    const areas = datos.areaServed as { '@type': string; name: string }[]

    expect(datos['@type']).toBe('LocalBusiness')
    expect(datos.url).toBe('https://poliservicios-noa.com.ar/p/ana-perez')
    expect(areas).toContainEqual({ '@type': 'City', name: 'Yerba Buena' })
    expect(areas).toContainEqual({ '@type': 'City', name: 'San Miguel de Tucumán' })
    expect(areas).toContainEqual({ '@type': 'AdministrativeArea', name: 'Tucumán' })
    expect(areas).toContainEqual({ '@type': 'AdministrativeArea', name: 'Salta' })
  })

  it('no publica el teléfono ni inventa un rating', () => {
    const datos = construirJsonLd(perfil(), 'https://poliservicios-noa.com.ar')

    expect('telephone' in datos).toBe(false)
    expect('aggregateRating' in datos).toBe(false)
    expect(JSON.stringify(datos)).not.toContain('telephone')
  })

  it('incluye la dirección, las fotos y los rubros', () => {
    const datos = construirJsonLd(perfil(), 'https://poliservicios-noa.com.ar')

    expect(datos.address).toEqual({
      '@type': 'PostalAddress',
      addressLocality: 'Yerba Buena',
      addressRegion: 'Tucumán',
      addressCountry: 'AR',
    })
    expect(datos.image).toEqual(['https://res.cloudinary.com/demo/image/upload/foto-1.jpg'])
    expect(datos.knowsAbout).toEqual([
      'Electricista',
      'Tableros eléctricos',
      'Luminarias',
    ])
  })

  it('omite las claves vacías en lugar de publicarlas en null', () => {
    const datos = construirJsonLd(
      perfil({ baseCity: null, coverage: [], images: [], description: null, shortBio: null }),
      'https://poliservicios-noa.com.ar',
    )

    expect('address' in datos).toBe(false)
    expect('areaServed' in datos).toBe(false)
    expect('image' in datos).toBe(false)
    expect('description' in datos).toBe(false)
  })

  it('escapa el cierre de script en la serialización', () => {
    const serializado = jsonLdParaScript(
      construirJsonLd(perfil({ description: 'Hola </script><img src=x>' }), 'https://x.test'),
    )

    expect(serializado).not.toContain('</script>')
    expect(serializado).toContain('\\u003c/script>')
  })
})

describe('metadatos', () => {
  it('arma título, descripción, canónica y tarjetas sociales', () => {
    const meta = construirMetadata(perfil())

    expect(meta.title).toBe('Ana Pérez - Electricista en Yerba Buena')
    expect(meta.description).toBe('Instalaciones eléctricas y reparaciones en el día.')
    expect(String(meta.alternates?.canonical)).toBe('/p/ana-perez')
    expect(JSON.stringify(meta.openGraph)).toContain(
      'https://res.cloudinary.com/demo/image/upload/foto-1.jpg',
    )
    expect(JSON.stringify(meta.twitter)).toContain('"card":"summary_large_image"')
    expect(JSON.stringify(meta.twitter)).toContain(
      'https://res.cloudinary.com/demo/image/upload/foto-1.jpg',
    )
  })

  it('usa el logo como imagen social si no hay fotos', () => {
    const meta = construirMetadata(
      perfil({
        images: [],
        logoUrl: 'https://res.cloudinary.com/demo/image/upload/logo.png',
      }),
    )

    expect(JSON.stringify(meta.openGraph)).toContain(
      'https://res.cloudinary.com/demo/image/upload/logo.png',
    )
  })

  it('no inventa descripción cuando el perfil no tiene texto', () => {
    const resumen = resumenPerfil(
      perfil({ description: null, shortBio: null, tradeName: null }),
    )

    expect(resumen).toBe('Ana Pérez ofrece Electricista en Yerba Buena Contacto directo por WhatsApp.')
  })

  it('recorta el resumen sin cortar una palabra', () => {
    const resumen = resumenPerfil(perfil({ description: 'palabra '.repeat(40) }))

    expect(resumen.length).toBeLessThanOrEqual(161)
    expect(resumen.endsWith('…')).toBe(true)
    expect(resumen.endsWith('palabr…')).toBe(false)
  })

  it('no incluye el número de WhatsApp en los metadatos', () => {
    const meta = construirMetadata(
      perfil({ type: ProfileType.COMPANY, tradeName: 'Pérez Electricidad' }),
    )

    expect(JSON.stringify(meta)).not.toContain('549')
  })
})

describe('equipo', () => {
  it('muestra el tamaño del equipo solo como dato de la empresa', () => {
    const meta = construirMetadata(
      perfil({
        type: ProfileType.COMPANY,
        tradeName: 'Pérez Electricidad',
        teamSize: TeamSize.T6_20,
      }),
    )

    expect(meta.title).toBe('Pérez Electricidad - Electricista en Yerba Buena')
  })
})
