# Homeboard

A household command-center PWA — always on, always current. A wall-mounted Android tablet in landscape mode rotates through shared household info automatically. A phone at `/admin` manages everything.

## Stack

- **Vanilla HTML/CSS/JS** — single `index.html` serves both modes
- **Supabase** — database and real-time backend
- **Netlify** — hosting, env var injection at build, redirect rules
- **Google Calendar API** — read-only, API key only (no OAuth)
- **Lucide Icons** — via CDN

## Two Modes

| Mode | URL | Device | Orientation |
|------|-----|--------|-------------|
| Display | `/` | Wall tablet | Landscape |
| Admin | `/admin` | Phone | Portrait |

Both modes are served from `index.html`. Netlify rewrites `/admin` to `index.html` with a 200 status. The page detects mode from `window.location.pathname` in an inline script that runs before any JS loads.

## Display Screens

Screens rotate automatically every 30 seconds. Swipe left/right to navigate manually. Nav arrows hide on touch devices.

1. **This Week** — Google Calendar events for the current 7-day window
2. **This Month** — full month calendar grid with events
3. **To-do List** — shared household tasks with open count and next-up summary
4. **Dinner Plan** — this week's dinner entries (Mon–Sun)
5. **Looking Forward** — countdown cards to upcoming events with Lucide icons and days-remaining
6. **Wedding Pulse** — live RSVP tracker (Chris & Bailey only, hidden starting Oct 11, 2026)

## Admin Tabs

### Todos
- Add tasks with title, optional assignee, optional due date
- Mark tasks complete (archives them) or restore archived tasks
- Archived tasks live in a collapsible drawer

### Meal Plan
- Week navigation — previous, current, and next week
- Tap any day row to open an inline edit form
- Enter dinner name and type (cooking at home, ordering in, going out, leftovers)
- Save writes directly to the week; cancel closes the inline form

### Countdowns
- Tap a Google Calendar event to pre-fill the countdown form
- Or enter name, date, and Lucide icon name manually
- Saved countdowns appear on the display's "Looking Forward" screen
- Browse icons at [lucide.dev/icons](https://lucide.dev/icons)

### Settings
- Placeholder — household settings coming soon

## Supabase Tables

| Table | Purpose |
|-------|---------|
| `households` | Household name, Google Cal config, display settings, admin PIN |
| `users` | Linked to `auth.users`; household membership and role |
| `todos` | Soft-delete only — never hard delete; archived via `archived_at` |
| `meal_plan` | `user_id = null` = shared/household row shown on display |
| `meal_plan_notes` | One note per household per week; keyed by `household_id` + `week_start` (Monday's date) |
| `countdowns` | `icon` is a Lucide icon name string (e.g. `"plane"`) |
| `rsvps` | Wedding RSVP table — do not modify schema |

## File Structure

```
index.html          — app shell for both modes
css/
  display.css       — display mode styles
  admin.css         — admin mode styles
js/
  shared.js         — Supabase client, shared utilities, VERSION constant
  display.js        — display mode logic
  admin.js          — admin mode logic
manifest.json       — PWA manifest for display mode (landscape, start_url: /)
manifest-admin.json — PWA manifest for admin mode (portrait, start_url: /admin)
sw.js               — service worker (cache key: homeboard-v{version})
netlify.toml        — build config, env var injection, redirect rules
```

## Environment Variables

Set in Netlify dashboard. Never hardcode.

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_KEY` | Supabase anon/public key |
| `GOOGLE_CAL_KEY` | Google Calendar read-only API key |

## Local Development

```bash
netlify dev
```

This injects env vars correctly. `file://` and `npx serve .` will not work because env vars won't be available.

If you get a Mac permissions error, use:

```bash
netlify dev --no-watch
```
