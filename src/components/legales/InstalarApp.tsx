'use client'

import { useEffect, useRef, useState } from 'react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

/**
 * Aviso discreto de "Instalar la app".
 *
 * No es invasivo: se muestra una sola vez (se recuerda en localStorage) y
 * desaparece al hacer clic. Solo se instala si el navegador lo soporta
 * (`beforeinstallprompt`) y la app aún no está instalada (`display-mode`).
 */
export function InstalarApp(): React.ReactElement | null {
  const [mostrar, setMostrar] = useState(false)
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    // Ya instalada o ya se mostró antes: no hacer nada.
    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      localStorage.getItem('poliserviciosnoa:instalar-app-oculto') === '1'
    ) {
      return
    }

    const handler = ((event: Event) => {
      const e = event as BeforeInstallPromptEvent
      e.preventDefault()
      promptRef.current = e
      setMostrar(true)
    }) as EventListener

    window.addEventListener('beforeinstallprompt' as any, handler)
    return () => window.removeEventListener('beforeinstallprompt' as any, handler)
  }, [])

  if (!mostrar || !promptRef.current) return null

  const instalar = async () => {
    const evento = promptRef.current
    if (!evento) return
    await evento.prompt()
    const resultado = await evento.userChoice
    if (resultado.outcome === 'accepted') {
      localStorage.setItem('poliserviciosnoa:instalar-app-oculto', '1')
    }
    setMostrar(false)
  }

  const ocultar = () => {
    localStorage.setItem('poliserviciosnoa:instalar-app-oculto', '1')
    setMostrar(false)
  }

  return (
    <div
      className="fixed inset-x-0 bottom-4 z-20 flex items-center justify-center pointer-events-none"
      aria-label="Instalar PoliserviciosNOA como app"
    >
      <div className="pointer-events-auto tarjeta p-4 shadow-[0_8px_24px_rgba(0,0,0,0.25)] animate-[fade-in_0.3s_ease-out]">
        <p className="text-sm font-bold leading-relaxed">
          ¿Instalás PoliserviciosNOA como app? Se abre más rápido y sin barra de navegador.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={instalar}
            className="btn-oscuro px-4 py-2 text-sm"
          >
            Instalar
          </button>
          <button onClick={ocultar} className="text-xs underline decoration-1 underline-offset-2 hover:opacity-60">
            No, gracias
          </button>
        </div>
      </div>
    </div>
  )
}
