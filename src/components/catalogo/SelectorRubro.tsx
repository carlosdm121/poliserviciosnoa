"use client"

import type { GrupoCatalogo } from '@/services/catalogo'

interface SelectorRubroProps {
  etiqueta: string
  grupos: GrupoCatalogo[]
  valor: string
  onChange: (id: string) => void
  requerido?: boolean
  excluir?: string
  ayuda?: string
}

export function SelectorRubro({
  etiqueta,
  grupos,
  valor,
  onChange,
  requerido = false,
  excluir,
  ayuda,
}: SelectorRubroProps): React.ReactElement {
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