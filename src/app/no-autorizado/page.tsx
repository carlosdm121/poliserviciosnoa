import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import Link from 'next/link'

import { authOptions } from '@/lib/auth'

export const metadata: Metadata = {
  title: 'No tenés acceso a esta página',
  robots: { index: false, follow: false },
}

/**
 * 403.
 *
 * Destino del middleware cuando alguien tiene sesión pero del rol equivocado.
 *
 * Distinguir entre "no autorizado" y "no autenticado" importa: redirigir al
 * login a alguien que ya está logueado lo manda a un ciclo de reintentos sin
 * mensaje. Acá se le explica qué pasó y se lo manda al panel que le
 * corresponde, no siempre a `/panel` (un admin en `/panel` vuelve a caer acá).
 */
export default async function PaginaNoAutorizado(): Promise<React.ReactElement> {
  const sesion = await getServerSession(authOptions)
  const rol = sesion?.user.role

  const esAdmin = rol === 'ADMIN' || rol === 'MODERADOR'
  const destino =
    esAdmin ? '/admin' : rol === 'CLIENT' ? '/mis-contactos' : rol ? '/panel' : '/login'
  const etiqueta =
    esAdmin ? 'Ir al panel de administración' : rol ? 'Ir a mi panel' : 'Entrar'

  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <p className="text-6xl font-black leading-none">403</p>

      <h1 className="mt-4 text-title font-black uppercase">No tenés acceso acá</h1>

      <p className="mt-4 text-lg leading-relaxed">
        {esAdmin
          ? 'Esta sección es para profesionales. Tu cuenta de administración tiene su propio panel.'
          : 'Esta sección es para otro tipo de cuenta. Si creaste tu perfil como profesional, entrá desde tu panel.'}
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href={destino} className="btn-oscuro">
          {etiqueta}
        </Link>
        <Link href="/" className="btn-linea">
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}
