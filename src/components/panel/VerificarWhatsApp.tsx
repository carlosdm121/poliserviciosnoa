'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'

import { pedirCodigoWhatsApp, type RespuestaSolicitarCodigo } from '@/app/actions/whatsapp'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { formatearWhatsapp } from '@/lib/phone'

/**
 * Verificación del número de WhatsApp.
 *
 * Tres estados, y son los tres posibles: sin código pedido, con código vigente,
 * y verificado. La cuenta regresiva vive en el cliente, pero la autoridad es el
 * servidor: cada 3 segundos se consulta el estado y es esa respuesta la que
 * decide si se muestra el OK. Confiar en un `setTimeout` del cliente sería
 * mostrar "verificado" sin que nadie haya verificado nada.
 */
export function VerificarWhatsApp({
  numeroActual,
  verificado,
}: {
  numeroActual: string
  verificado: boolean
}): React.ReactElement {
  const [telefono, setTelefono] = useState(numeroActual)
  const [codigo, setCodigo] = useState<RespuestaSolicitarCodigo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [restante, setRestante] = useState<number | null>(null)
  const [pendiente, arrancarTransicion] = useTransition()
  const [consultando, setConsultando] = useState(false)

  const intervalo = useRef<ReturnType<typeof setInterval> | null>(null)

  const detenerIntervalo = useCallback(() => {
    if (intervalo.current) {
      clearInterval(intervalo.current)
      intervalo.current = null
    }
  }, [])

  // Si el componente se desmonta (el profesional cierra la pestaña), el
  // intervalo tiene que morir con él. Un timer vivo sigue golpeando la ruta.
  useEffect(() => detenerIntervalo, [detenerIntervalo])

  /**
   * Consulta el estado al servidor.
   *
   * Se corta sola cuando no queda nada pendiente: seguir consultando después de
   * verificar es tráfico de sobra cada 3 segundos.
   */
  const consultar = useCallback(async () => {
    try {
      const respuesta = await fetch('/api/panel/whatsapp/estado', { cache: 'no-store' })
      if (!respuesta.ok) return

      const estado = (await respuesta.json()) as
        | { status: string; restanteSegundos: number | null }
        | null

      if (!estado) return

      if (estado.status === 'VERIFIED') {
        detenerIntervalo()
        window.location.reload()
        return
      }

      if (estado.status === 'PENDING' && estado.restanteSegundos !== null) {
        setRestante(estado.restanteSegundos)
        return
      }

      // EXPIRED, LOCKED o CANCELED: no queda nada que esperar.
      detenerIntervalo()
      setCodigo(null)
      setRestante(null)
    } catch {
      // Fallo de red. No se corta el polling: puede ser el celular perdiendo
      // señal un segundo y volver al siguiente.
    }
  }, [detenerIntervalo])

  // Cuenta regresiva local. Es solo de visualización: el corte real lo hace el
  // servidor, que es el único que sabe si el código sigue vigente.
  useEffect(() => {
    if (restante === null) return

    if (restante <= 0) {
      setRestante(null)
      setCodigo(null)
      return
    }

    const timer = setTimeout(() => setRestante((valor) => (valor === null ? null : valor - 1)), 1000)

    return () => clearTimeout(timer)
  }, [restante])

  async function pedir(): Promise<void> {
    setError(null)

    const resultado = await pedirCodigoWhatsApp(telefono)

    if (!resultado.ok) {
      setError(resultado.error)
      return
    }

    setCodigo(resultado.data)
    setRestante(
      Math.max(
        0,
        Math.floor((new Date(resultado.data.expiraEnIso).getTime() - Date.now()) / 1000),
      ),
    )

    detenerIntervalo()
    intervalo.current = setInterval(() => {
      setConsultando(true)
      void consultar().finally(() => setConsultando(false))
    }, 3000)
  }

  if (verificado) {
    return (
      <div className="tarjeta p-8">
        <p className="etiqueta">WhatsApp verificado</p>
        <h2 className="mt-4 text-2xl font-black uppercase">Tu número está confirmado</h2>
        <p className="mt-3 leading-relaxed text-muted">
          Estás contactable en{' '}
          <span className="font-bold text-ink">{formatearWhatsapp(numeroActual)}</span>. Los
          clientes que te encuentren van a poder escribirte por ahí.
        </p>
        <p className="mt-6 text-sm text-muted">
          Si cambiaste de número, pedí un código nuevo con el nuevo. Al cambiarlo, el perfil queda
          despublicado hasta que vuelvas a confirmar.
        </p>
      </div>
    )
  }

  return (
    <div className="tarjeta p-8">
      <p className="etiqueta">Paso 1 de 1</p>
      <h2 className="mt-4 text-2xl font-black uppercase">Confirmá tu número de WhatsApp</h2>

      <p className="mt-3 max-w-prose leading-relaxed text-muted">
        Los clientes te van a escribir por este número. Para demostrar que es tuyo te mandamos un
        código y lo tenés que reenviar desde el mismo celular. No pedimos documento ni foto.
      </p>

      <div className="mt-8 space-y-6">
        <Input
          label="Tu número de WhatsApp"
          value={telefono}
          onChange={(evento) => setTelefono(evento.target.value)}
          placeholder="3814123456"
          inputMode="tel"
          autoComplete="tel"
          ayuda="Con o sin el 15. Lo normalizamos nosotros."
          error={error ?? undefined}
        />

        {!codigo && (
          <Button variante="oscuro" onClick={pedir} cargando={pendiente} textoCargando="Generando…">
            Generar código
          </Button>
        )}
      </div>

      {codigo && (
        <div className="mt-8 border-t-[3px] border-ink pt-8">
          <p className="text-sm font-black uppercase tracking-widest">Tu código</p>

          <p className="mt-4 font-mono text-5xl font-black tracking-[0.3em]">{codigo.codigo}</p>

          <ol className="mt-8 max-w-prose space-y-3 leading-relaxed">
            <li>
              <span className="font-bold">1.</span> Tocá el botón verde y mandá el mensaje que ya
              viene escrito.
            </li>
            <li>
              <span className="font-bold">2.</span> Esperá la respuesta en el mismo chat. Tarda unos
              segundos.
            </li>
            <li>
              <span className="font-bold">3.</span> Esta pantalla se actualiza sola cuando el código
              llega.
            </li>
          </ol>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a href={codigo.enlaceWhatsApp} target="_blank" rel="noreferrer noopener" className="btn-whatsapp">
              Enviar por WhatsApp
            </a>

            {restante !== null && (
              <p className="font-mono text-sm text-muted">
                Vence en {restante > 60 ? `${Math.ceil(restante / 60)} min` : `${restante} s`}
                {consultando ? ' · consultando…' : ''}
              </p>
            )}
          </div>

          <p className="mt-6 text-sm text-muted">
            ¿Se venció?{' '}
            <button
              type="button"
              onClick={pedir}
              className="font-bold underline"
              disabled={pendiente}
            >
              Pedí otro código
            </button>
          </p>
        </div>
      )}
    </div>
  )
}