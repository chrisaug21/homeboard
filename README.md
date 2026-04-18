# Homeboard

Homeboard is a household command-center PWA built for two surfaces:

- a wall-mounted display at `/` that rotates through shared household info
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
| Display | `/` | wall tablet | landscape |
| Admin | `/admin` | phone | portrait |
| Signup | `/signup` | phone | portrait |

Netlify rewrites `/admin` to `index.html` and `/signup` to `signup.html`. The main app decides which mode to boot from `window.location.pathname` before the main scripts run.

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
- on success, the returned `household_id` is written to `localStorage`
- the display immediately boots into the normal display experience

If the code is invalid or expired, the display shows an inline error and stays on the pairing screen.

## Main Features

### Display

- upcoming calendar view
- monthly calendar view
- shared to-do list
- dinner plan
- countdown rotation
- scorecard display screens
- wedding RSVP display screen for the wedding household only

Display screens rotate automatically using timers from `display_settings.timer_intervals`. Users can also swipe or tap footer navigation buttons to move manually.

### Admin

- manage to-dos
- manage weekly meals and meal notes
- manage countdowns and countdown images
- manage display settings
- generate display pairing codes
- manage RSVP review and guest list workflows
- create and run scorecards

Settings are opened from the gear icon in the admin header, not a bottom-nav tab.

## Tech Stack

- Vanilla HTML, CSS, and JavaScript
- Supabase
  - Auth for admin login
  - Postgres tables for app data
  - Edge Functions for pairing-code generation and validation
  - Storage for custom countdown photos
- Netlify
- Google Calendar API
- Lucide icons
- GSAP and Canvas Confetti for display celebrations

## Repository Layout

```text
index.html                  app shell for both modes
css/
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
homeboard_logo.svg          Homeboard logo asset
sw.js                       service worker
netlify.toml                Netlify config and env injection
rls-policies.sql            reference RLS policies for the Supabase project
```

## Supabase Data Model

Core tables used by Homeboard:

| Table | Purpose |
|---|---|
| `households` | household-level settings such as assistant name, color scheme, Google Calendar ID, and `display_settings` |
| `users` | maps authenticated Supabase users to a household and role, and stores personal admin settings such as `display_name` and `preferences.admin_theme` |
| `todos` | household to-dos; never hard-deleted |
| `meal_plan` | weekly meal entries |
| `meal_plan_notes` | one note per household per week |
| `countdowns` | countdown definitions and photo metadata |
| `scorecards` | scorecard definitions |
| `scorecard_sessions` | active and completed scorecard sessions |
| `display_pairings` | temporary pairing codes for display setup |
| `invite_codes` | self-serve household signup codes with active state and usage limits |
| `rsvps` | wedding RSVP data; schema is treated as fixed |
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
- do not modify the `rsvps` schema
- keep `js/shared.js` `VERSION` and `sw.js` `CACHE_NAME` in sync on every push
- update this README when auth, setup, routes, pairing, environment variables, or architecture change
