'use client'

import { useEffect } from 'react'

/**
 * Avisa al servidor que alguien abrió el perfil.
 *
 * Se dispara recién cuando el componente monta, no en el HTML. Eso deja afuera
 * a los crawlers y a los previews de WhatsApp, que piden el HTML pero no
 * ejecutan React. Además mantiene el número de visitas fuera del render: el
 * visitante nunca ve el contador ni puede deducir cuántas visitas hay.
 *
 * `sendBeacon` se usa cuando existe porque sobrevive a que el visitante cierre
 * la pestaña enseguida; el `fetch` con `keepalive` es el respaldo. No se usa
 * `AbortController` porque cancelar la petición al desmontar (StrictMode en
 * desarrollo) haría que la visita no se registre nunca.
 */
export function ContadorVista({ slug }: { slug: string }): null {
  useEffect(() => {
    const url = `/api/vistas/${encodeURIComponent(slug)}`

    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(url)
      return
    }

    void fetch(url, { method: 'POST', keepalive: true }).catch(() => {
      // Una visita perdida no es un error para el visitante: no hay nada que
      // mostrar ni reintentar en pantalla.
    })
  }, [slug])

  return null
}
