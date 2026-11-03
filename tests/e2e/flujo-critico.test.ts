import { test, expect } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import { createHmac } from 'node:crypto'

/**
 * Test E2E del flujo crítico de PoliserviciosNOA.
 *
 * Prueba de punta a punta el camino que convierte a un visitante en un
 * contacto real:
 *
 *   1. Un profesional se da de alta y completa su perfil (datos creados por
 *      Prisma, igual que los scripts de `scripts/verificar-*.ts`).
 *   2. Verifica su número de WhatsApp con el simulador de Meta
 *      (`/api/dev/whatsapp-simulate`).
 *   3. Queda con una suscripción activa (pago por el mock de Mercado Pago,
 *      ya cubierto por `verificar-suscripcion.ts` y `webhook-mp.test.ts`).
 *   4. Su perfil aparece en la búsqueda pública (`/buscar?rubro=...`).
 *   5. Un visitante puede contactarlo por WhatsApp
 *      (`/api/contacto/[slug]` redirige a wa.me con el mensaje predefinido).
 *
 * No importa nada de `src/` con el alias `@/` (Playwright no lo resuelve): usa
 * solo paquetes (`@prisma/client`, `@playwright/test`, `node:crypto`) y
 * `fetch` contra el servidor Next.js levantado.
 *
 * Prerrequisitos para correr:
 *   - Una Postgres levantada con el schema aplicado (embeded-postgres o similar).
 *   - Un servidor Next.js escuchando en `process.env.NEXTAUTH_URL`
 *     (default http://localhost:3000).
 *   - Las variables de entorno que valida `src/lib/env.ts`, incluida
 *     `PHONE_HASH_PEPPER` (necesaria para crear el código de verificación).
 *
 * Uso:
 *   DATABASE_URL=... NEXTAUTH_URL=http://localhost:3000 \
 *     npx playwright test tests/e2e/flujo-critico.test.ts
 */

const PEPPER = 'pepper-de-prueba-de-32-caracteres-minimo'

// Slugs fijos para que el test sea repetible (se borran y vuelven a crear).
const SLUG_RUBRO = 'electricista-e2e'
const NOMBRE_RUBRO = 'Electricista E2E'
const SLUG_CIUDAD = 'yerba-buena-e2e'
const NOMBRE_CIUDAD = 'Yerba Buena E2e'
const SLUG_PERFIL = 'electricista-de-prueba-e2e'
const NUMERO_WHATSAPP = '5493811234567'
const CODIGO_VERIFICACION = 'ABC123'

function hashCodigo(codigo: string): string {
  return createHmac('sha256', PEPPER).update(codigo).digest('hex')
}

const BASE_URL = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'

let prisma: PrismaClient

let ids: {
  grupoId: string
  rubroId: string
  ciudadId: string
  usuarioId: string
  perfilId: string
  suscripcionId: string
}

test.describe('flujo crítico de punta a punta', () => {
  test.beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        'Falta DATABASE_URL. Levantá una Postgres (ej. scripts/verificar.ts) y definí DATABASE_URL antes de correr el E2E.',
      )
    }

    prisma = new PrismaClient()

    // Creamos todo lo necesario para que un perfil quede publicable, salvo la
    // verificación de WhatsApp (que hacemos con el simulador dentro del test).
    const grupo = await prisma.categoryGroup.create({
      data: { name: 'Oficios E2E', slug: 'oficios-e2e', icon: 'herramientas', sortOrder: 1 },
    })
    const rubro = await prisma.category.create({
      data: {
        name: NOMBRE_RUBRO,
        slug: SLUG_RUBRO,
        icon: 'electricidad',
        groupId: grupo.id,
        isActive: true,
      },
    })
    const ciudad = await prisma.city.create({
      data: { name: NOMBRE_CIUDAD, slug: SLUG_CIUDAD, province: 'TUCUMAN', sortOrder: 1 },
    })
    const usuario = await prisma.user.create({
      data: {
        email: 'electricista.e2e@test.com',
        emailVerified: new Date(),
        name: 'Electricista de Prueba',
        role: 'PROFESSIONAL',
      },
    })
    const perfil = await prisma.profile.create({
      data: {
        userId: usuario.id,
        type: 'PERSON',
        name: 'Electricista de Prueba E2E',
        slug: SLUG_PERFIL,
        whatsappE164: NUMERO_WHATSAPP,
        whatsappHash: hashCodigo(NUMERO_WHATSAPP),
        whatsappVerifiedAt: null, // se verifica con el simulador en el test
        description:
          'Hacemos instalaciones eléctricas y reparaciones en el día. Presupuesto sin cargo.',
        shortBio: 'Electricista en Yerba Buena.',
        baseCityId: ciudad.id,
        moderationStatus: 'APPROVED',
        isPublished: false, // se publica tras cumplir todos los requisitos
      },
    })
    await prisma.image.create({
      data: {
        profileId: perfil.id,
        publicId: 'e2e/foto-prueba',
        url: 'https://res.cloudinary.com/demo/image/upload/foto-prueba.jpg',
        width: 1200,
        height: 900,
        sortOrder: 0,
        isHidden: false,
      },
    })
    await prisma.profileCategory.create({
      data: { profileId: perfil.id, categoryId: rubro.id, isPrimary: true },
    })
    const suscripcion = await prisma.subscription.create({
      data: {
        profileId: perfil.id,
        planId: null,
        planAmount: 10000,
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })

    ids = {
      grupoId: grupo.id,
      rubroId: rubro.id,
      ciudadId: ciudad.id,
      usuarioId: usuario.id,
      perfilId: perfil.id,
      suscripcionId: suscripcion.id,
    }
  })

  test.afterAll(async () => {
    // Borra en orden inverso a las claves foráneas.
    await prisma.image.deleteMany({ where: { profileId: ids.perfilId } })
    await prisma.profileCategory.deleteMany({ where: { profileId: ids.perfilId } })
    await prisma.whatsAppVerification.deleteMany({ where: { profileId: ids.perfilId } })
    await prisma.subscription.delete({ where: { id: ids.suscripcionId } })
    await prisma.profile.delete({ where: { id: ids.perfilId } })
    await prisma.user.delete({ where: { id: ids.usuarioId } })
    await prisma.city.delete({ where: { id: ids.ciudadId } })
    await prisma.category.delete({ where: { id: ids.rubroId } })
    await prisma.categoryGroup.delete({ where: { id: ids.grupoId } })

    await prisma.$disconnect()
  })

  test('verifica WhatsApp con el simulador, aparece en búsqueda y se puede contactar', async () => {
    // ------------------------------------------------------------------
    // 1. Verificación de WhatsApp con el simulador de Meta.
    // ------------------------------------------------------------------
    await prisma.whatsAppVerification.create({
      data: {
        profileId: ids.perfilId,
        phoneE164: NUMERO_WHATSAPP,
        codeHash: hashCodigo(CODIGO_VERIFICACION),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        status: 'PENDING',
        attempts: 0,
        messageId: 'wamid.E2E.TEST.1',
      },
    })

    const simulador = await fetch(`${BASE_URL}/api/dev/whatsapp-simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: NUMERO_WHATSAPP,
        text: `Código: ${CODIGO_VERIFICACION}`,
        messageId: 'wamid.E2E.TEST.1',
      }),
    })

    expect(simulador.status).toBe(200)

    // Tras el simulador, el perfil debe tener el número verificado.
    const perfil = await prisma.profile.findUnique({ where: { slug: SLUG_PERFIL } })
    expect(perfil?.whatsappVerifiedAt).not.toBeNull()

    // ------------------------------------------------------------------
    // 2. Suscripción activa → el perfil se publica.
    // ------------------------------------------------------------------
    // (La suscripción ya se creó ACTIVE en beforeAll. Marcamos el perfil como
    //  publicable: en producción lo hace sincronizarPublicacion; aquí lo fijamos
    //  directamente tras haber cumplido todos los requisitos.)
    await prisma.profile.update({
      where: { id: ids.perfilId },
      data: { isPublished: true },
    })

    // ------------------------------------------------------------------
    // 3. El perfil aparece en la búsqueda pública por rubro.
    // ------------------------------------------------------------------
    const buscar = await fetch(`${BASE_URL}/buscar?rubro=${SLUG_RUBRO}`)
    expect(buscar.status).toBe(200)
    const html = await buscar.text()
    expect(html).toContain('Electricista de Prueba E2E')
    expect(html).toContain(SLUG_PERFIL)

    // ------------------------------------------------------------------
    // 4. Contacto por WhatsApp: redirige a wa.me con el mensaje predefinido.
    // ------------------------------------------------------------------
    // `redirect: 'manual'` para no seguir el redirect a wa.me (red externa) y
    // poder chequear el 302 y el Location de nuestro propio endpoint.
    const contacto = await fetch(`${BASE_URL}/api/contacto/${SLUG_PERFIL}`, {
      redirect: 'manual',
    })

    expect(contacto.status).toBe(302)
    const location = contacto.headers.get('location') ?? ''
    expect(location).toContain(`https://wa.me/${NUMERO_WHATSAPP}`)
    expect(location).toContain(encodeURIComponent('quiero solicitar tus servicios'))
  })

  test('un perfil no publicado no aparece en la búsqueda', async () => {
    // Creamos un segundo perfil idéntico pero sin publicar.
    const oculto = await prisma.profile.create({
      data: {
        userId: ids.usuarioId,
        type: 'PERSON',
        name: 'Oculto E2E',
        slug: 'oculto-e2e',
        whatsappE164: '5493811234568',
        whatsappHash: hashCodigo('5493811234568'),
        whatsappVerifiedAt: new Date(),
        description: 'Este perfil no debe aparecer en la búsqueda.',
        baseCityId: ids.ciudadId,
        moderationStatus: 'APPROVED',
        isPublished: false,
      },
    })

    await prisma.image.create({
      data: {
        profileId: oculto.id,
        publicId: 'e2e/foto-oculta',
        url: 'https://res.cloudinary.com/demo/image/upload/foto-oculta.jpg',
        width: 800,
        height: 600,
        sortOrder: 0,
        isHidden: false,
      },
    })
    await prisma.profileCategory.create({
      data: { profileId: oculto.id, categoryId: ids.rubroId, isPrimary: true },
    })
    await prisma.subscription.create({
      data: {
        profileId: oculto.id,
        planId: null,
        planAmount: 10000,
        status: 'ACTIVE',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })

    const buscar = await fetch(`${BASE_URL}/buscar?rubro=${SLUG_RUBRO}`)
    const html = await buscar.text()

    expect(html).not.toContain('Oculto E2E')
    expect(html).not.toContain('oculto-e2e')

    // Limpieza del perfil oculto.
    await prisma.image.deleteMany({ where: { profileId: oculto.id } })
    await prisma.profileCategory.deleteMany({ where: { profileId: oculto.id } })
    await prisma.subscription.deleteMany({ where: { profileId: oculto.id } })
    await prisma.profile.delete({ where: { id: oculto.id } })
  })
})
