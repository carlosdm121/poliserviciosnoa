/**
 * Lógica pura de la galería.
 *
 * Todo lo que se puede decidir sin base de datos ni red vive acá, separado del
 * proveedor y del servicio. La razón no es prolijidad: es que el chequeo más
 * importante del módulo —que una imagen pertenezca al perfil que la está
 * reclamando— es una comparación de strings, y una comparación de strings se
 * puede testear en mil casos en milisegundos en vez de subir un archivo de
 * verdad cada vez.
 *
 * La regla de oro de este archivo: **nada de lo que llega del navegador se
 * confía**. El `publicId` y la `url` los manda el cliente, y los dos son
 * decisiones del cliente hasta que se verifiquen.
 */

/**
 * Máximo de imágenes por perfil.
 *
 * Vive acá y no en el schema porque el límite se valida en el servicio, dentro
 * de una transacción con bloqueo de fila (ver `decisions.md` D5 y D20), no con
 * un CHECK de Postgres. Un CHECK sin `FOR UPDATE` no es un límite: dos subidas
 * simultáneas leen 9, las dos pasan y quedan 11.
 *
 * Este 20 es el límite vigente. `evaluarPublicacion` solo exige al menos una
 * foto; si el límite cambia, la verificación de galería lo sigue por constante.
 */
export const LIMITE_IMAGENES = 20

/**
 * Formatos aceptados.
 *
 * Solo los tres que pesan poco y que se ven en cualquier teléfono de la zona.
 * Un profesional del interior saca fotos con la cámara del celular y a veces
 * las descarga como HEIC; el archivo se sube igual y Cloudinary lo convierte,
 * pero el selector del navegador tiene que ofrecer algo que todos puedan usar.
 */
export const FORMATOS_PERMITIDOS = ['jpg', 'jpeg', 'png', 'webp'] as const

export type FormatoPermitido = (typeof FORMATOS_PERMITIDOS)[number]

/**
 * Peso máximo por archivo: 5 MB.
 *
 * Sale de la cuenta del lado del cliente, no de lo que soporta el servidor:
 * una foto de 4 MB subida desde un celular con datos móviles tarda lo suficiente
 * como para que el profesional la cancele y no termine. El recorte se hace en
 * el navegador antes de subir (ver `comprimirEnCliente`), y este número es el
 * piso que tiene que cumplir el archivo ya comprimido.
 */
export const BYTES_MAXIMOS = 5 * 1024 * 1024

/**
 * Lado mayor máximo de la imagen entregada.
 *
 * Cloudinary lo aplica en la transformación firmada: una foto de 12 MP de un
 * teléfono de 2024 ocupa 4 MB y se ve igual de bien a 1600 px, que es el
 * tamaño máximo real de pantalla que va a ver alguien buscando un plomero.
 */
export const LADO_MAXIMO = 1600

/**
 * Transformation que se aplica al subir.
 *
 * Va dentro de la firma, no como ajuste del preset: si el cliente pudiera
 * elegirla, podría subir sin transformar y saltarse el recorte y el `q_auto`
 * que son los que hacen que la galería cargue rápido con datos móviles.
 */
export const TRANSFORMACION_SUBIDA = `c_limit,w_${LADO_MAXIMO},q_auto,f_auto`

/** Carpeta de Cloudinary donde vive la galería de un perfil. */
export function carpetaDePerfil(profileId: string): string {
  return `perfiles/${profileId}`
}

/**
 * Si un `publicId` pertenece a la carpeta del perfil.
 *
 * **Esta es la barrera anti-IDOR del módulo.** Sin ella, un usuario puede
 * mandar el `publicId` de una foto de otro perfil y sumar esa foto a su galería:
 * el archivo es público en Cloudinary, así que el ataque no necesita acceso a
 * la cuenta ajena, solo adivinar o leer un identificador.
 *
 * Se compara la carpeta, no el `publicId` entero, porque Cloudinary genera el
 * nombre del archivo: el profesional nunca lo elige. Lo único que el sistema
 * controla es en qué carpeta se subió, y eso es lo que hay que verificar.
 *
 * @param publicId Identificador que dice el cliente, p. ej. `perfiles/abc/x1y2`.
 * @param profileId Perfil que dice ser el dueño.
 */
export function publicIdPerteneceA(publicId: string, profileId: string): boolean {
  const carpetaEsperada = `${carpetaDePerfil(profileId)}/`

  // `startsWith` y no `includes`: un perfil cuyo id es `abc` no puede reclamar
  // `perfiles/abcdef/x`. El corte tiene que incluir la barra.
  return publicId.startsWith(carpetaEsperada) && publicId.length > carpetaEsperada.length
}

/**
 * Detecta el intento de atravesar la carpeta con `..`.
 *
 * Es un caso aparte de `publicIdPerteneceA` porque no alcanza con lo de arriba:
 * `perfiles/abc/../../../perfiles/otro/img` empieza con `perfiles/abc/` y
 * parecería propio. Cloudinary no interpreta rutas, pero el `publicId` se
 * manda a la API para borrar y para consultar, y un valor raro ahí es un
 * request que no tiene por quéarse.
 */
export function publicIdTieneTraversal(publicId: string): boolean {
  return publicId.includes('..') || publicId.startsWith('/') || publicId.includes('//')
}

/**
 * Valida el tipo MIME declarado por el navegador.
 *
 * Va por contenido declarado y no por extensión del nombre, porque la
 * extensión la escribe cualquiera: `foto.jpg` puede ser un ejecutable. La
 * verificación real de que el archivo sea una imagen la hace Cloudinary al
 * procesarlo, y si no puede, la subida falla sola.
 */
export function esFormatoPermitido(tipoMime: string): boolean {
  const normalizado = tipoMime.trim().toLowerCase()

  return (
    normalizado === 'image/jpeg' ||
    normalizado === 'image/png' ||
    normalizado === 'image/webp'
  )
}

/**
 * Deriva la URL de una miniatura.
 *
 * Las miniaturas del panel se piden chicas: la grilla del celular muestra
 * fotos de 160 px de ancho, y pedir la versión de 1600 px para pintar un
 * cuadradito de 160 gasta datos que en el interior no sobran.
 *
 * `c_fill,g_auto` recorta al centro en cuadrado en vez de escalar: una grilla
 * con imágenes de proporciones distintas se ve rota si no se recorta.
 */
export function urlMiniatura(url: string, ancho = 400): string {
  if (!url.includes('/upload/')) return url

  return url.replace('/upload/', `/upload/c_fill,g_auto,w_${ancho},q_auto,f_auto/`)
}

/** Mensaje del límite, en un solo lugar para que UI y servidor digan lo mismo. */
export function mensajeLimiteAlcanzado(): string {
  return `Ya tenés las ${LIMITE_IMAGENES} fotos. Borrá alguna para subir otra.`
}

/**
 * Comprime la imagen en el cliente antes de subir.
 *
 * Las fotos de celular pesan 3-6 MB y la subida directa a Cloudinary desde una
 * conexión móvil se corta antes de terminar (el `xhr.onerror` del XHR dispara
 * "se cortó la conexión"). Redimensionar a 1600 px y comprimir a JPEG baja el
 * archivo a ~300 KB sin pérdida visible en la galería.
 *
 * Es tolerante: si el navegador no puede decodificar la imagen o el JPEG
 * comprimido sale más pesado que el original, devuelve el archivo original y
 * deja que Cloudinary lo rechace con su propio mensaje.
 *
 * @param file Archivo original del input.
 * @param maxWidth Ancho máximo en píxeles.
 * @param calidad Calidad JPEG entre 0 y 1.
 */
export async function comprimirEnCliente(
  file: File,
  maxWidth: number = 800,  // Reducido de 1600 a 800 para archivos más pequeños
  calidad: number = 0.6,  // Reducido de 0.8 a 0.6 para mayor compresión
): Promise<File> {
  const img = new Image()
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  
  const url = URL.createObjectURL(file)
  img.src = url
  
  return new Promise((resolve) => {
    img.onload = () => {
      URL.revokeObjectURL(url)
      
      if (!ctx) {
        // El navegador no pudo decodificar la imagen: dejamos el original
        // para que Cloudinary lo rechace con su propio mensaje.
        resolve(file)
        return
      }
  
      const { width: ancho, height: alto } = img
      const proporcion = ancho / alto
  
      const destinoAncho = arribaMaximo(ancho, maxWidth)
      const destinoAlto = Math.round(destinoAncho / proporcion)
  
      canvas.width = destinoAncho
      canvas.height = destinoAlto
      ctx.drawImage(img, 0, 0, destinoAncho, destinoAlto)
  
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file)
            return
          }
  
          // Un JPG comprimido que pesa más que el original es peor: no se sube.
          if (blob.size >= file.size) {
            resolve(file)
            return
          }
  
          const base = file.name.replace(/\.[^.]*$/, '') || 'foto'
          resolve(new File([blob], `${base}.jpg`, { type: 'image/jpeg' }))
        },
        'image/jpeg',
        calidad,
      )
    }
  
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file)
    }
  })
}

/** `min(ancho, maximo)` redondeado, porque `canvas.width` exige un entero. */
function arribaMaximo(ancho: number, maximo: number): number {
  return Math.round(Math.min(ancho, maximo))
}