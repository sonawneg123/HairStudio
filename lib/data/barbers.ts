/**
 * Server-side data access for public barber discovery.
 *
 * Uses the existing server Supabase client (anon key + cookies).
 * RLS policies allow anonymous reads of:
 *   - barber_profiles WHERE is_active = true
 *   - barber_services (full read, USING (true))
 *   - services WHERE is_active = true
 *
 * NOTE: The hand-written Database type does not carry Supabase's
 * relationship metadata, so nested select type inference is unavailable.
 * We use two explicit queries (barber_profiles, then barber_services join
 * services) and merge the results in TypeScript — still a single round-trip
 * per query, not an N+1.
 */

import { createClient } from "@/lib/supabase/server";
import type { BarberProfileRow, BarberServiceRow, ServiceRow } from "@/types/database";

/** Public-safe columns from barber_profiles. Intentionally excludes user_id. */
export type PublicBarber = Pick<
  BarberProfileRow,
  "id" | "display_name" | "bio" | "avatar_url"
>;

/** Minimal service info shown on a barber's profile card. */
export type BarberServiceInfo = Pick<
  ServiceRow,
  "id" | "name" | "slug" | "duration_minutes" | "price"
>;

/** A barber with their assigned active services. */
export interface PublicBarberWithServices extends PublicBarber {
  services: BarberServiceInfo[];
}

export type BarbersResult =
  | { ok: true; barbers: PublicBarberWithServices[] }
  | { ok: false; error: string };

/**
 * Fetches all active barber profiles with their assigned active services.
 *
 * Two queries:
 *   1. All active barber_profiles (select public-safe columns only).
 *   2. All barber_services rows joined to active services for those barbers.
 *
 * Merged in memory — avoids N+1 while staying compatible with the
 * hand-written Database type that lacks Supabase relationship metadata.
 */
export async function getActiveBarbersWithServices(): Promise<BarbersResult> {
  const supabase = await createClient();

  // Query 1: active barber profiles (public-safe columns only; user_id excluded).
  const { data: profileData, error: profileError } = await supabase
    .from("barber_profiles")
    .select("id, display_name, bio, avatar_url")
    .eq("is_active", true)
    .order("display_name", { ascending: true })
    .returns<PublicBarber[]>();

  if (profileError) {
    console.error("[getActiveBarbersWithServices:profiles]", profileError.message);
    return { ok: false, error: profileError.message };
  }

  const profiles = profileData ?? [];
  if (profiles.length === 0) {
    return { ok: true, barbers: [] };
  }

  const barberIds = profiles.map((p) => p.id);

  // Query 2: barber_services rows + service details for the active barbers.
  // The barber_services RLS allows anon reads; services RLS returns only is_active=true.
  type BarberServiceJoinRow = Pick<BarberServiceRow, "barber_id"> & {
    services: BarberServiceInfo | null;
  };

  const { data: assignmentData, error: assignmentError } = await supabase
    .from("barber_services")
    .select("barber_id, services(id, name, slug, duration_minutes, price)")
    .in("barber_id", barberIds)
    .returns<BarberServiceJoinRow[]>();

  if (assignmentError) {
    console.error("[getActiveBarbersWithServices:barber_services]", assignmentError.message);
    return { ok: false, error: assignmentError.message };
  }

  // Build a map: barber_id → BarberServiceInfo[]
  const servicesByBarber = new Map<string, BarberServiceInfo[]>();
  for (const row of assignmentData ?? []) {
    if (!row.services) continue;
    const existing = servicesByBarber.get(row.barber_id) ?? [];
    existing.push(row.services);
    servicesByBarber.set(row.barber_id, existing);
  }

  const barbers: PublicBarberWithServices[] = profiles.map((profile) => {
    const svcs = servicesByBarber.get(profile.id) ?? [];
    // Sort services alphabetically for consistent display.
    svcs.sort((a, b) => a.name.localeCompare(b.name));
    return { ...profile, services: svcs };
  });

  return { ok: true, barbers };
}
