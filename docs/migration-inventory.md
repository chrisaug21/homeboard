# Migration inventory (Phase 0)

Read-only snapshot taken 2026-09-30 from the repo (`main` at `1470014`) and from the live Supabase project
using catalog/metadata queries only (table definitions, policies, function bodies, counts). No household row data was read. Every claim below is either from repo files or from those live
queries; anything I did not verify is marked **unverified**.

## 0. Security review

Security-relevant observations from this inventory are tracked privately until they are resolved, and are
deliberately not written into this public repository. Sections below describe structure only.

## 1. Frontend call sites

No file uses realtime, and every `createClient` call is in `js/shared.js` and `signup.html`. Table access,
counted as `.from("table")` occurrences per file:

| File | Tables (count) |
|---|---|
| `js/admin-core.js` | users (1) |
| `js/admin-countdowns.js` | countdowns (7) + **storage** bucket `countdown-photos` (upload, remove, getPublicUrl) |
| `js/admin-meal-types.js` | households (1) |
| `js/admin-meals.js` | meal_library (4), meal_plan (6), meal_plan_notes (2) |
| `js/admin-onboarding.js` | household_members (5), households (1), users (2) |
| `js/admin-rsvp.js` | invited_parties (5), rsvps (6) |
| `js/admin-scorecard.js` | scorecard_sessions (7), scorecards (4) |
| `js/admin-settings.js` | display_pairings (1), household_members (3), households (6), users (1) + RPC `get_household_members_with_login_status` |
| `js/admin-todos.js` | todos (16) |
| `js/display-countdowns.js` | countdowns (1) |
| `js/display-meals.js` | households (1), meal_plan (1), meal_plan_notes (1) |
| `js/display-scorecards.js` | scorecard_sessions (8), scorecards (2) |
| `js/display-todos.js` | todos (4) |
| `js/shared.js` | household_members (1), households (1), invited_parties (3), rsvps (1) |
| `signup.html` | invite_codes (2) |

Auth calls: `signInWithPassword`, `signOut` (3 places), `getSession` (5 places), `signUp` (signup.html). No password
reset, magic link, OAuth-provider or `onAuthStateChange` usage found by grep (**unverified** for indirect uses).

Edge Function calls from the browser (all `fetch` to `${SUPABASE_URL}/functions/v1/...`): `validate-pairing-code`
(display-init), `manage-display-devices`, `google-calendar-connect`, `generate-pairing-code` (admin-settings),
`create-household-on-signup` (signup), `google-calendar-events` (shared.js).

Browser storage: `homeboard_household_id`, `homeboard_device_token`, and a last-synced timestamp. The display
learns its household from `homeboard_household_id` and then queries tables directly with the anon key; the
device token is only sent to `google-calendar-events`.

**Not done at this granularity yet:** a per-line list of every select/insert/update/delete and the exact filters.
The table-by-file map above is enough to plan Phase 1 (adapter); the per-call detail should be produced while
building the adapter, file by file.

## 2. Database (live)

Tables in `public` (rows at snapshot): households (2), users (3), household_members (5), todos (442),
meal_plan (191), meal_plan_notes (16), meal_library (66), countdowns (27), scorecards (21),
scorecard_sessions (83), display_pairings (1), display_devices (6), google_calendar_connections (1),
invite_codes (1), rsvps (45), invited_parties (36), **events (1)**. `auth.users`: 6.

Column-level definitions were captured via the Supabase table listing; regenerate them with a schema-only
`pg_dump` in Phase 1 rather than copying from this doc. Points worth knowing:

- **`events` table exists and is not in the spec or README.** `rsvps.event_id` and `invited_parties.event_id`
  reference it; `events` has a public "read if `rsvp_form_enabled`" policy. Trigger `trg_stamp_hacc_wedding_event_id`
  (BEFORE INSERT on `rsvps`) fills `rsvps.event_id` from the event with slug `bailey-chris-wedding`. This is a
  live coupling with the wedding site.
- **`rsvps.household_id` is NOT NULL with a hard-coded default** (`a1b2c3d4-...`, this household), and the `rsvps`
  and `countdown-photos` storage policies compare against that same hard-coded UUID. The wedding site depends
  on the default. Copying `rsvps` must preserve it.
- `todos` already has recurrence columns (`recurrence_type`, `recurrence_config`, `recurrence_template_id`),
  `completed_at`, and `deleted_at`, although CLAUDE.md says recurring todos are a future change. It also has both
  `assignee_member_id` and `assignee_member_ids`. A database policy also permits deleting generated recurring
  instances, so the "never hard-delete todos" rule is a frontend convention, not a database guarantee.
- `households.display_settings` default is a legacy shape; real rows use the shape documented in CLAUDE.md.
- `users.id` references `auth.users.id`; `users.member_id` links to `household_members`.
- Extensions installed: `supabase_vault`, `pgcrypto`, `uuid-ossp`, `pg_stat_statements`, `plpgsql`. No `pg_cron`
  (no scheduled jobs found).
- Only 12 migration files exist in `supabase/migrations/`; the base schema was created outside git. A schema-only
  dump is required, and the migration history must not be treated as complete.

### RLS
Helper: `auth_household_id()` (SECURITY DEFINER; returns `users.household_id` for `auth.uid()`). Authenticated
policies are household-scoped on the core tables. The full `pg_policies` output was reviewed for this doc (see section 0); regenerate it during Phase 1.

### Database functions
| Function | Notes |
|---|---|
| `auth_household_id()` | RLS helper, executable by anon/authenticated |
| `get_household_members_with_login_status(uuid)` | SECURITY DEFINER; checks the caller belongs to the household |
| `gcal_store_refresh_token / gcal_read_refresh_token / gcal_delete_refresh_token` | Vault wrappers; executable only by `service_role` |
| `rls_auto_enable()` | Event trigger that turns RLS on for every new `public` table |
| `stamp_hacc_wedding_event_id()` | The rsvps trigger function above |

### Storage
One bucket, `countdown-photos` (public, 22 objects). Policies allow insert/select/update/delete only for objects
under a folder named with the hard-coded household UUID, so **photo upload works for only one household today**.
Photo URLs are stored in `countdowns.custom_image_url`, so a move must rewrite those URLs (or keep serving
the old ones).

### Auth users
6 users, all with bcrypt password hashes, all `email` provider (none via Google or another provider). Importing
the existing hashes is technically possible; the decision is still open (spec Phase 4).

## 3. Edge Functions

7 live; **6 in the repo**. `generate-pairing-code` is deployed but not in `supabase/functions/`. Its source was
read from the live project and should be committed to the repo (Phase 1) so it isn't lost. All 7 have
`verify_jwt=false`.

| Function | Caller / auth | Input -> output | Secrets and stores touched |
|---|---|---|---|
| `generate-pairing-code` | Admin (see section 0) | none -> `{id, code, expires_at}` | service role; deletes household's old codes, inserts `display_pairings` (15 min) |
| `validate-pairing-code` | Anyone (unauthenticated display) | `{code}` -> `{household_id, device_token}` | service role; deletes the code (atomic consume), inserts `display_devices` (SHA-256 hash only) |
| `manage-display-devices` | Admin (`auth.getUser` + role check) | `{action: status\|unpair}` | service role; reads/updates `display_devices.revoked_at` |
| `create-household-on-signup` | Any signed-up user (see section 0) | `{display_name}` -> `{household_id, member_id}` | service role; inserts household, household_member, user (not atomic, no rollback if a later step fails) |
| `google-calendar-connect` | Admin | `{action: start\|status\|list_calendars\|select_calendars\|update_settings\|disconnect}` | `GOOGLE_OAUTH_CLIENT_ID/SECRET`, `OAUTH_STATE_SECRET`; Vault via RPC; `google_calendar_connections` |
| `google-calendar-callback` | Browser redirect from Google; trust from signed `state` | query `code`, `state` -> 302 to `/admin?gcal=...` | same secrets; stores refresh token in Vault, upserts connection |
| `google-calendar-events` | Admin (JWT) **or** paired display (`x-device-token`) | `{timeMin, timeMax, maxResults}` -> `{items, incompleteCalendarIds?}` | same secrets; reads Vault; masks private events server-side; updates `last_success_at` |

Env values: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (injected by Supabase), the three Google/OAuth secrets
above. The `ALLOWED_RETURN_ORIGINS` are hard-coded in `gcal-shared.ts` (`https://homeboard.chrisaug.com`,
`http://localhost:8888`), not read from an env var. `gcal-shared.ts` is byte-identical in the three Google
functions. The callback URL is derived from `SUPABASE_URL`, so **the new API's callback URL must be registered
in Google Cloud Console** (already in spec Phase 6). Deploy previews and any other Netlify origin are not in the
allowlist.

## 4. Where household ids and tokens are read or written

- `homeboard_household_id`: written by the display after pairing (`display-init.js`), read by `shared.js` and used
  as a query filter across display screens. Not proof of anything by itself.
- `homeboard_device_token`: written after pairing; sent as `x-device-token` to `google-calendar-events` only.
- Admin household id: derived from the session via `users.household_id` (RLS helper, and inside edge functions).
- Device token: raw token never stored server-side; `display_devices.token_hash` = SHA-256.

## 5. Corrections to the spec

1. Add the **`events`** table and the `rsvps` trigger/hard-coded household UUID to the "Shared dependency" notes.
2. Phase 5's display access model needs re-scoping; see the private security notes (section 0).
3. **`generate-pairing-code` is missing from the repo** (spec lists "a pairing-code generator" without noting this).
4. **Invite-code enforcement is client-side only**; Phase 4's "signup validates an invite code ... atomically"
   is new behavior, not a port.
5. Several Phase 4-6 security behaviors are new work rather than ports (details tracked privately; section 0).
6. `ALLOWED_RETURN_ORIGINS` is a hard-coded list, not the env secret the spec implies.
7. The migration folder is incomplete (12 files); Phase 1's schema-only dump is the source of truth.
8. Photo storage: only one household's folder is allowed by policy; URLs are stored in `countdowns.custom_image_url`.
9. All existing accounts are email/password with bcrypt hashes, which favors importing hashes (Phase 4).
10. No realtime and no scheduled jobs (confirmed): nothing to port there.

## 6. Open questions for the owner

Tracked privately (see section 0).
