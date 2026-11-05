'use client'

import { useCallback, useState, useEffect } from 'react'

import { editarEspacioPersonalizacion } from '@/app/actions/personalizacion'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { obtenerPersonalizacionPublica } from '@/services/personalizacion'

type ColorCampo = 'primary' | 'secondary' | 'background' | 'text'

export default function EditarEspacio(): React.ReactElement {
  const [datos, setDatos] = useState<{
    logoUrl: string | null
    bannerUrl: string | null
    pageColors: Record<string, string>
  }>({ logoUrl: null, bannerUrl: null, pageColors: {} })
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    const respuesta = await fetch('/api/panel/espacio/personalizacion', {
      cache: 'no-store',
    })
    if (!respuesta.ok) return
    const json = await respuesta.json()
    setDatos({
      logoUrl: json.logoUrl ?? null,
      bannerUrl: json.bannerUrl ?? null,
      pageColors: (json.pageColors as Record<string, string>) ?? {},
    })
  }

  async function guardar() {
    setError(null)
    setOk(null)
    setCargando(true)

    const resultado = await editarEspacioPersonalizacion({
      logoUrl: datos.logoUrl || undefined,
      bannerUrl: datos.bannerUrl || undefined,
      pageColors: datos.pageColors || undefined,
    })

    setCargando(false)

    if (resultado.ok) {
      setOk('Cambios guardados.')
    } else {
      setError(resultado.error)
    }
  }

  const COLOR_CAMPOS: ColorCampo[] = ['primary', 'secondary', 'background', 'text']
  const ETIQUETAS: Record<ColorCampo, string> = {
    primary: 'Color principal',
    secondary: 'Color secundario',
    background: 'Fondo',
    text: 'Texto',
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="border-b-[3px] border-ink pb-6">
        <h1 className="text-title font-black uppercase">Tu espacio</h1>
        <p className="mt-2 text-lg leading-relaxed">
          Personalizá cómo se ve tu página pública para los clientes.
        </p>
      </header>

      {error && (
        <div className="mb-6 p-4 border border-red-600 bg-red-50 text-red-800 rounded">
          {error}
        </div>
      )}
      {ok && (
        <div className="mb-6 p-4 border border-green-600 bg-green-50 text-green-800 rounded">
          {ok}
        </div>
      )}

      <form onClick={() => guardar()} className="tarjeta p-8 space-y-8" style={{ cursor: 'pointer' }}>
        <div className="space-y-4">
          <label className="block text-sm font-black uppercase">Logo</label>
          <Input
            label="URL del logo"
            value={datos.logoUrl ?? ''}
            onChange={(e) => setDatos({ ...datos, logoUrl: e.target.value || null })}
            placeholder="https://cloudinary.com/tu-logo.png"
            ayuda="URL de tu logo en Cloudinary u otro hosting."
          />
        </div>

        <div className="space-y-4">
          <label className="block text-sm font-black uppercase">Banner</label>
          <Input
            label="URL del banner"
            value={datos.bannerUrl ?? ''}
            onChange={(e) => setDatos({ ...datos, bannerUrl: e.target.value || null })}
            placeholder="https://cloudinary.com/tu-banner.png"
            ayuda="URL del banner que se muestra arriba de tu nombre."
          />
        </div>

        <div className="space-y-4">
          <label className="block text-sm font-black uppercase">Colores de la página</label>
          <div className="grid gap-4 md:grid-cols-2">
            {COLOR_CAMPOS.map((campo) => (
              <div key={campo} className="space-y-2">
                <label className="block text-sm font-black uppercase">{ETIQUETAS[campo]}</label>
                <Input
                  label={ETIQUETAS[campo]}
                  value={datos.pageColors[campo] ?? ''}
                  onChange={(e) => {
                    const valor = e.target.value || null
                    setDatos({
                      ...datos,
                      pageColors: {
                        ...datos.pageColors,
                        [campo]: valor ?? '',
                      },
                    })
                  }}
                  placeholder="#0A0A0A"
                  ayuda="Código hexadecimal, ej. #0A0A0A"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 flex gap-4">
          <Button
            variante="oscuro"
            cargando={cargando}
            textoCargando="Guardando…"
            onClick={(e) => {
              e.preventDefault()
              guardar()
            }}
          >
            Guardar cambios
          </Button>
        </div>
      </form>
    </div>
  )
}
