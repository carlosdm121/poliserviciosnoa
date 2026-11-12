'use client'

import { useState } from 'react'

import {
  adminCrearEspacioAction,
  type EstadoCreacionEspacio,
} from '@/app/actions/admin/crear-perfil'

type Ciudad = {
  id: string
  nombre: string
  provincia: string
}

type Rubro = {
  id: string
  nombre: string
}

/**
 * Alta de un espacio desde el panel.
 *
 * Es un client component porque necesita filtrar ciudades según la provincia y
 * mostrar la clave temporal una sola vez, sin recargar ni ponerla en la URL.
 */
export function FormularioCrearEspacio({
  ciudades,
  rubros,
}: {
  ciudades: readonly Ciudad[]
  rubros: readonly Rubro[]
}): React.ReactElement {
  const [provincia, setProvincia] = useState('')
  const [estado, setEstado] = useState<EstadoCreacionEspacio | null>(null)
  const [pendiente, setPendiente] = useState(false)
  const [copiado, setCopiado] = useState(false)

  const provincias = Array.from(new Set(ciudades.map((ciudad) => ciudad.provincia))).sort(
    (a, b) => a.localeCompare(b),
  )
  const ciudadesDeProvincia = ciudades.filter((ciudad) => ciudad.provincia === provincia)

  async function enviar(evento: React.FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault()
    setPendiente(true)
    setCopiado(false)

    try {
      setEstado(await adminCrearEspacioAction(new FormData(evento.currentTarget)))
    } catch {
      setEstado({ ok: false, error: 'No pudimos crear el espacio. Probá de nuevo.' })
    } finally {
      setPendiente(false)
    }
  }

  async function copiar(): Promise<void> {
    if (!estado?.ok) return

    const origen = window.location.origin
    const mensaje = `Hola ${estado.nombre}, tu espacio en PoliserviciosNOA ya está creado.

Tu espacio: ${origen}/${estado.slug}
Para editarlo entrá a ${origen}/login con:
Email: ${estado.email}
Clave temporal: ${estado.password}

Cuando entres, cambiá la clave desde "Mi cuenta" y completá fotos y descripción en "Mi espacio".`

    try {
      await navigator.clipboard.writeText(mensaje)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      setCopiado(false)
    }
  }

  return (
    <>
      <form onSubmit={enviar} className="tarjeta mt-6 space-y-6 p-8">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="block text-sm font-black uppercase">Nombre del profesional</span>
            <input
              name="nombre"
              type="text"
              required
              minLength={2}
              className="campo"
              placeholder="Ej. Juan Pérez"
            />
          </label>

          <label className="space-y-2">
            <span className="block text-sm font-black uppercase">Email</span>
            <input
              name="email"
              type="email"
              required
              className="campo"
              placeholder="juan@example.com"
            />
          </label>

          <label className="space-y-2">
            <span className="block text-sm font-black uppercase">Tipo</span>
            <select name="tipo" className="campo" defaultValue="PERSON">
              <option value="PERSON">Persona</option>
              <option value="COMPANY">Empresa</option>
            </select>
          </label>

          <label className="space-y-2">
            <span className="block text-sm font-black uppercase">Provincia</span>
            <select
              value={provincia}
              onChange={(evento) => setProvincia(evento.target.value)}
              className="campo"
            >
              <option value="">Elegí una provincia</option>
              {provincias.map((nombre) => (
                <option key={nombre} value={nombre}>
                  {nombre}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="block text-sm font-black uppercase">Ciudad base</span>
            <select name="ciudadId" required className="campo">
              <option value="">Elegí primero la provincia</option>
              {ciudadesDeProvincia.map((ciudad) => (
                <option key={ciudad.id} value={ciudad.id}>
                  {ciudad.nombre}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="block text-sm font-black uppercase">Rubro principal</span>
            <select name="rubroPrincipalId" required className="campo" defaultValue="">
              <option value="">Elegí un rubro</option>
              {rubros.map((rubro) => (
                <option key={rubro.id} value={rubro.id}>
                  {rubro.nombre}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="block text-sm font-black uppercase">Rubro secundario</span>
            <select name="rubroSecundarioId" className="campo" defaultValue="">
              <option value="">Ninguno</option>
              {rubros.map((rubro) => (
                <option key={rubro.id} value={rubro.id}>
                  {rubro.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>

        {estado && !estado.ok ? (
          <p role="alert" className="border-[3px] border-red-600 p-3 font-bold text-red-700">
            {estado.error}
          </p>
        ) : null}

        <button type="submit" disabled={pendiente} className="btn-oscuro disabled:opacity-50">
          {pendiente ? 'Creando…' : 'Crear espacio'}
        </button>
      </form>

      {estado?.ok ? (
        <section className="tarjeta mt-6 space-y-4 border-green-600 p-8">
          <h2 className="text-xl font-black uppercase tracking-tight">Espacio creado</h2>
          <p className="text-muted">
            Enviá estos datos al profesional. La clave temporal no se vuelve a mostrar.
          </p>

          <dl className="grid gap-3 text-sm">
            <div>
              <dt className="font-black uppercase">Email</dt>
              <dd>{estado.email}</dd>
            </div>
            <div>
              <dt className="font-black uppercase">Clave temporal</dt>
              <dd className="font-mono text-lg font-bold">{estado.password}</dd>
            </div>
            <div>
              <dt className="font-black uppercase">Dirección del espacio</dt>
              <dd>
                <a
                  href={`/${estado.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold underline underline-offset-2"
                >
                  /{estado.slug}
                </a>
              </dd>
            </div>
            <div>
              <dt className="font-black uppercase">Para editar</dt>
              <dd>
                Entrar en{' '}
                <a href="/login" target="_blank" rel="noreferrer" className="font-bold underline underline-offset-2">
                  /login
                </a>{' '}
                y después ir a <strong>Mi espacio</strong>.
              </dd>
            </div>
            <div>
              <dt className="font-black uppercase">Suscripción</dt>
              <dd>
                Pendiente de pago. Acreditala en «Espacios recientes» cuando veas la
                transferencia en el banco.
              </dd>
            </div>
          </dl>

          <button type="button" onClick={copiar} className="btn-oscuro">
            {copiado ? 'Copiado' : 'Copiar mensaje para enviar'}
          </button>
        </section>
      ) : null}
    </>
  )
}
