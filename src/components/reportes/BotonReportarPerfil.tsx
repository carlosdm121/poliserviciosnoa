'use client'

import { useState } from 'react'

type Props = {
  slug: string
}

/**
 * Botón "Reportar perfil" para visitantes anónimos.
 *
 * Abre un diálogo con motivo y comentario opcional, y POSTea a
 * `/api/reportes/[slug]`. No requiere sesión: el visitante se identifica por
 * su IP hasheada en el servidor.
 */
export function BotonReportarPerfil({ slug }: Props): React.ReactElement {
  const [abierto, setAbierto] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<{
    ok: boolean
    mensaje: string
  } | null>(null)

  const motivos = [
    { valor: 'DUDOSO', texto: 'Perfil dudoso' },
    { valor: 'DATO_FALSO', texto: 'Dato falso' },
    { valor: 'CONTENIDO_INADECUADO', texto: 'Contenido inadecuado' },
    { valor: 'ESTAFO', texto: 'Estafa' },
    { valor: 'OTRO', texto: 'Otro motivo' },
  ] as const

  async function enviar(form: HTMLFormElement): Promise<void> {
    setEnviando(true)

    const formData = new FormData(form)
    const motivo = formData.get('motivo') as string
    const detalle = formData.get('detalle') as string

    const respuesta = await fetch(`/api/reportes/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motivo, detalle }),
    })

    const json = await respuesta.json().catch(() => ({}))

    setResultado({
      ok: respuesta.ok,
      mensaje: json.ok
        ? 'Gracias. Tu reporte fue registrado.'
        : json.error ?? 'No se pudo enviar el reporte.',
    })

    setEnviando(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="min-h-[44px] border-[3px] border-ink px-3 text-sm font-bold text-muted hover:bg-ink hover:text-paper"
      >
        Reportar perfil
      </button>

      {abierto && (
        <dialog
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAbierto(false)
          }}
        >
          <div className="bg-paper border-[3px] border-ink p-6 w-full max-w-md shadow-lg">
            <h2 className="font-black uppercase text-lg mb-4">
              Reportar perfil
            </h2>
            <p className="text-sm text-muted mb-4">
              Tu reporte es anónimo y ayuda a mantener la plataforma segura.
              No se revelan tus datos al profesional.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault()
                enviar(e.currentTarget)
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-xs font-bold uppercase mb-1">
                  Motivo
                </label>
                <select
                  name="motivo"
                  required
                  className="w-full min-h-[44px] border-[3px] border-ink px-2 font-black bg-paper"
                >
                  {motivos.map((m) => (
                    <option key={m.valor} value={m.valor}>
                      {m.texto}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase mb-1">
                  Comentario (opcional)
                </label>
                <textarea
                  name="detalle"
                  rows={3}
                  className="w-full min-h-[44px] border-[3px] border-ink px-2 font-black bg-paper"
                />
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setResultado(null)
                    setAbierto(false)
                  }}
                  className="flex-1 min-h-[44px] border-[3px] border-ink px-3 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={enviando}
                  className="flex-1 min-h-[44px] bg-ink text-paper border-[3px] border-ink px-3 font-bold disabled:opacity-50"
                >
                  Enviar reporte
                </button>
              </div>
            </form>

            {resultado && (
              <p
                key="resultado"
                className={`mt-4 text-sm font-bold ${resultado.ok ? 'text-green-700' : 'text-ink'}`}
              >
                {resultado.mensaje}
              </p>
            )}
          </div>
        </dialog>
      )}
    </>
  )
}
