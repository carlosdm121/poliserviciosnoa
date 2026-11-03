'use client'

import Link from 'next/link'

export const metadata = {
  title: 'Error | PoliserviciosNOA',
  robots: { index: false, follow: false },
}

/**
 * 500 con la marca del sitio. No muestra stack traces ni detalles internos:
 * solo un mensaje honesto y una salida al buscador.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}): React.ReactElement {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:py-20">
      <div className="tarjeta p-10 sm:p-16 text-center">
        <h1 className="text-display font-black uppercase leading-none">
          Algo no salió bien
        </h1>
        <p className="mt-6 text-lg leading-relaxed">
          La página no se pudo cargar. Intentá de nuevo o volvé a la home.
        </p>
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <button
            onClick={reset}
            className="btn-oscuro px-8"
          >
            Reintentar
          </button>
          <Link href="/" className="btn-linea px-8">
            Volver a la home
          </Link>
        </div>
      </div>
    </div>
  )
}
