import { Suspense } from "react";
import type { Metadata } from "next";
import { User } from "lucide-react";

import { BarbersContent } from "./barbers-content";
import { BarbersLoading } from "./barbers-loading";

export const metadata: Metadata = {
  title: "Our Barbers",
  description:
    "Meet the team at Raj Faded Studio. Discover which barbers perform your favourite services.",
};

export default function BarbersPage() {
  return (
    <>
      {/* Page header — static shell, prerendered immediately */}
      <section className="bg-muted/30 py-14 sm:py-20">
        <div className="container mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-1.5 text-sm text-muted-foreground">
              <User className="size-3.5" aria-hidden="true" />
              <span>The Team</span>
            </div>
            <h1 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              Our Barbers
            </h1>
            <p className="text-lg text-muted-foreground">
              Skilled professionals dedicated to making you look your best.
              <span className="block font-medium text-foreground mt-1">
                OWN YOUR STYLE.
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* Barbers listing — streams in once Supabase responds */}
      <Suspense fallback={<BarbersLoading />}>
        <BarbersContent />
      </Suspense>
    </>
  );
}
