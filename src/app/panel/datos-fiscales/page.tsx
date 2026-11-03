import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { FormularioDatosFiscales } from '@/components/panel/FormularioDatosFiscales'
import { PanelNavbar } from '@/components/panel/PanelNavbar'
import { obtenerDatosFiscales } from '@/services/suscripcion'

export const metadata: Metadata = {
  title: 'Datos fiscales',
  robots: { index: false, follow: false },
}

/**
 * Datos fiscales.
 *
 * Se piden antes del primer pago y no después, y la razón es de orden, no de
 * paciencia: cuando llega el pago aprobado hay que emitir la factura (2.5) y sin
 * estos datos no se puede. Preguntarlos en el instante del cobro pone al
 * profesional a elegir entre que le facturen y que su perfil siga visible.
 *
 * La pantalla dice explícitamente para qué se piden. "Datos fiscales" en un
 * formulario de un portal desconocido suena a trámite y aiganancia de datos;
 * decir que van a un comprobante y que nunca se publican es lo que hace que la
 * gente los cargue.
 */
export const dynamic = 'force-dynamic'

export default async function PaginaDatosFiscales(): Promise<React.ReactElement> {
  const sesion = await getServerSession(authOptions)

  const perfilId = sesion?.user?.id
    ? await prisma.profile.findUnique({
        where: { userId: sesion.user.id },
        select: { id: true },
      })
    : null

  const fiscales = perfilId ? await obtenerDatosFiscales(perfilId.id) : null

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="border-b-[3px] border-ink pb-6">
        <h1 className="text-title font-black uppercase">Datos fiscales</h1>
        <p className="mt-2 max-w-prose text-lg leading-relaxed">
          Van en la factura de cada pago que hagas. No los usamos para verificar quién sos —para eso
          está la verificación de WhatsApp— y no aparecen en tu perfil ni en ningún lado público.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <PanelNavbar />

        <div className="min-w-0">
          <FormularioDatosFiscales
            valoresIniciales={
              fiscales
                ? {
                    tipoPersona: fiscales.tipoPersona,
                    nombreORazonSocial: fiscales.nombreORazonSocial,
                    documento: fiscales.documento,
                    condicionIva: fiscales.condicionIva,
                    domicilioFiscal: fiscales.domicilioFiscal,
                  }
                : null
            }
          />
        </div>
      </div>
    </div>
  )
}