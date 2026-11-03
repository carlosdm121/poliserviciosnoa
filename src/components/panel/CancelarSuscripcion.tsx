'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { darDeBaja } from '@/app/actions/cancelaciones'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'

/**
 * Botón de baja de la renovación.
 *
 * Pide confirmación antes de cancelar, y la confirmación dice exactamente qué
 * pasa y qué no pasa. No es desconfianza del profesional: es que lo que pasa
 * después —"tu perfil sigue visible hasta fin de mes"— es la única parte de la
 * suscripción que le importa, y está del otro lado del botón.
 *
 * Cancelar dos veces no puede ser un error (ver `cancelarRenovacion` en
 * `services/suscripcion.ts`), así que el componente no lleva un estado local de
 * "cancelada": después de la primera, el servidor manda de vuelta la pantalla con
 * el botón ya deshabilitado y el aviso puesto.
 */
export function CancelarSuscripcion(): React.ReactElement {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendiente, arrancarTransicion] = useTransition()

  async function cancelar(): Promise<void> {
    setError(null)

    const resultado = await darDeBaja({ motivo })

    if (!resultado.ok) {
      setError(resultado.error)
      return
    }

    router.refresh()
  }

  if (confirmando) {
    return (
      <div className="tarjeta p-6">
        <p className="font-black uppercase">¿Cancelar la renovación automática?</p>

        <ul className="mt-4 space-y-2 leading-relaxed">
          <li>No se vuelve a cobrar el mes que viene.</li>
          <li>
            Tu perfil <span className="font-bold">sigue apareciendo</span> hasta que termine el mes
            que ya pagaste.
          </li>
          <li>
            Después de eso tu perfil deja de aparecer hasta que actives de nuevo. Tus datos, tus
            fotos y tu historial quedan guardados.
          </li>
        </ul>

        <div className="mt-5 max-w-xl">
          <Textarea
            label="¿Querés contarnos por qué? (opcional)"
            value={motivo}
            onChange={(evento) => setMotivo(evento.target.value)}
            maxLength={1000}
            ayuda="No hace falta para cancelar; nos sirve para mejorar."
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
            textoCargando="Cancelando…"
            onClick={() => arrancarTransicion(() => void cancelar())}
          >
            Sí, cancelar
          </Button>

          <Button variante="linea" onClick={() => setConfirmando(false)} disabled={pendiente}>
            No, dejar como está
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Button variante="linea" onClick={() => setConfirmando(true)}>
        Cancelar renovación automática
      </Button>

      {error && (
        <p className="error mt-4" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}