'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useCallback, useRef, useState } from 'react'

import { Button } from '@/components/ui/Button'
import {
  BYTES_MAXIMOS,
  comprimirEnCliente,
  esFormatoPermitido,
  LIMITE_IMAGENES,
  urlMiniatura,
} from '@/lib/imagen'
import { confirmarImagen, guardarOrden, borrarImagen } from '@/app/actions/galeria'
import type { ImagenGaleria } from '@/schemas/galeria'

/**
 * Galería del panel.
 *
 * El flujo de subida pasa por una ruta del propio sitio: el navegador sube el
 * archivo a `/api/panel/galeria/subir` y el servidor hace el salto a Cloudinary.
 * Así el XHR viaja por el mismo origen y no se corta en Android con datos
 * móviles del interior. El servidor igual confirma el `publicId` después.
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

    const comprimido = await comprimirEnCliente(archivo)

    if (comprimido.size > BYTES_MAXIMOS) {
      setError('Esa foto pesa demasiado. Bajala a 5 MB o menos.')
      return
    }

    await subir(comprimido)
  }

  async function subir(archivo: File): Promise<void> {
    setSubiendo({ nombre: archivo.name, progreso: 0, error: null })

    return new Promise((resolve) => {
      const formData = new FormData()
      formData.append('file', archivo)

      const xhr = new XMLHttpRequest()

      xhr.open('POST', '/api/panel/galeria/subir')
      xhr.withCredentials = true
      xhr.timeout = 120000

      xhr.upload.onprogress = (evento) => {
        if (evento.lengthComputable && evento.total > 0) {
          setSubiendo({
            nombre: archivo.name,
            progreso: Math.round((evento.loaded / evento.total) * 100),
            error: null,
          })
        }
      }

      xhr.onload = () => {
        // 401/403 = no autenticado o sin perfil; el mensaje genérico no ayuda.
        if (xhr.status === 401) {
          setSubiendo(null)
          setError('Tu sesión se cerró. Iniciá sesión de nuevo y probá.')
          resolve()
          return
        }

        if (xhr.status === 403) {
          setSubiendo(null)
          setError('No tenés permiso para subir fotos.')
          resolve()
          return
        }

        if (xhr.status === 413) {
          setSubiendo(null)
          setError('La foto pesa demasiado para el servidor. Bajala a menos de 4 MB.')
          resolve()
          return
        }

        if (xhr.status < 200 || xhr.status >= 300) {
          let mensaje = 'No pudimos subir la foto. Probá de nuevo.'

          try {
            const cuerpo = JSON.parse(xhr.responseText) as { error?: string }
            if (cuerpo.error) mensaje = cuerpo.error
          } catch {
            // No es JSON: dejamos el mensaje genérico.
          }

          setError(mensaje)
          setSubiendo(null)
          resolve()
          return
        }

        void (async () => {
          try {
            const respuesta = JSON.parse(xhr.responseText) as { publicId: string; url: string }
            const confirmada = await confirmarImagen({ publicId: respuesta.publicId, url: respuesta.url })

            if (!confirmada.ok) {
              setError(confirmada.error)
              setSubiendo(null)
              resolve()
              return
            }

            setImagenes((previas) => [...previas, confirmada.data])
            setSubiendo(null)
            refrescar()
          } catch (error: unknown) {
            setError(
              error instanceof Error
                ? error.message
                : 'Se cortó la conexión al subir la foto. Probá de nuevo.',
            )
            setSubiendo(null)
          }

          resolve()
        })()
      }

      xhr.ontimeout = () => {
        setSubiendo(null)
        setError('La subida tardo demasiado. Probá de nuevo con una conexión más estable.')
        resolve()
      }

      xhr.onerror = () => {
        setSubiendo(null)
        setError('Se cortó la conexión al subir la foto. Probá de nuevo.')
        resolve()
      }

      xhr.send(formData)
    })
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
 