# Homeboard: Self-Hosted Backend Migration Spec

Personal project (GitHub: chrisaug21/homeboard). Real households use it, so cutover must be rehearsed and reversible.

## Goal

Replace Supabase (Auth, Postgres API + RLS, Edge Functions, Vault, Storage) with a hand-rolled backend on one VPS, while keeping the vanilla HTML/CSS/JS frontend and Netlify (or Cloudflare Pages) for static hosting. Supabase stays live as the rollback until the new backend has run cleanly for ~30 days.

## Ground rules

- **Copy-based migration.** Build and test against a *copy* of production data. Never point in-progress work at the live Supabase project's data unless a phase says so.
- **No behavior change until cutover.** Every phase merges to `main` behind `BACKEND=supabase` (default) vs `BACKEND=api`.
- **Keep repo conventions** from README/CLAUDE.md/AGENTS.md: small PRs; `js/shared.js` `VERSION` and `sw.js` `CACHE_NAME` bumped together on every push; update README when auth, routes, pairing, env vars, or architecture change; never hard-delete todos; only additive nullable columns on `rsvps`.

## Current system (from README and PR #85; verify in Phase 0)

**Frontend:** one `index.html` serves `/` (marketing), `/display`, `/admin`; `signup.html` serves `/signup`. About 10 admin JS files and about 10 display JS files call Supabase directly. Local dev uses `netlify dev`.

**Auth:** Supabase Auth email/password for admins. `public.users` maps auth user to `household_id` and role. Signup validates an invite code, calls `supabase.auth.signUp()`, then calls the `create-household-on-signup` Edge Function.

**Display:** unauthenticated; paired via a 4-character code (15-minute expiry). Stores `homeboard_household_id` and `homeboard_device_token` in `localStorage`. Reads household data with the public anon key under anon-read RLS policies. Only the Google Calendar proxy checks the device token.

**Edge Functions (at least 7):** `validate-pairing-code`, a pairing-code generator, `manage-display-devices`, `create-household-on-signup`, `google-calendar-connect`, `google-calendar-callback`, `google-calendar-events`.

**Secrets:** Google refresh tokens in Supabase Vault via security-definer wrappers (`gcal_store_refresh_token` and siblings). Edge Function secrets: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `OAUTH_STATE_SECRET` (plus `ALLOWED_RETURN_ORIGINS`).

**Device tokens:** 32 random bytes; only the SHA-256 hash is stored in `display_devices`; `revoked_at` marks unpaired.

**OAuth state:** HMAC-signed, expiring roughly 10 minutes, validated against allowed return origins.

**Storage:** countdown photos. **Realtime:** not used (display polls; calendar refresh about every 5 minutes).

**Data:** tables include `households`, `household_members`, `users`, `todos`, `meal_plan`, `meal_plan_notes`, `meal_library`, `countdowns`, `scorecards`, `scorecard_sessions`, `display_pairings`, `display_devices`, `google_calendar_connections`, `invite_codes`, `rsvps`, `invited_parties`. RLS uses helper `auth_household_id()`.

**Shared dependency:** the wedding website repo writes `rsvps` (name, attending, guest_count) into this same Supabase project. Homeboard reads and annotates that table.

## Decisions made now

| Decision | Choice | Why |
| --- | --- | --- |
| Backend | Node + TypeScript + Fastify | Same language as frontend and current Edge Functions (TypeScript) |
| Database | Postgres in Docker locally; container on VPS | Same engine; schema and data move as-is |
| Migrations / ORM | Drizzle | Schema history in Git |
| Frontend | Stays vanilla JS; add a data-access adapter (`supabase` and `api` implementations) | Lets every phase ship with no behavior change |
| Auth | Use a library (not hand-rolled) | Real users' passwords and Google tokens are at stake |
| Hosting target | One VPS + Coolify; static frontend stays on Netlify | Cheapest; matches learning goals |
| Cutover style | Rehearsed one-time cutover, not per-household toggling or dual-write | Avoids two-database sync problems |
| Rollback | Keep Supabase project intact for about 30 days | Fast reversal |

## Decisions deferred (present options with a recommendation at the phase named)

| Decision | Options | Decide at |
| --- | --- | --- |
| Domain layout | `api.homeboard...` under chrisaug.com or a new domain vs same-origin proxy through Netlify redirects | Phase 2 |
| DB access for Claude | Local `psql`; Postgres MCP on a dev copy; read-only user for prod | Phase 1 |
| Auth library | Better Auth vs Auth.js | Phase 4 |
| Session strategy | Cookie sessions in DB (lean) vs JWT | Phase 4 |
| Authorization pattern | Household-scoping middleware only vs middleware plus Postgres RLS as a second layer | Phase 3 |
| Display read model | Every display read requires device token (lean) vs keep open reads by household id | Phase 5 |
| Refresh-token encryption | App-level AES-GCM with key in env vs libsodium vs pgcrypto | Phase 6 |
| Photo storage | Local disk on VPS vs Cloudflare R2 | Phase 3 |
| Wedding site / `rsvps` | Move wedding site to new API too, keep `rsvps` on Supabase until after the wedding, or copy | Phase 7 |
| VPS vendor / region | Hetzner Ashburn (lean) vs DigitalOcean | Phase 2 |
| Backups and monitoring | R2 or B2 nightly dump; hosted monitor vs Uptime Kuma | Phase 2 |
| Password hash import | Import Supabase bcrypt hashes vs force password reset | Phase 4 |

## Phases

One or more small PRs per phase. Merge a phase before starting the next. Acceptance criteria must pass first.

### Phase 0: Inventory (read-only, no code changes)

Agent reads the repo and produces `docs/migration-inventory.md`: every `supabase.*` call site by file; every table and column; every RLS policy; every Edge Function with inputs, outputs, auth method, and secrets; every place a household id or token is read or written; anything in this spec that is wrong.

**Accept when:** I've reviewed the inventory and corrected this spec where reality differs.

### Phase 1: Adapter layer and local database

- Introduce one data-access module in the frontend; all Supabase calls go through it. `BACKEND` selects the implementation; default `supabase`.
- Docker Compose runs Postgres locally. Load a schema-only dump of production, then a sanitized data copy, via Drizzle/SQL migrations.

**Accept when:** the app behaves identically on `BACKEND=supabase`; fresh clone gets a local database with `docker compose up` plus one migrate command.

### Phase 2: Hello-world deploy

- Provision VPS; install Coolify; firewall (only web ports public, database port never public); SSH keys only.
- Deploy a minimal Fastify service and Postgres; HTTPS on the API domain; DNS via Cloudflare.
- Nightly `pg_dump` to off-server storage; uptime monitor.

**Accept when:** `GET /health` works over HTTPS from a phone; a backup restores onto a fresh local database.

### Phase 3: Core admin data (easy to hard)

Order: todos, then meals (plan, notes, library), then countdowns and photos, then scorecards, then household settings/members.

- Every route scopes queries by the caller's `household_id` from the session; no route accepts `household_id` from the client for authorization.
- Preserve rules: todos never hard-deleted; meal library independent of `meal_plan`.

**Accept when:** for each feature, `BACKEND=api` on a preview URL matches Supabase behavior, and a test proves user A cannot read or write household B's rows.

### Phase 4: Auth and signup

- Admin login, logout, sessions; `users` maps user to household and role.
- Invite-code signup creates user, household, and first admin atomically, then increments `invite_codes.use_count`.
- Import existing accounts (per deferred decision).

**Accept when:** an existing admin can log in on the new backend; signup with a valid invite code works; anonymous requests to admin routes return 401; wrong-household requests return 403.

### Phase 5: Display pairing and device tokens

- Port pairing-code generation (4 characters, no ambiguous characters, one active code per household, 15-minute expiry) and validation.
- **Consume the code atomically** (delete-and-return; reject if zero rows) before issuing a device token.
- Device token: 32 random bytes, only the SHA-256 hash stored; raw token returned once.
- Port unpair (`revoked_at`), plus the kiosk self-heal on 401 and the `?repair=1` escape hatch.
- Display reads require a valid, unrevoked device token (if that option is chosen).

**Accept when:** a fresh tablet pairs and displays all screens; an unpaired tablet returns to the pairing screen on its next refresh; a reused or concurrent pairing code yields exactly one token.

### Phase 6: Google Calendar OAuth

- Port connect, callback, and events endpoints.
- HMAC-signed, expiring `state`, validated against allowed return origins; fail closed if the signing secret is missing or weak.
- Refresh tokens encrypted at rest; never logged, never in a URL (revoke uses a POST body).
- Private events masked to "Busy" server-side by default; response reports `incompleteCalendarIds` when any calendar fails.
- **Add the new redirect URI in Google Cloud Console** before testing; keep the old one until cutover is final.

**Accept when:** connect, pick calendars, display events, disconnect (token revoked at Google), and deny-consent all work on the new API; households with only a public calendar ID are unaffected.

### Phase 7: Wedding RSVPs (decide first)

Resolve the deferred `rsvps` decision. Do not cut over the wedding site or `rsvps` in a way that risks losing RSVPs while the wedding is in progress.

### Phase 8: Rehearse and cut over

- Rehearse two or three times: fresh dump, restore, verify counts and spot checks, import auth users, run smoke tests.
- Cutover in a short window: freeze admin writes, final dump and restore, flip `BACKEND=api` in Netlify env, bump `VERSION` and `CACHE_NAME` so service workers refresh, re-pair displays that lack device tokens.
- Verify on real devices: wall tablet, admin on a phone.

**Accept when:** all household screens work on the new backend and I can restore the previous state within minutes by flipping the env var back.

### Phase 9: Decommission

After about 30 clean days: export a final Supabase backup, then pause and later delete the project. Remove Supabase client code and the adapter's Supabase branch. Update README, CLAUDE.md, AGENTS.md.

## Security rules for the AI agent (learned from PR #85 reviews)

- Every endpoint states who may call it. If unclear, ask before writing it.
- Authorization comes from the session or device token, never from a client-supplied household id.
- One-time secrets (pairing codes) are consumed atomically; issue credentials only after confirmed consumption.
- Tokens and secrets never appear in URLs, logs, or error messages.
- Escape all interpolated data before `innerHTML` (use the shared `escapeHtml()`).
- No secrets in the repo; `.env.example` stays current.
- Schema changes are migration files in Git.
- Never expose the database port publicly.
- Flag anything that looks like a security risk, even if not asked.

## Out of scope

- Moving other apps (Passports, Habits/Ondoloop, Fast Forward); each gets its own spec after this one.
- Visual redesign or new features during migration.
