'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { guardarLosDatosFiscales } from '@/app/actions/suscripcion'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import {
  CONDICIONES_IVA,
  CONDICION_IVA_VALORES,
  datosFiscalesSchema,
  type CondicionIvaValor,
} from '@/schemas/suscripcion'

/**
 * Formulario de datos fiscales.
 *
 * El mismo schema del servidor se usa acá para validar antes de hacer el request.
 * No es unaformalidad de tipos: el error del campo pegado al campo es lo que
 * hace que alguien corrija el CUIT a la primera y no después de tres
 * actualizaciones de pantalla con un mensaje genérico.
 *
 * El `select` de condición de IVA se arma con `CONDICIONES_IVA`, la misma fuente
 * que el validador. Si tuvieran dos, el formulario ofrecería una opción que el
 * servidor rechaza.
 */
export function FormularioDatosFiscales({
  valoresIniciales,
}: {
  valoresIniciales: {
    tipoPersona: string
    nombreORazonSocial: string
    documento: string
    condicionIva: string
    domicilioFiscal: string
  } | null
}): React.ReactElement {
  const router = useRouter()

  const [tipoPersona, setTipoPersona] = useState<'PERSONA_HUMANA' | 'EMPRESA'>(
    valoresIniciales?.tipoPersona === 'EMPRESA' ? 'EMPRESA' : 'PERSONA_HUMANA',
  )
  const [nombre, setNombre] = useState(valoresIniciales?.nombreORazonSocial ?? '')
  const [documento, setDocumento] = useState(valoresIniciales?.documento ?? '')
  const [condicionIva, setCondicionIva] = useState<CondicionIvaValor>(
    (valoresIniciales?.condicionIva as CondicionIvaValor | undefined) ??
      'RESPONSABLE_MONOTRIBUTO',
  )
  const [domicilio, setDomicilio] = useState(valoresIniciales?.domicilioFiscal ?? '')
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [pendiente, arrancarTransicion] = useTransition()

  async function enviar(): Promise<void> {
    setErrorGeneral(null)

    const entrada = {
      tipoPersona,
      nombreORazonSocial: nombre,
      documento,
      condicionIva,
      domicilioFiscal: domicilio,
    }

    const parseado = datosFiscalesSchema.safeParse(entrada)

    if (!parseado.success) {
      const porCampo: Record<string, string> = {}

      for (const issue of parseado.error.issues) {
        const campo = issue.path[0]
        if (typeof campo === 'string' && !porCampo[campo]) porCampo[campo] = issue.message
      }

      setErrores(porCampo)
      return
    }

    setErrores({})

    const resultado = await guardarLosDatosFiscales(entrada)

    if (!resultado.ok) {
      // Un error del servidor que no es de campo (documento duplicado) va al
      // bloque de arriba: marcar el campo equivocado haría que el profesional
      // corrigiera algo que está bien.
      setErrorGeneral(resultado.error)
      return
    }

    router.refresh()
  }

  return (
    <div className="tarjeta p-6">
      <fieldset className="space-y-6">
        <legend className="text-sm font-bold">¿Sos una persona o una empresa?</legend>

        {(['PERSONA_HUMANA', 'EMPRESA'] as const).map((opcion) => (
          <label key={opcion} className="flex cursor-pointer items-center gap-3">
            <input
              type="radio"
              name="tipoPersona"
              value={opcion}
              checked={tipoPersona === opcion}
              onChange={() => setTipoPersona(opcion)}
              className="h-6 w-6 border-[3px] border-ink"
            />
            <span>{opcion === 'PERSONA_HUMANA' ? 'Soy una persona' : 'Soy una empresa'}</span>
          </label>
        ))}
      </fieldset>

      <div className="mt-8 space-y-6">
        <Input
          label={tipoPersona === 'EMPRESA' ? 'Razón social' : 'Nombre y apellido'}
          value={nombre}
          onChange={(evento) => setNombre(evento.target.value)}
          autoComplete="name"
          error={errores.nombreORazonSocial}
        />

        <Input
          label={tipoPersona === 'EMPRESA' ? 'CUIT de la empresa' : 'CUIT o DNI'}
          value={documento}
          onChange={(evento) => setDocumento(evento.target.value)}
          inputMode="numeric"
          ayuda={
            tipoPersona === 'EMPRESA'
              ? '11 dígitos, empezando con 33 o 34. Va como 33-12345678-0.'
              : 'Tu CUIT tiene 11 dígitos (30-12345678-1). Si no lo tenés, DNI de 8.'
          }
          error={errores.documento}
        />

        <label className="block space-y-1">
          <span className="block text-sm font-bold">Condición frente al IVA</span>
          <select
            value={condicionIva}
            onChange={(evento) => setCondicionIva(evento.target.value as CondicionIvaValor)}
            className="campo"
          >
            {CONDICION_IVA_VALORES.map((valor) => (
              <option key={valor} value={valor}>
                {CONDICIONES_IVA[valor]}
              </option>
            ))}
          </select>
        </label>

        <Textarea
          label="Domicilio fiscal"
          value={domicilio}
          onChange={(evento) => setDomicilio(evento.target.value)}
          rows={3}
          ayuda="Calle, número, localidad y provincia. Es el domicilio que figura en tu constancia de inscripción."
          error={errores.domicilioFiscal}
        />
      </div>

      {errorGeneral && (
        <p className="error mt-6" role="alert">
          {errorGeneral}
        </p>
      )}

      <div className="mt-8">
        <Button
          variante="oscuro"
          cargando={pendiente}
          textoCargando="Guardando…"
          onClick={() => arrancarTransicion(() => void enviar())}
        >
          Guardar datos fiscales
        </Button>
      </div>
    </div>
  )
}