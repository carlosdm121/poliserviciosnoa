'use client'

import { useState, useEffect } from 'react'

import Image from 'next/image'

/**
 * Modo de respaldo: link fijo + QR de Mercado Pago.
 *
 * Se muestra solo cuando NEXT_PUBLIC_MP_FALLBACK_MODE === '1'.
 * No interfiere con el flujo automático de Preapproval (webhook + suscripción mensual).
 * El profesional paga una vez, envía comprobante por WhatsApp, admin activa manual.
 */
export function FallbackPago(): React.ReactElement | null {
  const [habilitado, setHabilitado] = useState(false)
  const [link, setLink] = useState('')
  const [qrUrl, setQrUrl] = useState('')

  useEffect(() => {
    const modo = process.env.NEXT_PUBLIC_MP_FALLBACK_MODE
    const linkFijo = process.env.NEXT_PUBLIC_MP_STATIC_LINK
    const qrBase = process.env.NEXT_PUBLIC_MP_STATIC_QR_URL

    if (modo === '1' && linkFijo) {
      setHabilitado(true)
      setLink(linkFijo)
      setQrUrl(qrBase ? `${qrBase}?data=${encodeURIComponent(linkFijo)}` : `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(linkFijo)}`)
    }
  }, [])

  if (!habilitado) return null

  function abrirLink(): void {
    window.location.href = link
  }

  return (
    <div className="mt-8 tarjeta p-6 border-l-4 border-l-noa-blue">
      <h2 className="text-xl font-black uppercase text-noa-blue">
        Pago manual (link + QR)
      </h2>

      <p className="mt-3 max-w-prose leading-relaxed">
        Si preferís pagar la suscripción una sola vez con un link fijo o escaneando un QR, usá esta opción.
        Después de pagar, envianos el comprobante por WhatsApp al <strong>+54 9 381 384 5345</strong> y activamos tu perfil a mano.
      </p>

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={abrirLink}
          className="btn-oscuro min-h-[48px] text-base font-black uppercase tracking-wide"
        >
          Pagar con link
        </button>

        <div className="flex items-center gap-3 sm:ml-auto">
          <Image
            src={qrUrl}
            alt="Código QR de pago Mercado Pago"
            width={256}
            height={256}
            className="h-28 w-28 sm:h-32 sm:w-32 border border-noa-silver/40 bg-white"
            aria-label="Código QR para pagar la suscripción con Mercado Pago"
          />
          <p className="text-sm text-muted max-w-[160px]">
            Escaneá con la app de Mercado Pago o tu banco
          </p>
        </div>
      </div>

      <div className="mt-6 p-4 bg-noa-void/5 border border-noa-blue/20">
        <h3 className="font-bold uppercase text-sm">Pasos para completar el pago manual</h3>
        <ol className="mt-3 space-y-2 text-sm leading-relaxed">
          <li className="flex gap-2">
            <span aria-hidden="true" className="font-black text-noa-blue">1.</span>
            <span>Clic en <strong>Pagar con link</strong> o escaneá el QR con la app de MP / tu banco.</span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true" className="font-black text-noa-blue">2.</span>
            <span>Completá el pago en Mercado Pago (tarjeta, efectivo, transferencia).</span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true" className="font-black text-noa-blue">3.</span>
            <span>Guardá el comprobante (captura de pantalla o PDF).</span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true" className="font-black text-noa-blue">4.</span>
            <span>Enviá el comprobante por WhatsApp al <strong>+54 9 381 384 5345</strong> con tu nombre y rubro.</span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true" className="font-black text-noa-blue">5.</span>
            <span>Activamos tu perfil en <strong>24 hs hábiles</strong> y te avisamos.</span>
          </li>
        </ol>
      </div>

      <p className="mt-4 text-xs text-muted">
        Este modo no usa cobro recurrente. Cada mes deberás repetir el pago manualmente.
        El sistema principal (suscripción automática) sigue disponible arriba.
      </p>
    </div>
  )
}