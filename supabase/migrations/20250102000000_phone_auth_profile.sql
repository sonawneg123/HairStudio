-- ============================================================
-- Migration: 20250102000000_phone_auth_profile
-- Purpose:   Update handle_new_user() to copy the phone number
--            from auth.users into public.profiles at account
--            creation time.
--
--            Supabase Auth stores the phone number in auth.users.phone
--            when signup uses { phone, password }. This migration
--            ensures the profile row mirrors that value so application
--            queries do not need to JOIN auth.users.
--
-- Depends:   20250101000002_triggers_and_functions
-- Rollback:  Re-deploy the previous handle_new_user() body.
-- ============================================================
--
-- Security notes:
--   • Phone number ownership is NOT verified. Because OTP / SMS
--     confirmation is disabled, the application cannot assert that
--     the user actually controls the number they registered with.
--     The phone column stores the value as self-reported. Never
--     treat it as a verified identity anchor.
--   • SECURITY DEFINER + fixed search_path retained from original.
--   • ON CONFLICT DO NOTHING keeps the function idempotent.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert profile row.
  -- full_name: from raw_user_meta_data supplied at signUp time.
  -- phone:     from auth.users.phone (populated by Supabase Auth
  --            when signup uses { phone, password }).
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.phone  -- may be NULL for non-phone signups (none in this app)
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
  'Trigger function: creates a profile (with phone mirrored from '
  'auth.users) and a default customer role for every new auth.users row. '
  'Phone ownership is NOT verified — OTP confirmation is disabled. '
  'Idempotent via ON CONFLICT DO NOTHING.';
