/**
 * Service worker de PoliserviciosNOA.
 *
 * Regla de oro: solo se cachea contenido público e inmutable.
 * - `/_next/static/*`: caché primero (esos archivos llevan hash y no cambian).
 * - Imágenes de Cloudinary: caché primero.
 * - Navegaciones públicas: red primero; si no hay red, lo último cacheado.
 * - Panel, admin, login, registro y API: NUNCA pasan por el service worker.
 *   Son datos privados, cambian en cada request y cachearlos rompe la
 *   navegación entre rebuilds.
 */

const VERSION = 'v2'
const CACHE_ESTATICOS = 'poliservicios-estaticos-' + VERSION
const CACHE_IMAGENES = 'poliservicios-imagenes-' + VERSION

/** Rutas que nunca se interceptan ni se cachean. */
function esPrivada(url) {
  const ruta = new URL(url).pathname

  return (
    ruta === '/panel' ||
    ruta.indexOf('/panel/') === 0 ||
    ruta === '/admin' ||
    ruta.indexOf('/admin/') === 0 ||
    ruta === '/login' ||
    ruta === '/registro' ||
    ruta === '/mis-contactos' ||
    ruta.indexOf('/mis-contactos/') === 0 ||
    ruta.indexOf('/invitacion') === 0 ||
    ruta.indexOf('/api/') === 0
  )
}

function esEstatico(url) {
  const recurso = new URL(url)

  return (
    recurso.origin === self.location.origin &&
    recurso.pathname.indexOf('/_next/static/') === 0
  )
}

function esImagen(url) {
  return url.indexOf('res.cloudinary.com') !== -1
}

function respuestaSinConexion() {
  return new Response('Sin conexión. Revisá tu internet y probá de nuevo.', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

self.addEventListener('install', function () {
  self.skipWaiting()
})

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (nombres) {
      return Promise.all(
        nombres
          .filter(function (nombre) {
            return nombre !== CACHE_ESTATICOS && nombre !== CACHE_IMAGENES
          })
          .map(function (nombre) {
            return caches.delete(nombre)
          }),
      )
    }),
  )

  self.clients.claim()
})

self.addEventListener('fetch', function (event) {
  const request = event.request

  // Solo GET. Todo lo demás (POST, server actions) va directo a la red.
  if (request.method !== 'GET') return

  // Privado y API: no se tocan.
  if (esPrivada(request.url)) return

  // Navegaciones: red primero. Si falla, se sirve una copia pública cacheada
  // o un 503 legible. Nunca una promesa rechazada: eso es el "Failed to fetch".
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(function () {
        return caches.match(request).then(function (respuesta) {
          return respuesta || respuestaSinConexion()
        })
      }),
    )
    return
  }

  if (esEstatico(request.url)) {
    event.respondWith(
      caches.match(request).then(function (respuesta) {
        if (respuesta) return respuesta

        return fetch(request).then(function (respuestaRed) {
          if (respuestaRed.ok) {
            const copia = respuestaRed.clone()
            caches
              .open(CACHE_ESTATICOS)
              .then(function (cache) {
                return cache.put(request, copia)
              })
              .catch(function () {
                // Si no se puede guardar, la respuesta igual llega al navegador.
              })
          }

          return respuestaRed
        })
      }).catch(respuestaSinConexion),
    )
    return
  }

  if (esImagen(request.url)) {
    event.respondWith(
      caches.open(CACHE_IMAGENES).then(function (cache) {
        return cache.match(request).then(function (respuesta) {
          if (respuesta) return respuesta

          return fetch(request).then(function (respuestaRed) {
            if (respuestaRed.ok) {
              const copia = respuestaRed.clone()
              cache.put(request, copia).catch(function () {
                // Sin caché para esta imagen: se vuelve a pedir la próxima vez.
              })
            }

            return respuestaRed
          })
        })
      }).catch(respuestaSinConexion),
    )
    return
  }

  // Cualquier otro GET (RSC, datos) sigue su curso normal por la red.
})
