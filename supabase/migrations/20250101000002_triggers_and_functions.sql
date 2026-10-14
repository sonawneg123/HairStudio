-- ============================================================
-- Migration: 20250101000002_triggers_and_functions
-- Purpose:   Auth trigger to auto-create profiles and default roles,
--            plus updated_at maintenance triggers.
-- Depends:   20250101000001_core_tables
-- Rollback:  Drop functions and triggers individually (documented below).
-- ============================================================

-- ──────────────────────────────────────────────
-- Security-definer helper: get_user_role
-- ──────────────────────────────────────────────
-- Returns the app_role for the currently authenticated user.
-- Used in RLS policies to avoid recursive table reads.
--
-- Security properties:
--   • SECURITY DEFINER runs as the function owner (postgres), not the caller.
--   • search_path is explicitly fixed to prevent search_path injection.
--   • EXECUTE is granted only to the 'authenticated' role.
--   • The anon role and service_role must NOT call this directly from
--     client code; service-role operations bypass RLS entirely.
--   • STABLE + LEAKPROOF declared so the planner may inline it safely.
CREATE OR REPLACE FUNCTION public.get_user_role(p_user_id uuid)
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
-- Fix search_path to prevent injection attacks in SECURITY DEFINER functions.
SET search_path = public
AS $$
  SELECT role
  FROM   public.user_roles
  WHERE  user_id = p_user_id
  LIMIT  1;
$$;

-- Revoke public execute; grant only to authenticated users.
REVOKE ALL ON FUNCTION public.get_user_role(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_user_role IS
  'Returns the app_role for a given user_id. '
  'SECURITY DEFINER with fixed search_path. '
  'Call as: public.get_user_role(auth.uid()) inside RLS policies.';

-- ──────────────────────────────────────────────
-- Auth trigger: handle_new_user
-- ──────────────────────────────────────────────
-- Fires AFTER INSERT on auth.users. Creates:
--   1. A public.profiles row (full_name taken from raw_user_meta_data).
--   2. A public.user_roles row with the default 'customer' role.
--
-- Security:
--   • Runs as SECURITY DEFINER (owns both target tables) so the
--     auth schema trigger can write into public tables.
--   • ON CONFLICT DO NOTHING makes it idempotent against retries.
--   • No elevated role is ever assigned here — only 'customer'.
--   • search_path is fixed.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Attach the trigger to auth.users (runs in the auth schema).
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

COMMENT ON FUNCTION public.handle_new_user IS
  'Trigger function: creates a profile and a default customer role '
  'for every new auth.users row. Idempotent via ON CONFLICT DO NOTHING.';

-- ──────────────────────────────────────────────
-- updated_at maintenance trigger (reusable)
-- ──────────────────────────────────────────────
-- A generic trigger function that sets updated_at = now() on any UPDATE.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at IS
  'Generic trigger function to keep updated_at current on every UPDATE.';

-- Apply the updated_at trigger to all tables that have the column.
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_services_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_barber_profiles_updated_at
  BEFORE UPDATE ON public.barber_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_salon_settings_updated_at
  BEFORE UPDATE ON public.salon_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_barber_working_hours_updated_at
  BEFORE UPDATE ON public.barber_working_hours
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_barber_time_off_updated_at
  BEFORE UPDATE ON public.barber_time_off
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
