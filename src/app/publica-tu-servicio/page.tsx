import Link from 'next/link'
import type { Metadata } from 'next'

import { MENSAJE_CONTACTO, NOMBRE_PAGINA } from '@/lib/constantes'
import { contadorSociosFundadores, esSocioFundador } from '@/services/cupones'
import { getCurrentPlan } from '@/services/planes'

/**
 * Landing de captación de profesionales.
 *
 * Se vende en una pantalla: qué gana el profesional, cuánto paga, cómo se
 * empieza en 4 pasos y qué significa "WhatsApp verificado". El precio sale de
 * la base vía `getCurrentPlan()` y nunca se hardcodea: si el admin cambia el
 * monto, la landing lo refleja sin tocar código.
 *
 * Open Graph incluye una imagen para que, al compartir el link en WhatsApp o
 * Instagram, se vea una tarjeta atractiva y no un texto suelto.
 */

export async function generateMetadata(): Promise<Metadata> {
  const descripcion =
    'Publicá tu servicio en PoliserviciosNOA. Contactá directo por WhatsApp, ' +
    'sin comisiones ni intermediarios. Verificá tu número en 1 minuto, sin ' +
    'subir documentos ni fotos.'

  return {
    title: `Publicá tu servicio | ${NOMBRE_PAGINA}`,
    description: descripcion,
    alternates: { canonical: '/publica-tu-servicio' },
    openGraph: {
      type: 'website',
      locale: 'es_AR',
      siteName: NOMBRE_PAGINA,
      title: `Publicá tu servicio en ${NOMBRE_PAGINA}`,
      description: descripcion,
      url: '/publica-tu-servicio',
      images: [
        {
          url: '/og-publica-tu-servicio.png',
          width: 1200,
          height: 630,
          alt: 'Publicá tu servicio en PoliserviciosNOA',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `Publicá tu servicio en ${NOMBRE_PAGINA}`,
      description: descripcion,
      images: ['/og-publica-tu-servicio.png'],
    },
    robots: { index: true, follow: true },
  }
}

export const dynamic = 'force-dynamic'

/** Código del cupón de socios fundadores. */
const CUPON_SOCIOS_FUNDADORES = process.env.CUPON_SOCIOS_FUNDADORES ?? 'SOCIO_FUNDADOR'

export default async function PaginaPublicaTuServicio(): Promise<React.ReactElement> {
  const plan = await getCurrentPlan()
  const socios = await contadorSociosFundadores(CUPON_SOCIOS_FUNDADORES)

  return (
    <>
      {/* ------------------------------------------------------------------
       * Hero: el profesional es el protagonista, no un título centrado.
       * ---------------------------------------------------------------- */}
      <section className="border-b-[3px] border-ink">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:py-24">
          <p className="text-sm font-black uppercase tracking-widest">
            Para profesionales y oficios
          </p>

          <h1 className="mt-4 max-w-4xl text-display font-black uppercase tracking-tight">
            Tu servicio,<br />
            visible en tu zona.<br />
            <span className="whitespace-nowrap">Sin comisiones.</span>
          </h1>

          <p className="mt-6 max-w-prose text-lg leading-relaxed">
            Publicá tu perfil, recibí consultas directo por WhatsApp y crecí
            sin intermediarios que se lleven un porcentaje de cada cobro.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <Link
              href="/registro"
              className="btn border-paper bg-paper text-ink hover:bg-ink hover:text-paper"
            >
              Empezar gratis
            </Link>
            <Link
              href="/buscar"
              className="btn border-paper bg-transparent text-ink hover:bg-paper hover:text-paper"
            >
              Ver quiénes ya están
            </Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------
       * Propuesta de valor: qué gana el profesional.
       * ---------------------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-title font-black uppercase">Qué tenés al publicar</h2>

        <ul className="mt-10 grid gap-8 sm:grid-cols-3">
          {[
            {
              titulo: 'Contactos directos por WhatsApp',
              texto:
                'Los clientes te escriben desde la card y el perfil público, ' +
                'con un mensaje predefinido. Nadie interviene en la conversación.',
            },
            {
              titulo: 'Sin comisiones',
              texto:
                'Pagás una suscripción mensual y te quedás con todo lo que ' +
                'cobrás por tus servicios. La plataforma no se lleva nada.',
            },
            {
              titulo: 'WhatsApp verificado',
              texto:
                'Confirmás que el número es tuyo en un minuto, sin subir DNI ' +
                'ni fotos. Eso genera confianza para quien te contrata.',
            },
          ].map((item, i) => (
            <li key={i} className="border-[3px] border-ink p-5 sm:p-8">
              <p className="font-black">{item.titulo}</p>
              <p className="mt-3 text-muted leading-relaxed">{item.texto}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ------------------------------------------------------------------
       * Precio: leído de la base.
       * ---------------------------------------------------------------- */}
      <section className="border-t-[3px] border-b-[3px] border-ink bg-ink text-paper py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-title font-black uppercase">Cuánto cuesta</h2>

          <div className="mt-8 flex flex-col items-start gap-6 sm:flex-row sm:items-center">
            <span className="text-6xl font-black tabular-nums">
              {plan ? formatArsConMes(plan.monto) : 'Consultá precio'}
            </span>
            <span className="text-sm opacity-90">por mes</span>
            <span className="text-sm opacity-70">
              {plan ? 'Suscripción mensual, renovación automática.' : ''}
            </span>
          </div>

          <p className="mt-6 max-w-prose text-lg leading-relaxed opacity-90">
            El precio sale de la plataforma y puede cambiar con aviso previo.{' '}
            {plan
              ? `Hoy es ${formatArsConMes(plan.monto)}/mes.`
              : 'No hay un precio cargado en este momento.'}
          </p>

          {plan && (
            <div className="mt-10 border-t-[3px] border-paper/30 pt-8">
              <p className="text-sm font-bold uppercase tracking-widest mb-3">
                ¿Ya sos socio fundador?
              </p>
              <p className="text-sm leading-relaxed opacity-90">
                Los primeros {socios.cupoMaximo} profesionales usan el cupón{' '}
                <code className="font-mono">{CUPON_SOCIOS_FUNDADORES}</code> y{' '}
                {'quedan '}
                <span className="font-black">{socios.restantes}</span>{' '}
                cupos. Primer mes gratis y precio congelado para siempre.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------------------
       * Cómo funciona: 4 pasos.
       * ---------------------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-title font-black uppercase">Cómo se hace</h2>

        <ol className="mt-12 space-y-10">
          {[
            {
              paso: '1',
              titulo: 'Creá tu cuenta',
              texto:
                'Registrate con email y contraseña. Es gratis y no pide documentos.',
            },
            {
              paso: '2',
              titulo: 'Completá tu perfil',
              texto:
                'Rubro principal, ciudad, descripción, fotos y matrícula si tu ' +
                'oficio la exige.',
            },
            {
              paso: '3',
              titulo: 'Verificá tu WhatsApp',
              texto:
                'Te mandamos un código. Lo escribís desde tu número y ya: ' +
                'verificado en 1 minuto, sin subir documentos ni fotos.',
            },
            {
              paso: '4',
              titulo: 'Activá tu suscripción',
              texto:
                'Pagás el primer mes y tu perfil aparece en las búsquedas de ' +
                'tu zona y rubro.',
            },
          ].map((paso, i) => (
            <li key={i} className="flex flex-col sm:flex-row items-start gap-6">
              <span className="flex-none min-w-[3rem] h-[3rem] border-[3px] border-ink bg-paper items-center justify-center text-3xl font-black uppercase">
                {paso.paso}
              </span>
              <div>
                <p className="font-black">{paso.titulo}</p>
                <p className="mt-2 text-muted leading-relaxed">{paso.texto}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ------------------------------------------------------------------
       * Preguntas frecuentes.
       * ---------------------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-title font-black uppercase">Preguntas frecuentes</h2>

        <dl className="mt-10 divide-y divide-ink/30 border-y-[3px] border-ink space-y-6">
          <div>
            <dt className="font-black">¿Qué significa «WhatsApp verificado»?</dt>
            <dd className="mt-2 text-muted leading-relaxed">
              Significa que confirmaste que el número de WhatsApp es tuyo. La
              plataforma te envía un código y lo escribís desde ese mismo
              número. No pedimos DNI, fotos ni reconocimiento facial: lo que se
              verifica es la titularidad del número, no la identidad civil.
            </dd>
          </div>
          <div>
            <dt className="font-black">¿Cuánto cuesta publicar?</dt>
            <dd className="mt-2 text-muted leading-relaxed">
              Una suscripción mensual que se paga por Mercado Pago. El monto lo
              define la plataforma y se puede cambiar con aviso previo.{' '}
              {plan ? `Hoy es ${formatArsConMes(plan.monto)}/mes.` : ''}
            </dd>
          </div>
          <div>
            <dt className="font-black">¿Puedo cancelar cuando quiera?</dt>
            <dd className="mt-2 text-muted leading-relaxed">
              Sí. Cancelar corta los cobros futuros y tu perfil sigue visible
              hasta que termine el mes que ya pagaste. No hay penalidad.
            </dd>
          </div>
          <div>
            <dt className="font-black">¿Y el botón de arrepentimiento?</dt>
            <dd className="mt-2 text-muted leading-relaxed">
              Si te arrepentís dentro de los 10 días de pagar, te devolvemos el
              dinero y generamos una nota de crédito. Tu perfil se despublica.
            </dd>
          </div>
          <div>
            <dt className="font-black">¿Mis datos están seguros?</dt>
            <dd className="mt-2 text-muted leading-relaxed">
              Tu número de WhatsApp se guarda en claro solo para que los
              clientes te puedan escribir, y hasheado para detectar duplicados.
              No pedimos ni guardamos DNI ni datos biométricos.
            </dd>
          </div>
        </dl>
      </section>

      {/* ------------------------------------------------------------------
       * Testimonios (placeholders).
       * ---------------------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-4 py-16 border-t-[3px] border-ink">
        <h2 className="text-title font-black uppercase">Lo que dicen</h2>
        <p className="mt-4 text-muted">
          Testimonios de los primeros profesionales. Reemplazá con casos reales
          antes de lanzar.
        </p>

        <ul className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <li key={i} className="border-[3px] border-ink p-5">
              <p className="text-muted leading-relaxed">
                «PoliserviciosNOA me trajo los primeros clientes sin tener que
                pagar comisiones. El contacto es directo y rápido.»
              </p>
              <p className="mt-4 font-black">Profesional • Rubro ejemplo</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ------------------------------------------------------------------
       * CTA final.
       * ---------------------------------------------------------------- */}
      <section className="mx-auto max-w-6xl px-4 py-20 border-t-[3px] border-ink bg-ink text-paper">
        <div className="border-[3px] border-paper p-8 sm:p-12 text-center">
          <h2 className="text-4xl font-black uppercase">¿Empezamos?</h2>
          <p className="mt-4 max-w-prose mx-auto text-lg leading-relaxed opacity-90">
            Creá tu cuenta gratis, completá tu perfil y verificá tu WhatsApp.{' '}
            {socios.restantes > 0 && (
              <>
                {' '}
                Quedan <span className="font-black">{socios.restantes}</span> cupos de socio fundador.
              </>
            )}
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/registro"
              className="btn border-paper bg-paper text-ink hover:bg-ink hover:text-paper"
            >
              Crear mi cuenta
            </Link>
            <Link
              href="/buscar"
              className="btn border-paper bg-transparent text-paper hover:bg-paper hover:text-ink"
            >
              Buscar profesionales
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}

/** `$X.XXX/mes` con el separador de miles de Argentina. */
function formatArsConMes(monto: number): string {
  return `$${monto.toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}/mes`
}
