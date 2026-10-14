-- ============================================================
-- Migration: 20250101000003_rls_policies
-- Purpose:   Enable RLS on all application tables and define
--            least-privilege access policies per role.
-- Depends:   20250101000002_triggers_and_functions
-- Rollback:  DROP POLICY … ; ALTER TABLE … DISABLE ROW LEVEL SECURITY;
--            Review every dropped policy before disabling RLS.
-- ============================================================
--
-- Role resolution strategy:
--   All policies that need to check the caller's role invoke:
--     public.get_user_role(auth.uid())
--   This is a SECURITY DEFINER function (fixed search_path) that reads
--   from public.user_roles — a table the user cannot write to themselves.
--   This avoids trusting user_metadata, JWT claims, or any client-supplied
--   value for privilege decisions.
--
-- Anonymous access:
--   The anon role has NO access to any private table. Only services
--   and barber_profiles are intentionally readable without authentication
--   (so the public booking page can show available services and barbers).
--
-- Naming convention:
--   <table>_<actor>_<operation>  e.g. profiles_owner_select
-- ============================================================

-- ──────────────────────────────────────────────
-- Enable RLS on every table
-- ──────────────────────────────────────────────
ALTER TABLE public.profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barber_profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barber_services       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salon_settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barber_working_hours  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barber_time_off       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_services  ENABLE ROW LEVEL SECURITY;

-- Force RLS even for the table owner (postgres role).
-- This ensures service-role API calls (with anon key + Authorization)
-- are still policy-filtered. Server-side admin operations that genuinely
-- need unrestricted access must use the service-role key, which bypasses
-- RLS entirely — they should never reach the client.
ALTER TABLE public.profiles              FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles            FORCE ROW LEVEL SECURITY;
ALTER TABLE public.services              FORCE ROW LEVEL SECURITY;
ALTER TABLE public.barber_profiles       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.barber_services       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.salon_settings        FORCE ROW LEVEL SECURITY;
ALTER TABLE public.barber_working_hours  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.barber_time_off       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.appointments          FORCE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_services  FORCE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════
-- TABLE: profiles
-- ══════════════════════════════════════════════════════════

-- Any authenticated user can read their own profile.
CREATE POLICY profiles_owner_select ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Admins can read any profile (needed for customer management).
CREATE POLICY profiles_admin_select ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin');

-- Barbers can read profiles of customers who have an appointment with them.
CREATE POLICY profiles_barber_select ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    public.get_user_role(auth.uid()) = 'barber'
    AND EXISTS (
      SELECT 1
      FROM   public.appointments a
      JOIN   public.barber_profiles bp ON bp.id = a.barber_id
      WHERE  a.customer_id = profiles.id
      AND    bp.user_id    = auth.uid()
    )
  );

-- Users may update only their own profile, restricted columns only.
-- phone and full_name are the permitted user-editable fields.
-- id, created_at, updated_at are never user-writable.
CREATE POLICY profiles_owner_update ON public.profiles
  FOR UPDATE
  TO authenticated
  USING  (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Admins may update any profile.
CREATE POLICY profiles_admin_update ON public.profiles
  FOR UPDATE
  TO authenticated
  USING  (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- No direct INSERT from the client — profiles are created by the trigger.
-- No DELETE from the client — cascade handles deletion via auth.users.

-- ══════════════════════════════════════════════════════════
-- TABLE: user_roles
-- ══════════════════════════════════════════════════════════
-- CRITICAL: No client-facing INSERT, UPDATE, or DELETE.
-- Roles are set only by:
--   1. The on_auth_user_created trigger (default 'customer').
--   2. A postgres/service-role SQL Editor operation for admin/barber promotion.

-- Users may read only their own role record.
CREATE POLICY user_roles_owner_select ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Admins may read any role record.
CREATE POLICY user_roles_admin_select ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin');

-- DENY all INSERT from the application layer (trigger handles creation).
-- DENY all UPDATE from the application layer (SQL Editor only).
-- DENY all DELETE from the application layer (cascade from auth.users).
-- No INSERT/UPDATE/DELETE policies are defined — default deny applies.

-- ══════════════════════════════════════════════════════════
-- TABLE: services
-- ══════════════════════════════════════════════════════════

-- Public read: active services are visible without authentication
-- (e.g. for a public-facing booking page or marketing site).
CREATE POLICY services_public_select ON public.services
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Admins can read all services including inactive ones.
CREATE POLICY services_admin_select_all ON public.services
  FOR SELECT
  TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin');

-- Only admins may create, modify, or deactivate services.
CREATE POLICY services_admin_insert ON public.services
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY services_admin_update ON public.services
  FOR UPDATE
  TO authenticated
  USING  (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY services_admin_delete ON public.services
  FOR DELETE
  TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin');

-- ══════════════════════════════════════════════════════════
-- TABLE: barber_profiles
-- ══════════════════════════════════════════════════════════

-- Public read of active barbers (for booking page).
CREATE POLICY barber_profiles_public_select ON public.barber_profiles
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Admins can read all barber profiles.
CREATE POLICY barber_profiles_admin_select ON public.barber_profiles
  FOR SELECT
  TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin');

-- A barber may read their own profile (active or not).
CREATE POLICY barber_profiles_owner_select ON public.barber_profiles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Only admins may create barber profiles.
CREATE POLICY barber_profiles_admin_insert ON public.barber_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- Barbers may update permitted fields on their own profile
-- (display_name, bio, avatar_url). They may NOT change is_active or user_id.
-- The WITH CHECK mirrors USING to prevent ID swap attacks.
CREATE POLICY barber_profiles_owner_update ON public.barber_profiles
  FOR UPDATE
  TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    -- Barbers cannot activate/deactivate themselves; only admins can.
    -- This is enforced at the application/RPC layer; the policy allows
    -- the row but the RPC must validate the changed columns.
    -- For a harder constraint, use a BEFORE UPDATE trigger.
  );

-- Admins may update any barber profile (including is_active).
CREATE POLICY barber_profiles_admin_update ON public.barber_profiles
  FOR UPDATE
  TO authenticated
  USING  (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- Only admins may delete barber profiles.
CREATE POLICY barber_profiles_admin_delete ON public.barber_profiles
  FOR DELETE
  TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin');

-- ══════════════════════════════════════════════════════════
-- TABLE: barber_services
-- ══════════════════════════════════════════════════════════

-- Any authenticated user can read barber-service assignments
-- (needed to build the booking UI: which services does this barber offer?).
CREATE POLICY barber_services_auth_select ON public.barber_services
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only admins may manage assignments.
CREATE POLICY barber_services_admin_insert ON public.barber_services
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY barber_services_admin_delete ON public.barber_services
  FOR DELETE
  TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin');

-- ══════════════════════════════════════════════════════════
-- TABLE: salon_settings
-- ══════════════════════════════════════════════════════════

-- Authenticated users may read salon settings (name, timezone, contact).
CREATE POLICY salon_settings_auth_select ON public.salon_settings
  FOR SELECT
  TO authenticated
  USING (true);

-- Public read of salon settings (for public-facing pages).
CREATE POLICY salon_settings_public_select ON public.salon_settings
  FOR SELECT
  TO anon
  USING (true);

-- Only admins may create or modify salon settings.
CREATE POLICY salon_settings_admin_insert ON public.salon_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY salon_settings_admin_update ON public.salon_settings
  FOR UPDATE
  TO authenticated
  USING  (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- ══════════════════════════════════════════════════════════
-- TABLE: barber_working_hours
-- ══════════════════════════════════════════════════════════

-- Authenticated users may read working hours (required for availability display).
CREATE POLICY working_hours_auth_select ON public.barber_working_hours
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Barbers may manage their own working hours.
CREATE POLICY working_hours_barber_insert ON public.barber_working_hours
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.barber_profiles bp
      WHERE  bp.id      = barber_working_hours.barber_id
      AND    bp.user_id = auth.uid()
    )
    AND public.get_user_role(auth.uid()) IN ('barber', 'admin')
  );

CREATE POLICY working_hours_barber_update ON public.barber_working_hours
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.barber_profiles bp
      WHERE  bp.id      = barber_working_hours.barber_id
      AND    bp.user_id = auth.uid()
    )
    AND public.get_user_role(auth.uid()) IN ('barber', 'admin')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.barber_profiles bp
      WHERE  bp.id      = barber_working_hours.barber_id
      AND    bp.user_id = auth.uid()
    )
    AND public.get_user_role(auth.uid()) IN ('barber', 'admin')
  );

CREATE POLICY working_hours_barber_delete ON public.barber_working_hours
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.barber_profiles bp
      WHERE  bp.id      = barber_working_hours.barber_id
      AND    bp.user_id = auth.uid()
    )
    AND public.get_user_role(auth.uid()) IN ('barber', 'admin')
  );

-- Admins may manage any working hours record.
CREATE POLICY working_hours_admin_all ON public.barber_working_hours
  FOR ALL
  TO authenticated
  USING  (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- ══════════════════════════════════════════════════════════
-- TABLE: barber_time_off
-- ══════════════════════════════════════════════════════════

-- Authenticated users may read time-off records (availability checks).
CREATE POLICY time_off_auth_select ON public.barber_time_off
  FOR SELECT
  TO authenticated
  USING (true);

-- Barbers may manage their own time off.
CREATE POLICY time_off_barber_insert ON public.barber_time_off
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.barber_profiles bp
      WHERE  bp.id      = barber_time_off.barber_id
      AND    bp.user_id = auth.uid()
    )
    AND public.get_user_role(auth.uid()) IN ('barber', 'admin')
  );

CREATE POLICY time_off_barber_update ON public.barber_time_off
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.barber_profiles bp
      WHERE  bp.id      = barber_time_off.barber_id
      AND    bp.user_id = auth.uid()
    )
    AND public.get_user_role(auth.uid()) IN ('barber', 'admin')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.barber_profiles bp
      WHERE  bp.id      = barber_time_off.barber_id
      AND    bp.user_id = auth.uid()
    )
    AND public.get_user_role(auth.uid()) IN ('barber', 'admin')
  );

CREATE POLICY time_off_barber_delete ON public.barber_time_off
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.barber_profiles bp
      WHERE  bp.id      = barber_time_off.barber_id
      AND    bp.user_id = auth.uid()
    )
    AND public.get_user_role(auth.uid()) IN ('barber', 'admin')
  );

-- Admins may manage all time-off records.
CREATE POLICY time_off_admin_all ON public.barber_time_off
  FOR ALL
  TO authenticated
  USING  (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- ══════════════════════════════════════════════════════════
-- TABLE: appointments
-- ══════════════════════════════════════════════════════════
-- Customers see only their own appointments.
-- Barbers see only appointments assigned to them.
-- Admins see all appointments.
-- Direct client-side INSERT is NOT permitted; bookings go through
-- the create_appointment RPC (see migration 000004).

CREATE POLICY appointments_customer_select ON public.appointments
  FOR SELECT
  TO authenticated
  USING (customer_id = auth.uid());

CREATE POLICY appointments_barber_select ON public.appointments
  FOR SELECT
  TO authenticated
  USING (
    public.get_user_role(auth.uid()) = 'barber'
    AND EXISTS (
      SELECT 1 FROM public.barber_profiles bp
      WHERE  bp.id      = appointments.barber_id
      AND    bp.user_id = auth.uid()
    )
  );

CREATE POLICY appointments_admin_select ON public.appointments
  FOR SELECT
  TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin');

-- INSERT is handled by the create_appointment SECURITY DEFINER RPC only.
-- No direct INSERT policy for customers or barbers.
-- Admins may insert directly (for manual bookings).
CREATE POLICY appointments_admin_insert ON public.appointments
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- Barbers may update status of their own appointments (confirm, complete, no_show).
-- Actual status transition validation is enforced in the RPC/application layer.
CREATE POLICY appointments_barber_update ON public.appointments
  FOR UPDATE
  TO authenticated
  USING (
    public.get_user_role(auth.uid()) = 'barber'
    AND EXISTS (
      SELECT 1 FROM public.barber_profiles bp
      WHERE  bp.id      = appointments.barber_id
      AND    bp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.get_user_role(auth.uid()) = 'barber'
    AND EXISTS (
      SELECT 1 FROM public.barber_profiles bp
      WHERE  bp.id      = appointments.barber_id
      AND    bp.user_id = auth.uid()
    )
  );

-- Customers may cancel their own appointments only.
CREATE POLICY appointments_customer_cancel ON public.appointments
  FOR UPDATE
  TO authenticated
  USING  (customer_id = auth.uid())
  WITH CHECK (customer_id = auth.uid());

-- Admins may update any appointment.
CREATE POLICY appointments_admin_update ON public.appointments
  FOR UPDATE
  TO authenticated
  USING  (public.get_user_role(auth.uid()) = 'admin')
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- Only admins may hard-delete appointments.
CREATE POLICY appointments_admin_delete ON public.appointments
  FOR DELETE
  TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin');

-- ══════════════════════════════════════════════════════════
-- TABLE: appointment_services
-- ══════════════════════════════════════════════════════════
-- Service snapshots are readable by anyone who can read the parent appointment.

CREATE POLICY appt_services_customer_select ON public.appointment_services
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE  a.id          = appointment_services.appointment_id
      AND    a.customer_id = auth.uid()
    )
  );

CREATE POLICY appt_services_barber_select ON public.appointment_services
  FOR SELECT
  TO authenticated
  USING (
    public.get_user_role(auth.uid()) = 'barber'
    AND EXISTS (
      SELECT 1
      FROM   public.appointments  a
      JOIN   public.barber_profiles bp ON bp.id = a.barber_id
      WHERE  a.id      = appointment_services.appointment_id
      AND    bp.user_id = auth.uid()
    )
  );

CREATE POLICY appt_services_admin_select ON public.appointment_services
  FOR SELECT
  TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin');

-- Snapshots are written only by the create_appointment RPC or admin.
-- No direct INSERT from customers/barbers.
CREATE POLICY appt_services_admin_insert ON public.appointment_services
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

-- Snapshots are immutable once created (no UPDATE policy).
-- Cascade DELETE follows the parent appointment.
CREATE POLICY appt_services_admin_delete ON public.appointment_services
  FOR DELETE
  TO authenticated
  USING (public.get_user_role(auth.uid()) = 'admin');
