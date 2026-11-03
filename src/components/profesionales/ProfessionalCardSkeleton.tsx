export function ProfessionalCardSkeleton(): React.ReactElement {
  return (
    <div
      data-testid="professional-card-skeleton"
      aria-hidden="true"
      className="tarjeta flex h-full flex-col motion-safe:animate-pulse"
    >
      <div className="aspect-[4/3] w-full border-b-[3px] border-ink bg-ink/10" />

      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          <span className="h-6 w-36 bg-ink/10" />
          <span className="h-6 w-32 bg-ink/10" />
        </div>

        <div className="flex items-start gap-3">
          <span className="h-12 w-12 shrink-0 bg-ink/10" />
          <div className="flex-1 space-y-2">
            <span className="block h-8 w-3/4 bg-ink/10" />
            <span className="block h-3 w-1/2 bg-ink/10" />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="h-6 w-24 bg-ink/10" />
          <span className="h-6 w-28 bg-ink/10" />
        </div>

        <div className="space-y-2">
          <span className="block h-4 w-2/3 bg-ink/10" />
          <span className="block h-4 w-1/2 bg-ink/10" />
        </div>

        <div className="mt-auto space-y-2">
          <span className="block h-[50px] w-16 bg-ink/10" />
          <span className="block h-[50px] w-full bg-ink/10" />
          <span className="block h-[50px] w-full bg-ink/10" />
        </div>
      </div>
    </div>
  )
}
