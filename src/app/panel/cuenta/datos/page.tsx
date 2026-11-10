import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'

import { Aviso } from '@/components/admin/Aviso'
import { authOptions } from '@/lib/auth'
import { PoliticaRetencion, politicasRetencion } from '@/lib/retention'
import { privacidadSolicitarSupresion } from '@/app/actions/privacidad'
import { prisma } from '@/lib/prisma'
import { PanelNavbar } from '@/components/panel/PanelNavbar'

export const metadata: Metadata = {
  title: 'Tus datos',
  robots: { index: false, follow: false },
}
export const dynamic = 'force-dynamic'

function uno(valor: string | string[] | undefined): string {
  return typeof valor === 'string' ? valor : ''
}

export default async function PaginaDatos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<React.ReactElement> {
  const sp = await searchParams
  const ok = uno(sp.ok)
  const error = uno(sp.error)

  const sesion = await getServerSession(authOptions)

  if (!sesion?.user?.id) {
    redirect('/login?callbackUrl=/panel/cuenta/datos')
  }

  const perfil = await prisma.profile.findUnique({
    where: { userId: sesion.user.id },
    select: { id: true, name: true },
  })

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="border-b-[3px] border-ink pb-6">
        <h1 className="text-title font-black uppercase">Tus datos</h1>
        <p className="mt-2 max-w-prose text-lg leading-relaxed">
          Acá podés descargar una copia de tus datos personales y pedir la
          supresión de tu cuenta, como establece la Ley 25.326 de protección
          de datos personales.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <PanelNavbar />

        <div className="min-w-0">
          <section className="tarjeta p-5">
            <h2 className="text-xl font-black uppercase mb-4">Descargar mis datos</h2>
            <p className="mb-4 text-muted">
              Te generamos un JSON con tu perfil, fotos (URLs), número de
              WhatsApp, suscripciones, pagos, contactos y votos. No incluye
              datos de otras personas.
            </p>
            <Link
              href="/api/panel/datos/exportar"
              className="btn-oscuro px-4 py-3 text-base font-bold uppercase"
            >
              Descargar JSON
            </Link>
          </section>

          <div className="mt-6">
            <Aviso ok={ok || undefined} error={error || undefined} />
          </div>

          <section className="tarjeta p-5 mt-4">
            <h2 className="text-xl font-black uppercase mb-4">Eliminar mi cuenta</h2>
            <p className="mb-4 text-muted">
              Si pedís la supresión, te enviamos un email para confirmar. Tenés
              30 días para hacerlo; después, el pedido se rechaza y nada se
              borra.
            </p>
            <form action={privacidadSolicitarSupresion} className="space-y-3">
              <input type="hidden" name="ruta" value="/panel/cuenta/datos" />
              <button className="btn-oscuro px-4 py-3 text-base font-bold uppercase text-red-900 border-red-900 hover:bg-red-900 hover:text-paper">
                Sí, pedir la supresión de mi cuenta
              </button>
            </form>
          </section>

          <section className="tarjeta p-5 mt-4">
            <h2 className="text-xl font-black uppercase mb-4">Qué se conserva y qué se borra</h2>
            <ul className="space-y-3 text-sm">
              {politicasRetencion().map((politica: PoliticaRetencion) => (
                <li key={politica.dato} className="flex justify-between items-start">
                  <div>
                    <p className="font-bold">{politica.dato}</p>
                    <p className="text-muted">{politica.motivo}</p>
                  </div>
                  <span className="etiqueta">
                    {politica.seConserva ? 'Se conserva' : 'Se borra'}
                    {politica.plazoDias !== null
                      ? ` · ${politica.plazoDias} día${politica.plazoDias !== 1 ? 's' : ''}`
                      : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
