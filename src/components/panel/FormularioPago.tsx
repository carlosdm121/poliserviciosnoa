'use client'

import { useState, useTransition } from 'react'

import { suscribirme } from '@/app/actions/suscripcion'
import { Button } from '@/components/ui/Button'
import { FallbackPago } from '@/components/panel/FallbackPago'
import { WHATSAPP_PUBLICO, enlaceComprobantePago } from '@/lib/constantes'

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
 * Antes de pagar hay dos aceptaciones separadas: la de la cuenta a nombre del
 * titular y la de los términos con renovación automática. El pago se rechaza si
 * sale de una cuenta ajena, y el dinero no se devuelve, así que esa condición
 * tiene su propio recuadro y su propia casilla.
 *
 * Con un código promocional de meses gratis no hay pago: se pide solo la
 * aceptación de los términos, y la casilla del titular queda como respaldo por
 * si el código no cubre el total.
 */
export function FormularioPago({
  condiciones,
  versionTerminos,
}: {
  condiciones: string[]
  /** Se muestra para que quede escrito qué versión se aceptó. */
  versionTerminos: string
}): React.ReactElement {
  const [codigo, setCodigo] = useState('')
  const [aceptaCuenta, setAceptaCuenta] = useState(false)
  const [aceptaTerminos, setAceptaTerminos] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, arrancarTransicion] = useTransition()

  const esPromo = codigo.trim().length > 0
  const puedePagar = aceptaTerminos && (esPromo || aceptaCuenta)

  async function pagar(): Promise<void> {
    setError(null)

    const resultado = await suscribirme({
      aceptaTerminos,
      aceptaCuentaTitular: aceptaCuenta,
      codigoCupon: codigo.trim() || undefined,
    })

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
          <div className="mt-6 border-[3px] border-ink bg-noa-silver/30 p-5">
            <h2 className="text-xl font-black uppercase">
              El pago debe salir de una cuenta a tu nombre
            </h2>

            <p className="mt-3 max-w-prose leading-relaxed">
              Pagá desde una cuenta bancaria, tarjeta o billetera <strong>a tu nombre</strong>. Si
              el perfil es de una empresa, la cuenta tiene que estar a nombre de esa empresa. No se
              acepta la cuenta de otra persona.
            </p>

            <p className="mt-3 max-w-prose font-bold leading-relaxed">
              Si el pago se hace desde una cuenta ajena, se rechaza automáticamente y el dinero no
              se devuelve.
            </p>

            <p className="mt-3 max-w-prose leading-relaxed">
              Después de pagar, tenés que enviar el comprobante al WhatsApp{' '}
              <a
                href={enlaceComprobantePago()}
                target="_blank"
                rel="noopener noreferrer"
                className="font-black underline underline-offset-2"
              >
                {WHATSAPP_PUBLICO}
              </a>
              . Sin excepción.
            </p>
          </div>

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
          checked={aceptaCuenta}
          onChange={(evento) => setAceptaCuenta(evento.target.checked)}
          className="mt-1 h-6 w-6 shrink-0 border-[3px] border-ink"
        />
        <span className="leading-relaxed">
          {esPromo
            ? 'Si el código no cubre el total, acepto pagar desde una cuenta a mi nombre y enviar el comprobante al WhatsApp indicado.'
            : 'Entiendo y acepto: voy a pagar desde una cuenta a mi nombre y voy a enviar el comprobante al WhatsApp indicado. Si uso una cuenta ajena, el pago se rechaza y el dinero no se devuelve.'}
        </span>
      </label>

      <label className="mt-5 flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={aceptaTerminos}
          onChange={(evento) => setAceptaTerminos(evento.target.checked)}
          className="mt-1 h-6 w-6 shrink-0 border-[3px] border-ink"
        />
        <span className="leading-relaxed">
          {esPromo
            ? `Acepto las condiciones del servicio (versión ${versionTerminos}).`
            : `Acepto las condiciones del servicio y que la renovación sea automática (versión ${versionTerminos}).`}
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
          disabled={!puedePagar}
          cargando={pendiente}
          textoCargando={esPromo ? 'Activando…' : 'Abriendo el pago…'}
          onClick={() => arrancarTransicion(() => void pagar())}
        >
          {esPromo ? 'Activar código' : 'Pagar y activar'}
        </Button>
      </div>

      {!esPromo && <FallbackPago puedePagar={puedePagar} />}
    </div>
  )
}
