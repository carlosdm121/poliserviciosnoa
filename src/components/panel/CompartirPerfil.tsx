'use client'

import { useEffect, useState } from 'react'

type Props = { url: string }

/**
 * Muestra la URL pública del perfil y permite copiarla o compartirla.
 *
 * La URL vive en la barra de direcciones del navegador, que en un celular no
 * se ve: acá queda a la vista y a un toque de copiarla o enviarla por WhatsApp.
 */
export function CompartirPerfil({ url }: Props): React.ReactElement {
  const [copiado, setCopiado] = useState(false)
  const [compartible, setCompartible] = useState(false)

  useEffect(() => {
    setCompartible('share' in navigator)
  }, [])

  async function copiar(): Promise<void> {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sin permiso de clipboard (contexto inseguro o navegador viejo): el
      // texto queda seleccionable en la barra para copiarlo a mano.
    }
  }

  async function compartir(): Promise<void> {
    if (!compartible) return copiar()

    try {
      await navigator.share({ title: 'Mi perfil en PoliserviciosNOA', url })
    } catch {
      // El usuario canceló la hoja de compartir: no hay nada que hacer.
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2 border-[3px] border-ink bg-paper px-3 py-2">
        <span aria-hidden="true">🌐</span>
        <span className="truncate font-mono text-sm" title={url}>
          {url}
        </span>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={copiar} className="btn-linea px-3 py-1 text-sm">
          {copiado ? '¡Copiado!' : 'Copiar'}
        </button>
        <button type="button" onClick={compartir} className="btn-oscuro px-3 py-1 text-sm">
          Compartir
        </button>
      </div>
      <span aria-live="polite" className="sr-only">
        {copiado ? 'URL copiada al portapapeles' : ''}
      </span>
    </div>
  )
}
