import { ModerationStatus, SubscriptionStatus } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import {
  CONDICION_PERFIL_PUBLICO,
  MOTIVOS_BLOQUEO,
  evaluarPublicacion,
  type MotivoBloqueo,
} from '@/services/publicacion'

/**
 * Tabla de combinaciones de la regla de publicación.
 *
 * Esta función decide si un perfil se ve en las búsquedas. Un error acá es el
 * más caro del portal: un perfil que aparece y no puede abrirse, o un perfil
 * vencido que sigue recibiendo clientes que escriben a un número que ya no
 * atiende. Por eso se prueba como tabla y no con un par de casos sueltos.
 *
 * La tabla cubre el producto cartesiano relevante: cada motivo aparece solo y
 * acompañado de otros, para verificar que se acumulan y que **solo uno** es
 * suficiente para bloquear.
 */

/** Perfil que cumple todo. Cada caso parte de acá y le saca una cosa. */
const COMPLETO = {
  userId: 'u1',
  baseCityId: 'ciudad-1',
  whatsappVerifiedAt: new Date('2026-01-01'),
  name: 'Carlos Ramírez',
  description: 'Electricista con quince años de oficio.',
  isPublished: false,
  moderationStatus: ModerationStatus.APPROVED,
  unpublishedReason: null,
  images: [{ id: 'img-1' }],
  categories: [{ isPrimary: true }],
  subscription: {
    status: SubscriptionStatus.ACTIVE,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: new Date('2026-12-01'),
    graceUntil: null,
  },
}

function sin(override: Record<string, unknown>) {
  return { ...COMPLETO, ...override }
}

describe('evaluarPublicacion', () => {
  it('publica un perfil que cumple todo', () => {
    const evaluacion = evaluarPublicacion(sin({}), true)

    expect(evaluacion.publicable).toBe(true)
    expect(evaluacion.motivos).toHaveLength(0)
  })

  it('no publica sin email verificado', () => {
    expect(evaluarPublicacion(sin({}), false).motivos).toContain('EMAIL_SIN_VERIFICAR')
  })

  it('no publica sin WhatsApp verificado', () => {
    expect(evaluarPublicacion(sin({ whatsappVerifiedAt: null }), true).motivos).toContain(
      'WHATSAPP_SIN_VERIFICAR',
    )
  })

  it.each([
    [null, 'SIN_SUSCRIPCION'],
    [{ ...COMPLETO.subscription, status: SubscriptionStatus.PENDING }, 'SIN_SUSCRIPCION'],
    [{ ...COMPLETO.subscription, status: SubscriptionStatus.CANCELLED }, 'SIN_SUSCRIPCION'],
    [{ ...COMPLETO.subscription, status: SubscriptionStatus.PAST_DUE }, 'SIN_SUSCRIPCION'],
  ] as const)('no publica con suscripción %s', (subscription, motivo) => {
    const evaluacion = evaluarPublicacion(sin({ subscription }), true)

    expect(evaluacion.publicable).toBe(false)
    expect(evaluacion.motivos).toContain(motivo)
  })

  it('mantiene publicado un PAST_DUE dentro de la gracia', () => {
    const ahora = new Date('2026-03-10T12:00:00.000Z')
    const evaluacion = evaluarPublicacion(
      sin({
        subscription: {
          ...COMPLETO.subscription,
          status: SubscriptionStatus.PAST_DUE,
          currentPeriodEnd: new Date('2026-03-01T00:00:00.000Z'),
          graceUntil: new Date('2026-03-12T00:00:00.000Z'),
        },
      }),
      true,
      false,
      ahora,
    )

    expect(evaluacion.publicable).toBe(true)
    expect(evaluacion.motivos).not.toContain('SIN_SUSCRIPCION')
  })

  it('despublica un PAST_DUE con la gracia vencida', () => {
    const ahora = new Date('2026-03-13T00:00:00.000Z')
    const evaluacion = evaluarPublicacion(
      sin({
        subscription: {
          ...COMPLETO.subscription,
          status: SubscriptionStatus.PAST_DUE,
          currentPeriodEnd: new Date('2026-03-01T00:00:00.000Z'),
          graceUntil: new Date('2026-03-12T00:00:00.000Z'),
        },
      }),
      true,
      false,
      ahora,
    )

    expect(evaluacion.publicable).toBe(false)
    expect(evaluacion.motivos).toContain('SIN_SUSCRIPCION')
  })

  it('un PAST_DUE sin período pagado no se publica aunque tenga gracia', () => {
    const ahora = new Date('2026-03-10T12:00:00.000Z')
    const evaluacion = evaluarPublicacion(
      sin({
        subscription: {
          ...COMPLETO.subscription,
          status: SubscriptionStatus.PAST_DUE,
          currentPeriodEnd: null,
          graceUntil: new Date('2026-03-12T00:00:00.000Z'),
        },
      }),
      true,
      false,
      ahora,
    )

    expect(evaluacion.publicable).toBe(false)
  })

  it('no publica sin imágenes', () => {
    expect(evaluarPublicacion(sin({ images: [] }), true).motivos).toContain('SIN_IMAGENES')
  })

  it('no publica sin rubro principal', () => {
    expect(evaluarPublicacion(sin({ categories: [{ isPrimary: false }] }), true).motivos).toContain(
      'SIN_RUBRO_PRINCIPAL',
    )
  })

  it('no publica sin ciudad base', () => {
    expect(evaluarPublicacion(sin({ baseCityId: null }), true).motivos).toContain('PERFIL_INCOMPLETO')
  })

  it.each([
    ['', 'vacía'],
    ['   ', 'con espacios'],
    ['Corto', 'de menos de 20 caracteres'],
    ['x'.repeat(19), 'justo por debajo del límite'],
  ])('no publica con descripción "%s" (%s)', (description) => {
    expect(evaluarPublicacion(sin({ description }), true).motivos).toContain('PERFIL_INCOMPLETO')
  })

  it('publica con una descripción de exactamente 20 caracteres', () => {
    const resultado = evaluarPublicacion(sin({ description: 'x'.repeat(20) }), true)

    expect(resultado.motivos).not.toContain('PERFIL_INCOMPLETO')
  })

  it('acumula todos los motivos que faltan', () => {
    const evaluacion = evaluarPublicacion(
      sin({
        whatsappVerifiedAt: null,
        baseCityId: null,
        description: null,
        images: [],
        categories: [],
        subscription: null,
      }),
      false,
    )

    expect(evaluacion.motivos).toEqual(
      expect.arrayContaining([
        'EMAIL_SIN_VERIFICAR',
        'WHATSAPP_SIN_VERIFICAR',
        'SIN_SUSCRIPCION',
        'SIN_IMAGENES',
        'SIN_RUBRO_PRINCIPAL',
        'PERFIL_INCOMPLETO',
      ]),
    )
  })
})

describe('moderación', () => {
  it('no publica un perfil suspendido', () => {
    const evaluacion = evaluarPublicacion(
      sin({ moderationStatus: ModerationStatus.SUSPENDED }),
      true,
    )

    expect(evaluacion.motivos).toContain('SUSPENDIDO')
  })

  it('no publica un perfil rechazado', () => {
    const evaluacion = evaluarPublicacion(
      sin({ moderationStatus: ModerationStatus.REJECTED }),
      true,
    )

    expect(evaluacion.motivos).toContain('RECHAZADO')
  })

  it('publica un PENDING_REVIEW si no se exige aprobación manual', () => {
    const evaluacion = evaluarPublicacion(
      sin({ moderationStatus: ModerationStatus.PENDING_REVIEW }),
      true,
      false,
    )

    expect(evaluacion.publicable).toBe(true)
  })

  it('no publica un PENDING_REVIEW si se exige aprobación manual', () => {
    const evaluacion = evaluarPublicacion(
      sin({ moderationStatus: ModerationStatus.PENDING_REVIEW }),
      true,
      true,
    )

    expect(evaluacion.motivos).toContain('APROBACION_PENDIENTE')
  })

  it('la aprobación manual no cambia nada si el perfil ya está aprobado', () => {
    const conBandera = evaluarPublicacion(sin({}), true, true)

    expect(conBandera.publicable).toBe(true)
  })
})

describe('coherencia entre la función y el predicado SQL', () => {
  it('el predicado excluye suspended y rejected', () => {
    const notIn = CONDICION_PERFIL_PUBLICO.moderationStatus.notIn

    expect(notIn).toContain(ModerationStatus.SUSPENDED)
    expect(notIn).toContain(ModerationStatus.REJECTED)
  })

  it('el predicado no excluye pending_review', () => {
    // Si lo excluyera, con la bandera apagada un perfil pendiente desaparecería
    // de la búsqueda aunque `isPublished` fuera true, y las dos reglas dirían
    // cosas distintas sobre el mismo perfil.
    const notIn = CONDICION_PERFIL_PUBLICO.moderationStatus.notIn

    expect(notIn).not.toContain(ModerationStatus.PENDING_REVIEW)
  })

  it('el predicado exige isPublished', () => {
    expect(CONDICION_PERFIL_PUBLICO.isPublished).toBe(true)
  })
})

describe('MOTIVOS_BLOQUEO', () => {
  it('tiene texto para todos los motivos posibles', () => {
    // Si se agrega un motivo y no su texto, TypeScript lo marca acá; este test
    // es la red por si alguien castea el tipo a string.
    const motivos: MotivoBloqueo[] = [
      'EMAIL_SIN_VERIFICAR',
      'WHATSAPP_SIN_VERIFICAR',
      'SIN_SUSCRIPCION',
      'SUSCRIPCION_VENCIDA',
      'SIN_IMAGENES',
      'SIN_RUBRO_PRINCIPAL',
      'PERFIL_INCOMPLETO',
      'APROBACION_PENDIENTE',
      'SUSPENDIDO',
      'RECHAZADO',
    ]

    for (const motivo of motivos) {
      expect(MOTIVOS_BLOQUEO[motivo]).toBeTruthy()
    }
  })

  it('cada motivo dice qué puede hacer, no solo qué falta', () => {
    for (const texto of Object.values(MOTIVOS_BLOQUEO)) {
      // Un texto como "Falta el WhatsApp" genera una llamada a soporte. Uno
      // como "Verificá tu número de WhatsApp" no.
      expect(texto.length).toBeGreaterThan(25)
      expect(texto).toMatch(/[.áéíóúñ]/i)
    }
  })
})