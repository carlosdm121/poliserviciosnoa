'use client'

import { useState, useTransition } from 'react'

import { suscribirme } from '@/app/actions/suscripcion'
import { Button } from '@/components/ui/Button'
import { FallbackPago } from '@/components/panel/FallbackPago'

/**
 * Botón de pago.
 *
 * Tres estados y ninguno se inventa el resultado: el componente no decide si la
 * suscripción quedó activa, solo muestra lo que el servidor le dice. Como el
 * webhook (2.4) es el que activa la suscripción, después de pagar el
 * profesional vuelve a una pantalla que puede seguir diciendo "pendiente": por
 * eso el botón no promete "ya estás suscrito" y el texto de carga es
 * "Abriendo el pago…".
 *
 * El botón está deshabilitado hasta que se aceptan las condiciones, y no al
 * revés: es más honesto que dejar apretar y que después aparezca un error que
 * el profesional no puede corregir desde ahí.
 */
export function FormularioPago({
  condiciones,
  versionTerminos,
}: {
  condiciones: string[]
  /** Se muestra para que quede escrito qué versión se aceptó. */
  versionTerminos: string
}): React.ReactElement {
  const [aceptado, setAceptado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, arrancarTransicion] = useTransition()

  async function pagar(): Promise<void> {
    setError(null)

    const resultado = await suscribirme({ aceptaTerminos: aceptado })

    if (!resultado.ok) {
      setError(resultado.error)
      return
    }

    /**
     * Redirección del cliente con `window.location.href` y no con el router de
     * Next: la vuelta es a otro dominio (Mercado Pago) y después a uno nuestro, y
     * con el router el historial del navegador queda lleno de entradas internas
     * que el botón "atrás" del celular atraviesa. El botón de atrás tiene que
     * devolver al profesional a donde estaba antes de pagar, no a tres pantallas
     * internas del checkout.
     */
    window.location.href = resultado.data.urlCheckout
  }

  return (
    <div className="tarjeta p-6">
      <h2 className="text-xl font-black uppercase">Qué pasa cuando pagás</h2>

      <ul className="mt-4 space-y-3">
        {condiciones.map((linea) => (
          <li key={linea} className="flex gap-3 leading-relaxed">
            <span aria-hidden="true" className="font-black">
              —
            </span>
            <span>{linea}</span>
          </li>
        ))}
      </ul>

      <label className="mt-8 flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={aceptado}
          onChange={(evento) => setAceptado(evento.target.checked)}
          className="mt-1 h-6 w-6 shrink-0 border-[3px] border-ink"
        />
        <span className="leading-relaxed">
          Acepto las condiciones del servicio y que la renovación sea automática
          (versión {versionTerminos}).
        </span>
      </label>

      {error && (
        <p className="error mt-6" role="alert">
          {error}
        </p>
      )}

      <div className="mt-6">
        <Button
          variante="oscuro"
          disabled={!aceptado}
          cargando={pendiente}
          textoCargando="Abriendo el pago…"
          onClick={() => arrancarTransicion(() => void pagar())}
        >
          Pagar y activar
        </Button>
      </div>

      <FallbackPago />

    </div>
  )
}