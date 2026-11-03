import { prisma } from '@/lib/prisma'

/**
 * Ajustes del sitio.
 *
 * Módulo aparte y sin dependencias de otros servicios a propósito. La regla de
 * publicación necesita leer la bandera `requireManualApproval`, y si la leyera
 * desde `services/moderacion.ts` —que a su vez importa a la regla de
 * publicación— se armaría un ciclo de imports entre los dos módulos que
 * funciona por casualidad hoy y se rompe con el primer cambio de orden.
 */

/** Clave de la bandera de revisión manual. */
export const BANDERA_APROBACION_MANUAL = 'requireManualApproval'

/**
 * ¿Hay que aprobar cada perfil antes de publicarlo?
 *
 * Valor por defecto `false`: sin nadie mirando el panel, cada alta queda
 * esperando y el portal no le muestra a nadie. Con la bandera apagada, el
 * perfil nace en `PENDING_REVIEW` y `evaluarPublicacion` lo publica igual.
 *
 * Ante un error de base se asume que NO hace falta aprobar. La alternativa es
 * dejar de publicar a todo el mundo porque la base falló un segundo, que es la
 * peor forma de fallar: silenciosa y total.
 */
export async function exigeAprobacionManual(): Promise<boolean> {
  try {
    const ajuste = await prisma.siteSetting.findUnique({
      where: { key: BANDERA_APROBACION_MANUAL },
      select: { value: true },
    })

    // `value` es Json. Aceptar también el string "true" porque alguien puede
    // haberlo guardado desde Prisma Studio como texto.
    return ajuste?.value === true || ajuste?.value === 'true'
  } catch {
    return false
  }
}