
import withPWA from 'next-pwa'

/**
 * Headers estáticos de next.config.
 *
 * La CSP NO va acá: la construye el middleware con nonce por request
 * (ver src/lib/security-headers.ts). Tenerla también acá generaba dos
 * cabeceras en conflicto y una CSP enforced sin nonce que rompía Next.js.
 */
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  // HSTS: forzamos HTTPS durante dos años, subdominios incluidos.
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  // Enviamos solo el origen: no filtramos la URL completa a recursos externos.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // La app no usa cámara ni micrófono: cerrar todo salvo lo imprescindible.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Imágenes servidas desde Cloudinary. El host está en la whitelist de
  // next.config porque el optimizer de Next no puede validar dominios
  // arbitrarios en runtime.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        pathname: '/**',
      },
    ],
    // El 90% del tráfico es móvil con 3G/4G: formatos modernos y tamaños
    // acotados para no gastar datos de más.
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [360, 390, 640, 768, 1024, 1280, 1536],
    imageSizes: [64, 96, 128, 256, 384],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        // Páginas privadas: nunca deben quedar en caché compartida ni ser
        // indexadas por error.
        source: '/panel/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
      {
        source: '/admin/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
      {
        source: '/mis-contactos/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ]
  },

  // eslint en build: un lint roto no llega a producción.
  eslint: {
    dirs: ['src'],
  },

  // Desactiva el header X-Powered-By de Next.js para no revelar el framework.
  poweredByHeader: false,
}

export default nextConfig

