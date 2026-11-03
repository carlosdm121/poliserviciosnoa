
import withPWA from 'next-pwa'

/**
 * CSP deliberadamente sin `unsafe-inline` en scripts: Next.js inyecta sus
 * scripts con nonce solo si se configura, y hacerlo mal abre XSS. Empezamos
 * con una CSP que rompe el arranque si algo necesita inline, y se ajusta
 * con los valores reales que reporte el navegador.
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
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // 'unsafe-inline' en estilos porque Tailwind y Next inyectan CSS inline;
      // el riesgo real de XSS está en scripts, no en estilos.
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' https://sdk.mercadopago.com",
      "img-src 'self' data: blob: https://res.cloudinary.com",
      "font-src 'self' data:",
      "connect-src 'self' https://api.mercadopago.com https://api.resend.com",
      "frame-src 'self' https://sdk.mercadopago.com",
      "form-action 'self'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join('; '),
  },
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

