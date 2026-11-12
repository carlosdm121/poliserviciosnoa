import { Province, ProfileType, TeamSize } from '@prisma/client'
import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import {
  ProfessionalCard,
  type ProfessionalCardData,
} from '@/components/profesionales/ProfessionalCard'
import { ProfessionalCardSkeleton } from '@/components/profesionales/ProfessionalCardSkeleton'

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) =>
    createElement('img', { src, alt, 'data-next-image': 'true' }),
}))

vi.mock('next/link', () => ({
  default: ({
    href,
    className,
    children,
  }: {
    href: string
    className?: string
    children: ReactNode
  }) => createElement('a', { href, className }, children),
}))

vi.mock('@/components/votos/BotonCorazon', () => ({
  BotonCorazon: (props: {
    profileId: string
    corazones: number
    votado: boolean
    puedeVotar: boolean
    motivo: string | null
  }) =>
    createElement(
      'button',
      {
        'data-testid': 'corazon',
        'data-profile-id': props.profileId,
        'data-votado': String(props.votado),
        'data-puede-votar': String(props.puedeVotar),
        'data-motivo': props.motivo ?? '',
      },
      `${props.votado ? '♥' : '♡'} ${props.corazones}`,
    ),
}))

function persona(overrides: Partial<ProfessionalCardData> = {}): ProfessionalCardData {
  return {
    id: 'perfil-ana',
    slug: 'ana-perez',
    type: ProfileType.PERSON,
    name: 'Ana Pérez',
    tradeName: null,
    logoUrl: null,
    teamSize: null,
    shortBio: 'Instalaciones eléctricas y reparaciones en el día.',
    licenseNumber: null,
    companyVerified: false,
    heartsCount: 24,
    image: {
      url: 'https://res.cloudinary.com/demo/image/upload/ana.jpg',
      width: 1200,
      height: 900,
    },
    primaryCategory: 'Electricista',
    secondaryCategory: null,
    baseCity: 'San Miguel de Tucumán',
    province: Province.TUCUMAN,
    coverage: [],
    coversWholeProvince: false,
    ...overrides,
  }
}

function empresa(overrides: Partial<ProfessionalCardData> = {}): ProfessionalCardData {
  return persona({
    id: 'perfil-clima',
    slug: 'clima-norte',
    type: ProfileType.COMPANY,
    name: 'Clima Norte',
    tradeName: 'Clima Norte',
    logoUrl: 'https://res.cloudinary.com/demo/image/upload/logo.png',
    teamSize: TeamSize.T6_20,
    licenseNumber: 'MAT-123',
    companyVerified: true,
    heartsCount: 8,
    primaryCategory: 'Refrigeración',
    secondaryCategory: 'Electricista',
    coverage: [],
    ...overrides,
  })
}

function render(profile: ProfessionalCardData, logueado = true): string {
  return renderToStaticMarkup(createElement(ProfessionalCard, { profile, logueado }))
}

describe('ProfessionalCard', () => {
  it('muestra una persona con cobertura y sin matrícula', () => {
    const html = render(
      persona({
        coverage: ['Yerba Buena', 'Tafí Viejo', 'Banda del Río Salí', 'Monteros'],
      }),
    )

    expect(html).toContain('Ana Pérez')
    expect(html).toContain('Electricista')
    expect(html).toContain('San Miguel de Tucumán')
    expect(html).toContain('Tucumán')
    expect(html).toContain('Atiende en: Yerba Buena, Tafí Viejo (+2)')
    expect(html).toContain('WhatsApp verificado')
    expect(html).not.toContain('Empresa verificada')
    expect(html).not.toContain('Matrícula informada')
    expect(html).not.toContain('Identidad verificada')
    expect(html).toContain('line-clamp-2')
    expect(html).toContain('data-next-image="true"')
    expect(html).toContain('alt="Foto de Ana Pérez"')
    expect(html).toContain('♡ 24')
    expect(html).toContain('href="/api/contacto/ana-perez"')
    expect(html).toContain('href="/ana-perez"')
  })

  it('muestra una empresa verificada, con matrícula y sin cobertura', () => {
    const html = render(empresa())

    expect(html).toContain('Clima Norte')
    expect(html).toContain('6 a 20 personas')
    expect(html).toContain('Refrigeración')
    expect(html).toContain('Electricista')
    expect(html).toContain('Empresa verificada')
    expect(html).toContain('Matrícula informada')
    expect(html).toContain('WhatsApp verificado')
    expect(html).not.toContain('Atiende en:')
    expect(html).not.toContain('Identidad verificada')
    expect(html).toContain('alt="Logo de Clima Norte"')
  })

  it('no repite la ciudad base en la cobertura', () => {
    const html = render(
      persona({
        coverage: ['San Miguel de Tucumán', 'Yerba Buena'],
      }),
    )

    expect(html).toContain('Atiende en: Yerba Buena')
    expect(html).not.toContain('Atiende en: San Miguel de Tucumán')
  })

  it('avisa al visitante anónimo que puede valorar después de ingresar', () => {
    const html = render(persona(), false)

    expect(html).toContain(
      'Ingresá antes de contactar para poder valorar a este profesional después',
    )
    expect(html).toContain('data-puede-votar="false"')
    expect(html).toContain('data-motivo="SIN_SESION"')
  })

  it('no muestra la nota de ingreso si el visitante ya inició sesión', () => {
    const html = render(persona(), true)

    expect(html).not.toContain('Ingresá antes de contactar')
  })
})

describe('ProfessionalCardSkeleton', () => {
  it('respeta la forma de la card y no se anuncia como contenido', () => {
    const html = renderToStaticMarkup(createElement(ProfessionalCardSkeleton))

    expect(html).toContain('data-testid="professional-card-skeleton"')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('aspect-[4/3]')
  })
})
