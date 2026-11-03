import Link from 'next/link'

export const metadata = {
  title: 'Página no encontrada | PoliserviciosNOA',
  robots: { index: false, follow: false },
}

/**
 * 404 con la marca del sitio: bordes gruesos, blanco y negro, sin sombras.
 * Nunca deja al visitante sin salida: siempre hay un enlace al buscador.
 */
export default function NotFoundPage(): React.ReactElement {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:py-20">
      <div className="tarjeta p-10 sm:p-16 text-center">
        <h1 className="text-display font-black uppercase leading-none">
          No está por acá
        </h1>
        <p className="mt-6 text-lg leading-relaxed">
          No encontramos esa página. Puede que el profesional haya dejado de
          publicar o que la dirección esté mal escrita.
        </p>
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link href="/buscar" className="btn-oscuro px-8">
            Ir al buscador
          </Link>
          <Link href="/" className="btn-linea px-8">
            Volver a la home
          </Link>
        </div>
      </div>
    </div>
  )
}
