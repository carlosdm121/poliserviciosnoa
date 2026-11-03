'use client'

import { useEffect } from 'react'

/**
 * Registra el service worker de PoliserviciosNOA en el cliente.
 *
 * Solo corre en el navegador: comprueba que `navigator.serviceWorker`
 * exista antes de registrar, para no romper el render en el servidor ni en
 * entornos sin soporte para service workers.
 */
export function ServiceWorkerRegister(): React.ReactElement | null {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.serviceWorker) return

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then(function () {
        // Registrado correctamente.
      })
      .catch(function () {
        // Fallo silencioso: la app sigue funcionando sin caché offline.
      })
  }, [])

  return null
}
