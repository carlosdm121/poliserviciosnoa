'use client'

import { forwardRef, useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'

import { cn } from '@/lib/cn'

/**
 * Campo de formulario con etiqueta y error.
 *
 * El `useId` genera un id único para conectar label, input y mensaje de error.
 * Sin eso, el usuario del lector de pantalla oye "campo de texto" tres veces
 * sin saber cuál es.
 *
 * `aria-describedby` apunta solo al error cuando existe, y `aria-invalid`
 * avisa al lector de pantalla del problema sin depender del color.
 */

type BaseProps = {
  label: string
  error?: string
  /** Ayuda que se muestra siempre. Útil para el formato esperado. */
  ayuda?: string
}

type InputProps = BaseProps & InputHTMLAttributes<HTMLInputElement>

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, ayuda, className, id, ...props },
  ref,
) {
  const idGenerado = useId()
  const inputId = id ?? idGenerado
  const errorId = `${inputId}-error`
  const ayudaId = `${inputId}-ayuda`

  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="block text-sm font-bold">
        {label}
      </label>

      <input
        ref={ref}
        id={inputId}
        // Solo se marca inválido cuando hay error, no siempre: marcar en rojo
        // un campo vacío antes de que el usuario escriba lo confunde.
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : ayuda ? ayudaId : undefined}
        className={cn('campo', error && 'campo-error', className)}
        {...props}
      />

      {ayuda && !error && (
        <p id={ayudaId} className="text-xs text-muted">
          {ayuda}
        </p>
      )}

      {error && (
        <p id={errorId} role="alert" className="text-sm font-bold text-red-800">
          {error}
        </p>
      )}
    </div>
  )
})

type TextareaProps = BaseProps & TextareaHTMLAttributes<HTMLTextAreaElement>

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, ayuda, className, id, rows = 4, ...props },
  ref,
) {
  const idGenerado = useId()
  const inputId = id ?? idGenerado
  const errorId = `${inputId}-error`
  const ayudaId = `${inputId}-ayuda`

  return (
    <div className="space-y-1">
      <label htmlFor={inputId} className="block text-sm font-bold">
        {label}
      </label>

      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : ayuda ? ayudaId : undefined}
        className={cn('campo resize-y', error && 'campo-error', className)}
        {...props}
      />

      {ayuda && !error && (
        <p id={ayudaId} className="text-xs text-muted">
          {ayuda}
        </p>
      )}

      {error && (
        <p id={errorId} role="alert" className="text-sm font-bold text-red-800">
          {error}
        </p>
      )}
    </div>
  )
})