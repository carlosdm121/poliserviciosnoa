import { Province } from '@prisma/client'

import {
  adminCrearCiudad,
  adminCrearRubro,
  adminEditarCiudad,
  adminEditarRubro,
  adminReasignarLocalidad,
} from '@/app/actions/admin'
import { Aviso } from '@/components/admin/Aviso'
import { exigirAccesoPagina } from '@/lib/admin-auth'
import { listarCatalogo } from '@/services/admin-catalogo'

export const metadata = { title: 'Rubros y ciudades', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const PROVINCIAS: Record<Province, string> = {
  TUCUMAN: 'Tucumán',
  SALTA: 'Salta',
  SANTIAGO_DEL_ESTERO: 'Santiago del Estero',
  CATAMARCA: 'Catamarca',
  JUJUY: 'Jujuy',
}

function uno(valor: string | string[] | undefined): string {
  return typeof valor === 'string' ? valor : ''
}

/**
 * Catálogo.
 *
 * Nada se borra: se desactiva. Un rubro con perfiles adentro no puede
 * desaparecer porque alguien hizo clic en el lugar equivocado. Para fusionar
 * dos localidades está "reasignar", que mueve los perfiles y desactiva la
 * ciudad de origen.
 */
export default async function PaginaCatalogo({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await exigirAccesoPagina('catalogo')
  const sp = await searchParams
  const { grupos, ciudades } = await listarCatalogo()
  const ruta = '/admin/catalogo'

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-black uppercase tracking-tight">Rubros y ciudades</h1>
      <p className="mt-2 text-muted">
        Lo que se desactiva deja de aparecer en el sitio, pero los perfiles siguen existiendo.
      </p>

      <div className="mt-4">
        <Aviso ok={uno(sp.ok)} error={uno(sp.error)} />
      </div>

      <section className="mt-8">
        <h2 className="text-xl font-black uppercase">Rubros</h2>

        {grupos.map((grupo) => (
          <div key={grupo.id} className="mt-5">
            <h3 className="border-b-[3px] border-ink pb-1 font-black uppercase">
              {grupo.name} <span className="text-sm font-normal text-muted">({grupo.slug})</span>
            </h3>

            <ul className="mt-2 space-y-2">
              {grupo.categories.map((rubro) => (
                <li key={rubro.id} className="tarjeta p-3">
                  <form action={adminEditarRubro} className="grid items-end gap-2 lg:grid-cols-[1fr_5rem_auto_auto_10rem_auto]">
                    <input type="hidden" name="id" value={rubro.id} />
                    <input type="hidden" name="ruta" value={ruta} />
                    <label>
                      <span className="block text-xs font-bold uppercase">Nombre</span>
                      <input name="name" defaultValue={rubro.name} className="campo" />
                    </label>
                    <label>
                      <span className="block text-xs font-bold uppercase">Orden</span>
                      <input
                        name="sortOrder"
                        type="number"
                        defaultValue={rubro.sortOrder}
                        className="campo"
                      />
                    </label>
                    <label className="flex items-center gap-2 pb-3 text-sm">
                      <input
                        name="isActive"
                        type="checkbox"
                        defaultChecked={rubro.isActive}
                        className="h-5 w-5 accent-black"
                      />
                      Activo
                    </label>
                    <label className="flex items-center gap-2 pb-3 text-sm">
                      <input
                        name="requiresLicense"
                        type="checkbox"
                        defaultChecked={rubro.requiresLicense}
                        className="h-5 w-5 accent-black"
                      />
                      Matrícula
                    </label>
                    <label>
                      <span className="block text-xs font-bold uppercase">Etiqueta</span>
                      <input
                        name="licenseLabel"
                        defaultValue={rubro.licenseLabel ?? ''}
                        className="campo"
                        placeholder="Matrícula"
                      />
                    </label>
                    <button className="btn-linea px-3 py-2 text-sm" type="submit">
                      Guardar
                    </button>
                  </form>
                  <p className="mt-1 text-xs text-muted">
                    {rubro._count.profiles} perfiles · {rubro.slug}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="tarjeta mt-6 p-4">
          <h3 className="font-black uppercase">Crear rubro</h3>
          <form action={adminCrearRubro} className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <input type="hidden" name="ruta" value={ruta} />
            <label>
              <span className="block text-xs font-bold uppercase">Grupo</span>
              <select name="groupId" className="campo" required>
                {grupos.map((grupo) => (
                  <option key={grupo.id} value={grupo.id}>
                    {grupo.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="block text-xs font-bold uppercase">Nombre</span>
              <input name="name" className="campo" required />
            </label>
            <label>
              <span className="block text-xs font-bold uppercase">Ícono</span>
              <input name="icon" className="campo" placeholder="Nombre del ícono" required />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input name="requiresLicense" type="checkbox" className="h-5 w-5 accent-black" />
              Exige matrícula
            </label>
            <label>
              <span className="block text-xs font-bold uppercase">Etiqueta de matrícula</span>
              <input name="licenseLabel" className="campo" placeholder="Matrícula profesional" />
            </label>
            <div className="flex items-end">
              <button className="btn-oscuro w-full" type="submit">
                Crear rubro
              </button>
            </div>
          </form>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-black uppercase">Ciudades</h2>

        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {ciudades.map((ciudad) => (
            <li key={ciudad.id} className="tarjeta p-3">
              <form action={adminEditarCiudad} className="grid items-end gap-2 sm:grid-cols-[1fr_4rem_auto_auto]">
                <input type="hidden" name="id" value={ciudad.id} />
                <input type="hidden" name="ruta" value={ruta} />
                <label>
                  <span className="block text-xs font-bold uppercase">
                    {PROVINCIAS[ciudad.province]}
                  </span>
                  <input name="name" defaultValue={ciudad.name} className="campo" />
                </label>
                <label>
                  <span className="block text-xs font-bold uppercase">Orden</span>
                  <input
                    name="sortOrder"
                    type="number"
                    defaultValue={ciudad.sortOrder}
                    className="campo"
                  />
                </label>
                <label className="flex items-center gap-2 pb-3 text-sm">
                  <input
                    name="isActive"
                    type="checkbox"
                    defaultChecked={ciudad.isActive}
                    className="h-5 w-5 accent-black"
                  />
                  Activa
                </label>
                <button className="btn-linea px-3 py-2 text-sm" type="submit">
                  Guardar
                </button>
              </form>
              <p className="mt-1 text-xs text-muted">
                {ciudad._count.profiles} base · {ciudad._count.coverage} cobertura
              </p>
            </li>
          ))}
        </ul>

        <div className="tarjeta mt-6 p-4">
          <h3 className="font-black uppercase">Crear ciudad</h3>
          <form action={adminCrearCiudad} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input type="hidden" name="ruta" value={ruta} />
            <label>
              <span className="block text-xs font-bold uppercase">Provincia</span>
              <select name="province" className="campo" required>
                {Object.entries(PROVINCIAS).map(([valor, label]) => (
                  <option key={valor} value={valor}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="block text-xs font-bold uppercase">Nombre</span>
              <input name="name" className="campo" required />
            </label>
            <div className="flex items-end">
              <button className="btn-oscuro" type="submit">
                Crear ciudad
              </button>
            </div>
          </form>
        </div>

        <div className="tarjeta mt-6 p-4">
          <h3 className="font-black uppercase">Reasignar localidad</h3>
          <p className="text-sm text-muted">
            Mueve todos los perfiles de la ciudad de origen a la de destino y desactiva la de
            origen. No se puede deshacer desde el panel.
          </p>
          <form action={adminReasignarLocalidad} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input type="hidden" name="ruta" value={ruta} />
            <label>
              <span className="block text-xs font-bold uppercase">Desde</span>
              <select name="origenId" className="campo" required>
                {ciudades.map((ciudad) => (
                  <option key={ciudad.id} value={ciudad.id}>
                    {ciudad.name} ({PROVINCIAS[ciudad.province]})
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="block text-xs font-bold uppercase">Hacia</span>
              <select name="destinoId" className="campo" required>
                {ciudades.map((ciudad) => (
                  <option key={ciudad.id} value={ciudad.id}>
                    {ciudad.name} ({PROVINCIAS[ciudad.province]})
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <button className="btn-linea" type="submit">
                Reasignar
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  )
}
