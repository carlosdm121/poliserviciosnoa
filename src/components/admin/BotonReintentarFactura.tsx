'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { adminReintentarFactura } from '@/app/actions/admin'
import { Button } from '@/components/ui/Button'

/**
 * Reintento manual de una factura en FAILED.
 *
 * El botón no promete que va a salir: dice "Reintentar" y, si ARCA vuelve a
 * fallar, el error aparece al lado. La pantalla se refresca igual para que se
 * vea el nuevo `attempts` y la próxima fecha de reintento.
 */
export function BotonReintentarFactura({ invoiceId }: { invoiceId: string }): React.ReactElement {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pendiente, arrancarTransicion] = useTransition()

  function reintentar(): void {
    setError(null)

    arrancarTransicion(() => {
      void (async () => {
        const resultado = await adminReintentarFactura(invoiceId)

        if (!resultado.ok) {
          setError(resultado.error)
          return
        }

        router.refresh()
      })()
    })
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button variante="linea" cargando={pendiente} textoCargando="Emitiendo." onClick={reintentar}>
        Reintentar
      </Button>

      {error && (
        <p className="error max-w-xs" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
