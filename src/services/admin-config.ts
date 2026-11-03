import { Prisma } from '@prisma/client'

import { normalizarDominios } from '@/lib/admin'
import { prisma } from '@/lib/prisma'
import { registrarAuditoria, type ActorAuditoria } from '@/services/auditoria'
import {
  CLAVES_CONFIG,
  type ConfiguracionAdmin,
  obtenerConfiguracion,
} from '@/services/configuracion'
import { setExigeAprobacionManual } from '@/services/moderacion'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

/**
 * Escritura de la configuración del sitio.
 *
 * La lectura vive en `configuracion.ts` para que el webhook no importe el
 * módulo de administración. Acá solo se valida y se guarda, con auditoría.
 */

export type { ConfiguracionAdmin } from '@/services/configuracion'
export {
  CLAVES_CONFIG,
  DIAS_GRACIA_POR_DEFECTO,
  MIN_PERFILES_POR_DEFECTO,
  diasDeGracia,
  dominiosDesechablesExtra,
  obtenerConfiguracion,
} from '@/services/configuracion'

export async function guardarConfiguracion(
  entrada: ConfiguracionAdmin,
  actor: ActorAuditoria,
): Promise<Resultado<null>> {
  const minPerfiles = Math.floor(entrada.minPerfiles)
  const diasGracia = Math.floor(entrada.diasGracia)
  const dominios = normalizarDominios(entrada.dominios.join('\n'))

  if (!Number.isFinite(minPerfiles) || minPerfiles < 0 || minPerfiles > 100) {
    return err('El mínimo de perfiles tiene que estar entre 0 y 100.', ERROR_CODES.VALIDACION)
  }

  if (!Number.isFinite(diasGracia) || diasGracia < 0 || diasGracia > 365) {
    return err('Los días de gracia tienen que estar entre 0 y 365.', ERROR_CODES.VALIDACION)
  }

  const anterior = await obtenerConfiguracion()
  const antes: Prisma.InputJsonValue = {
    aprobacionManual: anterior.aprobacionManual,
    minPerfiles: anterior.minPerfiles,
    diasGracia: anterior.diasGracia,
    dominios: anterior.dominios,
  }

  if (anterior.aprobacionManual !== entrada.aprobacionManual) {
    const cambio = await setExigeAprobacionManual(entrada.aprobacionManual, actor.email)

    if (!cambio.ok) return cambio
  }

  const valores: { key: string; value: Prisma.InputJsonValue }[] = [
    { key: CLAVES_CONFIG.minPerfiles, value: minPerfiles },
    { key: CLAVES_CONFIG.diasGracia, value: diasGracia },
    { key: CLAVES_CONFIG.dominios, value: dominios },
  ]

  await prisma.$transaction(async (tx) => {
    for (const fila of valores) {
      await tx.siteSetting.upsert({
        where: { key: fila.key },
        create: { key: fila.key, value: fila.value, updatedBy: actor.email },
        update: { value: fila.value, updatedBy: actor.email },
      })
    }

    await registrarAuditoria(
      {
        actor,
        accion: 'configuracion.guardar',
        entidad: 'SiteSetting',
        antes,
        despues: {
          aprobacionManual: entrada.aprobacionManual,
          minPerfiles,
          diasGracia,
          dominios,
        },
      },
      tx,
    )
  })

  return ok(null)
}


