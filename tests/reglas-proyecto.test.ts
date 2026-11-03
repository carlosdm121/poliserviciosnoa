import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * La regla tiene un solo dueño.
 *
 * `sincronizarPublicacion` es el ÚNICO lugar del proyecto que escribe
 * `isPublished`. Si alguien escribe el flag en su propia consulta, aparece un
 * perfil vencido en las búsquedas y el cliente escribe a un número que ya no
 * atiende: es el bug más caro del portal y el más difícil de reproducir.
 *
 * Este test no comprueba comportamiento, comprueba una regla de autoría. Por eso
 * es un test y no un lint: si alguien lo rompe, el build falla con un mensaje
 * que explica por qué importa.
 */

/** Archivos donde sí se puede escribir, y por qué. */
const ARCHIVOS_PERMITIDOS = ['sincronizarPublicacion', 'sincronizarPublicacion']

/** Los únicos lugares donde tiene que aparecer la escritura. */
const RUTAS_PERMITIDAS = ['src/services/publicacion.ts']

const SRC = join(process.cwd(), 'src')

/** Recorre los archivos de `src/` yendo solo a donde puede haber código. */
async function archivosTypeScript(dir: string): Promise<string[]> {
  const entradas = await readdir(dir, { withFileTypes: true })

  const archivos: string[] = []

  for (const entrada of entradas) {
    const ruta = join(dir, entrada.name)

    if (entrada.isDirectory()) {
      archivos.push(...(await archivosTypeScript(ruta)))
      continue
    }

    if (entrada.name.endsWith('.ts') || entrada.name.endsWith('.tsx')) {
      archivos.push(ruta)
    }
  }

  return archivos
}

/** ¿El archivo está en la lista de permitidos? */
function esPermitido(ruta: string): boolean {
  const relativa = ruta.replace(`${process.cwd()}\\`, '').replaceAll('\\', '/')

  return RUTAS_PERMITIDAS.some((permitida) => relativa.endsWith(permitida))
}

describe('isPublished tiene un solo dueño', () => {
  it('nadie lo escribe fuera de sincronizarPublicacion', async () => {
    const archivos = await archivosTypeScript(SRC)
    const infractores: string[] = []

    for (const archivo of archivos) {
      if (esPermitido(archivo)) continue

      const contenido = await readFile(archivo, 'utf8')

      // Se buscan escrituras, no menciones. `isPublished: true` dentro de un
      // `where` es una condición de lectura y está permitido; lo prohibido es
      // `isPublished:` dentro de un `data`.
      const escribe =
        /\bdata\s*:\s*\{[^}]*\bisPublished\b/s.test(contenido) ||
        /update\(\s*\{[^}]*\bisPublished\s*:/s.test(contenido) ||
        /\bisPublished\s*:\s*(true|false)\s*,\s*\n\s*unpublishedReason/s.test(contenido)

      if (escribe) infractores.push(archivo.replace(`${process.cwd()}\\`, ''))
    }

    expect(
      infractores,
      `isPublished solo se escribe en ${ARCHIVOS_PERMITIDOS.join(', ')}. ` +
        `Estos archivos lo escriben: ${infractores.join(', ') || 'ninguno'}. ` +
        'Si necesitás cambiar la publicación, llamá a sincronizarPublicacion().',
    ).toEqual([])
  })

  it('el predicado SQL y la función pura viven en el mismo archivo', async () => {
    // Si se separan, cambian uno y no el otro, y aparecen perfiles en la
    // búsqueda que no se pueden abrir.
    const contenido = await readFile('src/services/publicacion.ts', 'utf8')

    expect(contenido).toContain('export function evaluarPublicacion')
    expect(contenido).toContain('export const CONDICION_PERFIL_PUBLICO')
    expect(contenido).toContain('export async function sincronizarPublicacion')
  })
})

/**
 * El precio de la suscripción vive en la base, no en el código.
 *
 * La regla del módulo 2.2: el monto sale de `Plan.amount` y se formatea con
 * `lib/dinero.ts`. Si un `$10.000` queda escrito en un componente, en un email o
 * en un texto legal, ese lugar queda viejo el día que sube el precio, y el
 * profesional lo descubre cuando el cobro real no coincide con lo que le
 * prometeron.
 *
 * Se revisan las cadenas del código, no los comentarios: los ejemplos en JSDoc
 * están permitidos justamente para documentar el formato, y `formatArs(10000)`
 * como ejemplo es documentation útil.
 */

/**
 * Montos que no pueden aparecer escritos.
 *
 * La lista es corta a propósito: crece con el proyecto, no se anticipa. El
 * patrón importa más que los valores, porque lo que atrapa es el próximo
 * `$15.000` que alguien escriba.
 */
const MONTOS_PROHIBIDOS = [/\$10\.000/, /\$10,000/, /"10000"/, /'10000'/]

/**
 * Archivos donde el monto sí puede aparecer escrito.
 *
 * Solo se revisa `src/`, así que la lista es corta: los ejemplos del
 * formateador en JSDoc. `prisma/seed.ts` y `scripts/verificar-planes.ts`
 * también tienen montos escritos, y está bien: el seed lee el suyo de
 * `SUBSCRIPTION_AMOUNT` y el script de verificación necesita un número
 * concreto para poder comprobar que cambiarlo cambia el precio. Ninguno de los
 * dos muestra nada a un profesional.
 */
const RUTAS_CON_MONTO_PERMITIDO = ['src/lib/dinero.ts']

/** Saca comentarios y bloques JSDoc para revisar solo el código. */
function sinComentarios(contenido: string): string {
  return contenido.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

describe('el precio no está hardcodeado', () => {
  it('no hay montos escritos en src/', async () => {
    const archivos = await archivosTypeScript(SRC)
    const infractores: string[] = []

    for (const archivo of archivos) {
      const relativa = archivo.replace(`${process.cwd()}\\`, '').replaceAll('\\', '/')

      if (RUTAS_CON_MONTO_PERMITIDO.some((permitida) => relativa.endsWith(permitida))) continue

      const codigo = sinComentarios(await readFile(archivo, 'utf8'))

      for (const patron of MONTOS_PROHIBIDOS) {
        if (patron.test(codigo)) {
          infractores.push(`${relativa} (${String(patron)})`)
          break
        }
      }
    }

    expect(
      infractores,
      `Estos archivos tienen el precio escrito en el código: ${infractores.join(', ') || 'ninguno'}. ` +
        'El precio sale de `getCurrentPlan()` y se formatea con `formatArs()` de @/lib/dinero.',
    ).toEqual([])
  })

  it('el formateador es el único que decide cómo se ve un monto', async () => {
    // Si otro archivo llama a Intl con 'es-AR' por su cuenta, el día que se
    // cambie el formato aparecen dos versiones distintas del mismo precio.
    const archivos = await archivosTypeScript(SRC)
    const infractores: string[] = []

    for (const archivo of archivos) {
      const relativa = archivo.replace(`${process.cwd()}\\`, '').replaceAll('\\', '/')

      if (relativa.endsWith('src/lib/dinero.ts')) continue

      const codigo = sinComentarios(await readFile(archivo, 'utf8'))

      if (/Intl\.NumberFormat/.test(codigo)) infractores.push(relativa)
    }

    expect(
      infractores,
      `Estos archivos formatean números por su cuenta: ${infractores.join(', ') || 'ninguno'}. ` +
        'Para pesos usá formatArs() de @/lib/dinero.',
    ).toEqual([])
  })
})

describe('reglas de los datos personales', () => {
  it('no hay console.log sueltos en código de servidor', async () => {
    const archivos = await archivosTypeScript(SRC)
    const infractores: string[] = []

    for (const archivo of archivos) {
      const relativa = archivo.replace(`${process.cwd()}\\`, '').replaceAll('\\', '/')

      // Los componentes cliente pueden loguear; la regla es para el servidor.
      if (relativa.startsWith('src/components') || relativa.startsWith('src/app')) continue
      if (relativa.includes('logger.ts')) continue

      const contenido = await readFile(archivo, 'utf8')

      if (/console\.(log|error|warn|info|debug)\(/.test(contenido)) {
        infractores.push(relativa)
      }
    }

    expect(
      infractores,
      `Estos archivos loguean directo. Usá logger de '@/lib/logger', que redacta ` +
        `email, teléfono, token y código: ${infractores.join(', ')}`,
    ).toEqual([])
  })
})

/**
 * Nadie habla con Mercado Pago fuera de `lib/mp/`.
 *
 * Es la regla de `stack.md`: ningún `services/` importa un SDK ni llama a una API
 * externa directamente. Con Cloudinary y con WhatsApp la consecuencia de romperla
 * es visible; con Mercado Pago es peor, porque hay dos cosas que no se pueden
 * hacer si cada servicio se arma su propia llamada:
 *
 * 1. **El mock.** El desarrollo local y los tests no pueden depender de
 *    credenciales reales. Si un servicio hace su propio `fetch` a
 *    `api.mercadopago.com`, el `MP_REAL` no lo frena y el script de verificación
 *    abre checkouts en la cuenta real.
 * 2. **El cuerpo del POST.** El preapproval necesita `auto_recurring`, el
 *    `external_reference` y la `notification_url` en un mismo formato. Dos
 *    versiones de ese cuerpo en dos archivos son dos formas de cobrar distinto
 *    a la misma persona.
 *
 * Por eso el archivo prohibido es `src/lib/mp/` y no `src/services/suscripcion.ts`:
 * el servicio es el que **consume** la interfaz, no el que la implementa.
 */
describe('la pasarela tiene un solo dueño', () => {
  it('nadie llama a la API de Mercado Pago fuera de lib/mp', async () => {
    const archivos = await archivosTypeScript(SRC)
    const infractores: string[] = []

    for (const archivo of archivos) {
      const relativa = archivo.replace(`${process.cwd()}\\`, '').replaceAll('\\', '/')

      if (relativa.startsWith('src/lib/mp/')) continue

      const codigo = sinComentarios(await readFile(archivo, 'utf8'))

      if (/api\.mercadopago\.com|mercadopago\.com\/preapproval/.test(codigo)) {
        infractores.push(relativa)
      }
    }

    expect(
      infractores,
      `Estos archivos llaman a Mercado Pago por su cuenta: ${infractores.join(', ') || 'ninguno'}. ` +
        'Usá getProveedor() de @/lib/mp, que además es lo que permite el mock de desarrollo.',
    ).toEqual([])
  })

  it('el token de Mercado Pago no aparece fuera de lib/mp y lib/env', async () => {
    const archivos = await archivosTypeScript(SRC)
    const infractores: string[] = []

    for (const archivo of archivos) {
      const relativa = archivo.replace(`${process.cwd()}\\`, '').replaceAll('\\', '/')

      if (relativa.startsWith('src/lib/mp/') || relativa === 'src/lib/env.ts') continue

      const codigo = sinComentarios(await readFile(archivo, 'utf8'))

      // La sola mención se permite en la instalación (`Bearer ${...}`). Lo que
      // no se permite es leer el valor de la variable en otro lado para armar
      // una petición propia.
      if (/env\.MP_ACCESS_TOKEN|process\.env\.MP_ACCESS_TOKEN/.test(codigo)) {
        infractores.push(relativa)
      }
    }

    expect(
      infractores,
      `Estos archivos leen la credencial de Mercado Pago: ${infractores.join(', ') || 'ninguno'}. ` +
        'Solo lib/mp y lib/env pueden tocarla.',
    ).toEqual([])
  })
})