'use client'

import { useState } from 'react'

import { crearReclamoAction } from '@/app/actions/reclamo'
import { MOTIVOS_RECLAMO } from '@/lib/reclamo'

type Props = {
  profileId: string
  nombreProfesional: string
}

/**
 * Formulario de reclamo de un cliente contra un profesional.
 *
 * Solo clientes con contacto previo pueden reclamar (validado en el servidor).
 * Hasta 1 reclamo por cliente y perfil cada 30 días.
 */
export function FormularioReclamoCliente({
  profileId,
  nombreProfesional,
}: Props): React.ReactElement {
  const [abierto, setAbierto] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null)

  const motivos = [
    { valor: 'NO_SE_PRESENTO', texto: 'No se presentó al servicio' },
    { valor: 'MALA_CALIDAD', texto: 'Mala calidad del servicio' },
    { valor: 'COBRO_EXCESIVO', texto: 'Cobro excesivo' },
    { valor: 'TRATO_INADECUADO', texto: 'Trato inadecuado' },
    { valor: 'FRAUDE', texto: 'Fraude' },
    { valor: 'OTRO', texto: 'Otro motivo' },
  ] as const

  async function enviar(form: HTMLFormElement): Promise<void> {
    setEnviando(true)

    const formData = new FormData(form)
    const motivo = formData.get('motivo') as string
    const descripcion = formData.get('descripcion') as string

    const respuesta = await crearReclamoAction({
      profileId,
      motivo,
      descripcion,
      evidencias: [],
    })

    setResultado({
      ok: respuesta.ok,
      mensaje: respuesta.ok
        ? `Reclamo registrado. Trámite: ${(respuesta as any).data?.tramiteNumber}`
        : respuesta.error,
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
        Reportar un problema
      </button>

      {abierto && (
        <dialog
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAbierto(false)
          }}
        >
          <div className="bg-paper border-[3px] border-ink p-6 w-full max-w-md shadow-lg">
            <h2 className="font-black uppercase text-lg mb-4">Reportar un problema</h2>
            <p className="text-sm text-muted mb-4">
              Estás reclamando a <strong>{nombreProfesional}</strong>. Solo podés reclamar a
              profesionales a los que ya contactaste por WhatsApp, y un reclamo por profesional
              cada 30 días.
            </p>

            <form onSubmit={(e) => { e.preventDefault(); enviar(e.currentTarget) }} className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase mb-1">Motivo</label>
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
                <label className="block text-xs font-bold uppercase mb-1">¿Qué pasó?</label>
                <textarea
                  name="descripcion"
                  required
                  minLength={1}
                  maxLength={1000}
                  rows={4}
                  className="w-full min-h-[44px] border-[3px] border-ink px-2 font-black bg-paper"
                  placeholder="Contanos qué pasó con el servicio."
                />
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => { setResultado(null); setAbierto(false) }}
                  className="flex-1 min-h-[44px] border-[3px] border-ink px-3 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={enviando}
                  className="flex-1 min-h-[44px] bg-ink text-paper border-[3px] border-ink px-3 font-bold disabled:opacity-50"
                >
                  Presentar reclamo
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
