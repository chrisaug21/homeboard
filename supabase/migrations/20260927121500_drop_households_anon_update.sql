-- Removes the anon-role UPDATE policy on households. It let anyone holding the
-- public anon key rewrite any household's row (any household_id, since RLS had
-- no ownership check for anon). Verified before dropping: display code never
-- writes to `households` (it only reads via fetchHouseholdConfig()); all admin
-- writes to `households` go through the authenticated `auth_update_households`
-- policy (id = auth_household_id()), which is unaffected by this change.
drop policy if exists "households: anon update" on public.households;
