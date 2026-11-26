'use client'

import { useEffect, useRef } from 'react'
import { VERSION_TERMINOS } from '@/lib/suscripcion'

interface ModalPromoProps {
  mesesGratis: number
  estado: 'activa' | 'reservada'
  onAccept: () => void
  open: boolean
}

/**
 * Diálogo nativo para mostrar el estado de la promo (activa o reservada).
 *
 * Se usa `showModal()` en el `useEffect` para abrirlo como modal real,
 * lo que bloquea el fondo y maneja `Esc` para cerrar.
 * El título lleva `id` y el `dialog` usa `aria-labelledby` para accesibilidad.
 */
export function ModalPromo({ mesesGratis, estado, onAccept, open }: ModalPromoProps): React.ReactElement | null {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open) {
      dialog.showModal()
    } else {
      dialog.close()
    }

    return () => {
      dialog.close()
    }
  }, [open])

  if (!open) return null

  const esReservada = estado === 'reservada'

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="modal-promo-titulo"
      className="max-w-md mx-auto p-6 bg-white rounded-xl shadow-lg border-2 border-ink"
      style={{ backgroundColor: 'white', color: '#1a1a1a' }}
    >
      <h2 id="modal-promo-titulo" className="text-xl font-black uppercase mb-4">
        {esReservada ? 'Promo reservada' : 'Tu suscripción'}
      </h2>

      <div className="space-y-3 text-base leading-relaxed">
        <p className="font-bold">
          {esReservada
            ? `Tenés una promo de ${mesesGratis} mes${mesesGratis > 1 ? 'es' : ''} gratis reservada.`
            : `Tu suscripción está activa con ${mesesGratis} mes${mesesGratis > 1 ? 'es' : ''} gratis.`}
        </p>

        <p className="text-muted">
          {esReservada
            ? 'La promo se activará cuando completes los requisitos que faltan. No se te cobra nada mientras tanto.'
            : 'El servicio es gratis hasta que termine el período. Después se renueva automáticamente al precio normal.'}
        </p>

        <p className="text-sm text-muted">
          Versión de términos: {VERSION_TERMINOS}
        </p>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          className="bg-noa-blue text-white font-bold py-2 px-6 border-2 border-ink hover:bg-noa-blue/90 transition-colors"
          onClick={() => {
            onAccept()
            dialogRef.current?.close()
          }}
        >
          Aceptar
        </button>
      </div>

      <form method="dialog" className="hidden">
        <button type="submit" value="cancel">Cerrar</button>
      </form>
    </dialog>
  )
}