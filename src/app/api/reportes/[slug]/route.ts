import { NextResponse } from 'next/server'

import { ipHasheada } from '@/lib/peticion'
import { crearReporte } from '@/services/reporte'
import { ERROR_CODES } from '@/types/resultado'

/**
 * Reporte público de un perfil (visitante anónimo, sin login).
 *
 * Cualquier visitante puede reportar un perfil desde /p/[slug]. Se valida el
 * cuerpo, se hashea la IP del visitante y se delega en el servicio, que aplica
 * rate limit (uno por IP y perfil por día) y dedupe.
 *
 * Responde 200 aunque el reporte no se acepte (límite alcanzado): el cuerpo
 * dice qué pasó. Nunca revela si el perfil existe para evitar enumeración.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<Response> {
  const { slug } = await params

  const ipHash = await ipHasheada()

  let cuerpo
  try {
    cuerpo = await request.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido.' }, { status: 400 })
  }

  const { motivo, detalle } = cuerpo

  const resultado = await crearReporte({
    slug,
    motivo,
    detalle: typeof detalle === 'string' ? detalle : undefined,
    ipHash,
    ahora: new Date(),
  })

  if (resultado.ok) {
    return NextResponse.json({ ok: true, id: resultado.data.id })
  }

  const status =
    resultado.code === ERROR_CODES.LIMITE_ALCANZADO ? 429 : 400

  return NextResponse.json(
    { ok: false, error: resultado.error },
    { status },
  )
}
