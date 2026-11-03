'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useCallback, useRef, useState } from 'react'

import { Button } from '@/components/ui/Button'
import {
  BYTES_MAXIMOS,
  esFormatoPermitido,
  LIMITE_IMAGENES,
  urlMiniatura,
} from '@/lib/imagen'
import { confirmarImagen, guardarOrden, borrarImagen, pedirFirmaSubida } from '@/app/actions/galeria'
import type { ImagenGaleria } from '@/schemas/galeria'

/**
 * Galería del panel.
 *
 * El flujo de subida es directo del navegador a Cloudinary, no a través del
 * servidor: mandar un archivo de 4 MB por la aplicación y volver a bajarlo es
 * el doble de ancho de banda, y en una conexión del interior eso es la
 * diferencia entre subir y abandonar. El servidor igual participa, pero solo
 * para firmar la subida y después para confirmar el `publicId`.
 *
 * Por eso el contador es optimista: la UI muestra el número que Cree que hay,
 * y si el servidor rechaza la undécima vuelve el número real. Un contador que
 * espera la respuesta se siente lento en cada subida.
 */
type Props = {
  imagenesIniciales: ImagenGaleria[]
}

type EstadoSubida = {
  nombre: string
  /** 0 a 100. `null` cuando ya terminó o falló. */
  progreso: number | null
  error: string | null
}

export function Galeria({ imagenesIniciales }: Props): React.ReactElement {
  const router = useRouter()

  const [imagenes, setImagenes] = useState(imagenesIniciales)
  const [subiendo, setSubiendo] = useState<EstadoSubida | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [borrando, setBorrando] = useState<string | null>(null)

  // El id de la foto que se está arrastrando. Va en estado y no en un ref
  // porque el componente tiene que volver a pintar cuando cambia.
  const [arrastrada, setArrastrada] = useState<string | null>(null)
  const [sobre, setSobre] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)

  const quedan = LIMITE_IMAGENES - imagenes.length
  const lleno = imagenes.length >= LIMITE_IMAGENES

  const refrescar = useCallback(() => {
    router.refresh()
  }, [router])

  async function alElegirArchivo(evento: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const archivos = Array.from(evento.target.files ?? [])

    // Se limpia el input para poder volver a elegir el mismo archivo después de
    // borrar una foto: sin esto, elegirlo de nuevo no dispara el `change`.
    evento.target.value = ''

    if (archivos.length === 0) return

    setError(null)

    if (lleno) {
      setError(`Ya tenés las ${LIMITE_IMAGENES} fotos. Borrá alguna para subir otra.`)
      return
    }

    // Solo uno por vez. Subir varios en paralelo parecería más rápido, pero el
    // contador del servidor es el que manda y con dos a la vez la UI muestra
    // "subiendo" dos fotos que en realidad compiten por el mismo lugar.
    const archivo = archivos[0]

    if (!archivo) return

    if (!esFormatoPermitido(archivo.type)) {
      setError('Esa foto no sirve. Subí un JPG, un PNG o un WebP.')
      return
    }

    if (archivo.size > BYTES_MAXIMOS) {
      setError('Esa foto pesa demasiado. Bajala a 5 MB o menos.')
      return
    }

    await subir(archivo)
  }

  async function subir(archivo: File): Promise<void> {
    setSubiendo({ nombre: archivo.name, progreso: 0, error: null })

    try {
      const firma = await pedirFirmaSubida()

      if (!firma.ok) {
        setError(firma.error)
        setSubiendo(null)
        return
      }

      const datos = await subirACloudinary(archivo, firma.data, (progreso) =>
        setSubiendo({ nombre: archivo.name, progreso, error: null }),
      )

      const confirmada = await confirmarImagen({ publicId: datos.publicId, url: datos.url })

      if (!confirmada.ok) {
        // El archivo quedó subido en Cloudinary pero no entró a la galería.
        // No es grave: el plan no factura por archivo y una imagen suelta en
        // una carpeta que nadie ve no le cuesta nada a nadie.
        setError(confirmada.error)
        setSubiendo(null)
        return
      }

      setImagenes((previas) => [...previas, confirmada.data])
      setSubiendo(null)
      refrescar()
    } catch (error: unknown) {
      setSubiendo(null)
      setError(
        error instanceof Error
          ? error.message
          : 'Se cortó la conexión al subir la foto. Probá de nuevo.',
      )
    }
  }

  async function alBorrar(id: string): Promise<void> {
    if (!confirm('¿Borrar esta foto?')) return

    setBorrando(id)
    setError(null)

    const resultado = await borrarImagen(id)

    setBorrando(null)

    if (!resultado.ok) {
      setError(resultado.error)
      return
    }

    setImagenes((previas) => previas.filter((imagen) => imagen.id !== id))
    refrescar()
  }

  async function alSoltar(destino: string): Promise<void> {
    const origen = arrastrada

    setArrastrada(null)
    setSobre(null)

    if (!origen || origen === destino) return

    const ordenActual = imagenes.map((imagen) => imagen.id)
    const desde = ordenActual.indexOf(origen)
    const hasta = ordenActual.indexOf(destino)

    if (desde < 0 || hasta < 0) return

    // Reordena en una copia y solo después guarda. Si el servidor rechaza, la
    // lista local ya quedó como el profesional la dejó y no hay que adivinar
    // cómo volver atrás.
    const nuevoOrden = [...ordenActual]
    nuevoOrden.splice(hasta, 0, ...nuevoOrden.splice(desde, 1))

    const ordenAnterior = [...ordenActual]

    setImagenes(reordenarLocal(imagenes, nuevoOrden))

    const resultado = await guardarOrden({ ids: nuevoOrden })

    if (!resultado.ok) {
      setImagenes(reordenarLocal(imagenes, ordenAnterior))
      setError(resultado.error)
      return
    }

    refrescar()
  }

  /** Devuelve la lista reordenada según un array de ids. */
  function reordenarLocal(lista: ImagenGaleria[], orden: string[]): ImagenGaleria[] {
    const porId = new Map(lista.map((imagen) => [imagen.id, imagen]))

    return orden.flatMap((id) => {
      const imagen = porId.get(id)
      return imagen ? [{ ...imagen, sortOrder: orden.indexOf(id) }] : []
    })
  }

  return (
    <div className='space-y-6'>
      <header className='border-b-[3px] border-ink pb-6'>
        <h1 className='text-title font-black uppercase'>Mis fotos</h1>
        <p className='mt-2 max-w-prose text-lg leading-relaxed'>
          Subí hasta {LIMITE_IMAGENES} fotos de trabajos que hayas hecho vos. La primera es la
          que se ve en las búsquedas, así que poné la mejor.
        </p>
      </header>

      {/*
        Aviso de contenido. No es decoración: las fotos de trabajos son la vía
        más común de reclamo y de expulsión del portal, y un profesional que sube
        la foto de una obra con la marca del cliente al frente termina con la
        foto ocultada.
      */}
      <div className='tarjeta border-l-4 border-l-[12px] p-4'>
        <p className='font-bold uppercase'>Antes de subir</p>
        <ul className='mt-2 list-inside list-disc space-y-1'>
          <li>No subas fotos con el teléfono, documentos o datos de otras personas.</li>
          <li>No subas contenido que no sea tuyo.</li>
          <li>
            Si el trabajo es de un cliente o de un local, tapá los logos y los datos antes de
            subir.
          </li>
        </ul>
      </div>

      {error && <p className='error'>{error}</p>}

      {/* Contador. Va arriba de la grilla porque es el dato que decide si el
          botón de subir tiene sentido. */}
      <div className='flex flex-wrap items-center justify-between gap-4'>
        <p className='text-2xl font-black'>
          {imagenes.length}
          <span className='text-muted'>/{LIMITE_IMAGENES}</span>
        </p>

        <div>
          <input
            ref={inputRef}
            type='file'
            accept='image/jpeg,image/png,image/webp'
            className='hidden'
            onChange={(evento) => {
              void alElegirArchivo(evento)
            }}
          />

          <Button
            variante='oscuro'
            disabled={lleno}
            cargando={subiendo !== null}
            textoCargando='Subiendo...'
            onClick={() => inputRef.current?.click()}
          >
            {lleno ? 'Completaste el máximo' : 'Subir una foto'}
          </Button>
        </div>
      </div>

      {/* La barra es <progress> nativo con la clase que lo saca del aspecto
          gris del navegador. Ver el comentario en globals.css. */}
      {subiendo && (
        <div className='tarjeta space-y-2 p-4'>
          <p className='truncate text-sm font-bold'>{subiendo.nombre}</p>

          <progress className='progreso' value={subiendo.progreso ?? 0} max={100}>
            {subiendo.progreso ?? 0}%
          </progress>

          <p className='text-sm text-muted'>{subiendo.progreso ?? 0}%</p>
        </div>
      )}

      {imagenes.length === 0 && !subiendo && (
        <div className='tarjeta p-8 text-center'>
          <p className='text-lg'>
            Todavía no subiste ninguna foto. Con al menos una, tu perfil ya puede publicarse.
          </p>
        </div>
      )}

      {imagenes.length > 0 && (
        <ul className='grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4'>
          {imagenes.map((imagen, indice) => (
            <li
              key={imagen.id}
              draggable
              onDragStart={() => setArrastrada(imagen.id)}
              onDragOver={(evento) => {
                evento.preventDefault()
                setSobre(imagen.id)
              }}
              onDragLeave={() => setSobre(null)}
              onDrop={(evento) => {
                evento.preventDefault()
                void alSoltar(imagen.id)
              }}
              className={[
                'tarjeta relative',
                arrastrada === imagen.id && 'opacity-40',
                sobre === imagen.id && 'translate-x-[2px] translate-y-[2px]',
              ].join(' ')}
            >
              {/*
                next/image con la URL de la miniatura de Cloudinary, no la
                original: la grilla del celular muestra fotos de 160 px y
                pedir la versión de 1600 gasta datos que en el interior no
                sobran.
              */}
              <Image
                src={urlMiniatura(imagen.url)}
                alt={`Foto ${indice + 1} de tu galería`}
                width={400}
                height={400}
                className='aspect-square h-full w-full object-cover'
                unoptimized
              />

              {indice === 0 && (
                <span className='etiqueta absolute left-2 top-2 bg-paper'>
                  La que se ve primero
                </span>
              )}

              <button
                type='button'
                onClick={() => {
                  void alBorrar(imagen.id)
                }}
                disabled={borrando === imagen.id}
                aria-label={`Borrar la foto ${indice + 1}`}
                className='absolute bottom-2 right-2 min-h-[44px] border-[3px] border-ink bg-paper px-3 font-bold uppercase disabled:opacity-50'
              >
                {borrando === imagen.id ? '...' : 'Borrar'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {quedan > 0 && quedan <= 3 && (
        <p className='text-sm text-muted'>
          Te {quedan === 1 ? 'queda' : 'quedan'} {quedan}{' '}
          {quedan === 1 ? 'lugar' : 'lugares'} más.
        </p>
      )}
    </div>
  )
}

/**
 * Sube el archivo directo a Cloudinary con XMLHttpRequest y no con `fetch`.
 *
 * `fetch` no tiene forma de informar el progreso de subida: o se manda entero o
 * no se manda. En una conexión lenta del interior, sin barra de progreso el
 * profesional ve una pantalla congelada y cancela.
 *
 * `XMLHttpRequest.upload.onprogress` es la única API que da bytes enviados.
 */
function subirACloudinary(
  archivo: File,
  firma: { url: string; apiKey: string; timestamp: number; signature: string; folder: string; allowedFormats: string; transformation: string },
  alProgresar: (porcentaje: number) => void,
): Promise<{ publicId: string; url: string }> {
  return new Promise((resolve, reject) => {
    const formulario = new FormData()

    formulario.append('file', archivo)
    formulario.append('api_key', firma.apiKey)
    formulario.append('timestamp', String(firma.timestamp))
    formulario.append('signature', firma.signature)
    formulario.append('folder', firma.folder)
    formulario.append('allowed_formats', firma.allowedFormats)
    formulario.append('transformation', firma.transformation)

    const xhr = new XMLHttpRequest()

    xhr.open('POST', firma.url)

    xhr.upload.onprogress = (evento) => {
      if (evento.lengthComputable && evento.total > 0) {
        alProgresar(Math.round((evento.loaded / evento.total) * 100))
      }
    }

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        // El cuerpo del error de Cloudinary puede traer el motivo exacto
        // ("File size too large", "Unsupported image format"), que es lo que
        // hay que mostrarle al profesional y no un "algo falló".
        reject(new Error(mensajeDeCloudinary(xhr.responseText, xhr.status)))
        return
      }

      try {
        const datos = JSON.parse(xhr.responseText) as { public_id?: string; secure_url?: string }

        if (!datos.public_id || !datos.secure_url) {
          reject(new Error('La foto se subió pero no pudimos identificarla. Probá de nuevo.'))
          return
        }

        resolve({ publicId: datos.public_id, url: datos.secure_url })
      } catch {
        reject(new Error('No pudimos leer la respuesta de la subida. Probá de nuevo.'))
      }
    }

    xhr.onerror = () => {
      reject(new Error('Se cortó la conexión al subir la foto. Probá de nuevo.'))
    }

    xhr.onabort = () => {
      reject(new Error('Se canceló la subida.'))
    }

    xhr.send(formulario)
  })
}

/** Traduce el error de Cloudinary a algo que un profesional entienda. */
function mensajeDeCloudinary(cuerpo: string, status: number): string {
  if (status === 401 || status === 403) {
    return 'No pudimos autorizar la subida. Recargá la página y probá de nuevo.'
  }

  if (cuerpo.includes('File size too large')) {
    return `Esa foto pesa demasiado. Bajala a ${Math.round(BYTES_MAXIMOS / (1024 * 1024))} MB o menos.`
  }

  if (cuerpo.includes('Unsupported') || cuerpo.includes('format')) {
    return 'Cloudinary no pudo procesar esa foto. Probá con un JPG.'
  }

  return 'No pudimos subir la foto. Probá de nuevo en un momento.'
}