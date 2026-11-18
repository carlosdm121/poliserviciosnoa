import { NextResponse } from 'next/server'

import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { subirDesdeServidor } from '@/lib/cloudinary'

/**
 * Sube una foto a Cloudinary desde el servidor.
 *
 * El navegador sube el archivo a esta ruta (mismo sitio) y el servidor hace el
 * salto a Cloudinary. La subida directa del navegador a `api.cloudinary.com`
 * se cortaba en Android con datos móviles del interior: el XHR al dominio del
 * proveedor no terminaba de llegar y el cliente veía "se cortó la conexión".
 * Al pasar por nuestra red, el navegador solo habla con el sitio y el
 * proveedor recibe el archivo desde un server con mejor ancho de banda.
 */
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response> {
  const sesion = await getServerSession(authOptions)

  if (!sesion?.user?.id) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const perfil = await prisma.profile.findUnique({
    where: { userId: sesion.user.id },
    select: { id: true },
  })

  if (!perfil) {
    return NextResponse.json({ error: 'No tenés un perfil todavía.' }, { status: 404 })
  }

  const formData = await request.formData()
  const archivo = formData.get('file')

  if (!(archivo instanceof Blob)) {
    return NextResponse.json(
      { error: 'Falta el archivo a subir.' },
      { status: 400 },
    )
  }

  try {
    const datos = await subirDesdeServidor(archivo, perfil.id)

    return NextResponse.json({ publicId: datos.publicId, url: datos.url })
  } catch (error: unknown) {
    const mensaje =
      error instanceof Error
        ? error.message
        : 'No pudimos subir la foto. Probá de nuevo.'

    return NextResponse.json({ error: mensaje }, { status: 500 })
  }
}