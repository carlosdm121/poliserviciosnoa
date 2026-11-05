'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

import {
  adminAcreditarPagoAction,
  type EstadoPagoManual,
} from '@/app/actions/admin/acreditar-pago'

/**
 * Acredita el pago de un espacio desde el listado del panel.
 *
 * Está colapsado para que la lista no se llene de formularios: el admin lo
 * abre recién cuando vio la transferencia en el banco.
 */
export function FormularioAcreditarPago({
  profileId,
  montoSugerido,
}: {
  profileId: string
  montoSugerido: number
}): React.ReactElement {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [estado, setEstado] = useState<EstadoPagoManual | null>(null)
  const [pendiente, setPendiente] = useState(false)

  async function enviar(evento: React.FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()
    setPendiente(true)

    try {
      const resultado = await adminAcreditarPagoAction(new FormData(evento.currentTarget))
      setEstado(resultado)
      if (resultado.ok) router.refresh()
    } catch {
      setEstado({ ok: false, error: 'No pudimos registrar el pago. Probá de nuevo.' })
    } finally {
      setPendiente(false)
    }
  }

  if (estado?.ok) {
    return (
      <p className="text-sm font-bold text-green-700">
        Pago registrado. Activa hasta {new Date(estado.hasta).toLocaleDateString('es-AR')}.
      </p>
    )
  }

  if (!abierto) {
    return (
      <button type="button" className="btn-linea px-3 py-2 text-sm" onClick={() => setAbierto(true)}>
        Acreditar pago
      </button>
    )
  }

  return (
    <form onSubmit={enviar} className="space-y-2">
      <input type="hidden" name="profileId" value={profileId} />

      <label className="block">
        <span className="block text-xs font-bold uppercase">Método</span>
        <select name="metodo" className="campo" defaultValue="TRANSFERENCIA">
          <option value="TRANSFERENCIA">Transferencia</option>
          <option value="EFECTIVO">Efectivo</option>
          <option value="OTRO">Otro</option>
        </select>
      </label>

      <label className="block">
        <span className="block text-xs font-bold uppercase">Monto</span>
        <input
          name="monto"
          type="number"
          min="1"
          step="0.01"
          required
          defaultValue={montoSugerido}
          className="campo"
        />
      </label>

      <label className="block">
        <span className="block text-xs font-bold uppercase">N° de operación</span>
        <input
          name="referencia"
          type="text"
          className="campo"
          placeholder="Obligatorio en transferencia"
        />
      </label>

      {estado && !estado.ok ? (
        <p role="alert" className="text-sm font-bold text-red-700">
          {estado.error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button type="submit" disabled={pendiente} className="btn-oscuro disabled:opacity-50">
          {pendiente ? 'Registrando…' : 'Registrar pago'}
        </button>
        <button type="button" className="btn-linea" onClick={() => setAbierto(false)}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
