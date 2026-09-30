# Backend migration: progress log

Start every new thread here. Read `docs/backend-migration-spec.md` (the plan), then this file (where we are).
Update this file in every migration PR.

## How we work
- Small PRs that merge to `main` within a day or two. No long-lived migration branch, no long-lived worktree.
- New backend code lives in `server/`. Frontend changes stay behind `BACKEND=supabase` (default) vs `BACKEND=api`.
- Until cutover, every schema change is applied to BOTH live Supabase and the new Postgres (Drizzle migration).
- A thread that can't finish its piece pushes a draft PR; the next thread checks out that branch by name.

## Current phase
**Phase 0: Inventory** (not started)

## Done
- Spec committed to `docs/backend-migration-spec.md`.

## Next
1. Phase 0: write `docs/migration-inventory.md` (read-only; no code changes).
2. Review the inventory and correct the spec where reality differs.
3. Phase 1: adapter layer + local Postgres.

## Open decisions
See the "Decisions deferred" table in the spec; each has a phase where it gets decided.

## Notes
- Wedding RSVP board hides after Oct 11, 2026. `rsvps` is not touched until Phase 7.
