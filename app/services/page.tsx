import { Suspense } from "react";
import type { Metadata } from "next";
import { Scissors } from "lucide-react";

import { ServicesContent } from "./services-content";
import { ServicesLoading } from "./services-loading";

export const metadata: Metadata = {
  title: "Services",
  description:
    "Browse all haircut and grooming services offered at Raj Faded Studio. Transparent pricing, real durations.",
};

export default function ServicesPage() {
  return (
    <>
      {/* Page header — static shell, prerendered immediately */}
      <section className="bg-muted/30 py-14 sm:py-20">
        <div className="container mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-1.5 text-sm text-muted-foreground">
              <Scissors className="size-3.5" aria-hidden="true" />
              <span>Premium Grooming</span>
            </div>
            <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              Our Services
            </h1>
            <p className="text-lg text-muted-foreground">
              Every service is crafted with precision and care. Transparent
              pricing — no surprises.
            </p>
          </div>
        </div>
      </section>

      {/* Services listing — streams in once Supabase responds */}
      <Suspense fallback={<ServicesLoading />}>
        <ServicesContent />
      </Suspense>
    </>
  );
}
