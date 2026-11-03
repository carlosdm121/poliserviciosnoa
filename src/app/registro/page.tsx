import type { Metadata } from 'next'
import Link from 'next/link'

import { FormularioRegistro } from '@/components/registro/FormularioRegistro'

export const metadata: Metadata = {
  title: 'Crear cuenta',
  description: 'Publicá tu servicio en PoliserviciosNOA y recibí consultas por WhatsApp.',
  // Página de alta: no tiene sentido en el índice de búsqueda y compite con
  // las páginas de servicios.
  robots: { index: false, follow: true },
}

export default function PaginaRegistro(): React.ReactElement {
  return (
    <div className="mx-auto max-w-lg px-4 py-12 sm:py-20">
      <p className="text-sm font-black uppercase tracking-widest">Para profesionales</p>

      <h1 className="mt-2 text-title font-black uppercase">Creá tu cuenta</h1>

      <p className="mt-4 text-lg leading-relaxed">
        Es gratis crear la cuenta. Después completás tu perfil, verificás tu WhatsApp y activás la
        suscripción para aparecer en las búsquedas.
      </p>

      <div className="mt-10">
        <FormularioRegistro />
      </div>

      <p className="mt-10 border-t-[3px] border-ink pt-6 text-sm">
        ¿Solo querés buscar un profesional?{' '}
        <Link href="/buscar" className="font-bold underline">
          Andá directo al buscador
        </Link>{' '}
        — no hace falta que te registres.
      </p>
    </div>
  )
}