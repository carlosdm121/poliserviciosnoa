'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { exigirSuperAdmin } from '@/lib/admin-auth'
import { calcularPagina } from '@/lib/admin'
import { logger } from '@/lib/logger'
import {
  cancelarAumento,
  crearAumento,
  listarAumentos,
  type FiltrosAumentos,
  type FilaAumento,
} from '@/services/ajustes-precio'
import { err, ERROR_CODES, ok, type Resultado } from '@/types/resultado'

function texto(datos: FormData, clave: string): string {
  const valor = datos.get(clave)

  return typeof valor === 'string' ? valor.trim() : ''
}

function numero(datos: FormData, clave: string): number {
  const valor = Number(texto(datos, clave))

  return Number.isFinite(valor) ? valor : 0
}

/** Vuelve a la pantalla de precios con un mensaje legible. */
function volver(datos: FormData, correcto: boolean, mensaje: string): never {
  const ruta = texto(datos, 'ruta')
  const destino = ruta.startsWith('/admin') ? ruta : '/admin/precios'
  const separador = destino.includes('?') ? '&' : '?'

  redirect(`${destino}${separador}${correcto ? 'ok' : 'error'}=${encodeURIComponent(mensaje)}`)
}

/**
 * Programa un aumento de precio de un plan. Solo ADMIN: toca dinero y
 * configuración del sitio.
 */
export async function preciosCrearAumento(datos: FormData): Promise<void> {
  const admin = await exigirSuperAdmin()
  if (!admin.ok) return volver(datos, false, admin.error)

  const planId = texto(datos, 'planId')
  const montoNuevo = numero(datos, 'montoNuevo')
  const fechaAplicacion = texto(datos, 'fechaAplicacion')
  const motivo = texto(datos, 'motivo')

  if (!planId) {
    return volver(datos, false, 'Elegí el plan al que se aplica el aumento.')
  }

  if (!montoNuevo) {
    return volver(datos, false, 'El monto nuevo es obligatorio.')
  }

  if (!fechaAplicacion) {
    return volver(datos, false, 'Elegí la fecha en que se aplica el aumento.')
  }

  const fecha = new Date(`${fechaAplicacion}T00:00:00Z`)

  const resultado = await crearAumento({
    planId,
    montoNuevo,
    fechaAplicacion: fecha,
    motivo: motivo || undefined,
    actor: admin.data,
  })

  const ruta = texto(datos, 'ruta') ?? '/admin/precios'
  revalidatePath(ruta)
  volver(datos, resultado.ok, resultado.ok ? 'Aumento de precio programado.' : resultado.error)
}

/**
 * Cancela un aumento programado. Solo ADMIN.
 */
export async function preciosCancelarAumento(datos: FormData): Promise<void> {
  const admin = await exigirSuperAdmin()
  if (!admin.ok) return volver(datos, false, admin.error)

  const aumentoId = texto(datos, 'aumentoId')

  if (!aumentoId) {
    return volver(datos, false, 'Falta el aumento a cancelar.')
  }

  const resultado = await cancelarAumento({
    aumentoId,
    actor: admin.data,
  })

  const ruta = texto(datos, 'ruta') ?? '/admin/precios'
  revalidatePath(ruta)
  volver(datos, resultado.ok, resultado.ok ? 'Aumento cancelado.' : resultado.error)
}

/**
 * Listado de aumentos para la pantalla de administración.
 * Se exporta para que la página la pueda leer sin lógica extra.
 */
export async function preciosListarAumentos(
  filtros: FiltrosAumentos = {},
): Promise<{ filas: FilaAumento[]; pagina: ReturnType<typeof calcularPagina> }> {
  return listarAumentos(filtros)
}
