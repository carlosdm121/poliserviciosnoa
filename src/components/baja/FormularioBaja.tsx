'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { darDeBaja } from '@/app/actions/cancelaciones'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'

/**
 * Baja de la suscripción desde `/baja`.
 *
 * Dos pasos y ningún teléfono. El segundo paso dice qué pasa con el perfil y
 * con la plata antes de confirmar: la baja no devuelve el período ya pagado, y
 * que eso se entere después es la diferencia entre una baja y un reclamo.
 *
 * El motivo es opcional a propósito. Exigirlo para dejar de pagar es una traba
 * que la ley no pide y que el profesional resuelve escribiendo "no".
 */
export function FormularioBaja({ visibleHasta }: { visibleHasta: string }): React.ReactElement {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [tramite, setTramite] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, arrancarTransicion] = useTransition()

  async function confirmar(): Promise<void> {
    setError(null)

    const resultado = await darDeBaja({ motivo })

    if (!resultado.ok) {
      setError(resultado.error)
      return
    }

    setTramite(resultado.data.tramite)
    router.refresh()
  }

  if (tramite) {
    return (
      <div className="tarjeta p-6" role="status">
        <p className="font-black uppercase">Baja registrada</p>
        <p className="mt-3 leading-relaxed">
          No se te va a cobrar nada más. Tu perfil sigue visible hasta el{' '}
          <strong>{visibleHasta}</strong>.
        </p>
        <p className="mt-3 leading-relaxed">
          Número de trámite: <strong>{tramite}</strong>
        </p>
        <p className="mt-3 text-sm text-muted">
          Te mandamos un email con esta misma información. Guardalo por si necesitás reclamar.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/panel/suscripcion" className="btn-oscuro inline-flex items-center">
            Volver a mi suscripción
          </Link>
        </div>
      </div>
    )
  }

  if (!confirmando) {
    return (
      <div className="tarjeta p-6">
        <p className="font-black uppercase">¿Querés dar de baja tu suscripción?</p>
        <ul className="mt-4 space-y-2 leading-relaxed">
          <li>No se vuelve a cobrar el mes que viene.</li>
          <li>
            Tu perfil <strong>sigue visible hasta el {visibleHasta}</strong>, el período que ya
            pagaste.
          </li>
          <li>Después de esa fecha deja de aparecer en las búsquedas. Tus datos quedan guardados.</li>
          <li>No se devuelve el dinero del período en curso.</li>
        </ul>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button variante="oscuro" onClick={() => setConfirmando(true)}>
            Sí, quiero darme de baja
          </Button>
          <Link href="/panel/suscripcion" className="btn-linea inline-flex items-center">
            No, dejar como está
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="tarjeta p-6">
      <p className="font-black uppercase">Confirmá la baja</p>

      <p className="mt-3 leading-relaxed">
        Tu perfil queda visible hasta el <strong>{visibleHasta}</strong> y después se despublica.
      </p>

      <div className="mt-5 max-w-xl">
        <Textarea
          label="¿Querés contarnos por qué? (opcional)"
          value={motivo}
          onChange={(evento) => setMotivo(evento.target.value)}
          maxLength={1000}
          ayuda="Nos ayuda a mejorar, pero no hace falta para darte de baja."
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
          textoCargando="Dando de baja…"
          onClick={() => arrancarTransicion(() => void confirmar())}
        >
          Confirmar baja
        </Button>
        <Button variante="linea" onClick={() => setConfirmando(false)} disabled={pendiente}>
          Volver
        </Button>
      </div>
    </div>
  )
}
