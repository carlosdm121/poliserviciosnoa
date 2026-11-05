import type { Province } from '@prisma/client'
import type { Metadata } from 'next'

import { FormularioAcreditarPago } from '@/components/admin/FormularioAcreditarPago'
import { FormularioCrearEspacio } from '@/components/admin/FormularioCrearEspacio'
import { exigirAccesoPagina } from '@/lib/admin-auth'
import { PROVINCIAS } from '@/lib/constantes'
import { formatArs } from '@/lib/dinero'
import { prisma } from '@/lib/prisma'
import { obtenerCatalogoPerfil } from '@/services/catalogo'

export const metadata: Metadata = {
  title: 'Crear espacio',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

const ESTADOS: Record<string, string> = {
  PENDING: 'Pendiente de pago',
  ACTIVE: 'Activa',
  PAST_DUE: 'En atraso',
  CANCELLED: 'Cancelada',
  EXPIRED: 'Vencida',
}

function fechaCorta(valor: Date | null): string {
  if (!valor) return '-'

  const dia = String(valor.getDate()).padStart(2, '0')
  const mes = String(valor.getMonth() + 1).padStart(2, '0')

  return `${dia}/${mes}/${valor.getFullYear()}`
}

export default async function PaginaCrearEspacio(): Promise<React.ReactElement> {
  await exigirAccesoPagina('espacios')
  const catalogo = await obtenerCatalogoPerfil()

  const espacios = await prisma.profile.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      user: { select: { email: true } },
      subscription: {
        select: { status: true, currentPeriodEnd: true, planAmount: true },
      },
    },
  })

  const ciudades = catalogo.ciudades.map((ciudad) => ({
    id: ciudad.id,
    nombre: ciudad.nombre,
    provincia: PROVINCIAS[ciudad.provincia as Province]?.nombre ?? ciudad.provincia,
  }))

  const rubros = catalogo.grupos.flatMap((grupo) =>
    grupo.rubros.map((rubro) => ({ id: rubro.id, nombre: rubro.nombre })),
  )

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="border-b-[3px] border-ink pb-6">
        <h1 className="text-3xl font-black uppercase tracking-tight">Crear espacio</h1>
        <p className="mt-2 max-w-prose text-muted">
          Alta de un profesional. La suscripción queda pendiente hasta que registres el pago;
          el perfil se publica cuando además complete fotos y descripción.
        </p>
      </header>

      <FormularioCrearEspacio ciudades={ciudades} rubros={rubros} />

      <section className="mt-10 border-t-[3px] border-ink pt-6">
        <h2 className="text-xl font-black uppercase tracking-tight">Espacios recientes</h2>
        <p className="mt-2 text-sm text-muted">
          Acreditá el pago recién cuando lo veas en el banco. Hasta entonces la suscripción
          queda pendiente y el perfil no se publica.
        </p>

        <ul className="mt-4 space-y-3">
          {espacios.map((espacio) => {
            const suscripcion = espacio.subscription
            const activa =
              suscripcion?.status === 'ACTIVE' &&
              suscripcion.currentPeriodEnd !== null &&
              suscripcion.currentPeriodEnd > new Date()

            return (
              <li
                key={espacio.id}
                className="tarjeta flex flex-wrap items-start justify-between gap-4 p-4"
              >
                <div className="space-y-1">
                  <p className="font-black uppercase">{espacio.name}</p>
                  <p className="text-sm text-muted">{espacio.user.email}</p>
                  <p className="text-sm">
                    <a
                      href={`/p/${espacio.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-bold underline underline-offset-2"
                    >
                      /p/{espacio.slug}
                    </a>
                  </p>
                  <p className="text-sm">
                    Suscripción:{' '}
                    <strong>
                      {suscripcion ? (ESTADOS[suscripcion.status] ?? suscripcion.status) : 'Sin suscripción'}
                    </strong>
                    {activa && suscripcion?.currentPeriodEnd
                      ? ` hasta ${fechaCorta(suscripcion.currentPeriodEnd)}`
                      : ''}
                    {suscripcion ? ` · ${formatArs(Number(suscripcion.planAmount))}/mes` : ''}
                  </p>
                </div>

                {!activa && suscripcion ? (
                  <FormularioAcreditarPago
                    profileId={espacio.id}
                    montoSugerido={Number(suscripcion.planAmount)}
                  />
                ) : null}
              </li>
            )
          })}

          {espacios.length === 0 ? (
            <li className="text-muted">Todavía no hay espacios creados.</li>
          ) : null}
        </ul>
      </section>
    </div>
  )
}
