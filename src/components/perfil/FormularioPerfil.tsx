'use client'

import { useMemo, useState, useTransition } from 'react'

import { guardarDatosPerfil } from '@/app/actions/perfil'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import type { CiudadCatalogo, GrupoCatalogo } from '@/services/catalogo'
import type { EditarPerfil } from '@/services/perfil'
import { PROVINCIAS, PROVINCIAS_LISTA } from '@/lib/constantes'
import { formatearCuit } from '@/lib/cuit'
import { revisarDescripcion } from '@/lib/texto-perfil'
import { LIMITES_PERFIL } from '@/schemas/perfil'

/**
 * Formulario de perfil.
 *
 * Mobile-first y en secciones, pero **un solo botón de guardar**. Guardado
 * parcial por sección parece más amable, pero con guardado parcial hay estados
 * intermedios donde el perfil está a medio hacer y `evaluarPublicacion` no lo
 * publica: el profesional guarda tres cosas separadas y no entiende por qué
 * sigue sin aparecer. Un guardado, una respuesta clara.
 *
 * El formulario valida para dar feedback inmediato. La validez real la decide
 * el servidor, dentro de la transacción y con la fila bloqueada
 * (`services/perfil.ts`).
 */
export function FormularioPerfil({
  datos,
  grupos,
  ciudades,
}: {
  datos: EditarPerfil
  grupos: GrupoCatalogo[]
  ciudades: CiudadCatalogo[]
}): React.ReactElement {
  const [tipo, setTipo] = useState<'PERSON' | 'COMPANY'>(datos.type)
  const [nombre, setNombre] = useState(datos.name)
  const [descripcion, setDescripcion] = useState(datos.description)

  const [razonSocial, setRazonSocial] = useState(datos.company.companyName)
  const [nombreComercial, setNombreComercial] = useState(datos.company.tradeName)
  const [cuit, setCuit] = useState(datos.company.cuit)
  const [equipo, setEquipo] = useState(datos.company.teamSize ?? '')
  const [anio, setAnio] = useState(datos.company.yearFounded?.toString() ?? '')
  const [sitio, setSitio] = useState(datos.company.website)

  const [provincia, setProvincia] = useState(datos.province ?? '')
  const [ciudad, setCiudad] = useState(datos.baseCityId ?? '')
  const [todaProvincia, setTodaProvincia] = useState(datos.coversWholeProvince)
  const [otrasProvincias, setOtrasProvincias] = useState<string[]>(datos.otherProvinces)
  const [cobertura, setCobertura] = useState<string[]>(datos.cityIds)

  const [rubroPrincipal, setRubroPrincipal] = useState(datos.primaryCategoryId)
  const [rubroSecundario, setRubroSecundario] = useState(datos.secondaryCategoryId)
  const [subcategorias, setSubcategorias] = useState<string[]>(datos.subcategoryIds)
  const [matricula, setMatricula] = useState(datos.licenseNumber)

  const [error, setError] = useState<string | null>(null)
  const [guardado, setGuardado] = useState(false)
  const [pendiente, arrancar] = useTransition()

  /** Todas las subcategorías de los dos rubros elegidos. */
  const subcategoriasDisponibles = useMemo(() => {
    const elegidos = new Set([rubroPrincipal, rubroSecundario].filter(Boolean))

    return grupos
      .flatMap((grupo) => grupo.rubros)
      .filter((rubro) => elegidos.has(rubro.id))
      .flatMap((rubro) => rubro.subcategorias)
  }, [grupos, rubroPrincipal, rubroSecundario])

  /** Etiqueta de la matrícula, si algún rubro elegido la pide. */
  const etiquetaMatricula = useMemo(() => {
    const elegidos = new Set([rubroPrincipal, rubroSecundario].filter(Boolean))

    return grupos
      .flatMap((grupo) => grupo.rubros)
      .find((rubro) => elegidos.has(rubro.id) && rubro.requiereMatricula)
      ?.etiquetaMatricula
  }, [grupos, rubroPrincipal, rubroSecundario])

  const ciudadesDeProvincia = useMemo(
    () => ciudades.filter((c) => c.provincia === provincia),
    [ciudades, provincia],
  )

  function cambiarProvincia(nueva: string): void {
    setProvincia(nueva)
    // La ciudad se limpia porque ya no pertenece a la provincia elegida. Si se
    // dejara, el servidor lo rechaza y el profesional no entendería por qué su
    // ciudad "desapareció".
    setCiudad('')
    setCobertura([])
  }

  function alternarCobertura(id: string): void {
    setCobertura((previas) => {
      if (previas.includes(id)) return previas.filter((c) => c !== id)

      // El tope se avisa acá en vez de dejar que el servidor lo rechace: si no,
      // el profesional elige la ciudad número 9, guarda, y pierde todo lo que
      // había escrito en los otros campos.
      if (previas.length >= LIMITES_PERFIL.ciudades) {
        setError(`Podés marcar hasta ${LIMITES_PERFIL.ciudades} ciudades.`)
        return previas
      }

      return [...previas, id]
    })
  }

  function alternarSubcategoria(id: string): void {
    setSubcategorias((previas) => {
      if (previas.includes(id)) return previas.filter((s) => s !== id)

      if (previas.length >= LIMITES_PERFIL.subcategorias) {
        setError(`Podés elegir hasta ${LIMITES_PERFIL.subcategorias} subcategorías.`)
        return previas
      }

      return [...previas, id]
    })
  }

  function enviar(evento: React.FormEvent<HTMLFormElement>): void {
    evento.preventDefault()
    setError(null)
    setGuardado(false)

    const revision = revisarDescripcion(descripcion)

    if (!revision.ok && revision.detalle) {
      setError(revision.detalle)
      return
    }

    arrancar(async () => {
      const resultado = await guardarDatosPerfil({
        type: tipo,
        name: nombre,
        description: descripcion,
        company: {
          companyName: razonSocial,
          tradeName: nombreComercial,
          cuit,
          teamSize: equipo === '' ? undefined : (equipo as 'T1_5'),
          yearFounded: anio === '' ? undefined : Number(anio),
          website: sitio,
        },
        ubicacion: {
          province: provincia as never,
          baseCityId: ciudad,
          coversWholeProvince: todaProvincia,
          otherProvinces: otrasProvincias as never,
          cityIds: cobertura,
        },
        catalogo: {
          primaryCategoryId: rubroPrincipal,
          secondaryCategoryId: rubroSecundario,
          subcategoryIds: subcategorias,
          licenseNumber: matricula,
        },
      })

      if (!resultado.ok) {
        setError(resultado.error)
        return
      }

      setGuardado(true)
    })
  }

  return (
    <form onSubmit={enviar} className="space-y-10">
      {/* ---------------------------------------------------------------- */}
      <section className="tarjeta p-6">
        <p className="etiqueta">Paso 1</p>
        <h2 className="mt-3 text-xl font-black uppercase">Quién sos</h2>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <label className="flex cursor-pointer items-center gap-3 border-[3px] border-ink p-4 font-bold">
            <input
              type="radio"
              name="type"
              checked={tipo === 'PERSON'}
              onChange={() => setTipo('PERSON')}
            />
            Trabajo yo
          </label>
          <label className="flex cursor-pointer items-center gap-3 border-[3px] border-ink p-4 font-bold">
            <input
              type="radio"
              name="type"
              checked={tipo === 'COMPANY'}
              onChange={() => setTipo('COMPANY')}
            />
            Tengo empresa
          </label>
        </div>

        <div className="mt-6 space-y-5">
          <Input
            label={tipo === 'COMPANY' ? 'Nombre que se muestra' : 'Tu nombre'}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={80}
            ayuda="Es lo primero que ve el cliente. Escribí tu nombre, no el de la empresa."
          />

          <Textarea
            label="Contá qué hacés"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={5}
            maxLength={600}
            ayuda={
              revisarDescripcion(descripcion).ok
                ? 'Sin teléfono, links ni usuarios: los clientes te escriben por acá.'
                : (revisarDescripcion(descripcion).detalle ?? '')
            }
            error={
              descripcion.length > 10 && !revisarDescripcion(descripcion).ok
                ? (revisarDescripcion(descripcion).detalle ?? '')
                : undefined
            }
          />
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {tipo === 'COMPANY' && (
        <section className="tarjeta p-6">
          <p className="etiqueta">Paso 2</p>
          <h2 className="mt-3 text-xl font-black uppercase">Datos de la empresa</h2>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <Input
              label="Razón social"
              value={razonSocial}
              onChange={(e) => setRazonSocial(e.target.value)}
              maxLength={120}
              ayuda="Como figura en el AFIP."
            />
            <Input
              label="Nombre comercial"
              value={nombreComercial}
              onChange={(e) => setNombreComercial(e.target.value)}
              maxLength={120}
              ayuda="Si es distinto de la razón social."
            />
            <Input
              label="CUIT"
              value={cuit}
              onChange={(e) => setCuit(e.target.value.replace(/\D/g, '').slice(0, 11))}
              inputMode="numeric"
              placeholder={cuit.length === 11 ? formatearCuit(cuit) : '34123456789'}
              ayuda="Con 33 o 34 al principio."
            />
            <label className="block space-y-1">
              <span className="block text-sm font-bold">Tamaño del equipo</span>
              <select
                value={equipo}
                onChange={(e) => setEquipo(e.target.value)}
                className="campo"
              >
                <option value="">Elegí una opción</option>
                <option value="T1_5">1 a 5 personas</option>
                <option value="T6_20">6 a 20 personas</option>
                <option value="T21_50">21 a 50 personas</option>
                <option value="T50_PLUS">Más de 50 personas</option>
              </select>
            </label>
            <Input
              label="Año de fundación"
              value={anio}
              onChange={(e) => setAnio(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              ayuda="Opcional."
            />
            <Input
              label="Sitio web"
              value={sitio}
              onChange={(e) => setSitio(e.target.value)}
              placeholder="empresa.com.ar"
              ayuda="Opcional."
            />
          </div>

          <p className="mt-6 text-sm text-muted">
            La constancia de inscripción se sube cuando el administrador revise el perfil. Va en
            almacenamiento privado y se borra después de la revisión.
          </p>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      <section className="tarjeta p-6">
        <p className="etiqueta">Paso 3</p>
        <h2 className="mt-3 text-xl font-black uppercase">Dónde trabajás</h2>

        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="block text-sm font-bold">Provincia</span>
            <select
              value={provincia}
              onChange={(e) => cambiarProvincia(e.target.value)}
              className="campo"
            >
              <option value="">Elegí una provincia</option>
              {PROVINCIAS_LISTA.map((p) => (
                <option key={p} value={p}>
                  {PROVINCIAS[p].nombre}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className="block text-sm font-bold">Ciudad base</span>
            <select
              value={ciudad}
              onChange={(e) => setCiudad(e.target.value)}
              disabled={!provincia}
              className="campo"
            >
              <option value="">Elegí una ciudad</option>
              {ciudadesDeProvincia.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-6 flex cursor-pointer items-center gap-3 font-bold">
          <input
            type="checkbox"
            checked={todaProvincia}
            onChange={(e) => setTodaProvincia(e.target.checked)}
          />
          Atiendo toda la provincia
        </label>

        {!todaProvincia && provincia && (
          <div className="mt-6">
            <p className="text-sm font-bold">
              Otras ciudades donde podés trabajar
              <span className="ml-2 font-mono text-muted">
                {cobertura.length}/{LIMITES_PERFIL.ciudades}
              </span>
            </p>
            <p className="mt-1 text-sm text-muted">La ciudad base ya está cubierta.</p>

            <div className="mt-4 grid max-h-64 gap-2 overflow-y-auto border-[3px] border-ink p-4 sm:grid-cols-2">
              {ciudadesDeProvincia
                .filter((c) => c.id !== ciudad)
                .map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={cobertura.includes(c.id)}
                      onChange={() => alternarCobertura(c.id)}
                    />
                    {c.nombre}
                  </label>
                ))}
            </div>
          </div>
        )}

        <div className="mt-6">
          <p className="text-sm font-bold">También atendés en otras provincias</p>
          <div className="mt-3 flex flex-wrap gap-3">
            {PROVINCIAS_LISTA.filter((p) => p !== provincia).map((p) => (
              <label key={p} className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={otrasProvincias.includes(p)}
                  onChange={() =>
                    setOtrasProvincias((previas) =>
                      previas.includes(p) ? previas.filter((x) => x !== p) : [...previas, p],
                    )
                  }
                />
                {PROVINCIAS[p].nombre}
              </label>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="tarjeta p-6">
        <p className="etiqueta">Paso 4</p>
        <h2 className="mt-3 text-xl font-black uppercase">Qué hacés</h2>

        <p className="mt-3 text-sm text-muted">
          Rubros: <span className="font-mono">{rubroPrincipal ? 1 : 0}/{LIMITES_PERFIL.rubros}</span>
          . El principal es el que se muestra primero en las búsquedas.
        </p>

        <div className="mt-6 space-y-5">
          <SelectorRubro
            etiqueta="Rubro principal"
            grupos={grupos}
            valor={rubroPrincipal}
            onChange={(id) => {
              setRubroPrincipal(id)
              // Las subcategorías del rubro anterior dejan de ser válidas.
              const validas = new Set(
                grupos
                  .flatMap((g) => g.rubros)
                  .filter((r) => r.id === id)
                  .flatMap((r) => r.subcategorias)
                  .map((s) => s.id),
              )
              setSubcategorias((previas) => previas.filter((s) => validas.has(s)))
            }}
            requerido
          />

          <SelectorRubro
            etiqueta="Rubro secundario"
            grupos={grupos}
            valor={rubroSecundario}
            onChange={setRubroSecundario}
            excluir={rubroPrincipal}
            ayuda="Opcional. El que más te conviene elegir es el que se busca más."
          />
        </div>

        {subcategoriasDisponibles.length > 0 && (
          <div className="mt-6">
            <p className="text-sm font-bold">
              Detalles
              <span className="ml-2 font-mono text-muted">
                {subcategorias.length}/{LIMITES_PERFIL.subcategorias}
              </span>
            </p>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {subcategoriasDisponibles.map((sub) => (
                <label key={sub.id} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={subcategorias.includes(sub.id)}
                    onChange={() => alternarSubcategoria(sub.id)}
                  />
                  {sub.nombre}
                </label>
              ))}
            </div>
          </div>
        )}

        {etiquetaMatricula && (
          <div className="mt-6">
            <Input
              label={etiquetaMatricula}
              value={matricula}
              onChange={(e) => setMatricula(e.target.value)}
              maxLength={60}
              ayuda={
                'Se muestra como "Matrícula informada". No la verificamos, la declarás vos.'
              }
            />
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {guardado && (
        <p className="exito" role="status">
          Guardamos tu perfil.
        </p>
      )}

      <Button
        variante="oscuro"
        type="submit"
        cargando={pendiente}
        textoCargando="Guardando…"
        className="w-full"
      >
        Guardar perfil
      </Button>
    </form>
  )
}

/**
 * Selector de rubro.
 *
 * Se muestra agrupado por grupo con todos los rubros desplegados, en vez de un
 * `<select>` con 57 opciones: nadie encuentra "Gas matriculado" en una lista
 * alfabética de 57 ítems, y las subcategorías dan la palabra exacta que la
 * gente busca.
 */
function SelectorRubro({
  etiqueta,
  grupos,
  valor,
  onChange,
  requerido = false,
  excluir,
  ayuda,
}: {
  etiqueta: string
  grupos: GrupoCatalogo[]
  valor: string
  onChange: (id: string) => void
  requerido?: boolean
  excluir?: string
  ayuda?: string
}): React.ReactElement {
  return (
    <div>
      <p className="text-sm font-bold">
        {etiqueta} {requerido && <span aria-hidden="true">*</span>}
      </p>
      {ayuda && <p className="mt-1 text-sm text-muted">{ayuda}</p>}

      <div className="mt-3 space-y-4">
        {grupos.map((grupo) => {
          const rubros = grupo.rubros.filter((rubro) => rubro.id !== excluir)

          if (rubros.length === 0) return null

          return (
            <fieldset key={grupo.id}>
              <legend className="text-xs font-black uppercase tracking-widest text-muted">
                {grupo.nombre}
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {rubros.map((rubro) => (
                  <label
                    key={rubro.id}
                    className={`cursor-pointer border-2 px-3 py-2 text-sm font-bold ${
                      valor === rubro.id ? 'border-ink bg-ink text-paper' : 'border-ink'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`rubro-${etiqueta}`}
                      className="sr-only"
                      checked={valor === rubro.id}
                      onChange={() => onChange(rubro.id)}
                    />
                    {rubro.nombre}
                  </label>
                ))}
              </div>
            </fieldset>
          )
        })}
      </div>
    </div>
  )
}