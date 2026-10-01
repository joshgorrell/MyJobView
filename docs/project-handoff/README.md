# Project handoff implementation

This branch implements the coordinated task authoring, sold snapshot, shared work-order form and visit progress foundation from the September 30 audit. It is not deployed. Keep this PR draft until the remaining integration and field checks below are finished.

## Implemented

- Proposal editors write `proposal_tasks`. Labor updates seed never-seeded items; row locking prevents duplicate seeding. Intentional task removal/consolidation remains excluded. Tasks carry quantity-adjusted allocated estimates, instructions and explicit covered item IDs.
- One task list layout groups by room by default, with phase grouping and group/overall estimates. Tasks missing hours or phases remain visible.
- New projects capture immutable overall and room scopes, equipment notes and task definitions. Old jobs are not automatically labeled as original scope. Proposal tasks copy estimates, coverage and sold room names into stable project tasks.
- The project-specific form is an adapter to the universal work-order form. Project selection loads its customer/site for linked project/service/warranty orders. Phase is optional. Multiple technicians independently select tasks, copy selections, and add their own visit instructions. Master task text is retained separately from visit instructions.
- Work orders, tasks, parts and linked service request scheduling commit atomically with retry protection. Server checks task/project/customer/technician/organization relationships. Approved-project creation failures no longer commit just a warning.
- Today's Work contains only explicit visit assignments. Full Project shows original sold scopes, equipment, all statuses, room/phase/status filters and permanent cross-visit history. Earlier completion notes remain visible; no time/payroll totals are changed.
- Progress distinguishes partial, blocked, finished portion and explicit entire-task completion. Project status retains the existing open/completed/cancelled vocabulary for portal compatibility, with a separate progress status. Final completion never falsely completes other technician visits. Reopening preserves activity; cancelling work visibly cancels outstanding assignments.
- Progress retries are idempotent and stale assignment versions are rejected. Visit close-out requires task outcomes and atomically saves the visit status and completion record.
- CO application failures are surfaced instead of reporting success.

## Remaining before ready-to-merge / rollout

1. Stage 5: approved change-order task/scope reconciliation, parts-only removal semantics, approval transaction coverage, and proposal duplication/revision mapping of new estimate/coverage fields. Existing CO code does not yet publish a full current-approved scope packet. This is a release blocker for projects using changes.
2. Stage 5: separately reviewed legacy data repair and verified original-scope recovery. No automatic backfill runs in this branch.
3. Stage 6: authorized iPhone/browser checks across all six creation entry points, large-project loading and Light/Dark appearance. Runtime component tests do not establish visual or signed-in permission parity.
4. Stage 6: full offline job packets, durable queued progress and conflict review after reconnect. This branch rejects stale online saves; it does not claim completed offline sync.
5. Whole-record pop-out routes remain in place. Verify all-day authentication refresh, unsaved-edit protection and concurrent edits on a second monitor. No new task/scope/work-order pop-outs were added.
6. Verify every target deployment against the connected schema before applying this migration. Native mobile parity remains a separate delivery if that client is used.

## Verification

`npm run test:handoff` exercises PostgreSQL functions against column definitions from the connected MJV database in PGlite, plus the runtime React harness. It covers atomic batch failure/retry, project and tenant mismatches, distinct/shared assignments, partial versus final completion, cross-visit history, reopened history, immutable original scope, labor-update seeding/deletion, stale progress and atomic close-out.

`npm run build` passes. Repository-wide TypeScript checking has existing failures outside this feature; the detailed check output must be reviewed for changed-file regressions. No production migration or deployment has been performed.

The staged schema and UI must be reviewed and released together. Do not apply the migration independently of its matching UI.
