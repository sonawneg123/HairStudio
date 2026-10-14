/**
 * Server-side data access for the public services catalogue.
 *
 * Uses the existing server Supabase client (anon key + cookies).
 * RLS policy `services_public_select` allows anonymous reads of active services.
 */

import { createClient } from "@/lib/supabase/server";
import type { ServiceRow } from "@/types/database";

/** Columns needed for public display — no sensitive data. */
export type PublicService = Pick<
  ServiceRow,
  "id" | "name" | "slug" | "description" | "duration_minutes" | "price" | "display_order"
>;

export type ServicesResult =
  | { ok: true; services: PublicService[] }
  | { ok: false; error: string };

/**
 * Fetches all active services, ordered by display_order then name.
 * Safe for Server Components — uses the server client with anon key.
 */
export async function getActiveServices(): Promise<ServicesResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("services")
    .select("id, name, slug, description, duration_minutes, price, display_order")
    .eq("is_active", true)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("[getActiveServices]", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true, services: data ?? [] };
}
