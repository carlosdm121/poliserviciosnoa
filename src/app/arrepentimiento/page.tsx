import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import Link from 'next/link'

import { FormularioArrepentimiento } from '@/components/baja/FormularioArrepentimiento'
import { authOptions } from '@/lib/auth'
import { DIAS_ARREPENTIMIENTO } from '@/lib/cancelaciones'
import { formatArs } from '@/lib/dinero'
import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { evaluarArrepentimiento } from '@/services/cancelaciones'

export const metadata: Metadata = {
  title: 'Botón de arrepentimiento',
  description:
    'Revocá la contratación de tu suscripción dentro de los 10 días corridos y te devolvemos el dinero.',
}

function fecha(valor: Date | null): string {
  if (!valor) return '—'

  const dia = String(valor.getUTCDate()).padStart(2, '0')
  const mes = String(valor.getUTCMonth() + 1).padStart(2, '0')

  return `${dia}/${mes}/${valor.getUTCFullYear()}`
}

/**
 * Botón de arrepentimiento.
 *
 * Es público a propósito. La ley no dice "si recordás tu contraseña": el
 * derecho a revocar existe igual, así que la página se puede leer sin sesión y
 * solo la ejecución pide identificarse.
 *
 * `force-dynamic` porque el plazo corre y una página cacheada podría ofrecer un
 * reembolso que ya venció.
 */
export const dynamic = 'force-dynamic'

export default async function PaginaArrepentimiento(): Promise<React.ReactElement> {
  const sesion = await getServerSession(authOptions)

  const perfil = sesion?.user?.id
    ? await prisma.profile.findUnique({
        where: { userId: sesion.user.id },
        select: { id: true },
      })
    : null

  const evaluacion = perfil ? await evaluarArrepentimiento(perfil.id) : null

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <header className="border-b-[3px] border-ink pb-6">
        <p className="text-sm font-bold uppercase text-muted">Ley 24.240 · Resolución 424/2020</p>
        <h1 className="mt-2 text-title font-black uppercase">Botón de arrepentimiento</h1>
        <p className="mt-3 max-w-prose text-lg leading-relaxed">
          Si contrataste la suscripción hace menos de {DIAS_ARREPENTIMIENTO} días corridos, podés
          revocarla sin explicar el motivo. Te devolvemos el total, despublicamos tu perfil y
          anulamos el comprobante fiscal.
        </p>
      </header>

      <div className="mt-8 space-y-6">
        {!sesion && (
          <>
            <div className="tarjeta p-6">
              <p className="font-black uppercase">Para revocar necesitamos identificarte</p>
              <p className="mt-3 leading-relaxed">
                Entrá con tu cuenta y la página te dice si el plazo sigue abierto. Si no podés
                entrar, escribinos y lo resolvemos igual.
              </p>
              <Link
                href="/login?callbackUrl=%2Farrepentimiento"
                className="btn-oscuro mt-6 inline-flex items-center"
              >
                Entrar con mi email
              </Link>
            </div>

            <div className="tarjeta p-6">
              <h2 className="text-xl font-black uppercase">Qué pasa si lo hacés</h2>
              <ul className="mt-3 space-y-2 leading-relaxed">
                <li>Devolvemos el total del último pago, por el mismo medio.</li>
                <li>Tu perfil se despublica en el momento.</li>
                <li>Emitimos una nota de crédito que anula la factura.</li>
                <li>Te mandamos un email con el número de trámite y la constancia.</li>
              </ul>
            </div>
          </>
        )}

        {sesion && !perfil && (
          <div className="tarjeta p-6">
            <p className="font-black uppercase">No encontramos tu perfil</p>
            <p className="mt-3 leading-relaxed">
              Tu usuario no tiene un perfil asociado. Escribinos a{' '}
              <a href={`mailto:${env.contactEmail}`} className="font-bold underline">
                {env.contactEmail}
              </a>{' '}
              y lo revisamos.
            </p>
          </div>
        )}

        {evaluacion && !evaluacion.ok && (
          <div className="tarjeta p-6">
            <p className="error" role="alert">
              {evaluacion.error}
            </p>
          </div>
        )}

        {evaluacion?.ok && !evaluacion.data.elegible && (
          <div className="tarjeta p-6">
            <p className="font-black uppercase">
              {evaluacion.data.tramiteExistente
                ? 'Tu arrepentimiento ya está registrado'
                : 'El plazo de arrepentimiento no está abierto'}
            </p>
            <p className="mt-3 leading-relaxed">
              {evaluacion.data.tramiteExistente
                ? 'Ya procesamos tu pedido y te enviamos la constancia por email.'
                : evaluacion.data.motivo}
            </p>

            {evaluacion.data.tramiteExistente && (
              <p className="mt-3 leading-relaxed">
                Número de trámite: <strong>{evaluacion.data.tramiteExistente}</strong>
              </p>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/baja" className="btn-linea inline-flex items-center">
                Dar de baja la renovación
              </Link>
              <Link href="/libro-de-quejas" className="btn-linea inline-flex items-center">
                Libro de quejas
              </Link>
            </div>
          </div>
        )}

        {evaluacion?.ok &&
          evaluacion.data.elegible &&
          evaluacion.data.monto !== null &&
          evaluacion.data.contratadoEn && (
            <FormularioArrepentimiento
              monto={formatArs(evaluacion.data.monto)}
              contratadoEl={fecha(evaluacion.data.contratadoEn)}
              venceEl={fecha(evaluacion.data.venceEl)}
              diasRestantes={evaluacion.data.diasRestantes}
            />
          )}

        <div className="tarjeta p-6">
          <h2 className="text-xl font-black uppercase">Si no estás de acuerdo con la respuesta</h2>
          <p className="mt-3 leading-relaxed">
            Podés reclamar en nuestro libro de quejas o denunciar ante la Dirección de Comercio
            Interior de Tucumán.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/libro-de-quejas" className="btn-linea inline-flex items-center">
              Libro de quejas
            </Link>
            <a
              href="https://defensadelconsumidortucuman.gob.ar/"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-linea inline-flex items-center"
            >
              Defensa del Consumidor
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
