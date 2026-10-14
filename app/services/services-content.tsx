import Link from "next/link";
import { Clock, AlertCircle, Scissors } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getActiveServices } from "@/lib/data/services";
import { formatPriceINR, formatDuration } from "@/lib/utils/format";

/**
 * Async Server Component — performs the Supabase fetch and renders the result.
 * Rendered inside a <Suspense> boundary in ServicesPage so the static header
 * shell can be prerendered while this streams in.
 */
export async function ServicesContent() {
  const result = await getActiveServices();

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
              <p className="font-medium">Unable to load services</p>
              <p className="mt-1 text-destructive/80">
                Please try refreshing the page. If the problem persists,
                contact us directly.
              </p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {result.ok && result.services.length === 0 && (
          <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
            <div className="mb-4 inline-flex size-14 items-center justify-center rounded-full bg-muted">
              <Scissors className="size-7 text-muted-foreground" aria-hidden="true" />
            </div>
            <h2 className="mb-2 text-lg font-semibold">No services available</h2>
            <p className="text-muted-foreground">
              We&apos;re updating our menu. Check back soon or{" "}
              <Link href="/contact" className="underline underline-offset-4 hover:text-foreground">
                contact us
              </Link>{" "}
              for availability.
            </p>
          </div>
        )}

        {/* Service cards */}
        {result.ok && result.services.length > 0 && (
          <ul
            className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
            aria-label="Available services"
          >
            {result.services.map((service) => (
              <li key={service.id}>
                <article className="flex h-full flex-col rounded-xl border border-border bg-background p-5 transition-colors hover:bg-muted/40">
                  {/* Name + price row */}
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <h2 className="text-base font-semibold leading-snug">
                      {service.name}
                    </h2>
                    <span className="shrink-0 text-sm font-semibold text-primary">
                      {formatPriceINR(service.price)}
                    </span>
                  </div>

                  {/* Description */}
                  {service.description && (
                    <p className="mb-4 flex-1 text-sm text-muted-foreground">
                      {service.description}
                    </p>
                  )}

                  {/* Duration + CTA */}
                  <div className="mt-auto flex items-center justify-between gap-2 pt-3 border-t border-border">
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="size-3.5" aria-hidden="true" />
                      {formatDuration(service.duration_minutes)}
                    </span>
                    <Button variant="outline" size="xs" asChild>
                      <Link href="/barbers">
                        Find a barber
                      </Link>
                    </Button>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}

        {/* Link to barbers */}
        {result.ok && result.services.length > 0 && (
          <div className="mt-14 rounded-xl border border-border bg-muted/30 p-8 text-center">
            <h2 className="mb-2 text-xl font-semibold">Ready to book?</h2>
            <p className="mb-6 text-muted-foreground">
              Browse our barbers to see who performs each service and book
              your preferred slot.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button asChild>
                <Link href="/barbers">Meet Our Barbers</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/book">Book an Appointment</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
