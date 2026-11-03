import { SubscriptionStatus } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import { ErrorMontoInvalido } from '@/lib/dinero'
import {
  evaluarRequisitosPago,
  finDeGracia,
  finDePeriodo,
  importeParaPasarela,
  precioDeAlta,
  puedeSuscribirse,
  resumenCondiciones,
  VERSION_TERMINOS,
} from '@/lib/suscripcion'
import { CONDICIONES_IVA, CONDICION_IVA_VALORES, datosFiscalesSchema } from '@/schemas/suscripcion'

/**
 * Lógica pura del módulo 2.3.
 *
 * Lo que necesita base de datos real está en `scripts/verificar-suscripcion.ts`.
 * Acá va lo que se puede decidir con un objeto en la mano, que es la parte donde
 * los errores salen por un `if` mal puesto y no por una carrera.
 */

const COMPLETO = {
  emailVerificado: true,
  whatsappVerificado: true,
  tieneRubroPrincipal: true,
  perfilCompleto: true,
  tieneDatosFiscales: true,
}

describe('requisitos para pagar', () => {
  it('con todo cargado no falta nada', () => {
    expect(evaluarRequisitosPago(COMPLETO)).toEqual([])
  })

  it('cada requisito aparece cuando falta lo suyo y solo ese', () => {
    const casos = [
      ['emailVerificado', 'EMAIL_SIN_VERIFICAR'],
      ['whatsappVerificado', 'WHATSAPP_SIN_VERIFICAR'],
      ['tieneRubroPrincipal', 'SIN_RUBRO_PRINCIPAL'],
      ['perfilCompleto', 'PERFIL_INCOMPLETO'],
      ['tieneDatosFiscales', 'DATOS_FISCALES_INCOMPLETOS'],
    ] as const

    for (const [campo, esperado] of casos) {
      const entrada = { ...COMPLETO, [campo]: false }

      expect(evaluarRequisitosPago(entrada), `faltando ${campo}`).toEqual([esperado])
    }
  })

  it('con un perfil recién dado de alta faltan los tres más comunes', () => {
    const faltantes = evaluarRequisitosPago({
      emailVerificado: false,
      whatsappVerificado: false,
      tieneRubroPrincipal: false,
      perfilCompleto: false,
      tieneDatosFiscales: false,
    })

    expect(faltantes).toHaveLength(5)
    expect(faltantes).toContain('DATOS_FISCALES_INCOMPLETOS')
  })

  /**
   * Las fotos NO bloquean el pago.
   *
   * Es una decisión del módulo, no un olvido: `evaluarPublicacion` exige al menos
   * una foto para publicar, pero pedirla para cobrar deja al profesional en una
   * pantalla donde no puede avanzar hasta tener una foto, y la foto no tiene nada
   * que ver con el comprobante. Si este test falla porque alguien agregó el
   * requisito, que se haga a propósito y no por arrastre.
   */
  it('no pide fotos para cobrar', () => {
    expect(evaluarRequisitosPago(COMPLETO)).not.toContain('SIN_IMAGENES')
  })
})

describe('estado de la suscripción', () => {
  it('con ACTIVE no se puede volver a suscribir', () => {
    expect(puedeSuscribirse(SubscriptionStatus.ACTIVE)).toBe(false)
  })

  /**
   * PENDING no bloquea, y es lo que evita el callejón sin salida.
   *
   * Un PENDING es un intento a medias: se cerró la pestaña en el checkout o la
   * tarjeta no pasó. Si el botón dijera "ya tenés una suscripción en curso" sin
   * más, el profesional queda trabado en una pantalla que no lo deja seguir ni
   * cancelar. Se reabre el mismo intento sobre la misma fila.
   */
  it('con PENDING se puede reabrir el intento', () => {
    expect(puedeSuscribirse(SubscriptionStatus.PENDING)).toBe(true)
  })

  it('con EXPIRED, CANCELLED o sin suscripción se puede volver a suscribir', () => {
    expect(puedeSuscribirse(SubscriptionStatus.EXPIRED)).toBe(true)
    expect(puedeSuscribirse(SubscriptionStatus.CANCELLED)).toBe(true)
    expect(puedeSuscribirse(SubscriptionStatus.PAST_DUE)).toBe(true)
    expect(puedeSuscribirse(null)).toBe(true)
  })
})

describe('precio congelado', () => {
  it('sin congelamiento se cobra el precio del plan', () => {
    expect(precioDeAlta(8000, false, 10000)).toBe(10000)
  })

  it('con congelamiento se conserva el monto anterior', () => {
    expect(precioDeAlta(8000, true, 10000)).toBe(8000)
  })

  /**
   * Congelado sin monto previo no congela la nada.
   *
   * Es el caso del socio fundador que se dio de alta después de que el precio
   * subiera y todavía no tuvo ninguna suscripción: no hay de qué conservar el
   * precio, así que entra el vigente.
   */
  it('congelado sin monto previo usa el del plan', () => {
    expect(precioDeAlta(null, true, 10000)).toBe(10000)
  })
})

describe('importe que va a la pasarela', () => {
  it('un monto entero sale con dos decimales', () => {
    expect(importeParaPasarela(10000)).toBe('10000.00')
  })

  it('un monto con centavos los conserva', () => {
    expect(importeParaPasarela(9999.5)).toBe('9999.50')
  })

  /**
   * El ruido de coma flotante no puede viajar a la pasarela.
   *
   * `Decimal` de Prisma pasa por `number` en el camino al POST. Si el número
   * llega como `10000.000000000001`, el cuerpo del pedido deja de coincidir con
   * el precio de la base y la diferencia la ve el pagador en su resumen, no
   * nosotros.
   */
  it('absorbe el ruido de coma flotante', () => {
    expect(importeParaPasarela(10000.0000000001)).toBe('10000.00')
    expect(importeParaPasarela(0.1 + 0.2)).toBe('0.30')
  })

  it('un monto cero o negativo es un error, no un checkout de $0', () => {
    expect(() => importeParaPasarela(0)).toThrow(ErrorMontoInvalido)
    expect(() => importeParaPasarela(-1)).toThrow(ErrorMontoInvalido)
  })

  it('un monto que no es número es un error', () => {
    expect(() => importeParaPasarela(Number.NaN)).toThrow(ErrorMontoInvalido)
  })
})

describe('fin del período', () => {
  it('es el mismo día del mes siguiente', () => {
    expect(finDePeriodo(new Date(Date.UTC(2026, 0, 15, 12, 0, 0))).toISOString()).toBe(
      '2026-02-15T00:00:00.000Z',
    )
  })

  /**
   * El 31 de enero no tiene 31 de febrero.
   *
   * Sin recortar, `new Date(2026, 1, 31)` se corre al 3 de marzo y el período
   * dura un día de más. Con recorte termina el 28, que es el último día que
   * existe.
   */
  it('recorta al último día cuando el mes destino es más corto', () => {
    expect(finDePeriodo(new Date(Date.UTC(2026, 0, 31))).toISOString()).toBe(
      '2026-02-28T00:00:00.000Z',
    )
  })

  it('acorta a 28 días en febrero bisiesto', () => {
    expect(finDePeriodo(new Date(Date.UTC(2028, 0, 31))).toISOString()).toBe(
      '2028-02-29T00:00:00.000Z',
    )
  })

  /**
   * Un mes de 30 días al que le toca uno de 31: el período tiene que terminar
   * el mismo día del mes siguiente, no corrido.
   */
  it('no se corre cuando el mes destino tiene más días', () => {
    expect(finDePeriodo(new Date(Date.UTC(2026, 3, 30))).toISOString()).toBe(
      '2026-05-30T00:00:00.000Z',
    )
  })

  it('de diciembre a enero del año siguiente', () => {
    expect(finDePeriodo(new Date(Date.UTC(2026, 11, 20))).toISOString()).toBe(
      '2027-01-20T00:00:00.000Z',
    )
  })
})

describe('fin de la gracia', () => {
  it('suma los días configurados', () => {
    const desde = new Date('2026-03-10T12:00:00.000Z')

    expect(finDeGracia(desde, 5).toISOString()).toBe('2026-03-15T12:00:00.000Z')
  })

  it('nunca termina antes de empezar', () => {
    const desde = new Date('2026-03-10T12:00:00.000Z')

    expect(finDeGracia(desde, -3).toISOString()).toBe(desde.toISOString())
  })
})

describe('texto de las condiciones', () => {
  it('el precio va ya formateado y no se vuelve a armar', () => {
    const condiciones = resumenCondiciones('$10.000/mes', 'ARS')

    expect(condiciones[0]).toBe('Vas a pagar $10.000/mes (ARS) una vez por mes.')
  })

  it('dice las cuatro cosas que tiene que decir', () => {
    const texto = resumenCondiciones('$10.000/mes', 'ARS').join(' ').toLowerCase()

    expect(texto).toContain('automática')
    expect(texto).toContain('cancelar')
    expect(texto).toContain('5 días')
  })
})

describe('versión de los términos', () => {
  it('es una fecha, no un texto libre', () => {
    expect(VERSION_TERMINOS).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

// ---------------------------------------------------------------------------
// Datos fiscales
// ---------------------------------------------------------------------------

/**
 * CUITs de prueba, calculados con el módulo 11 de `lib/cuit.ts`.
 *
 * Van escritos y no generados en el test a propósito: si el algoritmo del
 * validador se rompe, un CUIT generado con el mismo algoritmo roto seguiría
 * \"validando\" y el test pasaría probando el bug.
 */

/** Persona humana: prefijo 30, dígito verificador 1. */
const CUIT_PERSONA_VALIDO = '30123456781'

/** Empresa: prefijo 33, dígito verificador 0. */
const CUIT_EMPRESA_VALIDO = '33123456780'

const PERSONA = {
  tipoPersona: 'PERSONA_HUMANA',
  nombreORazonSocial: 'Ana Gómez',
  documento: CUIT_PERSONA_VALIDO,
  condicionIva: 'RESPONSABLE_MONOTRIBUTO',
  domicilioFiscal: 'Calle 123, San Miguel de Tucumán, Tucumán',
}

const EMPRESA = {
  tipoPersona: 'EMPRESA',
  nombreORazonSocial: 'Carpintería Gómez S.R.L.',
  documento: CUIT_PERSONA_VALIDO,
  condicionIva: 'RESPONSABLE_INSCRIPTO',
  domicilioFiscal: 'Av. Siempreviva 742, Salta, Salta',
}

describe('datos fiscales', () => {
  it('acepta a una persona humana con CUIT', () => {
    const resultado = datosFiscalesSchema.safeParse({
      ...PERSONA,
      documento: CUIT_PERSONA_VALIDO,
    })

    expect(
      resultado.success,
      resultado.success ? '' : (resultado.error.issues[0]?.message ?? ''),
    ).toBe(true)
  })

  it('acepta a una persona humana con DNI', () => {
    const resultado = datosFiscalesSchema.safeParse({ ...PERSONA, documento: '12345678' })

    expect(resultado.success).toBe(true)
  })

  it('limpia los guiones del documento', () => {
    const resultado = datosFiscalesSchema.safeParse({
      ...PERSONA,
      documento: '30-12345678-1',
    })

    expect(resultado.success && resultado.data.documento).toBe(CUIT_PERSONA_VALIDO)
  })

  it('rechaza un CUIT con el dígito verificador incorrecto', () => {
    const resultado = datosFiscalesSchema.safeParse({ ...PERSONA, documento: '30123456780' })

    expect(resultado.success).toBe(false)
  })

  it('rechaza un documento de largo imposible', () => {
    expect(datosFiscalesSchema.safeParse({ ...PERSONA, documento: '123' }).success).toBe(false)
    expect(datosFiscalesSchema.safeParse({ ...PERSONA, documento: '123456789012' }).success).toBe(
      false,
    )
  })

  /**
   * Una empresa con CUIT de persona no pasa.
   *
   * Es el error más común y el que más caro sale: la persona pone su propio CUIT
   * en el casillero de empresa y el comprobante sale con un tipo de persona
   * jurídica que no existe.
   */
  it('rechaza que una empresa use un CUIT de persona humana', () => {
    const resultado = datosFiscalesSchema.safeParse(EMPRESA)

    expect(resultado.success).toBe(false)
  })

  it('acepta una empresa con CUIT válido', () => {
    const resultado = datosFiscalesSchema.safeParse({ ...EMPRESA, documento: CUIT_EMPRESA_VALIDO })

    expect(
      resultado.success,
      resultado.success ? '' : (resultado.error.issues[0]?.message ?? ''),
    ).toBe(true)
  })

  it('exige las condiciones de IVA del enum de la base', () => {
    expect(datosFiscalesSchema.safeParse({ ...PERSONA, condicionIva: 'MONOTRIBUTO' }).success).toBe(
      false,
    )
  })

  it('el texto de cada condición de IVA existe para todos los valores', () => {
    // Si se agrega un valor al enum y no su texto, el `<select>` queda con una
    // opción vacía y el profesional no sabe qué eligió.
    for (const valor of CONDICION_IVA_VALORES) {
      expect(CONDICIONES_IVA[valor], `falta el texto de ${valor}`).toBeTruthy()
    }
  })

  it('pide domicilio fiscal con calle, número y localidad', () => {
    expect(datosFiscalesSchema.safeParse({ ...PERSONA, domicilioFiscal: 'San Miguel' }).success).toBe(
      false,
    )
  })
})