import type { Metadata } from 'next'
import Link from 'next/link'

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
 * mensaje. Acá se le explica qué pasó y qué puede hacer.
 */
export default function PaginaNoAutorizado(): React.ReactElement {
  return (
    <div className="mx-auto max-w-lg px-4 py-20 text-center">
      <p className="text-6xl font-black leading-none">403</p>

      <h1 className="mt-4 text-title font-black uppercase">No tenés acceso acá</h1>

      <p className="mt-4 text-lg leading-relaxed">
        Esta sección es para otro tipo de cuenta. Si creés tu perfil como profesional, entrá desde
        tu panel.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/panel" className="btn-oscuro">
          Ir a mi panel
        </Link>
        <Link href="/" className="btn-linea">
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}