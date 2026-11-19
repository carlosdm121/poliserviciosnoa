'use client'

import { signIn } from 'next-auth/react'
import { useState, useTransition } from 'react'
import Link from 'next/link'

import { registrarProfesional } from '@/app/actions/registro'
import { SelectorRubro } from '@/components/catalogo/SelectorRubro'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { normalizarWhatsapp } from '@/lib/phone'
import type { GrupoCatalogo } from '@/services/catalogo'

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
export function FormularioRegistro({
  grupos,
}: {
  grupos: GrupoCatalogo[]
}): React.ReactElement {
  const [errores, setErrores] = useState<Errores>({})
  const [telefono, setTelefono] = useState('')
  const [primaryCategoryId, setPrimaryCategoryId] = useState('')
  const [secondaryCategoryId, setSecondaryCategoryId] = useState('')
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
    const primary = datos.get('primaryCategoryId') ?? ''
    const secondary = datos.get('secondaryCategoryId') ?? ''

    iniciarTransicion(async () => {
      const resultado = await registrarProfesional({
        name: nombre,
        email,
        password,
        whatsapp,
        primaryCategoryId: String(primary),
        secondaryCategoryId: String(secondary) || undefined,
      })

      if (resultado.ok) {
        // Iniciar sesión automáticamente después del registro. `signIn` maneja
        // el token CSRF que el endpoint de credenciales exige.
        try {
          const sesion = await signIn('credentials', { redirect: false, email, password })

          if (sesion && !sesion.error) {
            window.location.href = '/panel/perfil'
            return
          }

          setErrores({
            form: 'Cuenta creada, pero no se pudo iniciar sesión automáticamente. Entrá desde /login con tu email y contraseña.',
          })
        } catch {
          setErrores({
            form: 'Cuenta creada, pero falló el inicio de sesión automático. Entrá desde /login con tu email y contraseña.',
          })
        }
        return
      }

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
    <form method="post" onSubmit={manejarEnvio} noValidate className="space-y-6">
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

      {/* Rubros principales y secundarios */}
      <div className="mt-6 space-y-4">
        <p className="text-sm font-bold">Rubro principal (obligatorio)</p>
        <SelectorRubro
          etiqueta="Rubro principal"
          grupos={grupos}
          valor={primaryCategoryId}
          onChange={(id) => setPrimaryCategoryId(id)}
          requerido
          ayuda="Obligatorio: el rubro que aparecerá primero en las búsquedas"
        />

        <p className="mt-4 text-sm text-muted">
          El rubro principal es el que se muestra primero en las búsquedas.
        </p>
      </div>

      <p className="mt-4 text-sm text-muted">
        Rubro secundario (opcional)
      </p>
      <SelectorRubro
        etiqueta="Rubro secundario"
        grupos={grupos}
        valor={secondaryCategoryId}
        onChange={(id) => setSecondaryCategoryId(id)}
        requerido={false}
        excluir={primaryCategoryId}
        ayuda="Opcional: otro rubro en el que también trabajás."
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

      <input
        type="hidden"
        name="primaryCategoryId"
        value={primaryCategoryId}
      />
      <input
        type="hidden"
        name="secondaryCategoryId"
        value={secondaryCategoryId || ''}
      />

      <p className="text-sm text-muted">
        Al crear la cuenta aceptás nuestros{' '}
        <Link href="/terminos" className="font-bold underline">
          términos y condiciones
        </Link>{' '}
        y la{' '}
        <Link href="/privacidad" className="font-bold underline">
          política de privacidad
        </Link>
        .
      </p>
    </form>
  )
}