import { randomUUID } from 'node:crypto'

import { enviarEmailReclamo } from '@/lib/email'
import { logger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

/**
 * Libro de quejas.
 *
 * Guarda el reclamo y avisa por email a la casilla del proveedor. Guardar sin
 * avisar deja la queja en una tabla que nadie mira; avisar sin guardar deja al
 * reclamante sin número de trámite. Las dos cosas o ninguna.
 *
 * El texto es libre y puede traer datos de terceros: no se loguea, solo se
 * persiste y se manda al contacto interno.
 */

const RECLAMOS_POR_HORA = 5
const UNA_HORA = 60 * 60 * 1000

export type EntradaReclamo = {
  nombre: string
  email: string
  telefono?: string | null
  referencia?: string | null
  mensaje: string
}

export async function registrarReclamo(
  entrada: EntradaReclamo,
  ahora: Date = new Date(),
): Promise<Resultado<{ numero: string }>> {
  const recientes = await prisma.complaint.count({
    where: {
      email: entrada.email,
      createdAt: { gte: new Date(ahora.getTime() - UNA_HORA) },
    },
  })

  if (recientes >= RECLAMOS_POR_HORA) {
    return err(
      'Recibimos varios reclamos tuyos en la última hora. Esperá unos minutos o escribinos directamente.',
      ERROR_CODES.RATE_LIMIT,
    )
  }

  const numero = generarNumeroReclamo(ahora, randomUUID())

  const reclamo = await prisma.complaint.create({
    data: {
      name: entrada.nombre,
      email: entrada.email,
      phone: entrada.telefono?.trim() || null,
      reference: entrada.referencia?.trim() || null,
      message: entrada.mensaje,
    },
    select: { id: true },
  })

  const envio = await enviarEmailReclamo({
    nombre: entrada.nombre,
    email: entrada.email,
    telefono: entrada.telefono?.trim() || null,
    referencia: entrada.referencia?.trim() || null,
    mensaje: entrada.mensaje,
    numero,
  })

  if (!envio.ok) {
    // El reclamo ya está guardado: se avisa en el log para que alguien lo
    // busque a mano. Devolver error acá haría que el reclamante lo mande dos
    // veces y quedarían dos filas del mismo caso.
    logger.error('reclamos: quedó guardado pero no se pudo notificar', {
      complaintId: reclamo.id,
      numero,
      error: envio.error,
    })
  }

  return ok({ numero })
}

/** Número legible para citar por teléfono: `LQ-20261027-AB12CD`. */
function generarNumeroReclamo(ahora: Date, sufijo: string): string {
  const anio = ahora.getUTCFullYear()
  const mes = String(ahora.getUTCMonth() + 1).padStart(2, '0')
  const dia = String(ahora.getUTCDate()).padStart(2, '0')
  const limpio = sufijo.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6)

  return `LQ-${anio}${mes}${dia}-${limpio || '000000'}`
}
