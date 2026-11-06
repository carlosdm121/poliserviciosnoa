import type { Metadata, Viewport } from 'next'

import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { ServiceWorkerRegister } from '@/components/legales/ServiceWorkerRegister'
import { cn } from '@/lib/cn'
import { NOMBRE_PAGINA } from '@/lib/constantes'

import './globals.css'

/**
 * Metadata raíz.
 *
 * El template `%s` es lo que hace que cada página tenga su propio título sin
 * declararlo completo. `title.default` aparece cuando una página no define
 * título.
 *
 * `metadataBase` es obligatorio para que las URLs de Open Graph sean
 * absolutas: sin esto, WhatsApp y Facebook muestran la imagen como relativa y
 * no la renderizan.
 */
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL ?? 'http://localhost:3000'),
  title: {
    default: `${NOMBRE_PAGINA} — Encontrá un profesional en el NOA`,
    template: `%s | ${NOMBRE_PAGINA}`,
  },
  description:
    'Plomeros, electricistas, beauty, fletes, clases y más en Tucumán, Salta, ' +
    'Santiago del Estero, Catamarca y Jujuy. Contactá directo por WhatsApp.',
  keywords: [
    'poliservicios',
    'profesionales Tucumán',
    'plomero Tucumán',
    'electricista Salta',
    'servicios Jujuy',
    'oficios NOA',
  ],
  openGraph: {
    type: 'website',
    locale: 'es_AR',
    siteName: NOMBRE_PAGINA,
  },
  twitter: {
    card: 'summary_large_image',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export const viewport: Viewport = {
  themeColor: '#0A0A0A',
  width: 'device-width',
  initialScale: 1,
  // Sin zoom bloqueado: impedirlo rompe la accesibilidad para quien necesita
  // ampliar el texto.
  maximumScale: 5,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}): React.ReactElement {
  return (
    <html lang="es-AR">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/icon-192.svg"
        />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black" />
        <meta name="apple-mobile-web-app-title" content="PoliserviciosNOA" />
      </head>
      <body className={cn('flex min-h-screen flex-col')}>
        <ServiceWorkerRegister />
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-ink focus:px-4 focus:py-3 focus:text-paper"
        >
          Saltar al contenido
        </a>

        <Header />

        <main id="contenido" className="flex-1">
          {children}
        </main>

        <Footer />
      </body>
    </html>
  )
}