import Link from 'next/link'

import type { Paso } from '@/services/panel'

/**
 * Checklist de publicación.
 *
 * Es lo primero que ve el profesional al entrar, porque contesta la pregunta que
 * se hace al entrar: "¿por qué no me aparece nadie?".
 *
 * Dos decisiones de diseño que importan más que el estilo:
 *
 * 1. **Separa lo que se puede resolver de lo que no.** Una revisión pendiente
 *    o una suspensión dependen del administrador. Ponerles un botón "Resolver"
 *    que lleva a una pantalla donde no se puede hacer nada hace que el
 *    profesional haga el recorrido, vuelva a estar igual y llame a soporte
 *    preguntando por qué.
 * 2. **Cada motivo sale de `evaluarPublicacion`.** El checklist no tiene su
 *    propia lógica: si acá dijera "todo listo" y el perfil no aparece, el
 *    profesional pierde la confianza en la plataforma y con razón.
 */
export function PanelPasos({ pasos }: { pasos: Paso[] }): React.ReactElement {
  if (pasos.length === 0) return <></>

  const total = TOTAL_REQUISITOS
  const hechos = Math.max(0, total - pasos.length)

  return (
    <section aria-labelledby="titulo-pasos" className="tarjeta p-6">
      <h2 id="titulo-pasos" className="text-xl font-black uppercase">
        Para publicar tu perfil
      </h2>

      <p className="mt-2 text-muted">
        {hechos} de {total} listos. {pasos.length === 1 ? 'Te falta 1.' : `Te faltan ${pasos.length}.`}
      </p>

      {/* Barra de avance. La longitud refleja los requisitos reales, no una
          animación motivated: si el perfil tiene 5 requisitos y le faltan 2,
          la barra tiene que mostrar exactamente eso. */}
      <div
        role="progressbar"
        aria-valuenow={hechos}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label="Progreso para publicar el perfil"
        className="mt-4 h-4 border-[3px] border-ink"
      >
        <div className="h-full bg-ink" style={{ width: `${(hechos / total) * 100}%` }} />
      </div>

      <ol className="mt-6 space-y-3">
        {pasos.map((paso, indice) => (
          <li key={paso.motivo} className="border-l-[3px] border-ink pl-4">
            <div className="flex items-start gap-3">
              {/* Número en un cuadro: el listado se lee de un vistazo sin
                  tener que interpretar viñetas. */}
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center border-[3px] border-ink font-black"
              >
                {indice + 1}
              </span>

              <div className="min-w-0 flex-1">
                <p className="leading-snug">{paso.texto}</p>

                {paso.resoluble ? (
                  <Link
                    href={paso.href}
                    className="mt-2 inline-flex min-h-[44px] items-center font-bold underline"
                  >
                    Resolver →
                  </Link>
                ) : (
                  <p className="mt-2 text-sm font-bold text-muted">
                    Lo revisamos nosotros. No tenés que hacer nada.
                  </p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

/**
 * Requisitos que tiene que cumplir un perfil para publicarse.
 *
 * Tiene que coincidir con las condiciones de `evaluarPublicacion`. Va
 * explícito en vez de derivarse porque el texto de la barra es para el
 * usuario: "4 de 6" tiene que significar algo, y si se calcula con una
 * operación distinta a la regla, un día significará otra cosa.
 */
const TOTAL_REQUISITOS = 6