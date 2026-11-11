'use client'

import { getSession, signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import Link from 'next/link'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

/** El panel de destino depende del rol: `/panel` es solo para profesionales. */
async function destinoPorRol(): Promise<string> {
  const sesion = await getSession()
  const rol = sesion?.user?.role

  if (rol === 'ADMIN' || rol === 'MODERADOR') return '/admin'
  if (rol === 'CLIENT') return '/mis-contactos'
  return '/panel'
}

/**
 * Formulario de login.
 *
 * Usa `signIn` de next-auth: se encarga del token CSRF que el endpoint de
 * credenciales exige. Un POST directo sin ese token es rechazado.
 */
export function FormularioLogin(): React.ReactElement {
  const parametros = useSearchParams()
  const callbackUrl = parametros.get('callbackUrl')
  const emailDesdeRegistro = parametros.get('email') ?? ''
  const registroOk = parametros.get('registro') === 'ok'

  const [error, setError] = useState<string | null>(null)
  const [estaProcesando, iniciarTransicion] = useTransition()

  async function manejarEnvio(evento: React.FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()
    setError(null)

    const datos = new FormData(evento.currentTarget)
    const email = String(datos.get('email') ?? '')
    const password = String(datos.get('password') ?? '')

    iniciarTransicion(async () => {
      try {
        const resultado = await signIn('credentials', {
          redirect: false,
          email,
          password,
          ...(callbackUrl ? { callbackUrl } : {}),
        })

        if (!resultado || resultado.error) {
          setError(
            resultado?.status === 429
              ? 'Demasiados intentos. Esperá unos minutos y probá de nuevo.'
              : 'No pudimos entrar. Revisá tu email y contraseña.',
          )
          return
        }

        // `resultado.url` ya pasó por la validación de NextAuth. No se usa el
        // callbackUrl crudo del query, que permitiría un redirect externo.
        window.location.href = callbackUrl
          ? (resultado.url ?? '/panel')
          : await destinoPorRol()
      } catch {
        setError('No pudimos conectar con el servidor. Probá de nuevo.')
      }
    })
  }

  return (
    <form method="post" onSubmit={manejarEnvio} noValidate className="space-y-6">
      {registroOk && (
        <p role="status" className="exito">
          Cuenta creada. Ya podés entrar con tu contraseña.
        </p>
      )}
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
        defaultValue={emailDesdeRegistro}
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
          <Link href="/recuperar-contrasena" className="font-bold underline">
            ¿Olvidaste tu contraseña?
          </Link>
        </p>
        <p className="text-muted">
          Si no verificaste tu email,{' '}
          <Link href="/reenviar-verificacion" className="font-bold underline">
            pedinos que te lo reenviemos
          </Link>
          .
        </p>
      </div>
    </form>
  )
}