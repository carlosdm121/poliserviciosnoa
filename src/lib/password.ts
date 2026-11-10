import bcrypt from 'bcryptjs'

/**
 * Hash de contraseñas.
 *
 * Se usa bcryptjs y no bcrypt nativo porque no requiere compilación: en
 * Vercel y en cualquier Linux sin toolchain, bcrypt nativo falla al
 * instalarse y tumba el build. bcryptjs es JS puro, un poco más lento pero
 * irrelevante acá.
 *
 * Nota del punto 10 del módulo 6.1: OWASP recomienda argon2id, pero argon2
 * requiere compilación nativa y rompe el despliegue en Vercel. bcryptjs con
 * costo 12 es el mejor compromiso disponible sin infraestructura propia.
 */

/** Costo 12. */
const COSTO_BCRYPT = 12

/**
 * Lista de contraseñas comunes que se rechazan al registrar o cambiar
 * contraseña. No es exhaustiva: cubre los casos más obvios para evitar que
 * un atacante entre con el primer intento de fuerza bruta.
 */
const CONTRASEÑAS_COMUNES = new Set([
  '1234567890',
  '12345678',
  'password',
  'contraseña',
  'qwerty',
  'abc123',
  '123456',
  '123456789',
  'iloveyou',
  'admin',
  'welcome',
  'monkey',
  'dragon',
  'master',
  'login',
  'princess',
  'football',
  'shadow',
  'sunshine',
  'trustno1',
])

/** Hashea una contraseña en texto plano. */
export async function hashearPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COSTO_BCRYPT)
}

/**
 * Devuelve true si el hash necesita ser rehasheado porque los parámetros
 * cambiaron (costo distinto al actual).
 *
 * Se usa al iniciar sesión: si la contraseña es válida pero el hash usa un
 * costo viejo, se rehashea con el costo actual y se guarda de nuevo.
 */
export function necesitaRehash(hash: string): boolean {
  // bcryptjs guarda el costo en el hash: $2a$<costo>$
  const match = hash.match(/^\$2[ab]\$(\d{2})\$/)
  if (!match) return true

  const costo = Number(match[1])
  return costo !== COSTO_BCRYPT
}

/**
 * Verifica una contraseña contra su hash.
 *
 * Nunca tira. Si el hash está mal formado o viene `null`, devuelve `false`:
 * un error acá revelaría que el usuario existe pero no tiene password, que
 * es exactamente la información que un atacante busca.
 *
 * Devuelve un objeto `{ valido, necesitaRehash }` para que quien llama pueda
 * rehashear y guardar si el costo cambió.
 */
export async function verificarPassword(
  password: string,
  hash: string | null,
): Promise<{ valido: boolean; necesitaRehash: boolean }> {
  if (!hash) return { valido: false, necesitaRehash: false }

  try {
    const valido = await bcrypt.compare(password, hash)
    return { valido, necesitaRehash: necesitaRehash(hash) }
  } catch {
    return { valido: false, necesitaRehash: false }
  }
}

/**
 * Verifica que una contraseña candidata no sea una de las comunes y tenga
 * al menos 12 caracteres con complejidad (mayúscula, minúscula, número,
 * símbolo).
 *
 * Lanza un error con el motivo si no cumple la política.
 */
export function validarPoliticaPassword(password: string): void {
  // Mínimo 12 caracteres
  if (password.length < 12) {
    throw new Error(
      'La contraseña necesita al menos 12 caracteres.',
    )
  }

  // Complejidad: mayúscula, minúscula, número, símbolo
  const hasUppercase = /[A-Z]/.test(password)
  const hasLowercase = /[a-z]/.test(password)
  const hasNumbers = /\d/.test(password)
  const hasSymbols = /[!@#$%^&*()_+\-=\[\]{};:"\\|,.<>\/?~`]/.test(password)

  if (!(hasUppercase && hasLowercase && hasNumbers && hasSymbols)) {
    throw new Error(
      'La contraseña debe incluir mayúsculas, minúsculas, números y símbolos.',
    )
  }

  // Contraseñas comunes
  if (CONTRASEÑAS_COMUNES.has(password.toLowerCase())) {
    throw new Error(
      'Esa contraseña es demasiado común. Elegí otra.',
    )
  }

  // No secuencias obvias
  if (/(\d{4,})/.test(password)) {
    throw new Error(
      'La contraseña no puede contener secuencias de números obvias.',
    )
  }
}

/**
 * Alfabeto sin caracteres ambiguos (0/O, 1/l/I): la clave se dicta o se copia
 * a mano, y un carácter confundido es un login que falla.
 */
const ALFABETO_TEMPORAL = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
const SIMBOLOS_TEMPORALES = '!@#$%'

/**
 * Genera la contraseña temporal que el admin le entrega al profesional al
 * crear su espacio. 12 caracteres superan la política mínima de 12.
 *
 * Garantiza al menos: 1 mayúscula, 1 minúscula, 1 número, 1 símbolo.
 */
export function generarPasswordTemporal(longitud = 12): string {
  if (longitud < 12) longitud = 12

  // Alfabetos por clase
  const mayusculas = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const minusculas = 'abcdefghijkmnopqrstuvwxyz'
  const numeros = '23456789'
  const simbolos = '!@#$%'

  const todos = [...mayusculas, ...minusculas, ...numeros, ...simbolos]

  // Asegurar al menos un carácter de cada clase
  const passwordChars: string[] = []
  for (const cls of [mayusculas, minusculas, numeros, simbolos]) {
    const idx = Math.floor(Math.random() * cls.length)
    passwordChars.push(cls[idx]!)
  }

  // Rellenar el resto hasta alcanzar la longitud solicitada
  for (let i = passwordChars.length; i < longitud; i++) {
    passwordChars.push(todos[Math.floor(Math.random() * todos.length)]!)
  }

  return passwordChars.join('')
}
