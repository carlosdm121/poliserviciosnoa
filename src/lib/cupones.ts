import { TipoCupon } from '@prisma/client'

import { aNumero, ErrorMontoInvalido, type Monto } from '@/lib/dinero'

/**
 * Etiqueta de usuario para cada tipo de cupón.
 *
 * Se usa en el panel y en la pantalla de aplicación de cupón para mostrar
 * qué tipo de descuento es sin que el profesional tenga que leer el código
 * interno del enum.
 */
export function tipoCuponALabel(tipo: TipoCupon): string {
  switch (tipo) {
    case TipoCupon.MES_GRATIS:
      return 'Primer mes gratis'
    case TipoCupon.PORCENTAJE:
      return 'Descuento porcentual'
    case TipoCupon.MONTO_FIJO:
      return 'Monto fijo'
    default:
      return String(tipo)
  }
}

/**
 * Lógica pura de cupones de lanzamiento.
 *
 * Todo lo que se puede decidir sin base vive acá: validar que un cupón se puede
 * usar, calcular el monto con descuento y decidir si un perfil puede canjearlo.
 * El servicio (`services/cupones.ts`) solo lee y escribe.
 */

/**
 * Resultado de validar un cupón para un perfil concreto.
 *
 * `valido` es la respuesta de negocio. `motivo` explica por qué no se puede
 * usar, para mostrarlo al profesional. `montoFinal` es el monto que se le
 * tendría que cobrar si el cupón es válido (ya aplicado el descuento).
 */
export type ValidacionCupon = {
  valido: boolean
  motivo?: string
  montoFinal: number | null
}

/**
 * Lo que se necesita para decidir si un cupón aplica a un perfil.
 */
export type EntradaValidacionCupon = {
  /** Slug del rubro principal del perfil. */
  rubroSlug: string | null
  /** Provincia del perfil. */
  provincia: string | null
  /** Hash del WhatsApp verificado, si lo tiene. */
  whatsappHash: string | null
  /** Hash del CUIT, si lo tiene. */
  cuitHash: string | null
  /** Ya usó este cupón este perfil (por profileId). */
  yaUsadoPorEstePerfil: boolean
  /** Ya usó este cupón este número de WhatsApp. */
  yaUsadoPorEsteWhatsapp: boolean
  /** Ya usó este cupón este CUIT. */
  yaUsadoPorEsteCuit: boolean
}

/** Un cupón tal como lo necesita la validación. */
export type CuponParaValidar = {
  id: string
  codigo: string
  tipo: TipoCupon
  valor: number | null
  cupoMaximoUsos: number
  usosActuales: number
  vigenteDesde: Date
  vigenteHasta: Date | null
  rubrosHabilitados: string[] | null
  provinciasHabilitados: string[] | null
  activo: boolean
}

/**
 * Valida si un cupón se puede aplicar a un perfil en este momento.
 *
 * Reglas de negocio:
 * - Debe estar activo y dentro de su vigencia.
 * - Debe tener cupo disponible (usosActuales < cupoMaximoUsos).
 * - Si restringe rubros, el rubro del perfil tiene que estar en la lista.
 * - Si restringe provincias, la provincia del perfil tiene que estar en la lista.
 * - El perfil no puede haber usado ya este cupón (por profileId).
 * - El número de WhatsApp no puede haber usado ya este cupón.
 * - El CUIT no puede haber usado ya este cupón.
 *
 * Devuelve el monto final con el descuento aplicado cuando es válido.
 */
export function validarCupon(
  cupo: CuponParaValidar,
  entrada: EntradaValidacionCupon,
  montoDelPlan?: number,
  ahora: Date = new Date(),
): ValidacionCupon {
  if (!cupo.activo) {
    return { valido: false, motivo: 'Ese cupón ya no está activo.', montoFinal: null }
  }

  const ahoraMs = ahora.getTime()
  if (ahoraMs < cupo.vigenteDesde.getTime()) {
    return { valido: false, motivo: 'Ese cupón aún no está vigente.', montoFinal: null }
  }

  if (cupo.vigenteHasta && ahoraMs > cupo.vigenteHasta.getTime()) {
    return { valido: false, motivo: 'Ese cupón ya venció.', montoFinal: null }
  }

  if (cupo.usosActuales >= cupo.cupoMaximoUsos) {
    return { valido: false, motivo: 'Ese cupón ya no tiene cupos disponibles.', montoFinal: null }
  }

  if (entrada.yaUsadoPorEstePerfil) {
    return { valido: false, motivo: 'Ya usaste este cupón con este perfil.', montoFinal: null }
  }

  if (entrada.yaUsadoPorEsteWhatsapp && entrada.whatsappHash) {
    return {
      valido: false,
      motivo: 'Ya usaste este cupón con ese número de WhatsApp.',
      montoFinal: null,
    }
  }

  if (entrada.yaUsadoPorEsteCuit && entrada.cuitHash) {
    return {
      valido: false,
      motivo: 'Ya usaste este cupón con ese CUIT.',
      montoFinal: null,
    }
  }

  if (cupo.rubrosHabilitados && cupo.rubrosHabilitados.length > 0) {
    if (!entrada.rubroSlug || !cupo.rubrosHabilitados.includes(entrada.rubroSlug)) {
      return {
        valido: false,
        motivo: 'Este cupón no aplica a tu rubro.',
        montoFinal: null,
      }
    }
  }

  if (cupo.provinciasHabilitados && cupo.provinciasHabilitados.length > 0) {
    if (!entrada.provincia || !cupo.provinciasHabilitados.includes(entrada.provincia)) {
      return {
        valido: false,
        motivo: 'Este cupón no aplica a tu provincia.',
        montoFinal: null,
      }
    }
  }

  // Calcular monto final con el descuento.
  const montoFinal = calcularMontoConDescuento(cupo.tipo, cupo.valor, montoDelPlan ?? null)

  return { valido: true, montoFinal }
}

/**
 * Calcula el monto a cobrar aplicando el descuento del cupón.
 *
 * - MES_GRATIS: monto 0 (primer mes sin cargo).
 * - PORCENTAJE: se descuenta el `valor` por ciento del `montoDelPlan`.
 * - MONTO_FIJO: se cobra `valor` fijo.
 *
 * `montoDelPlan` puede ser null cuando solo interesa saber si el cupón es
 * aplicable (el monto real se calcula después con el plan vigente).
 */
export function calcularMontoConDescuento(
  tipo: TipoCupon,
  valor: number | null,
  montoDelPlan: number | null,
): number | null {
  switch (tipo) {
    case TipoCupon.MES_GRATIS:
      return 0
    case TipoCupon.PORCENTAJE: {
      if (!valor || !montoDelPlan) return null
      const descuento = (montoDelPlan * valor) / 100
      const resultado = montoDelPlan - descuento
      return resultado < 0 ? 0 : resultado
    }
    case TipoCupon.MONTO_FIJO: {
      if (!valor) return null
      return valor
    }
    default:
      return null
  }
}

/**
 * El monto como string de dos decimales, listo para la pasarela.
 *
 * Permite monto 0 (MES_GRATIS), a diferencia de `importeParaPasarela` de
 * `lib/suscripcion.ts`, que rechaza el cero. Un cupón de primer mes gratis
 * genera un preapproval de $0, que es válido en Mercado Pago como período de
 * prueba.
 */
export function montoParaPasarela(monto: Monto): string {
  const numero = aNumero(monto)

  if (numero < 0) {
    throw new ErrorMontoInvalido('El monto del cupón no puede ser negativo.')
  }

  return numero.toFixed(2)
}
