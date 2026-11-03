import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PanelNavbar } from '@/components/panel/PanelNavbar'
import { VerificarWhatsApp } from '@/components/panel/VerificarWhatsApp'

export const metadata: Metadata = {
  title: 'Verificar WhatsApp',
  robots: { index: false, follow: false },
}

/**
 * Verificación del número de WhatsApp.
 *
 * Es la primera pantalla real del panel: sin ella no se puede publicar, porque
 * `evaluarPublicacion` exige `whatsappVerifiedAt`. Es el paso que convierte el
 * registro en un perfil que un cliente puede contactar.
 */
export const dynamic = 'force-dynamic'

export default async function PaginaWhatsApp(): Promise<React.ReactElement> {
  const sesion = await getServerSession(authOptions)

  const perfil = sesion?.user?.id
    ? await prisma.profile.findUnique({
        where: { userId: sesion.user.id },
        select: { whatsappE164: true, whatsappVerifiedAt: true },
      })
    : null

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="border-b-[3px] border-ink pb-6">
        <h1 className="text-title font-black uppercase">Verificar WhatsApp</h1>
        <p className="mt-2 max-w-prose text-lg leading-relaxed">
          Confirmá que el número que cargaste es tuyo. Sin esto nadie te puede contactar.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <PanelNavbar />

        <div className="min-w-0">
          {perfil ? (
            <VerificarWhatsApp
              numeroActual={perfil.whatsappE164}
              verificado={perfil.whatsappVerifiedAt !== null}
            />
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