import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'

import { FormularioLogin } from '@/components/auth/FormularioLogin'

export const metadata: Metadata = {
  title: 'Entrar',
  robots: { index: false, follow: true },
}

/**
 * Login.
 *
 * Va envuelto en `Suspense` porque `useSearchParams` fuerza renderizado
 * dinámico y Next.js lo exige en build si no hay un límite de carga encima.
 */
export default function PaginaLogin(): React.ReactElement {
  return (
    <div className="mx-auto max-w-lg px-4 py-12 sm:py-20">
      <h1 className="text-title font-black uppercase">Entrar</h1>

      <p className="mt-4 text-lg">Accedé a tu panel para editar tu perfil y ver tus consultas.</p>

      <div className="mt-10">
        <Suspense fallback={<div className="h-64" />}>
          <FormularioLogin />
        </Suspense>
      </div>

      <p className="mt-10 border-t-[3px] border-ink pt-6 text-sm">
        ¿Todavía no tenés cuenta?{' '}
        <Link href="/registro" className="font-bold underline">
          Creá tu perfil gratis
        </Link>
        .
      </p>
    </div>
  )
}