/**
 * Skeleton fallback shown while BarbersContent streams in.
 * Matches the barber card grid layout to minimise content shift.
 */
export function BarbersLoading() {
  return (
    <section className="py-14 sm:py-20" aria-label="Loading barbers">
      <div className="container mx-auto max-w-6xl px-4 sm:px-6">
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i}>
              <div className="flex h-full flex-col rounded-xl border border-border bg-background overflow-hidden">
                {/* Avatar placeholder */}
                <div className="flex items-center justify-center bg-muted/60 px-6 pt-8 pb-4">
                  <div className="size-24 rounded-full bg-muted animate-pulse border-2 border-border" />
                </div>
                {/* Name + bio */}
                <div className="flex flex-1 flex-col p-5">
                  <div className="mb-3 h-4 w-32 rounded bg-muted animate-pulse" />
                  <div className="mb-4 space-y-2">
                    <div className="h-3 w-full rounded bg-muted animate-pulse" />
                    <div className="h-3 w-4/5 rounded bg-muted animate-pulse" />
                  </div>
                  {/* Service rows placeholder */}
                  <div className="mt-auto space-y-1.5">
                    {Array.from({ length: 3 }).map((_, j) => (
                      <div
                        key={j}
                        className="h-7 rounded-md bg-muted animate-pulse"
                      />
                    ))}
                  </div>
                  {/* CTA placeholder */}
                  <div className="mt-5 pt-4 border-t border-border">
                    <div className="h-9 w-full rounded bg-muted animate-pulse" />
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
