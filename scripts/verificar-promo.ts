#!/usr/bin/env node
import { PrismaClient } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { obtenerEstadoPanel } from '@/services/panel'

/**
 * Verifica el flujo completo de la promo reservada.
 *
 * Ejecuta: npx ts-node scripts/verificar-promo.ts
 */
async function main() {
  console.log('🔍 Verificando flujo de promo reservada...')

  // 1. Buscar un perfil con suscripción PENDING y cupón pendiente
  const perfilConCupo = await prisma.profile.findFirst({
    where: {
      subscription: {
        status: 'PENDING',
        pendingCouponCode: { not: null },
      },
    },
  })

  if (!perfilConCupo) {
    console.error('❌ No se encontró un perfil con suscripción PENDING y cupón pendiente')
    process.exit(1)
  }

  // 2. Verificar estado PENDING en suscripción
  const suscripcion = await prisma.subscription.findFirst({
    where: {
      profileId: perfilConCupo.id,
      status: 'PENDING',
    },
  })

  if (!suscripcion || !suscripcion.pendingCouponCode) {
    console.error('❌ La suscripción no está en estado PENDING o no tiene cupón pendiente')
    process.exit(1)
  }

  // 3. Verificar que la promo esté reservada
  const estadoPanel = await obtenerEstadoPanel(perfilConCupo.id)

  if (!estadoPanel || !estadoPanel.promoReservada) {
    console.error('❌ La promo NO está reservada')
    process.exit(1)
  }

  // 4. Verificar que el perfil tenga imágenes (banner/cards)
  const perfilConImagenes = await prisma.profile.findFirst({
    where: {
      id: perfilConCupo.id,
    },
    include: { images: true },
  })

  if (!perfilConImagenes || perfilConImagenes.images.length === 0) {
    console.error('❌ El perfil no tiene imágenes')
    process.exit(1)
  }

  // 5. Verificar que la suscripción esté ACTIVE
  const suscripcionActiva = await prisma.subscription.findFirst({
    where: {
      profileId: perfilConCupo.id,
      status: 'ACTIVE',
    },
  })

  if (!suscripcionActiva) {
    console.error('❌ La suscripción NO está en estado ACTIVE')
    process.exit(1)
  }

  console.log('✅ Verificación completada: todo está listo para la promo reservada')
}

main().catch(error => {
  console.error('❌ Error:', error.message)
  process.exit(1)
})