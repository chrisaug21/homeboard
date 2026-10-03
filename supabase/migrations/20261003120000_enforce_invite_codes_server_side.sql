-- Security finding S5 (docs/SECURITY-FINDINGS.local.md): invite codes were only
-- enforced in the browser, any logged-in user could insert/update/read every
-- code, and anon could list every active code.
--
-- After this migration:
--   * invite_codes is not readable or writable by anon or authenticated at all
--     (codes are managed in the Supabase SQL editor / service role only).
--   * The signup page checks a code through check_invite_code() (yes/no only).
--   * create-household-on-signup consumes a code atomically through
--     consume_invite_code() before creating anything, and hands it back with
--     release_invite_code() if household setup fails.

drop policy if exists "invite_codes: anon read active" on public.invite_codes;
drop policy if exists "invite_codes: authenticated insert" on public.invite_codes;
drop policy if exists "invite_codes: authenticated read" on public.invite_codes;
drop policy if exists "invite_codes: authenticated update" on public.invite_codes;
revoke all on public.invite_codes from anon, authenticated;

-- Yes/no check for the signup form. Returns nothing about the code beyond
-- whether it can currently be used.
create or replace function public.check_invite_code(p_code text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.invite_codes
    where code = upper(btrim(p_code))
      and is_active = true
      and use_count < max_uses
  );
$$;

-- Atomic use: a single UPDATE both checks and increments, so two people can't
-- both take the last slot. Returns the code's id, or null if unusable.
create or replace function public.consume_invite_code(p_code text)
returns uuid
language sql
security definer
set search_path = public
as $$
  update public.invite_codes
  set use_count = use_count + 1
  where code = upper(btrim(p_code))
    and is_active = true
    and use_count < max_uses
  returning id;
$$;

create or replace function public.release_invite_code(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.invite_codes
  set use_count = greatest(use_count - 1, 0)
  where id = p_id;
$$;

revoke all on function public.check_invite_code(text) from public;
revoke all on function public.consume_invite_code(text) from public;
revoke all on function public.release_invite_code(uuid) from public;
grant execute on function public.check_invite_code(text) to anon, authenticated;
grant execute on function public.consume_invite_code(text) to service_role;
grant execute on function public.release_invite_code(uuid) to service_role;
