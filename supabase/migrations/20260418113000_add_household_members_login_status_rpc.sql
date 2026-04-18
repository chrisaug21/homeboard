CREATE OR REPLACE FUNCTION public.get_household_members_with_login_status(target_household_id uuid)
RETURNS TABLE (
  id uuid,
  display_name text,
  color text,
  is_active boolean,
  created_at timestamptz,
  has_linked_login boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    hm.id,
    hm.display_name,
    hm.color,
    hm.is_active,
    hm.created_at,
    EXISTS (
      SELECT 1
      FROM public.users AS u
      WHERE u.member_id = hm.id
    ) AS has_linked_login
  FROM public.household_members AS hm
  WHERE hm.household_id = target_household_id
    AND hm.is_active = true
    AND EXISTS (
      SELECT 1
      FROM public.users AS viewer
      WHERE viewer.id = auth.uid()
        AND viewer.household_id = target_household_id
    )
  ORDER BY hm.display_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_household_members_with_login_status(uuid) TO authenticated;
