# Homeboard

Household command center PWA. Runs on a wall-mounted Android tablet in landscape mode, managed from a phone in portrait mode.

## Stack
- Vanilla HTML/CSS/JS — single `index.html`
- Supabase (project: `rgvvsgvxmdebcqlokiwv`)
- Netlify — env vars injected at build via `sed` in `netlify.toml`
- Google Calendar API — read-only, API key based (no OAuth)
- Lucide icons via CDN

## File Structure
```
index.html          — single HTML file, both display + admin shells
css/
  display.css       — display mode styles only
  admin.css         — admin mode styles only
js/
  shared.js         — Supabase init, VERSION constant, utility functions, shared config
  display.js        — display mode logic (auto-rotate, data fetching, rendering)
  admin.js          — all admin mode logic (screens, modals, event handling)
manifests/
  manifest.json     — PWA manifest for display mode (landscape)
  manifest-admin.json — PWA manifest for admin mode (portrait)
sw.js               — service worker, cache key homeboard-v##
netlify.toml        — build config, env var injection via sed
```

## Two Modes
- **Display Mode** — landscape tablet, auto-rotates screens every 30s, manual swipe
- **Admin Mode** — portrait phone, at `/admin`

## Display Screens (in order)
1. Calendar (Google Cal read-only)
2. To-Do List
3. Meal Plan (dinner only on display)
4. Countdown Board (Lucide icons)
5. RSVP Live Board (Chris & Bailey only — reads `rsvps` table, retires Oct 9 2026)

## Supabase Tables
- `households` — assistant name (e.g. "HACC"), Google Cal config, display settings JSON, admin PIN
- `users` — linked to `auth.users`, household membership, role (admin/member)
- `todos` — soft delete via `archived_at`, never hard delete
- `meal_plan` — `user_id` nullable: null = shared/household, uuid = personal
- `meal_plan_notes` — one note per household per week, keyed by `household_id` + `week_start`
- `countdowns` — `icon` is a Lucide icon name string e.g. `"plane"`
- `rsvps` — pre-existing wedding table, do not modify schema

## Color Palette
- Background: `#F5F0E8` (warm parchment)
- Surface/cards: `#FFFDF7` (warm white)
- Primary text: `#1C1917` (warm near-black)
- Accent: `#B45309` (amber)
- Secondary accent: `#15803D` (sage green)
- Muted text: `#78716C` (warm gray)

## Env Vars (never hardcode)
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `GOOGLE_CAL_KEY`
- `UNSPLASH_ACCESS_KEY`

## Local Dev
Use `netlify dev` — injects env vars correctly.
Use `netlify dev --no-watch` if Mac permissions error occurs.
`file://` and `npx serve .` do not work.

## Homeboard-Specific Rules
- Never modify the `rsvps` table schema — it belongs to the wedding site
- Never hard-delete todos — always set `archived_at`
- `meal_plan` rows with `user_id = null` are shared/household; never show personal rows (`user_id` set) on the display
- sw.js cache prefix: `homeboard-v##`
- When pushing any change: update `VERSION` in `js/shared.js` (patch bump for fixes, minor bump for features), update `CACHE_NAME` in `sw.js` to match, and keep `README.md` accurate — add new tables, env vars, or screens as they are introduced