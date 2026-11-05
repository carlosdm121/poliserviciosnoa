'use client'

import { useEffect } from 'react'

/**
 * Registra el service worker solo en producción.
 *
 * En desarrollo el SW cachea HTML y chunks de Next.js y rompe la navegación
 * entre rebuilds (el error "Failed to fetch" al abrir el panel). Si ya quedó
 * uno registrado de una sesión anterior, acá se desregistra y se limpian sus
 * cachés para que el navegador vuelva a pedir todo a la red.
 */
export function ServiceWorkerRegister(): React.ReactElement | null {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return

    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker
        .getRegistrations()
        .then((registros) => Promise.all(registros.map((registro) => registro.unregister())))
        .catch(function () {
          // Sin permiso para desregistrar: la app sigue funcionando.
        })

      if (typeof caches !== 'undefined') {
        caches
          .keys()
          .then((claves) => Promise.all(claves.map((clave) => caches.delete(clave))))
          .catch(function () {
            // Caché no disponible: no es un error fatal.
          })
      }

      return
    }

    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {
      // Fallo silencioso: la app sigue funcionando sin caché offline.
    })
  }, [])

  return null
}
