/**
 * Formato de dinero.
 *
 * Existe porque el precio vive en la base y aparece en la pantalla de
 * suscripción, en los emails de cobro, en los textos legales y en el perfil
 * público. Si cada uno de esos lugares arma el número por su cuenta, el día que
 * el precio cambia hay cuatro "$10.000" distintos dando vueltas y la mitad
 * queda vieja.
 *
 * La regla del módulo 2.2 es tajante: **el monto no se escribe en el código**.
 * Sale de `Plan.amount` y se formatea acá. Este archivo no lee la base a
 * propósito: recibe el número y lo convierte, así se puede testear entero sin
 * levantar nada.
 *
 * Sobre el separador: `Intl` con `es-AR` ya pone el punto de miles y la coma
 * decimal, que es como se escribe acá. No se arma el string a mano porque
 * "10.000" mal puesto es un bug que en Argentina pasa por cantidad en la web.
 */

/**
 * Lo que se acepta como monto.
 *
 * El `Decimal` de Prisma entra porque `Plan.amount` es `Decimal(10,2)` y no un
 * `number`: se define estructuralmente con `toNumber` en vez de importar
 * `@prisma/client`, para que este archivo lo puedan usar también los tests sin
 * levantar el cliente.
 */
export type Monto = number | string | { toNumber(): number }

/** Error de monto inválido. Distinto de los de negocio, y a propósito. */
export class ErrorMontoInvalido extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ErrorMontoInvalido'
  }
}

/**
 * Convierte a número validando.
 *
 * Tira excepción en vez de devolver `NaN` o 0 porque un monto roto tiene que
 * verse en el log y en la consola, no convertirse en un "$NaN" en la pantalla
 * del profesional. La validación vive acá y no en cada formateador.
 *
 * Se rechazan los negativos: un plan en negativo no es un precio, es una fila
 * corrupta, y mostrar "-$10.000" como si fuera una rebaja sería el peor
 * resultado posible.
 *
 * @param monto Número, string numérico o `Decimal` de Prisma.
 */
export function aNumero(monto: Monto): number {
  const numero =
    typeof monto === 'number' ? monto : typeof monto === 'string' ? Number(monto) : monto.toNumber()

  if (!Number.isFinite(numero)) {
    throw new ErrorMontoInvalido('El monto no es un número válido.')
  }

  if (numero < 0) {
    throw new ErrorMontoInvalido('El monto no puede ser negativo.')
  }

  return numero
}

type OpcionesFormatArs = {
  /** Agrega el código de moneda: "$10.000 ARS". Para textos legales. */
  conCodigo?: boolean
  /**
   * Fuerza los dos decimales.
   *
   * Por defecto no se muestran cuando el monto es entero, porque un precio de
   * suscripción es casi siempre redondo y "$10.000" se lee mejor que
   * "$10.000,00". Con `true` sirve para facturas y textos legales, donde el
   * centavo tiene que estar.
   */
  conDecimales?: boolean
}

/**
 * Formatea un monto para la Argentina.
 *
 * @param monto Monto a mostrar.
 * @param opciones Ver `OpcionesFormatArs`.
 * @returns Por ejemplo `$10.000`, `$10.500,50` o `$10.000 ARS`.
 *
 * @example
 * formatArs(10000)         // '$10.000'
 * formatArs(10500.5)       // '$10.500,50'
 * formatArs(10000, { conCodigo: true }) // '$10.000 ARS'
 */
export function formatArs(monto: Monto, opciones: OpcionesFormatArs = {}): string {
  const numero = aNumero(monto)

  /**
   * ¿El monto tiene centavos de verdad?
   *
   * Con una tolerancia y no con `numero % 1`, porque el módulo tiene errores de
   * coma flotante: un precio que llega como 10000.0000000001 tiene que verse
   * `$10.000`, no `$10.000,00`.
   *
   * La tolerancia es de 1e-6, muy por encima del ruido real (que es del orden de
   * 1e-13) y muy por debajo de un centavo. Un plan a $10.000,0000001 no existe y,
   * si existiera, se muestra igual como $10.000.
   */
  const tieneDecimales = Math.abs(numero - Math.round(numero)) > 1e-6
  const mostrarDecimales = opciones.conDecimales ?? tieneDecimales

  const formato = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: mostrarDecimales ? 2 : 0,
    maximumFractionDigits: mostrarDecimales ? 2 : 0,
  })

  const texto = formato.format(numero)

  /**
   * `Intl` en `es-AR` separa el símbolo del número con un espacio duro (U+00A0):
   * devuelve `"$ 10.000"`. Acá nadie escribe eso — se escribe `$10.000` — y con
   * un espacio en el medio el precio se ve como si estuviera mal en todas las
   * pantallas y en todos los emails.
   *
   * Se quita el espacio y no se construye el string a mano porque los puntos de
   * miles sí los hace bien `Intl`, y esa es la parte que no hay que reimplementar.
   *
   * Se borran los dos espacios que aparecen en distintos runtimes: U+00A0, que
   * es el que usa CLDR para `es-AR`, y U+202F, el "non-breaking narrow space"
   * que algunos runtimes usan para currencies. Con `es-AR` el punto de miles es
   * un punto, así que ningún otro carácter del resultado es un espacio.
   */
  const sinEspacios = texto.replace(/[  ]/g, '')

  return opciones.conCodigo ? `${sinEspacios} ARS` : sinEspacios
}

/**
 * El precio como lo ve el profesional: `$10.000/mes`.
 *
 * Es la forma que va en el botón, en el precio grande de la pantalla de
 * suscripción y en el asunto de los emails. Existe como función y no como
 * formato inline para que el "/mes" no aparezca en un email donde no va y sí
 * falte en la pantalla donde sí.
 */
export function formatearPrecioMensual(monto: Monto): string {
  return `${formatArs(monto)}/mes`
}

/**
 * El texto del aviso de aumento de precio.
 *
 * "Tu suscripción pasa de $10.000 a $12.000" es la frase que va en el email de
 * notificación de aumento (módulo M9). Está acá porque es el texto donde un
 * cliente primero mira si le están cobrando de más: si el número del aviso y el
 * número de la factura no salen del mismo formateador, el primero se va a
 * sentir una trampa.
 *
 * @param montoAnterior Precio que se está dejando de cobrar.
 * @param montoNuevo Precio que va a pasar a cobrar.
 */
export function formatearAumentoPrecio(montoAnterior: Monto, montoNuevo: Monto): string {
  return (
    `Tu precio actual es ${formatearPrecioMensual(montoAnterior)}. A partir de la próxima ` +
    `renovación será de ${formatearPrecioMensual(montoNuevo)}, con aviso previo por email ` +
    `antes de aplicarlo.`
  )
}