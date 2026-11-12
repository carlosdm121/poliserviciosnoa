import { ArrowLeft, MapPin } from 'lucide-react'
import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { ContadorVista } from '@/components/perfil/ContadorVista'
import { GaleriaPerfil } from '@/components/perfil/GaleriaPerfil'
import { BotonCorazon } from '@/components/votos/BotonCorazon'
import { BotonReportarPerfil } from '@/components/reportes/BotonReportarPerfil'
import { authOptions } from '@/lib/auth'
import { EQUIPOS, PROVINCIAS } from '@/lib/constantes'
import {
  AVISO_WHATSAPP,
  ciudadesCubiertas,
  construirJsonLd,
  construirJsonLdBreadcrumbList,
  construirJsonLdOrganization,
  construirMetadata,
  etiquetaMatricula,
  jsonLdParaScript,
  nombreMostrado,
  provinciasCubiertas,
  rubroPrincipal,
} from '@/lib/perfil-publico'
import { obtenerPerfilPublico } from '@/services/perfil-publico'
import { estadoVoto } from '@/services/votos'

/**
 * El perfil depende de la sesión para el corazón y para no contar la visita del
 * dueño. No se cachea.
 */
export const dynamic = 'force-dynamic'

type PageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const perfil = await obtenerPerfilPublico(slug)

  if (!perfil) {
    return {
      title: 'Perfil no disponible',
      robots: { index: false, follow: false },
    }
  }

  return construirMetadata(perfil)
}

export default async function PerfilPublicoPage({
  params,
}: PageProps): Promise<React.ReactElement> {
  const { slug } = await params
  const perfil = await obtenerPerfilPublico(slug)

  if (!perfil) notFound()

  const session = await getServerSession(authOptions)
  const clienteId = session?.user.role === 'CLIENT' ? session.user.id : null
  const logueado = Boolean(session?.user)

  // Se recalcula en el servidor en cada visita: el botón del cliente no otorga
  // permiso para votar.
  const voto = await estadoVoto({ profileId: perfil.id, clientId: clienteId })

  const esEmpresa = perfil.type === 'COMPANY'
  const nombre = nombreMostrado(perfil)
  const rubro = rubroPrincipal(perfil)
  const matricula = etiquetaMatricula(perfil)
  const provinciaBase = perfil.baseCity ? PROVINCIAS[perfil.baseCity.province] : null
  const ubicacion = [perfil.baseCity?.name, provinciaBase?.nombre].filter(Boolean).join(', ')

  const ciudades = ciudadesCubiertas(perfil)
  const provincias = provinciasCubiertas(perfil)

  const volverHref =
    rubro && provinciaBase ? `/${provinciaBase.slug}/${rubro.slug}` : '/buscar'
  const volverTexto =
    rubro && provinciaBase
      ? `Volver a ${rubro.name} en ${provinciaBase.nombre}`
      : 'Volver al buscador'

  const jsonLd = construirJsonLd(
    perfil,
    process.env.NEXTAUTH_URL ?? 'http://localhost:3000',
  )

  const descripcion = perfil.description?.trim() || perfil.shortBio?.trim()

  return (
    <article className="pb-28 sm:pb-12">
      <ContadorVista slug={perfil.slug} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdParaScript(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdParaScript(
            construirJsonLdOrganization(
              process.env.NEXTAUTH_URL ?? 'http://localhost:3000',
            ),
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdParaScript(
            construirJsonLdBreadcrumbList([
              { name: 'Inicio', url: '/' },
              ...(provinciaBase && rubro
                ? [
                    {
                      name: provinciaBase.nombre,
                      url: `/${provinciaBase.slug}`,
                    },
                    {
                      name: rubro.name,
                      url: `/${provinciaBase.slug}/${rubro.slug}`,
                    },
                  ]
                : provinciaBase
                  ? [{ name: provinciaBase.nombre, url: `/${provinciaBase.slug}` }]
                  : []),
              { name: nombre, url: `/${perfil.slug}` },
            ]),
          ),
        }}
      />

      <div className="mx-auto max-w-6xl px-4 pt-6">
        <Link
          href={volverHref}
          className="inline-flex min-h-[44px] items-center gap-2 text-sm font-bold underline decoration-2 underline-offset-4"
        >
          <ArrowLeft aria-hidden className="h-4 w-4" />
          {volverTexto}
        </Link>

        <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:gap-10">
          <div className="min-w-0 space-y-8">
            <header className="border-b-[3px] border-ink pb-6">
              <div className="flex flex-wrap gap-2">
                <span className="insignia-verificada">WhatsApp verificado</span>
                {esEmpresa && perfil.companyVerifiedAt && (
                  <span className="insignia-verificada">Empresa verificada</span>
                )}
                {matricula && <span className="insignia-verificada">Matrícula informada</span>}
              </div>

              <div className="mt-4 flex items-start gap-4">
                {esEmpresa && perfil.logoUrl && (
                  <Image
                    src={perfil.logoUrl}
                    alt={`Logo de ${nombre}`}
                    width={96}
                    height={96}
                    className="h-20 w-20 shrink-0 border-[3px] border-ink bg-paper object-contain p-1 sm:h-24 sm:w-24"
                  />
                )}

                <div className="min-w-0">
                  <h1 className="text-balance font-display text-[clamp(2.25rem,8vw,4.75rem)] uppercase leading-[0.9] tracking-tight">
                    {nombre}
                  </h1>

                  {esEmpresa && perfil.teamSize && (
                    <p className="mt-2 font-mono text-sm uppercase tracking-wide">
                      {EQUIPOS[perfil.teamSize]}
                    </p>
                  )}

                  {ubicacion && (
                    <p className="mt-3 flex items-start gap-2 text-base font-bold">
                      <MapPin aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
                      {ubicacion}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {perfil.categories.map(({ category }) => (
                  <span key={category.slug} className="etiqueta">
                    {category.name}
                  </span>
                ))}
              </div>

              {perfil.subcategories.length > 0 && (
                <p className="mt-3 text-sm leading-snug">
                  <span className="font-mono text-xs uppercase tracking-wide">
                    También hace
                  </span>{' '}
                  {perfil.subcategories
                    .map(({ subcategory }) => subcategory.name)
                    .join(' · ')}
                </p>
              )}

              {matricula && (
                <p className="mt-3 font-mono text-xs uppercase tracking-wide">{matricula}</p>
              )}
            </header>

            <GaleriaPerfil imagenes={perfil.images} nombre={nombre} />

            <section aria-labelledby="sobre-el-trabajo">
              <h2
                id="sobre-el-trabajo"
                className="font-display text-3xl uppercase leading-none"
              >
                Sobre el trabajo
              </h2>

              <p className="mt-4 max-w-prose whitespace-pre-line text-base leading-relaxed">
                {descripcion ?? 'Este profesional todavía no cargó una descripción.'}
              </p>
            </section>

            <section aria-labelledby="zonas-de-cobertura">
              <h2
                id="zonas-de-cobertura"
                className="font-display text-3xl uppercase leading-none"
              >
                Dónde atiende
              </h2>

              {perfil.coversWholeProvince && provinciaBase && (
                <p className="mt-3 text-sm font-bold">
                  Atiende toda la provincia de {provinciaBase.nombre}.
                </p>
              )}

              <ul className="mt-4 flex flex-wrap gap-2">
                {ciudades.map((ciudad) => (
                  <li key={ciudad} className="etiqueta">
                    {ciudad}
                  </li>
                ))}

                {provincias
                  .filter(
                    (provincia) =>
                      !perfil.baseCity || provincia !== perfil.baseCity.province,
                  )
                  .map((provincia) => (
                    <li key={provincia} className="etiqueta">
                      {PROVINCIAS[provincia].nombre}
                    </li>
                  ))}
              </ul>
            </section>
          </div>

          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="tarjeta space-y-5 p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs uppercase tracking-wide">Confianza</p>
                  <p className="mt-1 text-sm font-bold leading-snug">
                    {voto.motivo === 'SIN_SESION'
                      ? 'Ingresá como cliente para valorar.'
                      : 'Los corazones los dejan clientes que ya contactaron.'}
                  </p>
                </div>

                <BotonCorazon
                  profileId={perfil.id}
                  corazones={voto.corazones}
                  votado={voto.votado}
                  puedeVotar={voto.puedeVotar}
                  motivo={voto.motivo}
                  horasRestantes={voto.horasRestantes}
                />
              </div>

              <a
                href={`/api/contacto/${perfil.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Contactar a ${nombre} por WhatsApp`}
                className="btn-whatsapp w-full"
              >
                Contactar por WhatsApp
              </a>

              {!logueado && (
                <Link
                  href="/login"
                  className="block text-xs font-bold leading-tight underline decoration-2 underline-offset-2"
                >
                  Ingresá antes de contactar para poder valorar a este profesional después
                </Link>
              )}

              <p className="border-t-2 border-ink pt-4 text-xs leading-snug">
                {AVISO_WHATSAPP}
              </p>

              <BotonReportarPerfil slug={perfil.slug} />
            </div>
          </aside>
        </div>
      </div>

      {/* En celular el botón vive pegado abajo: es la única conversión del
          perfil y no puede depender de que el visitante llegue al aside. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t-[3px] border-ink bg-paper p-3 sm:hidden">
        <a
          href={`/api/contacto/${perfil.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Contactar a ${nombre} por WhatsApp`}
          className="btn-whatsapp w-full"
        >
          Contactar por WhatsApp
        </a>
      </div>
    </article>
  )
}
