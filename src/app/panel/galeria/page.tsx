import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PanelNavbar } from '@/components/panel/PanelNavbar'
import { Galeria } from '@/components/galeria/Galeria'
import { listarImagenes } from '@/services/galeria'

export const metadata: Metadata = {
  title: 'Mis fotos',
  robots: { index: false, follow: false },
}

/**
 * Galería del panel.
 *
 * `force-dynamic` porque la lista de fotos cambia con cada subida y borrado:
 * con el estático de Next, la segunda visita del profesional muestra la galería
 * de la anterior y no se entiende que la foto nueva no se guardó.
 */
export const dynamic = 'force-dynamic'

export default async function PaginaGaleria(): Promise<React.ReactElement> {
  const sesion = await getServerSession(authOptions)

  if (!sesion?.user?.id) {
    return (
      <div className='mx-auto max-w-6xl px-4 py-8'>
        <p className='error'>Necesitás iniciar sesión.</p>
      </div>
    )
  }

  /**
   * La galería se filtra por `profileId`, no por `userId`, porque todas las
   * reglas de la galería hablan de perfil (el límite es por perfil, la carpeta
   * es por perfil). Resolver el id acá y no en el servicio mantiene al servicio
   * con una sola clave y evita que cada función se acuerde de traducir.
   */
  const perfil = await prisma.profile.findUnique({
    where: { userId: sesion.user.id },
    select: { id: true },
  })

  if (!perfil) {
    return (
      <div className='mx-auto max-w-6xl px-4 py-8'>
        <p className='error'>No encontramos tu perfil. Escribinos y lo revisamos.</p>
      </div>
    )
  }

  const imagenes = await listarImagenes(perfil.id)

  return (
    <div className='mx-auto max-w-6xl px-4 py-8'>
      <div className='grid gap-8 lg:grid-cols-[240px_1fr]'>
        <PanelNavbar />

        <div className='min-w-0'>
          <Galeria imagenesIniciales={imagenes} />
        </div>
      </div>
    </div>
  )
}