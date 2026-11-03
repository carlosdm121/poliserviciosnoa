/**
 * Service worker de PoliserviciosNOA.
 *
 * Estrategias de caché:
 * - Estáticos (_next/*): caché primero, caducan en 7 días.
 * - Imágenes de Cloudinary: caché primero, caducan en 30 días.
 * - Búsqueda pública (/buscar*): red primero, guarda en caché como respaldo (1 h).
 * - Pagos, sesiones y verificación de WhatsApp (/api/*): NUNCA se cachean.
 * - Todo lo demás: red primero.
 */

const CACHE_ESTATICOS = 'poliservicios-estaticos-v1'
const CACHE_IMAGENES = 'poliservicios-imagenes-v1'
const CACHE_BUSCADOR = 'poliservicios-buscador-v1'

const URLS_ESTATICAS = ['/', '/manifest.json', '/icon-192.svg', '/icon-512.svg']

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_ESTATICOS).then(function (cache) {
      return cache.addAll(URLS_ESTATICAS)
    }),
  )
  self.skipWaiting()
})

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (nombres) {
      return Promise.all(
        nombres
          .filter(function (nombre) {
            return (
              nombre !== CACHE_ESTATICOS &&
              nombre !== CACHE_IMAGENES &&
              nombre !== CACHE_BUSCADOR
            )
          })
          .map(function (nombre) {
            return caches.delete(nombre)
          }),
      )
    }),
  )
  self.clients.claim()
})

function estaCacheado(url) {
  return (
    url.indexOf(self.location.origin + '/_next/') === 0 ||
    URLS_ESTATICAS.indexOf(url) !== -1
  )
}

function esImagen(url) {
  return url.indexOf('res.cloudinary.com') !== -1
}

function esBuscador(url) {
  return url.indexOf('/buscar') !== -1
}

function esSensible(url) {
  // Pagos, sesiones, contacto, verificación de WhatsApp: nunca se cachean.
  return (
    url.indexOf('/api/webhooks') !== -1 || url.indexOf('/api/contacto') !== -1
  )
}

self.addEventListener('fetch', function (event) {
  var request = event.request
  var url = request.url

  // Solo peticiones GET y del mismo origen (o Cloudinary para imágenes).
  if (request.method !== 'GET') return
  if (
    url.indexOf(self.location.origin) !== 0 &&
    !esImagen(url)
  ) {
    return
  }

  if (esSensible(url)) {
    event.respondWith(fetch(request))
    return
  }

  if (esImagen(url)) {
    event.respondWith(
      caches.open(CACHE_IMAGENES).then(function (cache) {
        return cache.match(request).then(function (respuesta) {
          var fetchPromesa = fetch(request).then(function (respuestaRed) {
            cache.put(request, respuestaRed.clone())
            return respuestaRed
          })
          return respuesta || fetchPromesa
        })
      }),
    )
    return
  }

  if (esBuscador(url)) {
    event.respondWith(
      caches.open(CACHE_BUSCADOR).then(function (cache) {
        return cache.match(request).then(function (respuesta) {
          var fetchPromesa = fetch(request).then(function (respuestaRed) {
            if (respuestaRed.ok) {
              cache.put(request, respuestaRed.clone())
            }
            return respuestaRed
          })
          return respuesta || fetchPromesa
        })
      }),
    )
    return
  }

  // Estáticos y resto: caché primero.
  event.respondWith(
    caches.match(request).then(function (respuesta) {
      if (respuesta) return respuesta
      return fetch(request)
    }),
  )
})
