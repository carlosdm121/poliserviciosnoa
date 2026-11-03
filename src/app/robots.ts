import { MetadataRoute } from 'next'

const URL_BASE = (process.env.NEXTAUTH_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

/**
 * robots.txt.
 *
 * Bloquea las zonas privadas del sitio (/panel, /admin, /api y
 * /mis-contactos, entre otras) y apunta al sitemap. Las páginas de resultados
 * sin perfiles además se marcan con `noindex` desde su propio `generateMetadata`.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/panel/',
          '/admin/',
          '/api/',
          '/mis-contactos',
          '/login',
          '/registro',
          '/baja',
          '/arrepentimiento',
          '/libro-de-quejas',
          '/soporte',
        ],
      },
    ],
    sitemap: `${URL_BASE}/sitemap.xml`,
  }
}
