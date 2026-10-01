Homeboard is a household command center: a wall tablet in the kitchen that rotates through the week's calendar, to-dos, dinners, countdowns, scorecards and the wedding pulse, plus a phone admin app for updating it. It should feel like part of the home: warm, a little garden-and-kitchen, calm enough to live with all day, and readable from across the room.

## Brand idea

**A roof over a board.** A marigold roofline over an aubergine board with a week of days: one day lit marigold (today), one fern (a nod to the garden). The palette is one dark, one bright, and a green family around them:

- **Aubergine** `brand-aubergine`: the dark. Structure, identity, the logo, the eyebrow.
- **Marigold** `brand-marigold`: the bright. Today, the roof, dark-mode actions.
- **Greens**: `brand-sage` for soft fills, `brand-fern` for graphics and the logo, `brand-leaf` for green text.
- **Red** `brand-red`: the only alarm.
- **Linen** and **Night**: the light and dark grounds.

Never pair aubergine with another dark (navy, black) as equals. Never put two yellows side by side. No gradients anywhere: flat fills only.

## Content fundamentals

- Write like a note on the fridge: short, plain, second person ("You're all caught up", "Pair this display").
- Sentence case everywhere. Uppercase only in the eyebrow label and `household-name`.
- The product is **Homeboard** in prose; the wordmark is set lowercase `homeboard`.
- Let numbers carry the message. A countdown on its day reads **Today!**, never "0 days". Tomorrow reads "1 day".
- Relative dates beat absolute ones inside a week: "Wed · in 2 days", "Sunday". Past a week: "Oct 14".
- No emoji in UI chrome.

## Themes

Two themes, **Light** and **Dark**, plus "match device". Display and admin can each pick their own. They replace Warm, Dark and Slate.

## The time scale

Anything with a date (tasks, calendar days, month cells, meals, countdowns) takes its color from how soon it is. This is the system's main source of color, so most of the screen stays neutral and the colored things mean something.

| When | Treatment | Tokens |
|---|---|---|
| Overdue | **Solid** red card, white text, ⚠ in the date line | `time-overdue`, `on-time-overdue` |
| Today | **Solid** marigold, dark text | `time-today`, `on-time-today` |
| Next 1-3 days | Soft sage fill + fern edge, leaf date text | `time-soon`, `time-soon-edge`, `time-soon-fg` |
| 4-7 days | Soft aubergine fill + edge, aubergine date text | `time-week`, `time-week-edge`, `time-week-fg` |
| Later | Plain `card` | `card`, `muted` |

- **Act now = solid; coming up = soft fill with an edge.** Red outranks marigold: overdue is a problem, today is "pay attention".
- Edges go on the left of cards (`time-edge`, 6px) and on top of columns and cells (5px).
- Every tier also says it in words ("2 days overdue", "Due today", "in 2 days"). Color is never the only signal.
- Completed tasks show a `done` check during the celebration, then leave the list.

**Per screen:**

- **Upcoming (week):** today's column solid marigold with a dark "TODAY" tag; the next 3 days soon, with their event chips in `time-soon-chip`; the rest plain. The week tier is skipped here, since every column is already this week.
- **Month:** today's cell marigold, the next 3 days soon, past days at 70% opacity, outside-month days at 45%.
- **Meals** ("Meal plan - Dinner": a two-column grid of seven day cards plus a "This week" note card, each centered: date label, meal name, type): tonight's card marigold with a "TONIGHT" tag; the next 3 days soon. Meal type is a monotone icon + word in the tier's color, not a colored pill with an emoji. The note card is `time-week` with a `time-week-edge` left edge.
- **To-dos:** the full scale.
- **Countdowns** (anticipation, not action, and often months out) use their own four-step ramp that warms as the day nears: 31+ days `countdown-far` (neutral); 8-30 days `countdown-later` (sage); 1-7 days `countdown-soon` (fern, white display text); on the day a full `time-today` marigold panel reading **Today!**. The photo, when present, keeps the left 40%.

## Screens that aren't about time

- **Scorecard:** players are identified by their person color (dot + name). The leader's card gets a 2px marigold border and a marigold "Leading" tag; past-game winners are marigold pills. Score buttons stay neutral `card`. Score changes flash `success` or `danger`. Bonus-round results: `success` for correct, `danger` for incorrect, always with the word.
- **Wedding pulse:** the confirmed number and section labels use `love`. Stat tiles are neutral `card`, except the one that needs your action (Review RSVPs, when above zero), which goes solid marigold with an arrow. Guest tiles: attending = sage, undercount = sage with a marigold edge and ⚠, declined = faded and struck through, pending = plain with a dashed border.

## Pills, dots and text

Pills are for short labels only, never for metadata.

- **Keep as pills:** the eyebrow, "Today"/"Tonight" tags, "+2 more", the scorecard "Leading" tag, past-game pills.
- **Dates** are text in the tier's `-fg` color, in the `meta` style.
- **People** are a 9px dot in their person color + their name, never a tinted chip. On solid red or marigold cards, dot and name take the card's text color.
- **Meal types** are an icon + a word.

## Person colors

Eight colors for household members and scorecard players: `person-blueberry`, `person-berry`, `person-lagoon`, `person-clay`, `person-iris`, `person-olive`, `person-cocoa`, `person-moss`. Each has a light and dark value and holds 5:1+ as text on every light fill. None is marigold, red or aubergine, so identity never reads as status. Use them for the dot + name, calendar event bars (3px left edge), and scorecard names. Players use the first six.

## Admin app

The phone admin (a PWA, also usable on desktop) follows the same tokens, themes and time scale, with denser layouts.

- **Header:** the mark (`mark.svg` / `mark-on-dark.svg`), an "ADMIN" pill styled like the eyebrow, the version in `caption`/`muted`, and the settings gear.
- **Sections:** `surface` panels with a Rubik `card-title`-weight heading, a `muted` subtitle, and a `primary` "+ Add" button top-right.
- **Bottom tabs:** icon + label, `muted`; the active tab is a `primary` pill with `on-primary`.
- **Lists mirror the display:** to-dos use the full time scale on the whole card; meal days use today/soon tiers with icon + word for type; event rows show "in 2 days" style dates in the tier color; countdowns show a small distance tag in their ramp color (sage 8-30 days, fern 1-7, marigold today; plain text past 30).
- **Wedding RSVP:** "Needs review" rows get a marigold left edge and "⚠ Duplicate" (or the issue) as text, not a pill; confirmed parties are `countdown-later` tiles, partial parties add the marigold edge and "⚠ 1 of 2".
- **Controls:** primary buttons `primary`/`on-primary`; secondary buttons `card-sunken` with `ink`; destructive actions `danger` text, or `danger-soft` fill with `danger` text for full-width buttons ("Unpair this display"). Checkbox and radio rows are `card` with a hairline border; selected rows get a 1.5px `primary` border and a filled `primary` control. Never fill selected rows with a tint.
- **Theme setting:** a three-way segmented control (Light, Dark, Match device); the selected segment is `primary`.
- **Inputs:** `card` fill, `border` hairline, `focus` ring on focus. Empty states and codes use a dashed `border`.

## Chrome

- **Eyebrow:** every display screen starts with the screen-type pill, top-left: `eyebrow-bg` with `eyebrow-fg` icon and label. Aubergine + marigold in Light; lifted aubergine + marigold in Dark.
- **Nav:** neutral `card` buttons with `muted` icons; the active tab is `primary` with `on-primary`, and slightly wider.
- **Footer:** `logo.svg` (Light) or `logo-on-dark.svg` (Dark) bottom-left at about 22px tall; sync time and version in `caption`, `muted`, bottom-right.
- **Main panel:** `surface`, `radius-lg`, one `shadow`, on a flat `bg`.

## Type

- **Rubik** (`display`) for anything read from across the room: numbers, day headers, meal names, countdown names, scores. Weights 700-800.
- **Manrope** (`ui`) for everything you read up close: task titles, notes, meta lines, labels.
- Display numbers use tight tracking (-0.02 to -0.04em) and line-height 1. `caption` is the smallest size on the wall.

## Spacing, radius, elevation

Spacing runs `space-1` (4px) to `space-7` (36px); `space-3` is the default gap. Big soft corners on containers (`radius-lg` 28, `radius-md` 22, `radius-sm` 16), squarer controls (`button-radius` 8). One shadow. Motion uses one curve: `560ms cubic-bezier(0.22, 1, 0.36, 1)`.

## Focus and states

- Focus: 3px solid `focus` ring, 2px offset.
- Hover (admin): `card-sunken` fill.
- Celebrations (task done, game won) use confetti in marigold, sage, fern, aubergine and the players' person colors. No red.

## Logo

- **Lockup** (`logo.svg`): the tiled mark + `homeboard` in Rubik ExtraBold, sized so the ascenders reach the top of the tile and the baseline sits on its bottom. Light grounds.
- **On dark** (`logo-on-dark.svg`): the mark without its tile (linen board, marigold roof) + light wordmark. Use this instead of any CSS filter.
- **Stacked** (`logo-stacked*.svg`) for square spots: pairing screen, app store, avatars.
- **Mark** (`mark.svg`, `mark-on-dark.svg`) where the name is already on screen; 16px minimum.
- **Mono** (`logo-mono.svg`, `mark-mono.svg`): one ink, cells knocked out.
- **App icon** (`app-icon.svg`): full-bleed aubergine square for PWA and home-screen icons.
- Clear space: one roof-stroke width on every side. Don't recolor cells, add a chimney, rotate, or reset the wordmark.

## Brand banners

`Banners/` holds the roof-over-board graphic opened up into blocks: 3:1 for website headers, 4:1 for social covers, and name-free versions, each in Light and Dark. They're graphics, not logos; don't put them in the app chrome.
