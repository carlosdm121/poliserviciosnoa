import { forwardRef, type ButtonHTMLAttributes } from 'react'

import { cn } from '@/lib/cn'

/**
 * Botón base.
 *
 * Existe como componente y no solo como clase CSS por dos razones: el tipo
 * se define una vez (un `<button>` sin `type` dentro de un `<form>` envía el
 * formulario al hacer clic, que es un bug clásico), y el estado de carga se
 * maneja acá en lugar de en cada formulario.
 */

type Variante = 'oscuro' | 'linea' | 'whatsapp'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante
  cargando?: boolean
  /** Texto mientras carga. Si no se pasa, se oculta el label y queda el spinner. */
  textoCargando?: string
}

const VARIANTES: Record<Variante, string> = {
  oscuro: 'btn-oscuro',
  linea: 'btn-linea',
  whatsapp: 'btn-whatsapp',
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variante = 'oscuro', cargando = false, textoCargando, className, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      // type explícito: el default de <button> en HTML es "submit" y hace
      // envíos surprised.
      type="button"
      disabled={disabled || cargando}
      aria-busy={cargando}
      className={cn(
        VARIANTES[variante],
        // Sin hover: en táctil no existe y en el dedo queda pegado el estado.
        'hover:opacity-100',
        (disabled || cargando) && 'pointer-events-none opacity-50',
        className,
      )}
      {...props}
    >
      {cargando && (
        <span
          aria-hidden="true"
          className="inline-block h-4 w-4 animate-spin border-2 border-current border-t-transparent"
        />
      )}
      {cargando && textoCargando ? textoCargando : children}
    </button>
  )
})