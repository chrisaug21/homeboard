# Homeboard

Homeboard is a household command-center PWA built for two surfaces:

- a marketing landing page at `/`
- a wall-mounted display at `/display` that rotates through shared household info
- a phone-friendly admin app at `/admin` for managing that household
- a public self-serve signup page at `/signup` for new household creation with invite codes

It is a plain HTML/CSS/JS app with Supabase as the backend and Netlify for hosting.

## What It Does

Homeboard combines a few shared household tools into one app:

- calendar views for the upcoming week and current month
- shared to-dos
- dinner planning
- countdowns
- scorecards
- an admin-only RSVP management flow for the wedding feature set

The display is designed to stay open and rotate automatically. The admin side is designed for quick updates from a phone.

## How The App Is Structured

Both modes are served from a single `index.html`.

| Mode | URL | Intended device | Orientation |
|---|---|---|---|
| Marketing | `/` | desktop or phone | responsive |
| Display | `/display` | wall tablet | landscape |
| Admin | `/admin` | phone | portrait |
| Signup | `/signup` | phone | portrait |

Netlify rewrites `/display` and `/admin` to `index.html`, `/signup` to `signup.html`, and `/privacy` to `privacy.html` (the public privacy policy, linked from the marketing footer and required for Google OAuth consent-screen publishing). The main app decides which mode to boot from `window.location.pathname` before the main scripts run.

## Auth And Access

Homeboard uses two different access models:

### Admin mode

Admin mode uses Supabase Auth email/password sign-in.

- the browser signs in through `supabase.auth.signInWithPassword()`
- after login, the app reads the matching row in `public.users`
- that `users` row determines the admin’s `household_id`
- admin reads and writes are scoped to that household

If a valid Supabase auth user exists but there is no matching row in `public.users`, the app signs the user back out and blocks access.

### Signup mode

Signup mode is public and uses invite codes to create a new household.

- the browser validates the uppercase invite code against `invite_codes`
- it creates the auth account through `supabase.auth.signUp()`
- it calls the `create-household-on-signup` Edge Function with the new session access token
- after setup succeeds, it increments `invite_codes.use_count`
- the user is redirected into `/admin?onboarding=true`
- the first admin session opens a 3-step onboarding overlay that adds household members, picks a display theme, and marks `users.preferences.onboarding_complete`

### Display mode

Display mode does not require a logged-in user.

- the display stores its paired household in `localStorage` under `homeboard_household_id`
- once paired, the display reads household data using the public Supabase key and anon-access policies
- if the local storage key is missing, the display shows the pairing screen instead of the normal rotation UI

This means the display is effectively a paired, read-only household client, not an authenticated admin surface.

## Display Pairing Flow

The display must be paired once before it can load household data.

### Admin side

In Settings → Display Setup, the admin can generate a one-time pairing code.

- the code is 4 characters, uppercase, and excludes ambiguous characters
- only one active code should exist per household at a time
- the code expires after 15 minutes
- the admin UI shows the active code and a live countdown

Code generation is handled through a Supabase Edge Function, not a direct table insert from the client.

### Display side

If `homeboard_household_id` is not present in local storage:

- the display shows a pairing screen
- the user enters the 4-character code
- the app calls the public Supabase Edge Function at `${SUPABASE_URL}/functions/v1/validate-pairing-code`
- on success, the returned `household_id` and a one-time `device_token` are written to `localStorage`
- the display immediately boots into the normal display experience

If the code is invalid or expired, the display shows an inline error and stays on the pairing screen.

### Unpairing a display

In Settings → Display Setup, an admin can see whether a display is currently paired (and when it was last seen) and unpair it via the `manage-display-devices` Edge Function, which sets `revoked_at` on that household's `display_devices` row(s). This never touches the kiosk tablet directly — the running display notices on its own:

- the next time it fetches calendar events via `google-calendar-events` (its normal 5-minute refresh, or on waking from sleep), the request comes back `401` because its device token no longer matches a live, unrevoked row
- `fetchCalendarEventsViaProxy` (`js/shared.js`) treats that as "this display was unpaired," clears `homeboard_household_id` and `homeboard_device_token` from `localStorage`, and shows the pairing screen right there on the kiosk
- entering a fresh pairing code reloads the page, so display state re-initializes cleanly instead of trying to patch a running session

A display that never had a device token (paired before that feature shipped, and never re-paired since) never calls `google-calendar-events` at all, so it can't detect a revoke this way — see "Forcing a re-pair on a kiosk-locked tablet" below. Households on the legacy public-calendar-only path are unaffected either way.

### Forcing a re-pair on a kiosk-locked tablet

The admin-triggered unpair above only works once a display can actually reach `google-calendar-events` and see the `401` — it doesn't help a display that never had a device token to begin with (paired before this feature shipped), since that display never makes the call in the first place. It also doesn't help if the tablet is stuck for some other reason the automatic detection doesn't cover.

For those cases — or any tablet running in a fully locked-down kiosk browser (e.g. Fully Kiosk Browser) with no reachable "clear browser storage" option — load the display URL once with `?repair=1` appended (e.g. temporarily set the kiosk's start URL to `https://<your-domain>/display?repair=1`, then switch it back afterward). This clears `homeboard_household_id` and `homeboard_device_token` from `localStorage` and shows the pairing screen right there in the kiosk — no OS-level storage clearing, no exiting kiosk mode, just normal touch interaction with the page that's already on screen. Enter a fresh pairing code from Settings → Display Setup to finish. This is a permanent manual fallback, independent of the admin-unpair flow above; it stays useful even after every display has a device token, for whenever the automatic self-heal path doesn't fire.

### Google Calendar (private calendars)

Homeboard supports two ways to show a Google Calendar. Settings → Integrations presents them as an explicit either/or choice ("Calendar source") rather than two fields that silently coexist — switching sources clears the other one's data (with a confirm step if there's data to lose) so a stale, unused value never sits around implying a safety net that isn't real:

1. **Private, connected via Google OAuth** (Settings → Integrations → Connect Google Calendar). The admin signs in with Google, picks one or more calendars, and Homeboard reads them read-only. Three Edge Functions handle this — `google-calendar-connect` (admin actions: start/status/list_calendars/select_calendars/update_settings/disconnect), `google-calendar-callback` (handles Google's redirect), and `google-calendar-events` (fetches events for either an authenticated admin or a paired display, using its `device_token`). The refresh token is stored in Supabase Vault, never in a regular table or sent to the browser. Requires `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and `OAUTH_STATE_SECRET` set as Supabase Edge Function secrets (not Netlify env vars). Events a user has marked private in Google show as "Busy" on the display by default (`private_events_mode`); this can be changed to show full details in Settings.
2. **Public calendar ID** (`households.google_cal_id`), the original approach — the calendar must be shared as public.

Which source is "active" in the Settings UI is inferred from existing data (a `google_calendar_connections` row means Private; otherwise Public) rather than a separate stored field. The client-side fetch path (`fetchCalendarEvents()` in `js/shared.js`) still tries the OAuth proxy first and falls back to the public ID if present — but in practice that fallback should never fire once someone has explicitly chosen a source, since the inactive source's data gets cleared on switch.

A paired display only gets a `device_token` (and therefore only sees a private calendar) if it was paired after this feature shipped; displays paired earlier need to be re-paired once (see "Forcing a re-pair on a kiosk-locked tablet" above if the tablet can't reach its own pairing screen on its own).

## Main Features

### Display

- upcoming calendar view
- monthly calendar view
- shared to-do list
- meal plan (breakfast, lunch, and/or dinner — configurable per household, each shown as its own screen with a "Meal Plan - <Type>" header)
- countdown rotation
- scorecard display screens
- wedding RSVP display screen for the wedding household only

Display screens rotate automatically using timers from `display_settings.timer_intervals`. Users can also swipe or tap footer navigation buttons to move manually.

### Admin

- manage to-dos
- manage weekly meals and meal notes, swap a day's meal with an adjacent day, pick previously used meal names from a typeahead, and switch between breakfast/lunch/dinner tabs when more than one meal type is enabled
- choose which meal types (breakfast, lunch, dinner) are shown on the Meal Plan screen (Settings > Display > Meal Plan types)
- customize meal types (Cooking, HelloFresh, Delivery, etc.): toggle the standard set on/off, add custom types, and pick an Iconify icon for any of them via search-and-select (Settings > Display > Meal types), stored in `display_settings.meal_types`
- rename any meal type's display name across admin and display (Settings > Display > Meal Plan types > Rename meal types), stored in `display_settings.meal_slot_labels`
- manage the saved meal name library (Settings > Meal Library) to remove typos or unwanted entries
- manage countdowns and countdown images
- manage display settings
- run or relaunch the onboarding intro tour from Settings
- generate display pairing codes, see whether a display is currently paired, and unpair it
- manage RSVP review (with an option to soft-delete a reviewed RSVP) and browse the guest list split into Confirmed, Declined, and Pending sections
- create and run scorecards

Settings are opened from the gear icon in the admin header, not a bottom-nav tab.

## Tech Stack

- Vanilla HTML, CSS, and JavaScript
- Supabase
  - Auth for admin login
  - Postgres tables for app data
  - Edge Functions for pairing-code generation/validation and display unpairing
  - Storage for custom countdown photos
- Netlify
- Google Calendar API
- Lucide icons
- Self-hosted fonts (Rubik, Manrope) and a token-based design system (aubergine / marigold / sage; Light, Dark and Match device themes). See `TOKENS.md`.
- GSAP and Canvas Confetti for display celebrations

## Repository Layout

```text
index.html                  app shell for both modes
brand/                      logo, mark and app-icon SVGs (light/dark pairs)
fonts/                      self-hosted Rubik and Manrope (woff2)
design-system/              reference only, not served (tokens, fonts, logos, component docs)
css/
  tokens.css                design tokens (colors, time scale, person colors, fonts)
  admin.css                 admin-only styles
  display.css               display-only styles
js/
  shared.js                 shared constants, Supabase init, helpers, version
  admin-core.js             admin auth boot + core screen wiring
  admin-settings.js         admin settings + display pairing code UI
  admin-todos.js            admin to-do management
  admin-meals.js            admin meals and meal notes
  admin-countdowns.js       admin countdown flows
  admin-rsvp.js             admin RSVP flows
  admin-scorecard.js        admin scorecards
  display-init.js           display bootstrap + pairing screen flow
  display-core.js           display rotation and shared screen state
  display-navigation.js     display footer nav and navigation helpers
  display-sync.js           display sync/status helpers
  display-calendar.js       display calendar views
  display-todos.js          display to-do screen
  display-meals.js          display meal screen
  display-countdowns.js     display countdown screen
  display-rsvp.js           display RSVP screen
  display-scorecards.js     display scorecards
  display-modals.js         display modal flows
  vendor/                   bundled browser libraries
manifest.json               display PWA manifest
manifest-admin.json         admin PWA manifest
sw.js                       service worker
netlify.toml                Netlify config and env injection
rls-policies.sql            reference RLS policies for the Supabase project
```

## Supabase Data Model

Core tables used by Homeboard:

| Table | Purpose |
|---|---|
| `households` | household-level settings such as assistant name, color scheme, Google Calendar ID, and `display_settings` (member data here is legacy fallback only) |
| `household_members` | canonical list of household people, including `display_name`, `color`, and active status |
| `users` | maps authenticated Supabase users to a household and role, and stores personal admin settings such as `display_name` and `preferences.admin_theme` |
| `todos` | household to-dos; never hard-deleted; assignees use the `assignee_member_ids` uuid array (multi-assignee); `assignee_member_id` / `assignee` are kept in sync with the first assignee and used as a legacy fallback |
| `meal_plan` | weekly meal entries |
| `meal_plan_notes` | one note per household per week |
| `meal_library` | saved meal names per household, each tagged with the cooking-style type last used (`meal_type`) and the meal it was saved under (`meal_slot`: breakfast/lunch/dinner), used to power the Meal Plan typeahead (filtered by both) and the Meal Library cleanup screen; independent of `meal_plan` rows so removing a name never touches past or current planned meals |
| `countdowns` | countdown definitions, photo metadata, optional `location` and user-typed `description` (display-only, never synced to Google), and `calendar_event_id` (the Google event it was created from) |
| `scorecards` | scorecard definitions |
| `scorecard_sessions` | active and completed scorecard sessions |
| `display_pairings` | temporary pairing codes for display setup |
| `display_devices` | one row per paired wall display; stores only a hash of its device token, used to prove a display belongs to a household when reading a private Google Calendar. `revoked_at` marks it unpaired (see `manage-display-devices`) |
| `google_calendar_connections` | one row per household's connected Google account: account email, selected calendars, private-events display mode, connection status; the refresh token itself lives in Supabase Vault, referenced by id, never in this table |
| `invite_codes` | self-serve household signup codes with active state and usage limits |
| `rsvps` | wedding RSVP data owned by the wedding site repo; homeboard may add its own additive bookkeeping columns that are nullable or have a default (`status`, `merged_into_party_id`, `excluded_from_auto_match`) but must never touch columns the wedding site writes (`name`, `attending`, `guest_count`); `status` values are `active`, `superseded` (merged into another party as a duplicate), and `dismissed` (soft-deleted from admin Needs Review) — all RSVP reads filter to `status = 'active'` |
| `invited_parties` | wedding invite list and RSVP matching source of truth |

## Environment Variables

Set these in Netlify. Do not hardcode them in the repo.

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_KEY` | Supabase anon/public key |
| `GOOGLE_CAL_KEY` | Google Calendar read-only API key |
| `UNSPLASH_ACCESS_KEY` | Unsplash access key for countdown photo search |

## Local Development

Use Netlify dev so the injected environment variables are available:

```bash
netlify dev
```

If file watching causes a local Mac permissions issue:

```bash
netlify dev --no-watch
```

Do not use `file://` or `npx serve .` for local testing. The app depends on injected environment variables and route rewriting.

## Notes For Contributors

- keep changes small and safe
- do not hardcode Supabase credentials
- do not hard-delete todos
- only add additive columns to the `rsvps` schema that are nullable or have a default; never touch the columns the wedding site writes (`name`, `attending`, `guest_count`)
- keep `js/shared.js` `VERSION` and `sw.js` `CACHE_NAME` in sync on every push
- style with design-system tokens only (see `TOKENS.md`); no per-theme overrides, gradients, or hardcoded colors
- update this README when auth, setup, routes, pairing, environment variables, or architecture change
