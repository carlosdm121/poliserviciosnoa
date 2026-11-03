'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { arrepentirme } from '@/app/actions/cancelaciones'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'

/**
 * Arrepentimiento desde `/arrepentimiento`.
 *
 * Muestra el monto, la fecha del pago y los días que quedan ANTES de confirmar.
 * El plazo es la condición que hace que el botón exista o no; esconderla detrás
 * de un "consultar" convierte una página legal en un trámite.
 */
export function FormularioArrepentimiento({
  monto,
  contratadoEl,
  venceEl,
  diasRestantes,
}: {
  monto: string
  contratadoEl: string
  venceEl: string
  diasRestantes: number
}): React.ReactElement {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [constancia, setConstancia] = useState<{ tramite: string; monto: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, arrancarTransicion] = useTransition()

  async function confirmar(): Promise<void> {
    setError(null)

    const resultado = await arrepentirme({ motivo })

    if (!resultado.ok) {
      setError(resultado.error)
      return
    }

    setConstancia({ tramite: resultado.data.tramite, monto })
    router.refresh()
  }

  if (constancia) {
    return (
      <div className="tarjeta p-6" role="status">
        <p className="font-black uppercase">Arrepentimiento confirmado</p>
        <p className="mt-3 leading-relaxed">
          Devolvimos <strong>{constancia.monto}</strong> por Mercado Pago. Puede tardar algunos días
          hábiles en verse en tu resumen.
        </p>
        <p className="mt-3 leading-relaxed">
          Tu perfil quedó despublicado y el comprobante fiscal fue anulado con una nota de crédito.
        </p>
        <p className="mt-3 leading-relaxed">
          Número de trámite: <strong>{constancia.tramite}</strong>
        </p>
        <p className="mt-3 text-sm text-muted">
          Te mandamos la constancia por email. Guardala: es lo que podés mostrar si el dinero no
          aparece.
        </p>
        <div className="mt-6">
          <Link href="/" className="btn-oscuro inline-flex items-center">
            Volver al inicio
          </Link>
        </div>
      </div>
    )
  }

  if (!confirmando) {
    return (
      <div className="tarjeta p-6">
        <dl className="space-y-2">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Pago</dt>
            <dd className="font-bold">
              {monto} · {contratadoEl}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Plazo</dt>
            <dd className="font-bold">
              Vence el {venceEl}
              {diasRestantes > 0 ? ` (quedan ${diasRestantes} días)` : ''}
            </dd>
          </div>
        </dl>

        <p className="mt-4 leading-relaxed">
          Si revocás ahora, devolvemos el total, despublicamos tu perfil y anulamos el comprobante
          fiscal. La baja es definitiva.
        </p>

        <div className="mt-6">
          <Button variante="oscuro" onClick={() => setConfirmando(true)}>
            Quiero arrepentirme y que me devuelvan el dinero
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="tarjeta p-6">
      <p className="font-black uppercase">Confirmá el arrepentimiento</p>
      <p className="mt-3 leading-relaxed">
        Vamos a devolver <strong>{monto}</strong>, despublicar tu perfil y anular la factura. No se
        puede deshacer.
      </p>

      <div className="mt-5 max-w-xl">
        <Textarea
          label="¿Querés contarnos por qué? (opcional)"
          value={motivo}
          onChange={(evento) => setMotivo(evento.target.value)}
          maxLength={1000}
        />
      </div>

      {error && (
        <p className="error mt-4" role="alert">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <Button
          variante="oscuro"
          cargando={pendiente}
          textoCargando="Procesando…"
          onClick={() => arrancarTransicion(() => void confirmar())}
        >
          Confirmar y devolver el dinero
        </Button>
        <Button variante="linea" onClick={() => setConfirmando(false)} disabled={pendiente}>
          Volver
        </Button>
      </div>
    </div>
  )
}
