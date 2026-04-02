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

Screens rotate automatically using per-screen timers from `display_settings.timer_intervals` with a 30-second fallback. Swipe left/right to navigate manually, or tap the footer icon buttons to jump directly to a screen. Countdown screens share one footer hourglass button, and the upcoming/month calendar buttons show centered number overlays (`upcoming_days` or `30`). Nav arrows hide on touch devices.

1. **This Week** — Google Calendar events for the configured upcoming window (`display_settings.upcoming_days`, currently 5 or 7 days)
2. **This Month** — full month calendar grid with events
3. **To-do List** — shared household tasks with open count and next-up summary
   Display-only completions trigger one of seven built-in celebration animations before the card clears. `canvas-confetti` powers Confetti Burst, Star Shower, and Fireworks; GSAP powers Bubble Float, Thumbs Up Bounce, and Ink Splash; Ripple Rings stays CSS/JS only
4. **Dinner Plan** — this week's dinner entries (Mon–Sun)
5. **Looking Forward** — countdown cards to upcoming events with Lucide icons and days-remaining
6. **Wedding Pulse** — live RSVP tracker (Chris & Bailey only, hidden starting Oct 11, 2026)
   Counts are driven by `rsvps` + `invited_parties`, the hero shows parties responded plus review count, declined/pending totals open name-list modals, and review flags open a display explainer modal

## Admin Tabs

### To-do
- Add tasks with title, optional assignee, optional due date
- Active incomplete tasks with `due_date < today` are highlighted as overdue with a red-accent card treatment
- Mark tasks complete (archives them) or restore archived tasks
- Archived tasks live in a collapsible drawer

### Meals
- Week navigation — previous, current, and next week
- Tap any day row to open the shared bottom-sheet modal
- Enter dinner name and type (cooking at home, ordering in, going out, leftovers)
- Save writes directly to the week; cancel closes the modal

### Events
- Tap a Google Calendar event to pre-fill the countdown form
- Or enter name, date, and Lucide icon name manually
- Optionally add or refresh an Unsplash background photo for a countdown
- Optional visibility timing controls let countdowns appear only a set number of days before the event
- Saved countdowns appear on the display's "Looking Forward" screen
- Browse icons at [lucide.dev/icons](https://lucide.dev/icons)

### Settings
- Assistant name shown in the display footer
- Household members for todo assignee options
- Independent Active Screens and Screen Order controls for `upcoming_calendar` and `monthly_calendar`
- Rotation timers, color scheme, Google Calendar ID, and sync controls

### RSVP
- Needs Review shows flagged RSVP rows for `Unmatched`, `Duplicate`, `Count mismatch`, and `Low confidence`
- Each review row opens the shared bottom-sheet modal with issue-specific actions
- Full guest list shows every `invited_parties` row sorted Attending → Declined → Pending
- Tapping a party opens a shared bottom-sheet modal to edit the party name, invited count, and linked RSVP, including unlinking or manual relinking
- High-confidence matches can auto-link during refresh using the same scoring logic as the admin suggestions

## Supabase Tables

| Table | Purpose |
|-------|---------|
| `households` | Household name, Google Cal config, display settings, admin PIN |
| `users` | Linked to `auth.users`; household membership and role |
| `todos` | Soft-delete only — never hard delete; archived via `archived_at` |
| `meal_plan` | `user_id = null` = shared/household row shown on display |
| `meal_plan_notes` | One note per household per week; keyed by `household_id` + `week_start` (Monday's date) |
| `countdowns` | `icon` is a Lucide icon name string; also stores optional `unsplash_image_url`, `days_before_visible`, and `photo_keyword` for countdown photos and visibility timing |
| `rsvps` | Wedding RSVP table — do not modify schema |
| `invited_parties` | Wedding invite source of truth. `rsvp_id = null` means pending; set means matched to an RSVP |

## Wedding RSVP Matching

- Homeboard wedding counts must come from `rsvps` + `invited_parties`, not from hardcoded totals or subtracting from `households.total_invited_guests`
- `Attending` = matched attending people only; clamp over-counted RSVPs to the invited party size so totals still reconcile
- `Declined` = full declines plus partial declines for under-count RSVPs
- `Pending` = sum of `invited_parties.invited_count` where `rsvp_id` is null
- `Responded` = count of matched `invited_parties`
- `Review RSVPs` = count of flagged RSVP rows in Needs Review
- `attending + declined + pending` must equal the total invited count across `invited_parties`
- Fuzzy match scoring is shared by the admin RSVP tab and automatic refresh linking:
  1. last-word exact match has the highest weight
  2. any word overlap has medium weight
  3. full-string similarity has lower weight

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
| `UNSPLASH_ACCESS_KEY` | Unsplash API access key for countdown background photos |

## Local Development

```bash
netlify dev
```

This injects env vars correctly. `file://` and `npx serve .` will not work because env vars won't be available.

If you get a Mac permissions error, use:

```bash
netlify dev --no-watch
```
