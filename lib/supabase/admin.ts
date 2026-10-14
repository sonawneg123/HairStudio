/**
 * Service-role Supabase client — SERVER-SIDE ONLY.
 *
 * This client bypasses Row Level Security and must never be used in
 * browser code, client components, or any path that ends up in the
 * Next.js client bundle. It must only be imported from:
 *   - Server Actions ("use server")
 *   - Route Handlers (app/api/**)
 *   - Server Components that explicitly need admin operations
 *
 * The service-role key has full database access. Treat it like a root
 * password: keep it in a server-side environment variable without the
 * NEXT_PUBLIC_ prefix, and never log, return, or expose it.
 *
 * Usage:
 *   const adminClient = createAdminClient();
 *   await adminClient.auth.admin.createUser({ ... });
 */

import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * Creates a Supabase client authenticated with the service-role key.
 *
 * Must only be called from server-side code.
 * Requires SUPABASE_SERVICE_ROLE_KEY to be set.
 *
 * @throws If SUPABASE_SERVICE_ROLE_KEY is not set.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error(
      "[supabase/admin] NEXT_PUBLIC_SUPABASE_URL is not set."
    );
  }
  if (!serviceRoleKey) {
    throw new Error(
      "[supabase/admin] SUPABASE_SERVICE_ROLE_KEY is not set. " +
        "Set it in your server environment (never prefix with NEXT_PUBLIC_)."
    );
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      // Disable automatic session persistence — the admin client must not
      // store any session in storage or cookies. It is used only for
      // one-off admin operations and discarded after each request.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
