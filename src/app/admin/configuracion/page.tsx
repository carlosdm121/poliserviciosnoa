import { adminGuardarConfiguracion } from '@/app/actions/admin'
import { Aviso } from '@/components/admin/Aviso'
import { exigirAccesoPagina } from '@/lib/admin-auth'
import { obtenerConfiguracion } from '@/services/configuracion'

export const metadata = { title: 'Configuración', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

function uno(valor: string | string[] | undefined): string {
  return typeof valor === 'string' ? valor : ''
}

/**
 * Configuración del sitio.
 *
 * Cada campo tiene consecuencia inmediata y visible. La aprobación manual
 * resincroniza todos los perfiles, así que el texto lo dice antes de guardar:
 * nadie debería descubrir por sorpresa que apagó el sitio.
 */
export default async function PaginaConfiguracion({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirAccesoPagina('configuracion')
  const sp = await searchParams
  const config = await obtenerConfiguracion()

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-black uppercase tracking-tight">Configuración</h1>
      <p className="mt-2 text-muted">
        Los cambios se aplican al guardar. Quedan registrados en la auditoría con el valor anterior.
      </p>

      <div className="mt-4">
        <Aviso ok={uno(sp.ok)} error={uno(sp.error)} />
      </div>

      <form action={adminGuardarConfiguracion} className="mt-6 space-y-6">
        <input type="hidden" name="ruta" value="/admin/configuracion" />

        <fieldset className="tarjeta p-4">
          <legend className="px-2 font-black uppercase">Aprobación de altas</legend>
          <label className="mt-2 flex items-start gap-3">
            <input
              name="aprobacionManual"
              type="checkbox"
              defaultChecked={config.aprobacionManual}
              className="mt-1 h-5 w-5 accent-black"
            />
            <span>
              <span className="font-bold">Revisar cada alta antes de publicarla</span>
              <span className="block text-sm text-muted">
                Al activarlo, todos los perfiles pasan a revisión y el sitio se queda sin nuevos
                profesionales hasta que alguien los apruebe. Al desactivarlo, se publican todos los
                que estén aprobados.
              </span>
            </span>
          </label>
        </fieldset>

        <fieldset className="tarjeta p-4">
          <legend className="px-2 font-black uppercase">Rubros</legend>
          <label className="mt-2 block">
            <span className="font-bold">Mínimo de perfiles para abrir un rubro</span>
            <span className="mb-1 block text-sm text-muted">
              Se guarda como umbral de referencia para el catálogo público.
            </span>
            <input
              name="minPerfiles"
              type="number"
              min={0}
              max={100}
              defaultValue={config.minPerfiles}
              className="campo w-32"
            />
          </label>
        </fieldset>

        <fieldset className="tarjeta p-4">
          <legend className="px-2 font-black uppercase">Cobranza</legend>
          <label className="mt-2 block">
            <span className="font-bold">Días de gracia después de un pago rechazado</span>
            <span className="mb-1 block text-sm text-muted">
              El perfil sigue publicado durante este plazo mientras se reintenta el cobro. El
              webhook de Mercado Pago lee este valor.
            </span>
            <input
              name="diasGracia"
              type="number"
              min={0}
              max={365}
              defaultValue={config.diasGracia}
              className="campo w-32"
            />
          </label>
        </fieldset>

        <fieldset className="tarjeta p-4">
          <legend className="px-2 font-black uppercase">Emails desechables</legend>
          <label className="mt-2 block">
            <span className="font-bold">Dominios extra</span>
            <span className="mb-1 block text-sm text-muted">
              Uno por línea o separados por coma. Se suman a la lista interna. Un email de estos
              dominios genera una señal de riesgo al registrarse.
            </span>
            <textarea
              name="dominios"
              rows={6}
              defaultValue={config.dominios.join('\n')}
              className="campo font-mono text-sm"
              placeholder={'mailinator.com\ntempmail.com'}
            />
          </label>
        </fieldset>

        <button className="btn-oscuro w-full" type="submit">
          Guardar configuración
        </button>
      </form>
    </div>
  )
}

