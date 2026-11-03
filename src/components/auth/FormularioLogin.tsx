'use client'

import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

/**
 * Formulario de login.
 *
 * Muestra un solo error genérico para todos los casos. Distinguir entre "ese
 * email no existe" y "la contraseña está mal" convierte el formulario en una
 * herramienta para enumerar qué correos están registrados en la plataforma.
 *
 * El `callbackUrl` viene de la query porque el middleware lo manda cuando
 * corta el acceso: sin eso, un profesional que intentó entrar a /panel cae en
 * la home y no entiende qué pasó.
 */
export function FormularioLogin(): React.ReactElement {
  const parametros = useSearchParams()
  const callbackUrl = parametros.get('callbackUrl') ?? '/panel'

  const [error, setError] = useState<string | null>(null)
  const [estaProcesando, iniciarTransicion] = useTransition()

  function manejarEnvio(evento: React.FormEvent<HTMLFormElement>): void {
    evento.preventDefault()
    setError(null)

    const datos = new FormData(evento.currentTarget)
    const email = String(datos.get('email') ?? '')
    const password = String(datos.get('password') ?? '')

    iniciarTransicion(async () => {
      const resultado = await signIn('credentials', {
        email,
        password,
        callbackUrl,
        redirect: false,
      })

      if (resultado?.error) {
        setError(
          'No pudimos entrar. Revisá tu email y contraseña, y confirmá que tu email esté ' +
            'verificado (revisá la carpeta de spam si no encontrás el enlace).',
        )
        return
      }

      window.location.href = resultado?.url ?? callbackUrl
    })
  }

  return (
    <form onSubmit={manejarEnvio} noValidate className="space-y-6">
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
      />

      <Input
        label="Contraseña"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />

      <Button
        type="submit"
        variante="oscuro"
        cargando={estaProcesando}
        textoCargando="Entrando..."
        className="w-full"
      >
        Entrar
      </Button>

      <div className="space-y-2 border-t-[3px] border-ink pt-6 text-sm">
        <p>
          <a href="/recuperar-contrasena" className="font-bold underline">
            ¿Olvidaste tu contraseña?
          </a>
        </p>
        <p className="text-muted">
          Si no verificaste tu email,{' '}
          <a href="/reenviar-verificacion" className="font-bold underline">
            pedinos que te lo reenviemos
          </a>
          .
        </p>
      </div>
    </form>
  )
}