import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Baja de invitaciones',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default function PaginaBajaInvitaciones(): React.ReactElement {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <header className="border-b-[3px] border-ink pb-6">
        <h1 className="text-title font-black uppercase">Baja de invitaciones</h1>
        <p className="mt-3 max-w-prose leading-relaxed">
          Ya no vas a recibir más invitaciones a valorar profesionales por email.
        </p>
      </header>

      <div className="mt-10 space-y-4">
        <p className="leading-relaxed">
          Si cambias de opinión, volverás a recibir invitaciones cuando el
          profesional al que contactaste haya pasado más de 48 horas y no haya
          una invitación previa pendiente.
        </p>
        <Link href="/" className="btn-linea inline-flex items-center">
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}
