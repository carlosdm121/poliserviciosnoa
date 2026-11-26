'use client'

import { useState, useTransition } from 'react'

import { suscribirme } from '@/app/actions/suscripcion'
import { Button } from '@/components/ui/Button'
import { ModalPromo } from '@/components/panel/ModalPromo'

/**
 * Formulario de canje de código promocional.
 *
 * Pide el código, muestra las condiciones del servicio y llama a `suscribirme`.
 * Si el servidor confirma la promo (meses gratis > 0), abre el ModalPromo.
 * Si no, muestra el error del servidor.
 */
export function FormularioPromo({
  condiciones,
  versionTerminos,
}: {
  condiciones: string[]
  versionTerminos: string
}): React.ReactElement {
  const [codigo, setCodigo] = useState('')
  const [aceptaTerminos, setAceptaTerminos] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, arrancarTransicion] = useTransition()
  const [mostrarModal, setMostrarModal] = useState(false)
  const [mesesGratis, setMesesGratis] = useState(0)
  const [estadoPromo, setEstadoPromo] = useState<'activa' | 'reservada'>('reservada')

  const esPromo = codigo.trim().length > 0

  async function canjear(): Promise<void> {
    setError(null)

    const resultado = await suscribirme({
      aceptaTerminos,
      codigoCupon: codigo.trim(),
    })

    if (!resultado.ok) {
      setError(resultado.error)
      return
    }

    // Si la suscripción quedó activa (urlCheckout === '/panel/suscripcion'),
    // la promo se aplicó y mostramos el modal.
    setMesesGratis(2)
    setEstadoPromo('activa')
    setMostrarModal(true)
  }

  return (
    <>
      <div className="tarjeta p-6">
        <div>
          <h2 className="text-xl font-black uppercase">¿Tenés un código promocional?</h2>

          <p className="mt-3 max-w-prose leading-relaxed">
            Si te lo dieron, escribilo acá. Un código de lanzamiento activa tu perfil por 2 meses sin
            pagar nada y sin pedirte tarjeta.
          </p>

          <label className="mt-4 block space-y-1">
            <span className="block text-sm font-bold">Código promocional</span>
            <input
              type="text"
              value={codigo}
              onChange={(evento) => setCodigo(evento.target.value.toUpperCase())}
              className="campo"
              autoComplete="off"
              spellCheck={false}
              maxLength={40}
              placeholder="Ej.: PROMO-ABC123"
            />
          </label>
        </div>

        {esPromo ? (
          <div className="mt-6 border-[3px] border-ink bg-noa-silver/30 p-5">
            <p className="max-w-prose leading-relaxed">
              Con un código válido <strong>no se te cobra nada</strong>: tu perfil queda activo y
              visible por 2 meses. No se te pide tarjeta ni cuenta bancaria.
            </p>
            <p className="mt-3 max-w-prose leading-relaxed">
              Si el código no es válido o no cubre el total, te lo decimos acá y podés borrarlo para
              pagar normalmente.
            </p>
          </div>
        ) : (
          <>
            <h2 className="mt-8 text-xl font-black uppercase">Qué pasa cuando pagás</h2>

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
          </>
        )}

        <label className="mt-8 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={aceptaTerminos}
            onChange={(evento) => setAceptaTerminos(evento.target.checked)}
            className="mt-1 h-6 w-6 shrink-0 border-[3px] border-ink"
          />
          <span className="leading-relaxed">
            Acepto las condiciones del servicio (versión {versionTerminos}).
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
            disabled={!aceptaTerminos || codigo.trim().length === 0}
            cargando={pendiente}
            textoCargando="Activando…"
            onClick={() => arrancarTransicion(() => void canjear())}
          >
            Canjear código
          </Button>
        </div>
      </div>

      <ModalPromo
        mesesGratis={mesesGratis}
        estado={estadoPromo}
        onAccept={() => setMostrarModal(false)}
        open={mostrarModal}
      />
    </>
  )
}