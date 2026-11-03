export type SeccionLegal = {
  /** Título de la sección. */
  titulo: string
  /** Párrafos de la sección, en orden. */
  parrafos: string[]
}

export type Props = {
  /** Título de la página (va en el <h1>). */
  titulo: string
  /** Fecha que se muestra como "Última actualización". */
  ultimaActualizacion: string
  /** Secciones del documento. */
  secciones: SeccionLegal[]
  /** Puntos que debe revisar un abogado antes de publicar. */
  puntosAbogado: string[]
}

/**
 * Layout compartido de los documentos legales (/terminos, /privacidad,
 * /politica-de-pagos).
 *
 * Estilo brutalist/editorial (D6): bordes gruesos, sin sombras, tipografía
 * grande y negra sobre blanco. Todo el contenido es estático: no consulta la
 * base de datos, así que la página es `force-dynamic` solo por coherencia con
 * el resto del sitio y para que no intente prerenderizarse con datos que aún
 * no existen.
 */
export function PaginaLegal({
  titulo,
  ultimaActualizacion,
  secciones,
  puntosAbogado,
}: Props): React.ReactElement {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      <div className="tarjeta p-6 sm:p-8 mb-10">
        <p className="text-xs font-black uppercase tracking-widest border-[3px] border-ink bg-ink text-paper p-2 inline-block">
          BORRADOR — revisar con abogado antes de publicar
        </p>
        <h1 className="mt-4 text-display font-black uppercase tracking-tight leading-none">
          {titulo}
        </h1>
        <p className="mt-3 text-muted text-sm">
          Última actualización: {ultimaActualizacion}
        </p>
      </div>

      {secciones.map((seccion) => (
        <section key={seccion.titulo} className="mb-10">
          <h2 className="text-title font-black uppercase mb-3 tracking-tight">
            {seccion.titulo}
          </h2>
          <div className="space-y-4 text-base leading-relaxed">
            {seccion.parrafos.map((parrafo, i) => (
              <p key={i}>{parrafo}</p>
            ))}
          </div>
        </section>
      ))}

      <div className="mt-14 pt-8 border-t-[3px] border-ink">
        <h3 className="text-sm font-black uppercase mb-3 tracking-wide">
          Para revisar con el abogado antes de publicar
        </h3>
        <ul className="space-y-2 text-sm leading-relaxed list-disc pl-6">
          {puntosAbogado.map((punto, i) => (
            <li key={i}>{punto}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
