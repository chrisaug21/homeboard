# Homeboard — Product Spec v5

> **Product name:** Homeboard  
> **Your household's instance:** HACC (Home App Command Center)  
> **URL:** `homeboard.chrisaug.com`  
> **Supabase project:** `rgvvsgvxmdebcqlokiwv` (formerly "wedding")  
> **Stack:** Vanilla HTML/CSS/JS · Supabase · Netlify · Google Calendar API (read-only)  
> **Target:** Personal household live in kitchen by ~June 2025 · Gift-ready multi-tenant by ~November 2025

---

## Problem Statement

Households want a shared, always-visible command center in their home — something that shows the family calendar, what's for dinner, upcoming events, and the shared to-do list without anyone having to pick up a phone. The problem is that the existing solutions are either overpriced, locked to proprietary hardware, or too generic to actually fit how a real household operates.

The average family ends up with a fragmented mess: a whiteboard for reminders, a shared Google Calendar nobody checks, a notes app that only one person updates, and a group chat that becomes the de facto task manager. Nothing is in one place. Nothing is visible at a glance.

---

## Customer

**Primary:** Households with two or more people who want shared visibility into their week — couples, families with kids, roommates. People who are already somewhat organized digitally (shared calendars, group chats) but want something ambient and passive in their physical space.

**Secondary (gifting):** People who want to give a thoughtful, personalized, genuinely useful home gift to family or close friends. Not another candle. Something that lives on their wall and makes their daily life easier.

---

## Product Pitch

Homeboard is a household command center that runs on a cheap Android tablet mounted in your kitchen. It shows your calendar, your meal plan, your shared to-do list, and countdown timers for things you're looking forward to — rotating automatically, always on, always current.

You manage everything from your phone. Your partner manages it from theirs. The tablet just displays.

No proprietary hardware. No subscription. No ecosystem lock-in. You own it, you control it, and you can give it as a gift to someone you love for less than the cost of one month of a competitor's subscription.

---

## Competitive Landscape

| Product | Price | What it does | What's wrong with it |
|---|---|---|---|
| **Skylight Calendar** | $160 hardware + $40/yr | Shared family calendar on a dedicated display | Calendar only, no to-do/meal/countdown, requires their hardware |
| **Amazon Echo Show** | $90–$250 | Alexa smart display, calendar, reminders | Locked to Alexa ecosystem, ad-supported, Amazon owns your data |
| **Google Nest Hub** | $100 | Google Calendar + smart home | Google ecosystem only, limited customization, no meal planning |
| **Familyhub (Samsung)** | Built into $3,000+ fridge | Calendar, notes, meal planning | You have to buy a Samsung fridge |
| **Cozi** | Free / $36/yr | Family organizer app (phone only) | Phone-only, no ambient display, requires everyone to use the app |
| **DIY (MagicMirror, etc.)** | ~$100–200 + hours | Fully custom Raspberry Pi display | Requires technical setup, fragile, not giftable |

---

## Differentiation

**1. Multi-screen ambient display, not just a calendar.**
Homeboard rotates through your calendar, to-dos, meal plan, and countdowns automatically. It's a dashboard, not a single-purpose display.

**2. Phone-first admin.**
You manage everything from your phone — the same way you already manage your life. No special hardware, no logging into a separate app, no voice commands required.

**3. Your Google Calendar, not a replacement.**
You don't change how you add events. You invite your shared Gmail to events like you already do, and they show up on the display. Zero behavior change.

**4. Genuinely giftable.**
A $130 tablet + a URL + a 15-minute setup call. Multi-tenant architecture means each family gets their own isolated instance on the same deployment. No technical knowledge required to receive this as a gift.

**5. You own it.**
No subscription. No proprietary hardware. No company discontinuing the product in two years. The code is yours, the data is yours, the Supabase project is yours.

**6. Personal touches at the household level.**
Each household names their instance. Yours is HACC. Your sister's family might call theirs something else entirely. Future voice integration means it'll actually respond to that name.

---

## What Homeboard Is Not (v1 Scope Boundaries)

- Not a smart home controller
- Not a voice assistant (yet — Phase 4)
- Not a recipe manager or grocery ordering tool
- Not a notifications inbox
- Not a replacement for your phone's calendar app
- Not a social product — no sharing outside the household

---

## Naming Model

| Layer | Name | Notes |
|---|---|---|
| **Product** | Homeboard | The app. What your sister receives as a gift. |
| **Your household's instance** | HACC | "Home App Command Center." Bailey's name for your version. Shows in your header and future voice responses. |
| **Other households** | Their choice | Each household sets their own assistant name in onboarding. |

---

## Auth & User Model

Three layers, each with a distinct job:

| Layer | What it is | Who manages it |
|---|---|---|
| `auth.users` | Login identity — email + password | Supabase, automatically |
| `public.users` | App profile — household membership, display name, role | Your app |
| `public.households` | The container — one per family | Your app |

**Relationship:**
```
households (1) ──→ (many) users ──→ (1) auth.users login
```

**Concretely for HACC:**
- 1 row in `households`: name "Bailey & Chris", assistant_name "HACC"
- 2 rows in `public.users`: Chris (admin) + Bailey (member), both pointing to that household
- 2 logins in `auth.users`: your emails

**Roles:** `admin` can change household settings and display config. `member` can add todos, meals, countdowns — everything except reconfiguring the display. Bailey can be admin too — it's just a field.

---

## Two Modes, One App

| Mode | Device | Orientation | Who uses it |
|---|---|---|---|
| **Display Mode** | Tablet (wall-mounted) | Landscape | Everyone — passive viewing |
| **Admin Mode** | Phone or tablet | Portrait | You, GF, eventually family |

Switching modes: small settings icon (or `/admin` route) enters Admin Mode. Display Mode is the default.

---

## Display Mode — Screens

Auto-rotates through screens on a configurable timer (default: 30 seconds). Manual swipe also works.

### Screen 1 — Calendar
- Pulls from `baileyandchrisaug@gmail.com` Google Calendar via read-only API key (no OAuth in v1)
- Shows current week or current month (toggle settable in Admin)
- Events color-coded by calendar, "Today" always highlighted
- Anyone adds to the display by inviting the shared Gmail to their event

### Screen 2 — To-Do List
- Shared household to-do list
- Items: title, optional due date, optional assignee (free text in v1)
- Completed items soft-deleted via `archived_at` — never shown on display
- Admin Mode has an "Archived" drawer to review or bulk-clear

### Screen 3 — Meal Plan
- **Display shows: dinner only** (the one truly shared household meal)
- Clean weekly grid Mon–Sun, single dinner row
- Personal meals (lunch, breakfast) exist in data and admin but never appear on display

### Screen 4 — Countdown Board
- Cards for upcoming events: vacations, concerts, weddings, holidays, etc.
- Each card: event name, Lucide icon, date, days remaining
- Past events auto-hidden
- Managed from Admin Mode

### Screen 5 — 🎊 RSVP Live Board *(Chris & Bailey only — not productizable)*
> Easter egg screen. Uses the existing `rsvps` table in the same Supabase project. Only on your household's instance. Retires after the wedding (October 9, 2026).

- Big hero number: total confirmed guests
- Breakdown: attending vs. declined
- Scrolling list of names
- Warm rose/blush accent color, distinct from the rest of the app
- Auto-removed from rotation after October 9, 2026

### Screen 6 — Photo Slideshow *(v1 stretch goal)*
- Rotating photos from manually uploaded set
- Cut if it adds meaningful complexity to v1

---

## Admin Mode — Features

Optimized for portrait phone use.

### Calendar Admin
- No admin in v1 — events managed by inviting shared Gmail to Google Calendar events
- Future: quick-add form writing to Google Calendar (requires OAuth — post-v1)

### To-Do Admin
- Add / edit / delete items
- Mark complete (triggers soft delete / archive)
- Assign to household member, optional due date
- "Archived" drawer: view past completed items, bulk-clear

### Meal Plan Admin
- Week picker (current week, next week)
- **Dinner:** always shared — tap to enter, applies to everyone
- **Lunch & Breakfast:** per-person toggle "Shared 🏠 / Just me 👤"
  - Shared: visible to all in admin
  - Personal: scoped to your `user_id`, only visible to you
- Personal meals never appear on the tablet display

### Countdown Admin
- Add / edit / delete countdowns
- Fields: name, Lucide icon (picker), date

### Household Settings
- Household / assistant name (e.g. "HACC")
- Display timer interval
- Which screens are active / screen order
- Calendar view: weekly vs monthly

---

## Data Model (Supabase — project `rgvvsgvxmdebcqlokiwv`)

### `rsvps` *(pre-existing — wedding site, untouched)*
| column | type | notes |
|---|---|---|
| `id` | uuid | |
| `name` | text | guest name |
| `attending` | boolean | |
| `guest_count` | integer | default 1 |
| `created_at` | timestamptz | |

### `households`
| column | type | notes |
|---|---|---|
| `id` | uuid | primary key |
| `name` | text | e.g. "Bailey & Chris" |
| `assistant_name` | text | nullable — e.g. "HACC" |
| `google_cal_id` | text | e.g. `baileyandchrisaug@gmail.com` |
| `google_cal_key` | text | read-only API key |
| `display_settings` | jsonb | screen order, timer interval, active screens, calendar view |
| `admin_pin` | text | simple PIN for v1 admin access |
| `created_at` | timestamptz | |

### `users`
| column | type | notes |
|---|---|---|
| `id` | uuid | = `auth.users.id` |
| `household_id` | uuid | foreign key → households |
| `display_name` | text | |
| `role` | text | `admin` or `member` |
| `created_at` | timestamptz | |

### `todos`
| column | type | notes |
|---|---|---|
| `id` | uuid | |
| `household_id` | uuid | foreign key |
| `title` | text | |
| `due_date` | date | nullable |
| `assignee` | text | nullable, free text in v1 |
| `completed` | boolean | default false |
| `archived_at` | timestamptz | nullable — soft delete |
| `created_at` | timestamptz | |

### `meal_plan`
| column | type | notes |
|---|---|---|
| `id` | uuid | |
| `household_id` | uuid | foreign key |
| `user_id` | uuid | **nullable** — null = shared, uuid = personal |
| `week_start` | date | always a Monday |
| `day_of_week` | integer | 0=Mon … 6=Sun |
| `meal_slot` | text | `breakfast`, `lunch`, `dinner` |
| `meal_name` | text | |

### `countdowns`
| column | type | notes |
|---|---|---|
| `id` | uuid | |
| `household_id` | uuid | foreign key |
| `name` | text | |
| `icon` | text | Lucide icon name, default `"calendar"` |
| `event_date` | date | |
| `created_at` | timestamptz | |

---

## Multi-Tenant Architecture

One Supabase project, one Netlify deployment, multiple households. RLS policies ensure each household only sees their own data. Your sister's family is just a new row in `households`.

**Auth strategy:**
- **v1:** Single household, PIN-protected admin, no Supabase Auth required yet
- **v2:** Supabase Auth (email + password), RLS enforced, multi-household

**Onboarding (Phase 3 — gift-ready):**
1. Send URL
2. Create account (email + password)
3. Setup wizard: household name + assistant name, invite members, connect Google Calendar, pick screens
4. QR code for tablet

---

## Technical Decisions

| Decision | Choice | Reason |
|---|---|---|
| Google Calendar auth | Read-only API key, no OAuth in v1 | Shared Gmail model makes this trivial; no token refresh |
| Icons | Lucide (already in habits app) | Zero new dependencies, searchable picker in admin |
| Soft delete | `archived_at` timestamp | Recoverable, auditable, simple |
| Meal plan personal vs shared | Nullable `user_id` | One column, handles both cases cleanly |
| Voice | Phase 4 — Web Speech API first, Alexa skill later | PWA must be solid before voice layer |
| RSVP screen | Reads existing `rsvps` table directly | Same Supabase project, no extra infra |
| Display color palette | Warm parchment + amber + sage | Homey, readable at distance, different from habits app |

---

## Phased Roadmap

### Phase 1 — HACC in the Kitchen (target: June 2025)
- [ ] Repo created: `chrisaug21/homeboard`
- [ ] Deployed at `homeboard.chrisaug.com`
- [ ] Display Mode: Calendar, Todo, Meal Plan, Countdown, RSVP screens
- [ ] Auto-rotation + manual swipe, landscape layout
- [ ] Admin Mode (phone-optimized): all screens + household settings
- [ ] Google Calendar read-only integration
- [ ] Meal plan: dinner (shared) + lunch/breakfast (per-person, admin only)
- [ ] To-do soft delete / archive
- [ ] Countdown icon picker (Lucide)
- [ ] Household assistant name ("HACC") in display header
- [ ] Single household, PIN-protected admin, no auth
- [ ] Running on Android tablet in kitchen

### Phase 2 — Multi-tenant Foundation (target: September 2025)
- [ ] Supabase Auth (email + password)
- [ ] RLS policies enforced per household
- [ ] Multiple household members, invite by email
- [ ] Household onboarding wizard
- [ ] Per-household display settings

### Phase 3 — Gift-Ready (target: November 2025)
- [ ] Onboarding polished, tested with Bailey as Household #2
- [ ] Google Calendar setup instructions in onboarding
- [ ] QR code generation for tablet setup
- [ ] Tested on second physical tablet
- [ ] Photo slideshow screen (stretch)

### Phase 4 — Voice / HACC as AI (post-Christmas)
- [ ] Web Speech API: tap-to-speak commands on tablet
- [ ] "HACC, add milk to the list" / "HACC, what's for dinner?"
- [ ] Alexa custom skill (Bailey's vision — full wake word experience)

### Post-Wedding Cleanup (after October 9, 2026)
- [ ] Remove RSVP screen from display rotation
- [ ] Drop `rsvps` table from Supabase
- [ ] Project is 100% Homeboard's

---

## Decisions Log

| Question | Decision |
|---|---|
| Product name | **Homeboard** |
| Household instance name | **HACC** — Bailey's name, lives in `households.assistant_name` |
| Naming model | Product = Homeboard. Each household picks their own assistant name. |
| Icons vs emoji | **Lucide icons** with searchable picker in admin |
| Meal plan scope | Dinner on display; lunch/breakfast per-person in admin only |
| Per-person meals | Nullable `user_id` on `meal_plan` |
| To-do completion | Soft delete via `archived_at`; archived drawer in admin |
| Tablet orientation | Lock to landscape via Android developer options |
| Lunch personal vs shared | "Shared 🏠 / Just me 👤" toggle in meal admin |
| Voice integration | Phase 4 — Web Speech API first, Alexa skill later |
| Google Calendar auth | Read-only API key in v1, no OAuth until write support needed |
| Supabase project | Repurposed wedding project (`rgvvsgvxmdebcqlokiwv`) |
| RSVP easter egg | Screen 5 — reads `rsvps` table, Chris & Bailey only, retires post-wedding |
| Users vs households | `auth.users` = login identity, `public.users` = app profile + household membership |
| Display color palette | Warm parchment (`#F5F0E8`), amber accent (`#B45309`), sage green (`#15803D`) |
| Battery / dark mode | Budget tablets are LCD — plugged in most of time, palette is aesthetic choice not battery optimization |