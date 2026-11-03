import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PanelNavbar } from '@/components/panel/PanelNavbar'
import { FormularioPerfil } from '@/components/perfil/FormularioPerfil'
import { obtenerCatalogoPerfil } from '@/services/catalogo'
import { obtenerPerfilParaEditar } from '@/services/perfil'

export const metadata: Metadata = {
  title: 'Mi perfil',
  robots: { index: false, follow: false },
}

/**
 * Panel de perfil.
 *
 * El catálogo entero (8 grupos, 57 rubros, 240 subcategorías, 82 ciudades) se
 * carga en el servidor y se pasa como props. Pesa poco y no cambia dentro de
 * una sesión: pedirlo por una ruta aparte sería una request de más en cada
 * apertura del formulario.
 */
export const dynamic = 'force-dynamic'

export default async function PaginaPerfil(): Promise<React.ReactElement> {
  const sesion = await getServerSession(authOptions)

  if (!sesion?.user?.id) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <p className="error">Necesitás iniciar sesión.</p>
      </div>
    )
  }

  const [perfil, catalogo] = await Promise.all([
    obtenerPerfilParaEditar(sesion.user.id),
    obtenerCatalogoPerfil(),
  ])

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="border-b-[3px] border-ink pb-6">
        <h1 className="text-title font-black uppercase">Mi perfil</h1>
        <p className="mt-2 max-w-prose text-lg leading-relaxed">
          Esto es lo que ven los clientes cuando te buscan. Con más detalle, te eligen más.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <PanelNavbar />

        <div className="min-w-0">
          {perfil ? (
            <FormularioPerfil datos={perfil} grupos={catalogo.grupos} ciudades={catalogo.ciudades} />
          ) : (
            <div className="tarjeta p-8">
              <p className="error">No encontramos tu perfil. Escribinos y lo revisamos.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}