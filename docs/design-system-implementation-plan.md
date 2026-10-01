# Design system implementation plan

Umbrella issue: #103. Source design system: `design-system/` (read its `README.md` and `guidelines/migration.md` first).

## Goal

Move Homeboard from the old Warm/Dark/Slate schemes onto the new aubergine + marigold + sage system: two themes (Light, Dark, plus "match device"), color driven by the time scale, Rubik + Manrope, flat fills, new logo.

## Rollout: long-running branch

Production must never show a half-redesigned app. So:

- `ca/103-design-system` is the long-running integration branch, cut from `main`.
- Each phase below is a PR **into that branch** (not `main`), on a branch named `ca/<phase issue>-<description>`.
- Merge `main` into the integration branch regularly so it does not drift (bug fixes shipped meanwhile).
- When all phases are done and verified on the real tablet and phone, one final PR merges the integration branch into `main`.
- Each push still bumps `VERSION` in `js/shared.js` and `CACHE_NAME` in `sw.js`.

## Token audit (state before the redesign)

| Problem | Count | Notes |
|---|---|---|
| Dark/Slate override blocks | ~199 (admin.css 111, display.css 88) | Components restyle themselves per scheme. New system needs none. |
| Tokens defined in 3 places | ~35 tokens x 3 | Warm in `index.html`, Dark and Slate in `display.css`. |
| Two accent systems | `--amber` 29 uses, `--color-accent` 51 uses | Migration never finished (see `TOKENS.md` section 7). Each use maps to `primary` or `time-today` by meaning. |
| Hardcoded colors | ~170 hex, ~470 `rgba()` | display.css 64 hex, index.html 39, admin.css 29, signup 17, admin-core.js 14, display-todos.js 11. Many `rgba` are legitimate shadows/overlays. |
| Gradients | 34 | Flat fills only in the new system. |
| Extra fonts | Bricolage, Fraunces, Righteous | Replaced by Rubik + Manrope, self-hosted. |
| One-off token families | 9 `--rsvp-*`, 8 `--marketing-*`, 4 `--onboarding-*`, 6 `--display-nav-*` | Removed or folded into the time scale. |
| Logo via CSS filters | 7 `homeboard_logo.svg` refs | `logo-on-dark.svg` replaces filters. |
| PWA icons | inline SVG data URIs in `manifest*.json` | Old colors; replace with `app-icon.svg`. |
| Person colors in JS | `admin-core.js` (two palettes), `display-todos.js` celebrations | Move to the 8 `person-*` tokens. |
| Doc drift | `CLAUDE.md`, `TOKENS.md` | Describe the old schemes/palette; rewrite at the end. |

### Data decisions (no database migration)

- `households.color_scheme` stores `warm` / `slate` / `dark`. Map `warm` and `slate` to `light` at read time; write only `light` / `dark` / `auto` going forward.
- Member (`display_settings.members`) and scorecard player colors are stored as raw hex. Map to the nearest `person-*` color at render time. An optional cleanup can come later.

## Phases

Each phase is a GitHub issue and one or more PRs into the integration branch.

1. **#95 Design system folder.** Commit trimmed `design-system/` (no `assets/Legacy/`), keep it from being served publicly, add this plan. Docs only. Goes to `main`.
2. **#96 Token foundation.** Add `css/tokens.css`, self-host fonts, switch to `data-theme` (Light/Dark/Match device), temporary alias layer for old token names so the app keeps working.
3. **#97 Cleanup of overrides.** Delete the Dark/Slate override blocks, gradients and hardcoded colors, in chunks.
4. **#98 Chrome.** Eyebrow, nav, footer, logo, favicon, PWA manifests/app icon, `sw.js` asset list.
5. **#99 Display screens**, one PR each: to-dos, upcoming + month calendars, meals, countdowns, scorecards, wedding pulse.
6. **#100 Admin.** Shell and settings (incl. Light/Dark/Match device control), then each screen.
7. **#101 Marketing, signup, privacy.** Self-hosting fonts removes Google Fonts as a third party, so `privacy.html` and its "Third parties" list must be updated in the same PR (required by `CLAUDE.md`).
8. **#102 Cleanup and docs.** Remove the alias layer and legacy tokens; rewrite `TOKENS.md`, `CLAUDE.md`, `README.md`.

## Risks

- Look shifts at phase 2 (old names resolve to new values). Harmless because it all lives on the integration branch.
- Privacy policy must be updated whenever third-party fonts are removed (phase 7, or earlier if fonts are self-hosted sooner).
- Time-scale logic (overdue/today/1-3 days/4-7 days/later) touches to-dos, calendars, meals and countdowns; verify date edge cases (today, tomorrow, week boundaries, timezones).
- Stored person colors cannot be theme-aware; nearest-match mapping needs a visual check with real household data.
