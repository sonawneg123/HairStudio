-- ============================================================
-- Migration: 20250104000000_phone_integrity_hardening
-- Purpose:   Harden phone-number integrity in two places that were
--            left open after the email+password auth switch:
--
--   1. handle_new_user() trigger: validate raw_user_meta_data->>'phone'
--      against the E.164 format before writing it to profiles.phone.
--      Any value that does not match is stored as NULL rather than
--      an arbitrary string, preventing direct API callers from
--      injecting garbage into the column.
--
--   2. protect_profiles_phone() trigger: prevent authenticated users
--      from altering their own profiles.phone after account creation.
--      Phone is set once by the server action at signup and must not
--      be changeable from the client layer.  Admins (role='admin') are
--      still allowed to correct the value via the SQL Editor.
--
-- Security rationale:
--   • The signUp server action normalizes and validates the phone before
--     writing it to raw_user_meta_data.  However, a caller who has
--     obtained valid Supabase Auth credentials (e.g. the anon key + a
--     valid JWT) could call the Supabase Auth API directly with
--     arbitrary metadata, bypassing the Next.js layer.
--   • The RLS policy profiles_owner_update allows UPDATE for id=auth.uid()
--     with no column-level restriction.  Without a trigger a customer
--     could execute:
--         UPDATE public.profiles SET phone='+911234567890' WHERE id=auth.uid()
--     and overwrite the phone that was recorded at signup.
--   • Neither change weakens existing RLS; both add narrower guards on top.
--
-- Depends:   20250103000000_email_auth_phone_from_metadata
-- Rollback:
--   DROP TRIGGER prevent_profile_phone_change ON public.profiles;
--   DROP FUNCTION public.protect_profiles_phone();
--   -- Then re-deploy handle_new_user from 20250103000000 (no phone validation).
-- ============================================================

-- ──────────────────────────────────────────────
-- 1. Update handle_new_user() to validate phone
-- ──────────────────────────────────────────────
-- E.164 pattern: + followed by 7–15 digits (ITU-T E.164).
-- Values that do not match are stored as NULL.
-- ON CONFLICT DO NOTHING ensures idempotency remains intact.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw_phone text;
  v_phone     text;
BEGIN
  -- Read the phone value provided by the signUp server action.
  v_raw_phone := NEW.raw_user_meta_data->>'phone';

  -- Validate E.164: + followed by 7–15 digits.
  -- If the value does not match, store NULL (self-reported, unverified).
  IF v_raw_phone IS NOT NULL AND v_raw_phone ~ '^\+\d{7,15}$' THEN
    v_phone := v_raw_phone;
  ELSE
    v_phone := NULL;
  END IF;

  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    v_phone
  )
  ON CONFLICT (id) DO NOTHING;

  -- Insert default 'customer' role.
  -- No elevated role is ever assigned here.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user IS
  'Trigger function: creates a profile (with validated E.164 phone from '
  'raw_user_meta_data) and a default customer role for every new auth.users row. '
  'Phone is validated against ^\+\d{7,15}$ before insertion; invalid values '
  'are stored as NULL. Phone ownership is NOT verified. '
  'Idempotent via ON CONFLICT DO NOTHING.';

-- ──────────────────────────────────────────────
-- 2. Protect profiles.phone from self-update
-- ──────────────────────────────────────────────
-- A BEFORE UPDATE trigger that prevents authenticated callers from
-- changing profiles.phone on their own row.  Only admins may alter it.
--
-- This complements the RLS policy profiles_owner_update, which correctly
-- limits row access to the owner but cannot restrict which columns are
-- written (PostgreSQL RLS does not support column-level WITH CHECK for UPDATE).

CREATE OR REPLACE FUNCTION public.protect_profiles_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow if phone is unchanged.
  IF NEW.phone IS NOT DISTINCT FROM OLD.phone THEN
    RETURN NEW;
  END IF;

  -- Allow if the caller is an admin.
  IF public.get_user_role(auth.uid()) = 'admin' THEN
    RETURN NEW;
  END IF;

  -- Reject: any other caller tried to change the phone column.
  RAISE EXCEPTION
    'permission_denied: profiles.phone may not be changed after account creation'
    USING ERRCODE = 'P0011';
END;
$$;

COMMENT ON FUNCTION public.protect_profiles_phone IS
  'BEFORE UPDATE trigger: blocks non-admin callers from changing '
  'profiles.phone after account creation. Admins may still correct the '
  'value via the SQL Editor or service-role key.';

DROP TRIGGER IF EXISTS prevent_profile_phone_change ON public.profiles;
CREATE TRIGGER prevent_profile_phone_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profiles_phone();
