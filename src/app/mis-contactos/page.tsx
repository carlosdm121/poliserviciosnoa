import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import { BotonCorazon } from '@/components/votos/BotonCorazon'
import { FormularioReclamoCliente } from '@/components/reportes/FormularioReclamoCliente'
import { authOptions } from '@/lib/auth'
import { PROVINCIAS } from '@/lib/constantes'
import { env } from '@/lib/env'
import { formatearFechaLarga } from '@/lib/fechas'
import { listarContactos } from '@/services/votos'

export const metadata: Metadata = {
  title: 'Mis contactos y votos',
  robots: { index: false, follow: false },
}

/** Página autenticada: nunca se cachea. */
export const dynamic = 'force-dynamic'

/**
 * Lista de profesionales contactados.
 *
 * Solo CLIENT. El middleware ya corta el acceso, pero se vuelve a verificar
 * contra la sesión del servidor: el token puede tener un rol viejo.
 */
export default async function MisContactosPage(): Promise<React.ReactElement> {
  const session = await getServerSession(authOptions)

  if (!session?.user.id || session.user.role !== 'CLIENT') {
    redirect('/no-autorizado')
  }

  const contactos = await listarContactos({ clientId: session.user.id })
  const horasMinimas = env.vote.minHoursAfterContact
  const unidad = horasMinimas === 1 ? 'hora' : 'horas'

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <header className="border-b-[3px] border-ink pb-6">
        <p className="text-sm font-black uppercase tracking-widest">Tu actividad</p>
        <h1 className="mt-1 text-title font-black uppercase">Mis contactos y votos</h1>
        <p className="mt-4 max-w-2xl text-lg">
          Acá están los profesionales a los que escribiste. Podés valorarlos después de{' '}
          <strong>
            {horasMinimas} {unidad}
          </strong>{' '}
          del contacto: un voto vale más cuando hubo un trabajo real detrás.
        </p>
      </header>

      {contactos.length === 0 ? (
        <div className="mt-10 border-[3px] border-ink p-8 text-center">
          <p className="text-xl font-black uppercase">Todavía no contactaste a nadie</p>
          <p className="mx-auto mt-3 max-w-md">
            Buscá el servicio que necesitás y escribile por WhatsApp. Después vas a poder
            valorarlo desde acá.
          </p>
          <Link href="/buscar" className="btn-oscuro mt-6">
            Buscar profesionales
          </Link>
        </div>
      ) : (
        <ul className="mt-8 divide-y-[3px] divide-ink border-y-[3px] border-ink">
          {contactos.map((contacto) => (
            <li
              key={contacto.profileId}
              className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center"
            >
              {contacto.imagenUrl ? (
                <Image
                  src={contacto.imagenUrl}
                  alt=""
                  width={88}
                  height={88}
                  className="h-[88px] w-[88px] shrink-0 border-[3px] border-ink object-cover"
                />
              ) : (
                <div
                  aria-hidden
                  className="flex h-[88px] w-[88px] shrink-0 items-center justify-center border-[3px] border-ink bg-ink text-3xl font-black uppercase text-paper"
                >
                  {contacto.nombre.slice(0, 1)}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="text-lg font-black uppercase leading-tight">{contacto.nombre}</p>

                <p className="mt-1 text-sm">
                  {[contacto.rubro, contacto.ciudad, contacto.provincia ? PROVINCIAS[contacto.provincia].nombre : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>

                <p className="mt-1 text-xs text-muted">
                  Contactado el {formatearFechaLarga(contacto.contactadoEn)}
                  {!contacto.publicado && ' · Perfil no disponible'}
                </p>
              </div>

              <div className="flex shrink-0 items-start gap-3">
                <BotonCorazon
                  profileId={contacto.profileId}
                  corazones={contacto.corazones}
                  votado={contacto.votado}
                  puedeVotar={contacto.puedeVotar}
                  motivo={contacto.motivo}
                  horasRestantes={contacto.horasRestantes}
                />

                <FormularioReclamoCliente
                  profileId={contacto.profileId}
                  nombreProfesional={contacto.nombre}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
