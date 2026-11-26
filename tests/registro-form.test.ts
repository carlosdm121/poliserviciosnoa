import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { FormularioPerfil } from '@/components/perfil/FormularioPerfil'
import type { CiudadCatalogo, GrupoCatalogo } from '@/services/catalogo'

vi.mock('next/link', () => ({
  default: ({ href, className, children }: { href: string; className?: string; children: ReactNode }) =>
    createElement('a', { href, className }, children),
}))

vi.mock('next-auth/react', () => ({ signIn: vi.fn() }))

vi.mock('@/app/actions/registro', () => ({ registrarProfesional: vi.fn() }))

vi.mock('@/app/actions/perfil', () => ({ guardarDatosPerfil: vi.fn() }))

const grupos: GrupoCatalogo[] = [
  {
    id: 'g1',
    nombre: 'Oficios',
    icono: '🛠️',
    rubros: [
      {
        id: 'r1',
        nombre: 'Electricista',
        requiereMatricula: true,
        etiquetaMatricula: 'Matrícula',
        subcategorias: [],
      },
      {
        id: 'r2',
        nombre: 'Plomero',
        requiereMatricula: false,
        etiquetaMatricula: null,
        subcategorias: [{ id: 's1', nombre: 'Destapaciones' }],
      },
    ],
  },
  {
    id: 'g2',
    nombre: 'Salud',
    icono: '🏥',
    rubros: [],
  },
]

function renderAlta(): string {
  // Cities mock for modo alta
  const mockCiudades = [
    { id: 'c1', nombre: 'Salta', provincia: 'Salta' },
    { id: 'c2', nombre: 'Capital', provincia: 'Salta' },
  ]
  return renderToStaticMarkup(
    createElement(FormularioPerfil, { modo: 'alta', grupos, ciudades: mockCiudades, versionTerminos: '2026-11-18' })
  )
}

function renderEdicion(): string {
  // Empty datos for edicion mode - uses perfilVacio, which has no cities
  const mockCiudades: CiudadCatalogo[] = [
    { id: 'c1', nombre: 'Salta', provincia: 'Salta' },
    { id: 'c2', nombre: 'Capital', provincia: 'Salta' },
  ]
  return renderToStaticMarkup(
    createElement(FormularioPerfil, { modo: 'edicion', grupos, ciudades: mockCiudades })
  )
}

describe('FormularioPerfil con modo alta', () => {
  it('renderiza el formulario de alta con sección "Tu cuenta"', () => {
    const html = renderAlta()

    // Deben existir los campos de cuenta
    expect(html).toContain('Tu cuenta')
    expect(html).toContain('Quién sos')
    expect(html).toContain('email')
    expect(html).toContain('password')
    expect(html).toContain('whatsapp')
    expect(html).toContain('aceptaTerminos')
    expect(html).toContain('Crear mi cuenta')

    // Deben ausentarse los campos de empresa
    expect(html).not.toContain('Razón social')
    expect(html).not.toContain('CUIT')
    expect(html).not.toContain('Nombre comercial')
    expect(html).not.toContain('Año de fundación')
    expect(html).not.toContain('Sitio web')
  })

  it('oculta los campos de catálogo en modo alta', () => {
    const html = renderAlta()

    // En modo alta, los rubros están ocultos (solo en modo edicion)
    expect(html).not.toContain('Rubro principal')
    expect(html).not.toContain('Rubro secundario')
  })

  it('renderiza checkbox de términos con versión', () => {
    const html = renderAlta()

    expect(html).toContain('Acepto los términos y condiciones (versión 2026-11-18)')
  })

  it('no muestra pasos numéricos', () => {
    const html = renderAlta()

    // En modo alta no debe haber "Paso 1", "Paso 2", etc.
    expect(html).not.toContain('Paso 1')
    expect(html).not.toContain('Paso 2')
    expect(html).not.toContain('Paso 3')
    expect(html).not.toContain('Paso 4')
  })
})

describe('FormularioPerfil con modo edicion', () => {
  it('renderiza el formulario de edición con datos básicos', () => {
    const html = renderEdicion()

    expect(html).toContain('Guardar perfil')
    expect(html).toContain('Quién sos')
  })
})