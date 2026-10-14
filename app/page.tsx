import Link from "next/link";
import { Scissors, CalendarCheck, Star, Clock, AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getActiveServices } from "@/lib/data/services";
import { formatPriceINR, formatDuration } from "@/lib/utils/format";

const features = [
  {
    icon: CalendarCheck,
    title: "Easy Online Booking",
    description:
      "Schedule your appointment 24/7 from any device. Pick your preferred barber, service, and time slot in minutes.",
  },
  {
    icon: Star,
    title: "Expert Stylists",
    description:
      "Our team of certified barbers brings years of experience and passion to every cut, style, and treatment.",
  },
  {
    icon: Clock,
    title: "No Waiting",
    description:
      "Your time is valuable. Arrive at your appointment time and we'll be ready for you — every time.",
  },
];

export default async function HomePage() {
  const result = await getActiveServices();

  // Show at most 6 services in the homepage preview; link to /services for the rest.
  const previewServices =
    result.ok ? result.services.slice(0, 6) : [];

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-background py-20 sm:py-28">
        <div className="container mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-muted px-4 py-1.5 text-sm text-muted-foreground">
              <Scissors className="size-3.5" aria-hidden="true" />
              <span>Premium Hair &amp; Beard Services</span>
            </div>
            <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Look Your Best,{" "}
              <span className="text-primary">Every Time</span>
            </h1>
            <p className="mb-10 text-lg text-muted-foreground">
              Book your next appointment at Raj Faded Studio — where skilled
              barbers craft the perfect look, tailored just for you.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button size="lg" asChild>
                <Link href="/book">Book an Appointment</Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href="/services">See Our Services</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-muted/30 py-16 sm:py-20">
        <div className="container mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="mb-12 text-center text-2xl font-semibold tracking-tight sm:text-3xl">
            Why clients choose us
          </h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <article
                  key={feature.title}
                  className="rounded-xl border border-border bg-background p-6 shadow-sm"
                >
                  <div className="mb-4 inline-flex size-10 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="size-5 text-primary" aria-hidden="true" />
                  </div>
                  <h3 className="mb-2 font-semibold">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* Services preview */}
      <section className="py-16 sm:py-20">
        <div className="container mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mb-12 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Our Services
            </h2>
            <Button variant="outline" size="sm" asChild>
              <Link href="/services">View all services</Link>
            </Button>
          </div>

          {/* Error state */}
          {!result.ok && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p>Unable to load services right now. Please try again later.</p>
            </div>
          )}

          {/* Empty state */}
          {result.ok && previewServices.length === 0 && (
            <p className="text-muted-foreground">
              No services are currently available. Check back soon.
            </p>
          )}

          {/* Service cards */}
          {previewServices.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {previewServices.map((service) => (
                <div
                  key={service.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-background p-4 transition-colors hover:bg-muted/50"
                >
                  <div>
                    <p className="font-medium">{service.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDuration(service.duration_minutes)}
                    </p>
                  </div>
                  <p className="text-sm font-medium text-primary">
                    {formatPriceINR(service.price)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* CTA Banner */}
      <section className="bg-primary py-16 sm:py-20">
        <div className="container mx-auto max-w-6xl px-4 text-center sm:px-6">
          <h2 className="mb-4 text-2xl font-semibold tracking-tight text-primary-foreground sm:text-3xl">
            Ready to book your appointment?
          </h2>
          <p className="mb-8 text-primary-foreground/80">
            Join hundreds of happy clients. Reserve your spot in under 60
            seconds.
          </p>
          <Button
            variant="secondary"
            size="lg"
            asChild
          >
            <Link href="/book">Book Now — It&apos;s Free</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
