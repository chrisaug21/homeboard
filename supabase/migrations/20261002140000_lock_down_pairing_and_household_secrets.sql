-- Security fixes S2, S4, S6 (docs/SECURITY-FINDINGS.local.md).
--
-- S2: anyone holding the public anon key could read every household row,
--     including `admin_pin` and `google_cal_key`. The wall display (anon role)
--     only needs the display-facing columns, so anon is now limited to those
--     columns. Authenticated admins are unchanged (their own household only).
-- S4/S6: anon could read and delete every live pairing code, and any logged-in
--     user could read all pairings or insert one for any household. Pairing
--     codes are now only created/consumed by edge functions (service role);
--     admins can read and delete only their own household's.

-- ---------------------------------------------------------------- households
-- Both anon-read policies were `USING (true)`. The second one targets the
-- `public` role, which also let any authenticated user read every household.
drop policy if exists "households: anon read" on public.households;
-- anon_select_households stays: rows stay visible to anon, but column grants
-- below decide which columns.

revoke select on public.households from anon;
grant select (
  id,
  name,
  assistant_name,
  google_cal_id,
  display_settings,
  total_invited_guests,
  color_scheme,
  created_at
) on public.households to anon;
-- Not granted to anon on purpose: admin_pin, google_cal_key.

-- ----------------------------------------------------------- display_pairings
drop policy if exists "anon_select_display_pairings" on public.display_pairings;
drop policy if exists "anon_delete_display_pairings" on public.display_pairings;
drop policy if exists "display_pairings: authenticated read" on public.display_pairings;
drop policy if exists "auth_insert_display_pairings" on public.display_pairings;

-- Admins see only their own household's active code (admin Settings shows it).
create policy "auth_select_display_pairings"
  on public.display_pairings
  for select
  to authenticated
  using (household_id = auth_household_id());
-- auth_delete_display_pairings (household-scoped) is already correct and stays.
-- No insert policy: codes are created by the generate-pairing-code edge function.

revoke all on public.display_pairings from anon;

-- ----------------------------------------------------------- pairing_attempts
-- Failed pairing-code guesses, so validate-pairing-code can throttle brute
-- force. Timestamps only: no IP address or other personal data is stored.
create table if not exists public.pairing_attempts (
  id uuid primary key default gen_random_uuid(),
  attempted_at timestamptz not null default now()
);

alter table public.pairing_attempts enable row level security;
revoke all on public.pairing_attempts from anon, authenticated;

create index if not exists pairing_attempts_attempted_at_idx
  on public.pairing_attempts (attempted_at);
