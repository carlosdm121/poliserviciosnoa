import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'

vi.mock('@/services/catalogo', () => ({
  obtenerCatalogoPerfil: vi.fn(),
}))

vi.mock('@/components/perfil/FormularioPerfil', () => ({
  FormularioPerfil: () => createElement('div', null, 'formulario-perfil'),
}))

describe('PaginaRegistro', () => {
  it('carga el catálogo con obtenerCatalogoPerfil y pasa grupos al FormularioPerfil', async () => {
    const mockGrupos = [
      {
        id: 'g1',
        nombre: 'Oficios',
        icono: '🛠️',
        rubros: [
          { id: 'r1', nombre: 'Electricista', requiereMatricula: true, etiquetaMatricula: 'Matrícula', subcategorias: [] },
          { id: 'r2', nombre: 'Plomero', requiereMatricula: false, etiquetaMatricula: null, subcategorias: [{ id: 's1', nombre: 'Destapaciones' }] },
        ],
      },
    ]

    const { obtenerCatalogoPerfil } = await import('@/services/catalogo')
    const mockObtenerCatalogo = vi.mocked(obtenerCatalogoPerfil)
    mockObtenerCatalogo.mockResolvedValue({
      grupos: mockGrupos,
      ciudades: [],
      rubrosLicenciados: {},
    })

    const modulo = await import('@/app/registro/page')
    const PaginaRegistro = modulo.default

    const element = await PaginaRegistro()
    expect(element).toBeTruthy()

    const html = renderToStaticMarkup(element)
    expect(html).toContain('formulario-perfil')
  })
})