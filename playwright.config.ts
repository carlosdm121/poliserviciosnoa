import { defineConfig, devices } from '@playwright/test'

/**
 * Configuración de Playwright para PoliserviciosNOA.
 *
 * Los tests E2E corren contra un servidor Next.js levantado (p. ej. `next dev`)
 * y una base de datos Postgres ya inicializada (como los scripts de
 * `scripts/verificar-*.ts`). Se conectan por HTTP con `page.request`, así que
 * no hacen falta navegadores descargados: basta con el paquete @playwright/test.
 *
 * Prerrequisitos para correr:
 *   - DATABASE_URL apuntando a una Postgres con el schema aplicado y seed.
 *   - NEXTAUTH_URL apuntando al servidor Next.js (default http://localhost:3000).
 *   - Las variables de entorno que valida src/lib/env.ts (ver .env.example).
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? undefined : 1,
  reporter: 'html',

  use: {
    baseURL: process.env.NEXTAUTH_URL ?? 'http://localhost:3000',
    extraHTTPHeaders: {
      // Las rutas API leen la sesión de NextAuth por cookie; los tests E2E
      // crean datos por Prisma y llaman rutas públicas o de desarrollo, así que
      // no necesitan autenticación de sesión.
    },
    // Timeout generoso: las rutas pueden tocar servicios externos (mock de
    // Mercado Pago, simulador de WhatsApp) y la base de datos.
    actionTimeout: 15_000,
    navigationTimeout: 15_000,
  },

  projects: [
    {
      name: 'flujo-critico',
      use: devices['Desktop Chrome'],
    },
  ],
})
