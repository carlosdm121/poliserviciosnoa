'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import Link from 'next/link'

import { guardarDatosPerfil } from '@/app/actions/perfil'
import { registrarProfesional } from '@/app/actions/registro'
import { Button } from '@/components/ui/Button'
import { Input, Textarea } from '@/components/ui/Input'
import { SelectorRubro } from '@/components/catalogo/SelectorRubro'
import type { CiudadCatalogo, GrupoCatalogo } from '@/services/catalogo'
import type { EditarPerfil } from '@/services/perfil'
import { PROVINCIAS, PROVINCIAS_LISTA } from '@/lib/constantes'
import { formatearCuit } from '@/lib/cuit'
import { normalizarWhatsapp } from '@/lib/phone'
import { revisarDescripcion } from '@/lib/texto-perfil'
import { LIMITES_PERFIL } from '@/schemas/perfil'
import { VERSION_TERMINOS } from '@/lib/suscripcion'

/**
 * Dos modos: edicion (perfil existente) y alta (nuevo registro).
 * En modo alta: sección "Tu cuenta" arriba, campos fiscales ocultos,
 * y envío via registrarProfesional + signIn.
 */
export function FormularioPerfil({
  modo = 'edicion',
  datos,
  grupos,
  ciudades,
  versionTerminos,
}: {
  modo?: 'edicion' | 'alta'
  datos?: EditarPerfil
  grupos: GrupoCatalogo[]
  ciudades: CiudadCatalogo[]
  versionTerminos?: string
}) {
  const esAlta = modo === 'alta'

  // Perfil vacío para modo alta
  const perfilVacio: Omit<EditarPerfil, 'id'> = {
    type: 'PERSON',
    name: '',
    description: '',
    company: {
      companyName: '',
      tradeName: '',
      cuit: '',
      teamSize: null,
      yearFounded: null,
      website: '',
    },
    province: null,
    baseCityId: null,
    coversWholeProvince: false,
    otherProvinces: [],
    cityIds: [],
    primaryCategoryId: '',
    secondaryCategoryId: '',
    subcategoryIds: [],
    licenseNumber: '',
  }

  const inicial = esAlta ? perfilVacio : (datos || perfilVacio)

  const [tipo, setTipo] = useState<'PERSON' | 'COMPANY'>(inicial.type)
  const [nombre, setNombre] = useState(inicial.name)
  const [descripcion, setDescripcion] = useState(inicial.description)

  const [razonSocial, setRazonSocial] = useState(inicial.company.companyName)
  const [nombreComercial, setNombreComercial] = useState(inicial.company.tradeName)
  const [cuit, setCuit] = useState(inicial.company.cuit)
  const [equipo, setEquipo] = useState(inicial.company.teamSize ?? '')
  const [anio, setAnio] = useState(inicial.company.yearFounded?.toString() ?? '')
  const [sitio, setSitio] = useState(inicial.company.website)

  const [provincia, setProvincia] = useState(inicial.province ?? '')
  const [ciudad, setCiudad] = useState(inicial.baseCityId ?? '')
  const [todaProvincia, setTodaProvincia] = useState(inicial.coversWholeProvince)
  const [otrasProvincias, setOtrasProvincias] = useState<string[]>(inicial.otherProvinces)
  const [cobertura, setCobertura] = useState<string[]>(inicial.cityIds)

  const [rubroPrincipal, setRubroPrincipal] = useState(inicial.primaryCategoryId)
  const [rubroSecundario, setRubroSecundario] = useState(inicial.secondaryCategoryId)
  const [subcategorias, setSubcategorias] = useState<string[]>(inicial.subcategoryIds)
  const [matricula, setMatricula] = useState(inicial.licenseNumber)

  const [telefono, setTelefono] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardado, setGuardado] = useState(false)
  const [pendiente, arrancar] = useTransition()

  function manejarTelefono(valor: string): void {
    setTelefono(valor)
  }

  // ---------- Subcategorías disponibles ----------
  const subcategoriasDisponibles = useMemo(() => {
    const elegidos = new Set([rubroPrincipal, rubroSecundario].filter(Boolean))

    return grupos
      .flatMap((grupo) => grupo.rubros)
      .filter((rubro) => elegidos.has(rubro.id))
      .flatMap((rubro) => rubro.subcategorias)
  }, [grupos, rubroPrincipal, rubroSecundario])

  // ---------- Etiqueta de matrícula ----------
  const etiquetaMatricula = useMemo(() => {
    const elegidos = new Set([rubroPrincipal, rubroSecundario].filter(Boolean))

    return grupos
      .flatMap((grupo) => grupo.rubros)
      .find((rubro) => elegidos.has(rubro.id) && rubro.requiereMatricula)
      ?.etiquetaMatricula
  }, [grupos, rubroPrincipal, rubroSecundario])

  // ---------- Ciudades de la provincia seleccionada ----------
  const ciudadesDeProvincia = useMemo(
    () => ciudades.filter((c) => c.provincia === provincia),
    [ciudades, provincia],
  )

  // ---------- Cambiar provincia (limpia ciudad y cobertura) ----------
  function cambiarProvincia(nueva: string): void {
    setProvincia(nueva)
    setCiudad('')
    setCobertura([])
  }

  // ---------- Alternar cobertura (ciudad suplementaria) ----------
  function alternarCobertura(id: string): void {
    setCobertura((previas) => {
      if (previas.includes(id)) return previas.filter((c) => c !== id)
      if (previas.length >= LIMITES_PERFIL.ciudades) {
        setError(`Podés marcar hasta ${LIMITES_PERFIL.ciudades} ciudades.`)
        return previas
      }
      return [...previas, id]
    })
  }

  // ---------- Alternar subcategoría ----------
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

  // ---------- Enviar formulario ----------
  function enviar(evento: React.FormEvent<HTMLFormElement>): void {
    evento.preventDefault()
    setError(null)
    setGuardado(false)

    const revision = revisarDescripcion(descripcion)

    if (!revision.ok && revision.detalle) {
      setError(revision.detalle)
      return
    }

    // Modo alta: construye payload plano para registrarProfesional
    if (esAlta) {
      const form = evento.currentTarget as HTMLFormElement
      const formData = new FormData(form)
      const email = formData.get('email') as string
      const password = formData.get('password') as string
      const whatsapp = formData.get('whatsapp') as string
      const aceptaTerminos = formData.has('aceptaTerminos')

      const payload = {
        type: tipo,
        name: nombre,
        description: descripcion,
        company: {
          companyName: razonSocial,
          cuit,
          // tradeName, teamSize, yearFounded, website: omitted -> schema defaults
        },
        ubicacion: {
          province: provincia || undefined,
          baseCityId: ciudad || undefined,
          // coversWholeProvince, otherProvinces, cityIds: omitted -> schema defaults
        },
        catalogo: {
          primaryCategoryId: rubroPrincipal,
          secondaryCategoryId: rubroSecundario,
          subcategoryIds: subcategorias,
          licenseNumber: matricula,
        },
        email,
        password,
        whatsapp,
        aceptaTerminos,
      }

      arrancar(async () => {
        const resultado = await registrarProfesional(payload as any)

        if (resultado.ok) {
          try {
            await signIn('credentials', {
              email: payload.email,
              password: payload.password,
              redirect: false,
            })
            // router.push('/panel/suscripcion')
            // router.refresh()
          } catch (signInError) {
            // sesión falló pero el alta ya está hecho
          }
          // Si llegamos acá, signIn falló; el alta ya quedó creado.
          setError(
            'Cuenta creada, pero no se pudo iniciar sesión automáticamente. Entrá desde /login con tu email y contraseña.',
          )
          setGuardado(true)
          return
        }

        setError(resultado.error)
      })

      return
    }

    // Modo edicion: comportamiento existente (guardarDatosPerfil)
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
      {esAlta && (
        <section className="tarjeta p-6">
          <p className="etiqueta">Tu cuenta</p>
          <h2 className="mt-3 text-xl font-black uppercase">Quién sos</h2>

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <label className="flex cursor-pointer items-center gap-3 border-[3px] border-ink p-4 font-bold">
              <input
                type="radio"
                name="type"
                checked={tipo === 'PERSON'}
                onChange={() => setTipo('PERSON')}
              />
              <span>Trabajo yo</span>
            </label>
            <label className="flex cursor-pointer items-center gap-3 border-[3px] border-ink p-4 font-bold">
              <input
                type="radio"
                name="type"
                checked={tipo === 'COMPANY'}
                onChange={() => setTipo('COMPANY')}
              />
              <span>Tengo empresa</span>
            </label>
          </div>

          <div className="mt-6 space-y-5">
            <Input
              label="Tu nombre o el de tu empresa"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={80}
              ayuda="Así te van a encontrar en las búsquedas."
            />

            <Textarea
              label="Contá qué hacés"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              rows={5}
              maxLength={600}
              placeholder="Ej: Hago instalaciones de gas y agua en Capital, con 15 años de oficio."
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

            <Input
              label="Email"
              name="email"
              type="email"
              autoComplete="email"
              required
              ayuda="Te mandamos un enlace acá para confirmar que el email es tuyo."
            />

            <Input
              label="WhatsApp"
              name="whatsapp"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={telefono}
              onChange={(e) => manejarTelefono(e.target.value)}
              placeholder="381 123 4567"
              ayuda={
                telefono && normalizarWhatsapp(telefono)
                  ? `Así lo van a ver tus clientes: +${normalizarWhatsapp(telefono)}`
                  : 'Con el número con el que atendés, sin 0 ni 15.'
              }
            />

            <Input
              label="Contraseña"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              placeholder="Mínimo 8 caracteres"
            />
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      {!esAlta && (
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
              <span>Trabajo yo</span>
            </label>
            <label className="flex cursor-pointer items-center gap-3 border-[3px] border-ink p-4 font-bold">
              <input
                type="radio"
                name="type"
                checked={tipo === 'COMPANY'}
                onChange={() => setTipo('COMPANY')}
              />
              <span>Tengo empresa</span>
            </label>
          </div>

          {tipo === 'PERSON' && (
            <p className="mt-4 text-sm text-muted">
              Si tenés empresa, elegí &quot;Tengo empresa&quot; y se habilitan la razón social y el CUIT.
            </p>
          )}

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
      )}

      {/* ---------------------------------------------------------------- */}
      {(!esAlta || tipo === 'COMPANY') && (
        <section className="tarjeta p-6">
          {!esAlta && <p className="etiqueta">Paso 2</p>}
          <h2 className="mt-3 text-xl font-black uppercase">Datos de la empresa</h2>

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <Input
              label="Razón social"
              value={razonSocial}
              onChange={(e) => setRazonSocial(e.target.value)}
              maxLength={120}
              ayuda="El nombre legal como figura en AFIP. No es el CUIT."
            />
            {!esAlta && (
              <Input
                label="Nombre comercial"
                value={nombreComercial}
                onChange={(e) => setNombreComercial(e.target.value)}
                maxLength={120}
                ayuda="Si es distinto de la razón social."
              />
            )}
            <Input
              label="CUIT"
              value={cuit}
              onChange={(e) => setCuit(e.target.value.replace(/\D/g, '').slice(0, 11))}
              inputMode="numeric"
              placeholder={cuit.length === 11 ? formatearCuit(cuit) : '34123456789'}
              ayuda="Con 30, 33 o 34 al principio."
            />
            {!esAlta && (
              <>
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
              </>
            )}
          </div>

          {!esAlta && (
            <p className="mt-6 text-sm text-muted">
              La constancia de inscripción se sube cuando el administrador revise el perfil. Va en
              almacenamiento privado y se borra después de la revisión.
            </p>
          )}
        </section>
      )}

      {/* ---------------------------------------------------------------- */}
      <section className="tarjeta p-6">
        {!esAlta && <p className="etiqueta">Paso 3</p>}
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

          {!esAlta && (
            <>
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
                            previas.includes(p)
                              ? previas.filter((x) => x !== p)
                              : [...previas, p],
                          )
                        }
                      />
                      {PROVINCIAS[p].nombre}
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>

      {/* ---------------------------------------------------------------- */}
      <section className="tarjeta p-6">
        {!esAlta && <p className="etiqueta">Paso 4</p>}
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
      {esAlta && (
        <>
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

          <label className="flex cursor-pointer items-center gap-3 font-bold">
            <input type="checkbox" name="aceptaTerminos" value="on" />
            Acepto los términos y condiciones (versión {versionTerminos || '?'})
          </label>
        </>
      )}

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
        textoCargando={esAlta ? 'Creando cuenta…' : 'Guardando…'}
        className="w-full"
      >
        {esAlta ? 'Crear mi cuenta' : 'Guardar perfil'}
      </Button>
    </form>
  )
}