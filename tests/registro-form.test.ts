import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { FormularioRegistro } from '@/components/registro/FormularioRegistro'
import type { GrupoCatalogo } from '@/services/catalogo'

vi.mock('next/link', () => ({
  default: ({ href, className, children }: { href: string; className?: string; children: ReactNode }) =>
    createElement('a', { href, className }, children),
}))

vi.mock('next-auth/react', () => ({ signIn: vi.fn() }))

vi.mock('@/app/actions/registro', () => ({ registrarProfesional: vi.fn() }))

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
]

function render(): string {
  return renderToStaticMarkup(createElement(FormularioRegistro, { grupos }))
}

describe('FormularioRegistro con rubros', () => {
  it('renderiza el selector principal y el secundario', () => {
    const html = render()

    expect(html).toContain('Rubro principal')
    expect(html).toContain('Rubro secundario')
  })

  it('muestra las etiquetas de ayuda de cada selector', () => {
    const html = render()

    expect(html).toContain('Obligatorio: el rubro que aparecerá primero en las búsquedas')
    expect(html).toContain('Opcional: otro rubro en el que también trabajás.')
  })

  it('lista los rubros del catálogo recibido', () => {
    const html = render()

    expect(html).toContain('Electricista')
    expect(html).toContain('Plomero')
    expect(html).toContain('Oficios')
  })

  it('marca el selector principal como requerido', () => {
    const html = render()

    // El segundo selector no lleva el asterisco; el principal sí.
    const principal = html.slice(html.indexOf('Rubro principal'), html.indexOf('Rubro secundario'))
    expect(principal).toContain('aria-hidden="true"')
  })

  it('include los campos del formulario de alta', () => {
    const html = render()

    // En el nuevo schema los rubros viajan dentro del objeto perfil, no como
    // inputs planos al final del formulario.
    expect(html).toContain('name="password"')
    expect(html).toContain('type="submit"')
  })
})
