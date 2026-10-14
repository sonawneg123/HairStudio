import Link from "next/link";
import { User, AlertCircle, Scissors, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getActiveBarbersWithServices } from "@/lib/data/barbers";
import { formatPriceINR, formatDuration } from "@/lib/utils/format";

/**
 * Async Server Component — performs the Supabase fetch and renders the result.
 * Rendered inside a <Suspense> boundary in BarbersPage so the static header
 * shell can be prerendered while this streams in.
 */
export async function BarbersContent() {
  const result = await getActiveBarbersWithServices();

  return (
    <section className="py-14 sm:py-20">
      <div className="container mx-auto max-w-6xl px-4 sm:px-6">

        {/* Database error */}
        {!result.ok && (
          <div
            role="alert"
            className="mx-auto flex max-w-lg items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium">Unable to load barber profiles</p>
              <p className="mt-1 text-destructive/80">
                Please try refreshing the page. If the problem persists,
                contact us directly.
              </p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {result.ok && result.barbers.length === 0 && (
          <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
            <div className="mb-4 inline-flex size-14 items-center justify-center rounded-full bg-muted">
              <User className="size-7 text-muted-foreground" aria-hidden="true" />
            </div>
            <h2 className="mb-2 text-lg font-semibold">Team profiles coming soon</h2>
            <p className="text-muted-foreground">
              We&apos;re setting up our barber profiles. In the meantime,{" "}
              <Link
                href="/book"
                className="underline underline-offset-4 hover:text-foreground"
              >
                book an appointment
              </Link>{" "}
              and we&apos;ll assign you to an available barber.
            </p>
          </div>
        )}

        {/* Barber cards */}
        {result.ok && result.barbers.length > 0 && (
          <ul
            className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
            aria-label="Our barbers"
          >
            {result.barbers.map((barber) => (
              <li key={barber.id}>
                <article className="flex h-full flex-col rounded-xl border border-border bg-background overflow-hidden">
                  {/* Avatar */}
                  <div className="flex items-center justify-center bg-muted/60 px-6 pt-8 pb-4">
                    {barber.avatar_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={barber.avatar_url}
                        alt={barber.display_name}
                        className="size-24 rounded-full object-cover border-2 border-border"
                        loading="lazy"
                      />
                    ) : (
                      <div
                        className="size-24 rounded-full bg-muted border-2 border-border flex items-center justify-center"
                        aria-hidden="true"
                      >
                        <User className="size-10 text-muted-foreground" />
                      </div>
                    )}
                  </div>

                  {/* Name + bio */}
                  <div className="flex flex-1 flex-col p-5">
                    <h2 className="mb-1 text-base font-semibold">
                      {barber.display_name}
                    </h2>
                    {barber.bio && (
                      <p className="mb-4 text-sm text-muted-foreground leading-relaxed">
                        {barber.bio}
                      </p>
                    )}

                    {/* Assigned services */}
                    {barber.services.length > 0 ? (
                      <div className="mt-auto">
                        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Services offered
                        </p>
                        <ul className="space-y-1.5" aria-label={`Services by ${barber.display_name}`}>
                          {barber.services.map((svc) => (
                            <li
                              key={svc.id}
                              className="flex items-center justify-between text-xs rounded-md bg-muted/50 px-2.5 py-1.5"
                            >
                              <span className="flex items-center gap-1.5 font-medium">
                                <Scissors className="size-3 text-muted-foreground shrink-0" aria-hidden="true" />
                                {svc.name}
                              </span>
                              <span className="flex items-center gap-2 text-muted-foreground shrink-0 ml-2">
                                <span className="flex items-center gap-1">
                                  <Clock className="size-3" aria-hidden="true" />
                                  {formatDuration(svc.duration_minutes)}
                                </span>
                                <span className="font-medium text-primary">
                                  {formatPriceINR(svc.price)}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="mt-auto text-xs text-muted-foreground">
                        Services will be listed soon.
                      </p>
                    )}

                    {/* Book CTA */}
                    <div className="mt-5 pt-4 border-t border-border">
                      <Button className="w-full" asChild>
                        <Link href="/book">
                          Book an Appointment
                        </Link>
                      </Button>
                    </div>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}

        {/* Cross-link to services */}
        {result.ok && result.barbers.length > 0 && (
          <div className="mt-14 text-center">
            <p className="text-muted-foreground">
              Not sure which service you need?{" "}
              <Link
                href="/services"
                className="font-medium text-foreground underline underline-offset-4 hover:text-primary transition-colors"
              >
                Browse our full services menu →
              </Link>
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
