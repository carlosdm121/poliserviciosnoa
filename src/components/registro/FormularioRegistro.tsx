'use client'

import { useState, useTransition } from 'react'

import { registrarProfesional } from '@/app/actions/registro'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { normalizarWhatsapp } from '@/lib/phone'

type Errores = Partial<Record<'name' | 'email' | 'password' | 'whatsapp' | 'form', string>>

/**
 * Formulario de alta de profesional.
 *
 * Valida con Zod en el cliente para dar feedback inmediato, pero delega la
 * validación real al Server Action: el cliente valida para experiencia, el
 * servidor valida por seguridad.
 *
 * El campo de teléfono muestra el valor normalizado mientras se escribe
 * porque el usuario escribe "381 1234567" y no sabe que detrás queda
 * "5493811234567". Ver la transformación en `normalizarWhatsapp`.
 */
export function FormularioRegistro(): React.ReactElement {
  const [errores, setErrores] = useState<Errores>({})
  const [telefono, setTelefono] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [estaProcesando, iniciarTransicion] = useTransition()

  function manejarTelefono(valor: string): void {
    setTelefono(valor)

    // Prevalidación suave: no bloquea, solo muestra cómo va a quedar.
    const normalizado = normalizarWhatsapp(valor)
    setErrores((previas) => ({
      ...previas,
      whatsapp:
        valor.length > 6 && !normalizado
          ? 'Revisá el número: debería tener entre 10 y 13 dígitos.'
          : previas.whatsapp,
    }))
  }

  function manejarEnvio(evento: React.FormEvent<HTMLFormElement>): void {
    evento.preventDefault()
    setErrores({})

    const datos = new FormData(evento.currentTarget)
    const nombre = String(datos.get('name') ?? '')
    const email = String(datos.get('email') ?? '')
    const password = String(datos.get('password') ?? '')
    const whatsapp = String(datos.get('whatsapp') ?? '')

    iniciarTransicion(async () => {
      const resultado = await registrarProfesional({ name: nombre, email, password, whatsapp })

      if (resultado.ok) {
        setEnviado(true)
        return
      }

      // El mensaje del servidor no viene asociado a un campo, así que se
      // muestra arriba. El servidor es la autoridad: si él rechaza, el
      // frontend no debe inventar un motivo distinto.
      setErrores({ form: resultado.error })
    })
  }

  if (enviado) {
    return (
      <div className="space-y-6">
        <div className="exito">
          <p className="font-bold">Ya creaste tu cuenta.</p>
          <p className="mt-2">
            Te mandamos un email para verificarlo. Revisá la bandeja de entrada y el spam: sin
            verificar no podés entrar al panel.
          </p>
        </div>

        <Button variante="linea" onClick={() => setEnviado(false)}>
          Crear otra cuenta
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={manejarEnvio} noValidate className="space-y-6">
      {errores.form && (
        <p role="alert" className="error">
          {errores.form}
        </p>
      )}

      <Input
        label="Cómo te llamás"
        name="name"
        type="text"
        autoComplete="name"
        required
        error={errores.name}
        placeholder="Carlos Ramírez"
      />

      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={errores.email}
        placeholder="tucorreo@email.com"
        ayuda="Te mandamos un enlace acá para confirmar que el email es tuyo."
      />

      <Input
        label="WhatsApp"
        name="whatsapp"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        required
        value={telefono}
        onChange={(e) => manejarTelefono(e.target.value)}
        error={errores.whatsapp}
        placeholder="381 123 4567"
        ayuda={
          telefono && normalizarWhatsapp(telefono)
            ? `Así lo van a ver tus clientes: +${normalizarWhatsapp(telefono)}`
            : 'Con el número con el que atendés, sin 0 ni 15.'
        }
      />

      <Input
        label="Contraseña"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        error={errores.password}
        ayuda="Mínimo 8 caracteres."
      />

      <Button
        type="submit"
        variante="oscuro"
        cargando={estaProcesando}
        textoCargando="Creando cuenta..."
        className="w-full"
      >
        Crear mi cuenta
      </Button>

      <p className="text-sm text-muted">
        Al crear la cuenta aceptás nuestros{' '}
        <a href="/terminos" className="font-bold underline">
          términos y condiciones
        </a>{' '}
        y la{' '}
        <a href="/privacidad" className="font-bold underline">
          política de privacidad
        </a>
        .
      </p>
    </form>
  )
}