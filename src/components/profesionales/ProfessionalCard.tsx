import type { Province, ProfileType, TeamSize } from '@prisma/client'
import { MapPin } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

import { BotonCorazon } from '@/components/votos/BotonCorazon'
import { EQUIPOS, PROVINCIAS } from '@/lib/constantes'
import type { MotivoNoVotable } from '@/services/votos'

export type ProfessionalCardData = {
  id: string
  slug: string
  type: ProfileType
  name: string
  tradeName: string | null
  logoUrl: string | null
  teamSize: TeamSize | null
  shortBio: string | null
  licenseNumber: string | null
  companyVerified: boolean
  heartsCount: number
  image: { url: string; width: number; height: number } | null
  primaryCategory: string
  secondaryCategory: string | null
  baseCity: string | null
  province: Province | null
  coverage: readonly string[]
  coversWholeProvince: boolean
}

export type VotoCard = {
  votado: boolean
  puedeVotar: boolean
  motivo: MotivoNoVotable | null
  horasRestantes: number | null
}

type Props = {
  profile: ProfessionalCardData
  logueado: boolean
  voto?: VotoCard
}

/**
 * Texto de cobertura de la card.
 *
 * La ciudad base no se repite: el esquema no la guarda en `coverage` porque ya
 * está cubierta por `baseCity`. Si algún dato viejo la incluye, se descarta acá
 * para no mostrar "San Miguel de Tucumán, San Miguel de Tucumán".
 */
function textoCobertura(
  cobertura: readonly string[],
  ciudadBase: string | null,
  todaLaProvincia: boolean,
): string | null {
  if (todaLaProvincia) return 'Atiende toda la provincia'

  const otras = [...new Set(cobertura)].filter((ciudad) => ciudad && ciudad !== ciudadBase)

  if (otras.length === 0) return null

  const visibles = otras.slice(0, 2).join(', ')
  const resto = otras.length - 2

  return `Atiende en: ${visibles}${resto > 0 ? ` (+${resto})` : ''}`
}

export function ProfessionalCard({ profile, logueado, voto }: Props): React.ReactElement {
  const esEmpresa = profile.type === 'COMPANY'
  const nombre = esEmpresa ? profile.tradeName ?? profile.name : profile.name
  const provincia = profile.province ? PROVINCIAS[profile.province].nombre : null
  const ubicacion = [profile.baseCity, provincia].filter(Boolean).join(', ')
  const cobertura = textoCobertura(
    profile.coverage,
    profile.baseCity,
    profile.coversWholeProvince,
  )
  const matricula = profile.licenseNumber?.trim()
  const inicial = nombre.trim().charAt(0).toUpperCase() || '?'
  const estadoVoto: VotoCard = voto ?? {
    votado: false,
    puedeVotar: false,
    motivo: logueado ? null : 'SIN_SESION',
    horasRestantes: null,
  }

  return (
    <article
      aria-labelledby={`perfil-${profile.slug}-titulo`}
      className="tarjeta flex h-full flex-col"
    >
      {profile.image ? (
        <div className="relative aspect-[4/3] w-full border-b-[3px] border-ink bg-ink/5">
          <Image
            src={profile.image.url}
            alt={`Foto de ${profile.name}`}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover"
          />
        </div>
      ) : (
        <div
          aria-hidden="true"
          className="flex aspect-[4/3] w-full items-center justify-center border-b-[3px] border-ink bg-ink text-paper"
        >
          <span className="font-display text-6xl uppercase">{inicial}</span>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          <span className="insignia-verificada">WhatsApp verificado</span>
          {esEmpresa && profile.companyVerified && (
            <span className="insignia-verificada">Empresa verificada</span>
          )}
          {matricula && <span className="insignia-verificada">Matrícula informada</span>}
        </div>

        <div className="flex items-start gap-3">
          {esEmpresa && profile.logoUrl && (
            <Image
              src={profile.logoUrl}
              alt={`Logo de ${nombre}`}
              width={48}
              height={48}
              className="h-12 w-12 shrink-0 border-[3px] border-ink bg-paper object-contain p-1"
            />
          )}

          <div className="min-w-0">
            <h3
              id={`perfil-${profile.slug}-titulo`}
              className="text-balance font-display text-[1.75rem] uppercase leading-[0.95] tracking-tight"
            >
              {nombre}
            </h3>

            {esEmpresa && profile.teamSize && (
              <p className="mt-1 font-mono text-xs uppercase tracking-wide">
                {EQUIPOS[profile.teamSize]}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="etiqueta">{profile.primaryCategory}</span>
          {profile.secondaryCategory && (
            <span className="etiqueta">{profile.secondaryCategory}</span>
          )}
        </div>

        {ubicacion && (
          <p className="flex items-start gap-1 text-sm font-bold">
            <MapPin aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            {ubicacion}
          </p>
        )}

        {cobertura && <p className="text-xs font-bold leading-snug">{cobertura}</p>}

        {profile.shortBio && (
          <p className="line-clamp-2 text-sm leading-snug">{profile.shortBio}</p>
        )}

        <div className="mt-auto">
          <BotonCorazon
            profileId={profile.id}
            corazones={profile.heartsCount}
            votado={estadoVoto.votado}
            puedeVotar={estadoVoto.puedeVotar}
            motivo={estadoVoto.motivo}
            horasRestantes={estadoVoto.horasRestantes}
          />
        </div>

        <div className="space-y-2">
          <a
            href={`/api/contacto/${profile.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Contactar a ${nombre} por WhatsApp`}
            className="btn-whatsapp w-full"
          >
            WhatsApp
          </a>

          {!logueado && (
            <Link
              href="/login"
              className="block text-xs font-bold leading-tight underline decoration-2 underline-offset-2"
            >
              Ingresá antes de contactar para poder valorar a este profesional después
            </Link>
          )}

          <Link href={`/p/${profile.slug}`} className="btn-linea w-full">
            Ver perfil
          </Link>
        </div>
      </div>
    </article>
  )
}
