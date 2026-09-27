-- Google Calendar OAuth (private calendars).
-- Additive only. Both tables are service-role-only: RLS is on and there are NO policies,
-- so the anon and authenticated roles cannot read or write them. Edge functions use the
-- service role. Refresh tokens live in Supabase Vault, never in a regular table.

create table public.google_calendar_connections (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null unique references public.households(id) on delete cascade,
  connected_by_user_id uuid references public.users(id) on delete set null,
  google_account_email text,
  refresh_token_secret_id uuid,
  scopes text,
  status text not null default 'active' check (status in ('active', 'needs_reauth')),
  selected_calendars jsonb not null default '[]'::jsonb,
  private_events_mode text not null default 'busy' check (private_events_mode in ('busy', 'full')),
  last_success_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_calendar_connections enable row level security;
revoke all on table public.google_calendar_connections from anon, authenticated;

-- One row per paired wall display. Only a hash of the device token is stored.
create table public.display_devices (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);

create index display_devices_household_id_idx on public.display_devices (household_id);

alter table public.display_devices enable row level security;
revoke all on table public.display_devices from anon, authenticated;

-- Vault helpers. The vault schema is not exposed through the API, so the edge functions
-- (service role) reach it through these narrow wrappers. Nobody else can execute them.
create or replace function public.gcal_store_refresh_token(p_token text, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  return vault.create_secret(p_token, p_name, 'Google Calendar refresh token');
end;
$$;

create or replace function public.gcal_read_refresh_token(p_secret_id uuid)
returns text
language sql
security definer
set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets where id = p_secret_id;
$$;

create or replace function public.gcal_delete_refresh_token(p_secret_id uuid)
returns void
language sql
security definer
set search_path = public, vault
as $$
  delete from vault.secrets where id = p_secret_id;
$$;

revoke all on function public.gcal_store_refresh_token(text, text) from public, anon, authenticated;
revoke all on function public.gcal_read_refresh_token(uuid) from public, anon, authenticated;
revoke all on function public.gcal_delete_refresh_token(uuid) from public, anon, authenticated;
grant execute on function public.gcal_store_refresh_token(text, text) to service_role;
grant execute on function public.gcal_read_refresh_token(uuid) to service_role;
grant execute on function public.gcal_delete_refresh_token(uuid) to service_role;
