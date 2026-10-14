-- ============================================================
-- Migration: 20250102000003_barber_profile_protect_is_active
-- Purpose:   Prevent barbers from toggling their own is_active flag.
--
--            The RLS policy barber_profiles_owner_update allows barbers
--            to UPDATE their own barber_profiles row (bio, display_name,
--            avatar_url). The WITH CHECK clause cannot prevent column-level
--            changes in standard PostgreSQL RLS, so a BEFORE UPDATE trigger
--            is the authoritative enforcement layer.
--
--            This trigger fires before every UPDATE on barber_profiles and
--            raises an exception if a non-admin caller attempts to change
--            is_active. Admins (and the service-role key, which bypasses
--            RLS/triggers by design) can still change the field.
--
-- Depends:   20250101000003_rls_policies
-- Rollback:  DROP TRIGGER prevent_barber_self_activate ON public.barber_profiles;
--            DROP FUNCTION public.check_barber_profile_update();
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_barber_profile_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow if is_active is unchanged.
  IF NEW.is_active IS NOT DISTINCT FROM OLD.is_active THEN
    RETURN NEW;
  END IF;

  -- Allow if the caller is an admin.
  IF public.get_user_role(auth.uid()) = 'admin' THEN
    RETURN NEW;
  END IF;

  -- Reject: a non-admin (typically the barber themselves) attempted to
  -- change is_active.
  RAISE EXCEPTION
    'permission_denied: only admins may change the is_active field on barber_profiles'
    USING ERRCODE = 'P0010';
END;
$$;

COMMENT ON FUNCTION public.check_barber_profile_update IS
  'BEFORE UPDATE trigger: blocks non-admin callers from toggling is_active '
  'on barber_profiles. Admins and the service-role key (which bypasses triggers) '
  'may still change the field.';

DROP TRIGGER IF EXISTS prevent_barber_self_activate ON public.barber_profiles;
CREATE TRIGGER prevent_barber_self_activate
  BEFORE UPDATE ON public.barber_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.check_barber_profile_update();
