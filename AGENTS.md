# AGENTS.md — Homeboard

Project-specific instructions. Global coding standards and git discipline are in `~/.codex/AGENTS.md`.

## What This Project Is
Household command center PWA. Wall-mounted Android tablet (landscape display) + phone admin (portrait). Single `index.html`, Supabase backend, Netlify hosting.

## File Structure
```text
index.html          — single HTML file, both display + admin shells
css/display.css     — display mode styles only
css/admin.css       — admin mode styles only
js/shared.js        — Supabase init, VERSION constant, utilities, shared config
js/display.js       — display mode logic
js/admin.js         — all admin mode logic (screens, modals, event handling)
sw.js               — service worker (cache key: homeboard-v##)
netlify.toml        — build + env var injection via sed
```

## Architecture
- Supabase-first. No offline writes — show error toast if Supabase unreachable on write.
- localStorage is read-only cache only.
- No frameworks, no bundlers. Plain vanilla JS.
- Two modes: Display Mode (landscape) and Admin Mode (`/admin`, portrait).
- Admin add/edit forms use a shared bottom-sheet modal (`#admin-modal`) — inject form HTML via `openAdminModal()`, dismiss via `closeAdminModal()`. Do not add new always-visible form panels.

## Supabase Tables
| Table | Key notes |
|---|---|
| `households` | One row per household. `assistant_name` = e.g. "HACC" |
| `users` | Linked to `auth.users`. Role: `admin` or `member` |
| `todos` | Soft delete only — set `archived_at`, never hard delete |
| `meal_plan` | `user_id` null = shared (show on display). `user_id` set = personal (admin only) |
| `meal_plan_notes` | One note per household per week. Keyed by `household_id` + `week_start` (Monday's date) |
| `countdowns` | `icon` = Lucide icon name string |
| `rsvps` | Wedding table — **do not modify schema** |

## Hard Rules
- Never modify `rsvps` table schema
- Never hard-delete todos — use `archived_at`
- Never show `meal_plan` rows where `user_id` is set in Display Mode
- Never hardcode `SUPABASE_URL` or `SUPABASE_KEY` — injected by Netlify at build
- sw.js cache prefix must be `homeboard-v##`
- When pushing any change: bump `VERSION` in `js/shared.js` (patch for fixes, minor for features), update `CACHE_NAME` in `sw.js` to match, and keep `README.md` accurate — document new tables, env vars, or screens as they are added

## Local Dev
`netlify dev` is the only correct local workflow. `file://` and `npx serve .` do not work.