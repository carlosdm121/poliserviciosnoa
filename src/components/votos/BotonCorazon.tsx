'use client'

import { Heart } from 'lucide-react'
import { useState, useTransition } from 'react'

import { votar } from '@/app/actions/votos'
import { cn } from '@/lib/cn'
import type { MotivoNoVotable } from '@/services/votos'

type Props = {
  profileId: string
  corazones: number
  votado: boolean
  puedeVotar: boolean
  motivo: MotivoNoVotable | null
  horasRestantes: number | null
}

/** Texto que explica por qué el corazón está bloqueado. */
function explicacion(motivo: MotivoNoVotable | null, horasRestantes: number | null): string {
  switch (motivo) {
    case 'SIN_SESION':
      return 'Ingresá como cliente para valorar.'
    case 'NO_ES_CLIENTE':
      return 'Solo las cuentas de cliente pueden valorar.'
    case 'ES_TU_PERFIL':
      return 'No podés valorar tu propio perfil.'
    case 'SIN_CONTACTO':
      return 'Valorá a este profesional después de contactarlo por WhatsApp.'
    case 'CONTACTO_RECIENTE':
      return horasRestantes
        ? `Podés valorar en ${horasRestantes} ${horasRestantes === 1 ? 'hora' : 'horas'}.`
        : 'Todavía no pasó el tiempo mínimo desde el contacto.'
    case 'PERFIL_NO_DISPONIBLE':
      return 'Este perfil no está disponible.'
    default:
      return 'Valorar a este profesional.'
  }
}

/**
 * Corazón de confianza.
 *
 * Si puede votar, actualiza de forma optimista y revierte si el servidor
 * falla. Si no puede, el botón sigue siendo clickeable a propósito: en el
 * celular no hay hover, así que un `title` solo no explica nada.
 */
export function BotonCorazon({
  profileId,
  corazones,
  votado: votadoInicial,
  puedeVotar,
  motivo,
  horasRestantes,
}: Props): React.ReactElement {
  const [votado, setVotado] = useState(votadoInicial)
  const [conteo, setConteo] = useState(corazones)
  const [error, setError] = useState<string | null>(null)
  const [procesando, iniciarTransicion] = useTransition()

  const texto = explicacion(motivo, horasRestantes)

  function alternar(): void {
    if (!puedeVotar) {
      setError(texto)
      return
    }

    setError(null)

    const anteriorVotado = votado
    const anteriorConteo = conteo

    setVotado(!anteriorVotado)
    setConteo(Math.max(0, anteriorConteo + (anteriorVotado ? -1 : 1)))

    iniciarTransicion(async () => {
      const resultado = await votar(profileId)

      if (!resultado.ok) {
        setVotado(anteriorVotado)
        setConteo(anteriorConteo)
        setError(resultado.error)
        return
      }

      setVotado(resultado.data.votado)
      setConteo(resultado.data.corazones)
    })
  }

  return (
    <div className="flex flex-col items-stretch gap-1">
      <button
        type="button"
        onClick={alternar}
        disabled={procesando}
        aria-pressed={votado}
        aria-label={`${votado ? 'Quitar voto' : 'Valorar'}: ${conteo} ${conteo === 1 ? 'corazón' : 'corazones'}`}
        title={texto}
        className={cn(
          'inline-flex min-h-[44px] items-center justify-center gap-2 border-[3px] border-ink px-3 font-black',
          puedeVotar ? 'hover:bg-ink hover:text-paper' : 'cursor-help text-muted',
          procesando && 'opacity-60',
        )}
      >
        <Heart
          aria-hidden
          className="h-5 w-5"
          fill={votado ? 'currentColor' : 'none'}
          strokeWidth={votado ? 2.5 : 2}
        />
        <span aria-hidden>{conteo}</span>
      </button>

      {error && (
        <p role="status" className="max-w-[240px] text-xs font-bold leading-tight">
          {error}
        </p>
      )}
    </div>
  )
}
