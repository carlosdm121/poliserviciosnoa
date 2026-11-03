import { ProfessionalCardSkeleton } from '@/components/profesionales/ProfessionalCardSkeleton'

/**
 * Esqueleto de la home mientras se carga el catálogo y el conteo de perfiles.
 *
 * La home es `force-dynamic`: depende de la base de datos, así que en redes
 * lentas puede tardar un instante. El esqueleto evita el salto de layout y
 * da feedback inmediato.
 */
export default function LoadingHome(): React.ReactElement {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:py-20">
      <div className="space-y-10">
        <div className="h-12 w-2/3 bg-ink/10 rounded-none" />
        <div className="h-16 w-full max-w-4xl bg-ink/10 rounded-none" />
        <div className="h-6 w-1/2 bg-ink/10 rounded-none" />
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <h2 className="h-10 w-1/3 bg-ink/10 rounded-none" />
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 5 }).map((_, j) => (
                  <div key={j} className="h-8 w-24 bg-ink/10 rounded-none" />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <ProfessionalCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  )
}
