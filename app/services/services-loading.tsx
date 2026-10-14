/**
 * Skeleton fallback shown while ServicesContent streams in.
 * Matches the service card grid layout to minimise content shift.
 */
export function ServicesLoading() {
  return (
    <section className="py-14 sm:py-20" aria-label="Loading services">
      <div className="container mx-auto max-w-6xl px-4 sm:px-6">
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i}>
              <div className="flex h-full flex-col rounded-xl border border-border bg-background p-5">
                {/* Name + price row */}
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="h-4 w-32 rounded bg-muted animate-pulse" />
                  <div className="h-4 w-14 rounded bg-muted animate-pulse" />
                </div>
                {/* Description lines */}
                <div className="mb-4 flex-1 space-y-2">
                  <div className="h-3 w-full rounded bg-muted animate-pulse" />
                  <div className="h-3 w-4/5 rounded bg-muted animate-pulse" />
                </div>
                {/* Duration + CTA */}
                <div className="mt-auto flex items-center justify-between gap-2 pt-3 border-t border-border">
                  <div className="h-3 w-16 rounded bg-muted animate-pulse" />
                  <div className="h-7 w-24 rounded bg-muted animate-pulse" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
