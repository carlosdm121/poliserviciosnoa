/**
 * Política de retención de datos personales.
 *
 * Vive en un archivo central y no repartida por los servicios porque la Ley
 * 25.326 exige que se sepa qué se conserva, cuánto y por qué. Cada política
 * tiene un plazo y una razón, y el plazo fiscal (facturas y pagos) lo define
 * el contador de PoliserviciosNOA: acá solo se registra el valor y el motivo.
 *
 * Los plazos son días corridos, no hábiles, porque la ley habla de plazos
 * corridos y un dato no deja de ser personal porque caiga en fin de semana.
 */

import { addDays } from '@/lib/fechas'

/** Plazo fiscal de conservación de facturas y registros de pago.
 *
 * El plazo lo define el contador de PoliserviciosNOA y se lee de una variable
 * de entorno para que pueda ajustarse sin tocar el código. Valor por defecto
 * de 5 años (1825 días), que es el plazo común en Argentina para libros
 * contables y comprobantes. Si el contador dice otro, se cambia acá o por env.
 */
export const PLAZO_FISCAL_DIAS = 1825

/** Datos de empresa (constancia de inscripción): se borran al resolver la
 * revisión, se apruebe o se rechace. No hay razón para conservar el CUIT y el
 * domicilio fiscal de una empresa que ya fue revisada. */
export const DOCUMENTOS_EMPRESA_DIAS = 0

/** Señales de IP (hash de IP de reportes): 30 días. Sirven para detectar abuso
 * y después ya no aportan nada. */
export const SENALES_IP_DIAS = 30

/** Verificaciones de WhatsApp vencidas: 30 días. Un intento fallido o expirado
 * ya no sirve para detectar nada después de un mes. */
export const VERIFICACIONES_WHATSAPP_VENCIDAS_DIAS = 30

/** Datos personales al darse de baja: se anonimizan, no se borran de golpe.
 * El email y el nombre se reemplazan por valores irreversibles, y el número de
 * WhatsApp se borra (el hash se conserva solo si el perfil fue suspendido por
 * fraude, ver `debeConservarHashEnBloqueo`). */
export const DATOS_PERSONALES_BAJA_DIAS = 0

/** Plazo de gracia para arrepentirse de una supresión de cuenta. */
export const GRACIA_SUPRESION_DIAS = 30

// ---------------------------------------------------------------------------
// Fechas de corte
// ---------------------------------------------------------------------------

/**
 * Fecha a partir de la cual un dato de este tipo debe estar borrado o
 * anonimizado.
 *
 * @param tipoUnoDe Los tipos soportados. Cualquier otro devuelve `null`:
 *   no se asume un plazo, se deja para revisión manual del admin.
 * @param ahora Momento de referencia. Inyectable para tests.
 */
export function fechaDeCorte(
  tipo: 'documentosEmpresa' | 'senalesIp' | 'verificacionesWhatsappVencidas' | 'datosPersonalesBaja',
  ahora: Date = new Date(),
): Date | null {
  const dias = {
    documentosEmpresa: DOCUMENTOS_EMPRESA_DIAS,
    senalesIp: SENALES_IP_DIAS,
    verificacionesWhatsappVencidas: VERIFICACIONES_WHATSAPP_VENCIDAS_DIAS,
    datosPersonalesBaja: DATOS_PERSONALES_BAJA_DIAS,
  }[tipo]

  if (dias === undefined) return null

  return addDays(ahora, -dias)
}

/**
 * Fecha de corte para facturas y pagos. Siempre `null`: se conservan por el
 * plazo fiscal y no se borran automáticamente. El contador las revisa cuando
 * corresponda.
 */
export function fechaDeCorteFacturas(): null {
  return null
}

// ---------------------------------------------------------------------------
// Reglas de conservación
// ---------------------------------------------------------------------------

/**
 * ¿El hash de un identificador (WhatsApp o CUIT) se debe conservar en la lista
 * de bloqueo después de darse de baja?
 *
 * Solo si el perfil fue suspendido por fraude. Un usuario legítimo que se da
 * de baja no debe aparecer en una lista de bloqueo; eso es un castigo sin
 * motivo. Un perfil suspendido por fraude sí: el número y el CUIT no pueden
 * volver a registrarse bajo otra cuenta.
 *
 * @param moderationStatus Estado de moderación del perfil al darse de baja.
 * @param moderationReason Motivo de la suspensión, si la hubo.
 */
export function debeConservarHashEnBloqueo(
  moderationStatus: string | null | undefined,
  moderationReason: string | null | undefined,
): boolean {
  if (moderationStatus !== 'SUSPENDED') return false

  const motivo = (moderationReason ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

  return motivo.includes('fraude') || motivo.includes('suplantacion') || motivo.includes('sustitucion')
}

/**
 * ¿Un dato debe conservarse por el plazo fiscal aunque el titular pida su
 * supresión?
 *
 * Facturas, comprobantes y registros de pago se conservan. El número de
 * WhatsApp y el email del titular no: son datos personales que la ley permite
 * borrar cuando ya no sirven para la relación comercial.
 *
 * @param tipoDato Nombre del dato, tal como se lee de la política.
 */
export function seConservaPorPlazoFiscal(tipoDato: string): boolean {
  return [
    'factura',
    'comprobante',
    'pago',
    'registro de pago',
    'nota de credito',
    'nota de crédito',
  ].some((clave) => tipoDato.toLowerCase().includes(clave))
}

/**
 * Plazo de retención por tipo de dato, para mostrar al titular antes de
 * pedir la supresión y para documentar el cumplimiento de la Ley 25.326.
 */
export type PoliticaRetencion = {
  dato: string
  seConserva: boolean
  plazoDias: number | null
  motivo: string
}

export function politicasRetencion(): PoliticaRetencion[] {
  return [
    {
      dato: 'Datos fiscales y facturas',
      seConserva: true,
      plazoDias: null,
      motivo: 'Plazo fiscal exigido por ARCA y la ley tributaria.',
    },
    {
      dato: 'Registros de pago',
      seConserva: true,
      plazoDias: null,
      motivo: 'Plazo fiscal y comprobante de cobro.',
    },
    {
      dato: 'Documentos de empresa (constancia de inscripción)',
      seConserva: false,
      plazoDias: 0,
      motivo: 'Se borran al resolver la revisión de la empresa.',
    },
    {
      dato: 'Señales de IP (hash)',
      seConserva: false,
      plazoDias: 30,
      motivo: 'Detección de abuso; después ya no aportan.',
    },
    {
      dato: 'Verificaciones de WhatsApp vencidas',
      seConserva: false,
      plazoDias: 30,
      motivo: 'Intentos de verificación expirados.',
    },
    {
      dato: 'Datos personales al darse de baja',
      seConserva: false,
      plazoDias: 0,
      motivo: 'Anonimización irreversible: email, nombre y número de WhatsApp.',
    },
    {
      dato: 'Hash en lista de bloqueo',
      seConserva: true,
      plazoDias: null,
      motivo: 'Solo si el perfil fue suspendido por fraude.',
    },
  ]
}
