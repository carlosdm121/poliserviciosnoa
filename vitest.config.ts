import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

/**
 * Configuración de Vitest.
 *
 * Solo se define el alias `@/`, que en el resto del proyecto lo pone Next.
 * Sin esto los tests no importarían nada del código que están probando.
 *
 * No hay `environment: 'jsdom'` a propósito: la lógica es pura o de servidor.
 * Los componentes se renderizan con `react-dom/server` y se prueban por
 * contenido; la interacción real va con Playwright en el módulo 12.
 */
export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
  // Next usa el runtime automático de JSX. Sin esto, Vite toma el
  // `jsx: preserve` del tsconfig y los componentes fallan con
  // "React is not defined" al renderizarlos con react-dom/server.
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**'],
    /**
     * `env.ts` valida TODAS las variables al importarse y falla si falta una,
     * que es el comportamiento que se quiere en la app. En los tests hay que
     * dárselas todas: leer el `.env` local haría que los tests pasaran en la
     * máquina del desarrollo y fallaran en cualquier otro lado.
     */
    env: {
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/poliservicios_test',
      NEXTAUTH_SECRET: 'secreto-de-prueba-para-los-tests-de-verify',
      NEXTAUTH_URL: 'http://localhost:3000',
      RESEND_API_KEY: 're_test',
      MP_ACCESS_TOKEN: 'TEST-token-de-prueba',
      MP_WEBHOOK_SECRET: 'secreto-webhook-de-prueba',
      CLOUDINARY_CLOUD_NAME: 'test',
      CLOUDINARY_API_KEY: '000000000000000',
      CLOUDINARY_API_SECRET: 'test',
      UPSTASH_REDIS_REST_URL: 'https://test.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'token',
      CRON_SECRET: 'secreto-cron-de-prueba',
      PHONE_HASH_PEPPER: 'pepper-de-prueba-de-32-caracteres-minimo',
      DATA_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    },
  },
})