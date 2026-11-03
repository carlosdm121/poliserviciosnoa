import { Prisma } from '@prisma/client'

import { ErrorMontoInvalido, aNumero, formatearPrecioMensual } from '@/lib/dinero'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'

/**
 * El precio de la suscripción.
 *
 * Este archivo es la ÚNICA fuente del monto en todo el proyecto. La razón es
 * directa: el precio cambia —por inflación, por cambiar de plan, por una
 * promoción— y si hay un `$10.000` escrito en un componente, en un email o en
 * un texto legal, ese lugar queda viejo y nadie se entera hasta que un cliente
 * reclama que se le cobró otra cosa.
 *
 * Por eso no hay ningún monto en el código y `tests/reglas-proyecto.test.ts`
 * falla el build si aparece uno.
 *
 * Módulo aparte y sin dependencias de otros servicios a propósito, igual que
 * `services/ajustes.ts`: la pantalla de suscripción lo usa, y si él importara
 * la regla de publicación y esta importara el precio, se arma el ciclo.
 */

/** Plan tal como lo necesita la UI y los emails. Sin `Decimal` ni Prisma. */
export type PlanVigente = {
  id: string
  nombre: string
  /** Monto como número, para calcular. No se muestra directo. */
  monto: number
  /** `ARS` por ahora. Va explícito para que el día que haya otro plan no assuma. */
  moneda: string
  /** `$10.000/mes`. Listo para pintar. */
  precio: string
}

/**
 * Cuánto vive el precio cacheado.
 *
 * Corto a propósito: 15 segundos es invisible para el profesional y evita que
 * cada visita al panel abra una consulta a la base por el mismo número. El
 * precio no es un dato que cambie con velocidad, así que un caché más largo
 * solo agregaría confusión cuando el admin cambia el monto y tarda en verse.
 *
 * El caché es en memoria del proceso, no compartido: en un despliegue serverless
 * cada instancia tiene el suyo. Para un precio eso está bien — en el peor caso
 * dos instancias muestran el precio viejo hasta 15 segundos — y evita traer
 * Redis a un dato que cambia una vez cada varios meses.
 */
const TTL_CACHE_MS = 15_000

type EntradaCache = {
  plan: PlanVigente | null
  guardadoEn: number
}

const cache: { entrada: EntradaCache | null } = { entrada: null }

/**
 * Vacía el precio cacheado.
 *
 * La usan los tests y el panel de administración después de cambiar el monto,
 * para que el cambio se vea en la próxima pantalla en vez de quince segundos
 * después.
 */
export function limpiarCachePlan(): void {
  cache.entrada = null
}

/**
 * El plan vigente: el que se está vendiendo ahora.
 *
 * "Vigente" son tres condiciones y las tres importan:
 *
 * 1. `isActive`. Un plan apagado no se vende, aunque su fecha diga que ya empezó.
 * 2. `vigenteDesde` no es futuro. Un plan con la fecha adelante está *programado*,
 *    no vigente: si se vendiera antes de tiempo, un cliente pagaría un precio que
 *    todavía no anunciamos.
 * 3. El más reciente entre los que cumplen. Si hay dos activos, gana el de
 *    `vigenteDesde` más nueva, y se avisa por log.
 *
 * `null` significa "no hay nada que vender", y hay tres motivos distintos que
 * terminan acá: no hay plan, el plan tiene un monto que no es un número, o la
 * base falló. No se distinguen hacia afuera a propósito: en los tres casos lo
 * que el profesional tiene que ver es lo mismo.
 *
* Por qué `null` y no un precio de respaldo tipo $10.000: si la base se cae un
 * segundo y la pantalla dice un precio inventado, el profesional hace clic y el
 * módulo 2.3 intenta cobrar un monto que nadie le prometió. Bloquear la compra un
 * segundo es molesto; cobrarle a alguien una cifra que no se le dijo es
 * irreversible.
 *
 * @param ahora Inyectable para tests, porque la ventana de vigencia depende de la hora.
 */
export async function getCurrentPlan(ahora: Date = new Date()): Promise<PlanVigente | null> {
  const ahoraMs = ahora.getTime()

  if (cache.entrada && ahoraMs - cache.entrada.guardadoEn < TTL_CACHE_MS) {
    return cache.entrada.plan
  }

  const plan = await leerPlanVigente(ahora)

  cache.entrada = { plan, guardadoEn: ahoraMs }

  return plan
}

/**
 * Lectura real del plan, sin caché.
 *
 * Va en su propia función para que `getCurrentPlan` sea el caché y esto sea la
 * verdad. Si un test necesita leer ignorando el caché (para probar el critério
 * de que cambiar la base cambia el precio), llama a esta y no tiene que esperar
 * quince segundos.
 */
export async function leerPlanVigente(ahora: Date = new Date()): Promise<PlanVigente | null> {
  try {
    const planes = await prisma.plan.findMany({
      where: {
        isActive: true,
        vigenteDesde: { lte: ahora },
      },
      orderBy: { vigenteDesde: 'desc' },
      select: { id: true, name: true, amount: true, currency: true },
    })

    if (planes.length === 0) {
      logger.warn('planes: no hay ningún plan vigente', { evaluatedAt: ahora.toISOString() })
      return null
    }

    /**
     * Dos planes vigentes a la vez no es un caso normal, pero tiene que
     * responder algo.
     *
     * Se avisa y se sigue con el más reciente: devolver el más nuevo es
     * determinista —dos llamadas seguidas devuelven lo mismo—, mientras que
     * devolver `null` dejaría al portal sin poder cobrar y devolver el primero
     * que aparezca haría que el precio cambie según el humor del índice.
     */
    if (planes.length > 1) {
      logger.warn('planes: hay más de un plan vigente, se usa el más reciente', {
        candidatos: planes.map((p) => p.id),
      })
    }

    const elegido = planes[0]

    if (!elegido) return null

    /**
     * `Decimal` a número, validado.
     *
     * `Prisma.Decimal` tiene `toNumber`, que es justo lo que espera `aNumero`.
     * Un plan con monto roto se trata como si no hubiera plan: es preferible
     * no mostrar precio a mostrar uno imposible. Y queda en el log, que es donde
     * se va a enterar el admin.
     */
    let monto: number

    try {
      monto = aNumero(elegido.amount)
    } catch (error: unknown) {
      if (error instanceof ErrorMontoInvalido) {
        logger.error('planes: el plan vigente tiene un monto inválido', {
          planId: elegido.id,
          monto: String(elegido.amount),
        })
        return null
      }

      throw error
    }

    return {
      id: elegido.id,
      nombre: elegido.name,
      monto,
      moneda: elegido.currency,
      precio: formatearPrecioMensual(monto),
    }
  } catch (error: unknown) {
    // Un fallo de base se registra y se traduce en "no hay plan". Es la misma
    // decisión que `exigeAprobacionManual`: se falla de forma visible y sin
    // inventar datos, nunca con un valor de relleno.
    logger.error('planes: no se pudo leer el plan vigente', { error })
    return null
  }
}

/**
 * El precio vigente como `Decimal`, listo para `Subscription.planAmount`.
 *
 * Existe para el módulo 2.3: la suscripción congela el monto con el que cobra
 * hoy ese suscriptor, y esa congelación es la razón de que `planAmount` sea una
 * columna y no se lea del plan al cobrar. El día que suba el precio, el que paga
 * $10.000 sigue pagando $10.000.
 *
 * @returns `null` si no hay plan vigente, y el módulo 2.3 tiene que manejarlo
 *   como un error antes de generar el preapproval.
 */
export async function montoVigente(): Promise<Prisma.Decimal | null> {
  const plan = await leerPlanVigente()

  if (!plan) return null

  return new Prisma.Decimal(plan.monto)
}