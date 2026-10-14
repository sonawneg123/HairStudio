import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/types/database";

/**
 * Creates a Supabase client for use in browser (client) components.
 * Safe to call on every render — createBrowserClient is a singleton under the hood.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
