# Backend migration: progress log

Start every new thread here. Read `docs/backend-migration-spec.md` (the plan), then this file (where we are).
Update this file in every migration PR.

## How we work
- Small PRs that merge to `main` within a day or two. No long-lived migration branch, no long-lived worktree.
- New backend code lives in `server/`. Frontend changes stay behind `BACKEND=supabase` (default) vs `BACKEND=api`.
- Until cutover, every schema change is applied to BOTH live Supabase and the new Postgres (Drizzle migration).
- A thread that can't finish its piece pushes a draft PR; the next thread checks out that branch by name.

## Current phase
**Phase 0: Inventory** (written, awaiting owner review; see `docs/migration-inventory.md`)

## Done
- Spec committed to `docs/backend-migration-spec.md`.
- Phase 0 inventory drafted in `docs/migration-inventory.md` (2026-09-30). It found 10 spec corrections and some security-relevant items that are tracked privately (not in this public repo) until resolved.

## Next
1. Owner reviews `docs/migration-inventory.md`; decide on the privately-tracked security items (fixed in separate PRs, described neutrally).
2. Apply the 10 corrections in section 5 of the inventory to `docs/backend-migration-spec.md`.
3. Phase 1: adapter layer + local Postgres.

## Open decisions
See the "Decisions deferred" table in the spec; each has a phase where it gets decided.

## Notes
- Wedding RSVP board hides after Oct 11, 2026. `rsvps` is not touched until Phase 7.
