'use client'

import { useState, useTransition } from 'react'

import { enviarReclamo } from '@/app/actions/cancelaciones'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'

/**
 * Formulario del libro de quejas.
 *
 * Público y sin sesión: exigir login para reclamar deja afuera justamente al
 * que ya no puede entrar. El número de trámite se muestra al final y se manda
 * por email al reclamante.
 *
 * El campo `sitioWeb` está oculto para personas y visible para bots. No es una
 * barrera de seguridad, es un filtro de ruido.
 */
export function FormularioReclamo(): React.ReactElement {
  const [numero, setNumero] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [pendiente, arrancarTransicion] = useTransition()

  async function enviar(evento: React.FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()
    setError(null)
    setErrores({})

    const datos = new FormData(evento.currentTarget)
    const entrada = {
      nombre: String(datos.get('nombre') ?? ''),
      email: String(datos.get('email') ?? ''),
      telefono: String(datos.get('telefono') ?? ''),
      referencia: String(datos.get('referencia') ?? ''),
      mensaje: String(datos.get('mensaje') ?? ''),
      sitioWeb: String(datos.get('sitioWeb') ?? ''),
    }

    const resultado = await enviarReclamo(entrada)

    if (!resultado.ok) {
      setError(resultado.error)
      setErrores(camposDelError(resultado.error))
      return
    }

    setNumero(resultado.data.numero)
  }

  if (numero) {
    return (
      <div className="tarjeta p-6" role="status">
        <p className="font-black uppercase">Reclamo registrado</p>
        <p className="mt-3 leading-relaxed">
          Tu número de trámite es <strong>{numero}</strong>. Te mandamos una copia por email.
        </p>
        <p className="mt-3 leading-relaxed">
          Lo revisamos y te respondemos a la dirección que dejaste. Si el problema es urgente,
          también podés denunciar ante Defensa del Consumidor de Tucumán.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={(evento) => arrancarTransicion(() => void enviar(evento))} className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Input
          label="Nombre y apellido"
          name="nombre"
          required
          autoComplete="name"
          error={errores.nombre}
        />
        <Input
          label="Email"
          name="email"
          type="email"
          required
          autoComplete="email"
          error={errores.email}
        />
        <Input
          label="Teléfono (opcional)"
          name="telefono"
          type="tel"
          autoComplete="tel"
          error={errores.telefono}
        />
        <Input
          label="Perfil, pago o trámite (opcional)"
          name="referencia"
          ayuda="Si sabés a quién o a qué se refiere, ponelo acá."
          error={errores.referencia}
        />
      </div>

      <Textarea
        label="Contanos qué pasó"
        name="mensaje"
        required
        rows={7}
        minLength={20}
        maxLength={4000}
        ayuda="Al menos 20 caracteres. Incluí fechas y números si los tenés."
        error={errores.mensaje}
      />

      {/* Trampa para bots: fuera de pantalla y sin foco. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="sitioWeb">No completar</label>
        <input id="sitioWeb" name="sitioWeb" tabIndex={-1} autoComplete="off" />
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" variante="oscuro" cargando={pendiente} textoCargando="Enviando…">
        Enviar reclamo
      </Button>
    </form>
  )
}

/**
 * El Server Action devuelve un mensaje, no un mapa de campos.
 *
 * Se asigna al campo que corresponde por palabra clave para que el error quede
 * al lado del input y no en una franja arriba del formulario, lejos de donde
 * hay que corregir.
 */
function camposDelError(mensaje: string): Record<string, string> {
  if (/email/i.test(mensaje)) return { email: mensaje }
  if (/nombre/i.test(mensaje)) return { nombre: mensaje }
  if (/reclamo|caracteres/i.test(mensaje)) return { mensaje }

  return {}
}
