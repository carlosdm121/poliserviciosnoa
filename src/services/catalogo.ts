import { prisma } from '@/lib/prisma'

/**
 * Datos del catálogo para el formulario de perfil.
 *
 * Se carga una sola vez, en el servidor, y se pasa al cliente como props.
 * Los 57 rubros y sus 240 subcategorías no cambian durante una sesión, y
 * pedirlos por una ruta aparte sería una request que no hace falta.
 */
export async function obtenerCatalogoPerfil(): Promise<{
  grupos: GrupoCatalogo[]
  ciudades: CiudadCatalogo[]
  rubrosLicenciados: Record<string, string>
}> {
  const [grupos, ciudades, rubros] = await Promise.all([
    prisma.categoryGroup.findMany({
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        icon: true,
        categories: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            name: true,
            requiresLicense: true,
            licenseLabel: true,
            subcategories: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
              select: { id: true, name: true },
            },
          },
        },
      },
    }),
    prisma.city.findMany({
      where: { isActive: true },
      orderBy: [{ province: 'asc' }, { sortOrder: 'asc' }],
      select: { id: true, name: true, province: true },
    }),
    prisma.category.findMany({
      where: { isActive: true, requiresLicense: true },
      select: { id: true, licenseLabel: true },
    }),
  ])

  return {
    grupos: grupos.map((grupo) => ({
      id: grupo.id,
      nombre: grupo.name,
      icono: grupo.icon,
      rubros: grupo.categories.map((categoria) => ({
        id: categoria.id,
        nombre: categoria.name,
        requiereMatricula: categoria.requiresLicense,
        etiquetaMatricula: categoria.licenseLabel,
        subcategorias: categoria.subcategories.map((sub) => ({ id: sub.id, nombre: sub.name })),
      })),
    })),
    ciudades: ciudades.map((ciudad) => ({
      id: ciudad.id,
      nombre: ciudad.name,
      provincia: ciudad.province,
    })),
    rubrosLicenciados: Object.fromEntries(
      rubros.map((rubro) => [rubro.id, rubro.licenseLabel ?? 'Matrícula']),
    ),
  }
}

export type GrupoCatalogo = {
  id: string
  nombre: string
  icono: string
  rubros: RubroCatalogo[]
}

export type RubroCatalogo = {
  id: string
  nombre: string
  requiereMatricula: boolean
  etiquetaMatricula: string | null
  subcategorias: { id: string; nombre: string }[]
}

export type CiudadCatalogo = {
  id: string
  nombre: string
  provincia: string
}