import Link from 'next/link'

import { NOMBRE_PAGINA, PROVINCIAS, PROVINCIAS_LISTA } from '@/lib/constantes'

/**
 * Pie de página.
 *
 * Además de los enlaces, tiene que estar el botón de baja: la normativa
 * argentina de comercio electrónico (Ley 25.326 y Resolución 853/AAIP)
 * exige que la baja sea visible en todas las páginas y accesible en no más
 * de dos pasos, sin pedir motivo obligatorio.
 */
export function Footer(): React.ReactElement {
  const anio = new Date().getFullYear()

  return (
    <footer className="mt-16 border-t-[3px] border-ink bg-ink text-paper">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-2xl font-black uppercase leading-none">{NOMBRE_PAGINA}</p>
          <p className="mt-3 text-sm leading-relaxed opacity-80">
            Encontrás al profesional que necesitás en tu zona y lo contactás directo por WhatsApp.
            Sin intermediarios ni comisiones.
          </p>
        </div>

        <div>
          <h2 className="text-sm font-black uppercase tracking-widest">Provincias</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {PROVINCIAS_LISTA.map((provincia) => (
              <li key={provincia}>
                <Link
                  href={`/${PROVINCIAS[provincia].slug}`}
                  className="inline-flex min-h-[36px] items-center hover:underline"
                >
                  {PROVINCIAS[provincia].nombre}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-black uppercase tracking-widest">Profesionales</h2>
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              <Link href="/publica-tu-servicio" className="inline-flex min-h-[36px] items-center hover:underline">
                Publicá tu servicio
              </Link>
            </li>
            <li>
              <Link href="/login" className="inline-flex min-h-[36px] items-center hover:underline">
                Entrar a mi panel
              </Link>
            </li>
            <li>
              <Link href="/ayuda" className="inline-flex min-h-[36px] items-center hover:underline">
                Ayuda
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-black uppercase tracking-widest">Legal</h2>
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              <Link href="/terminos" className="inline-flex min-h-[36px] items-center hover:underline">
                Términos y condiciones
              </Link>
            </li>
            <li>
              <Link href="/privacidad" className="inline-flex min-h-[36px] items-center hover:underline">
                Privacidad
              </Link>
            </li>
            <li>
              <Link href="/politica-de-pagos" className="inline-flex min-h-[36px] items-center hover:underline">
                Política de pagos
              </Link>
            </li>
            <li>
              {/* Botón de baja: visible en todas las páginas, dos clics, sin
                  motivo obligatorio. Requisito legal, no una feature. */}
              <Link href="/baja" className="inline-flex min-h-[36px] items-center hover:underline">
                Darme de baja
              </Link>
            </li>
            <li>
              {/* El arrepentimiento es otra cosa que la baja: devuelve el dinero
                  dentro de los 10 días. Va como enlace propio para que no se
                  confunda con "cancelar la renovación". */}
              <Link
                href="/arrepentimiento"
                className="inline-flex min-h-[36px] items-center hover:underline"
              >
                Botón de arrepentimiento
              </Link>
            </li>
            <li>
              <Link
                href="/libro-de-quejas"
                className="inline-flex min-h-[36px] items-center hover:underline"
              >
                Libro de quejas
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-paper/20 px-4 py-6">
        <div className="mx-auto max-w-6xl space-y-3 text-xs opacity-70">
          <p>
            © {anio} {NOMBRE_PAGINA}. Hecho en Tucumán, Argentina.
          </p>
          <p>
            {NOMBRE_PAGINA} es un intermediario: no prestamos servicios ni respondemos por el
            trabajo de los profesionales. La plataforma verifica que el número de WhatsApp exista,
            no verifica la identidad del profesional.
          </p>
        </div>
      </div>
    </footer>
  )
}