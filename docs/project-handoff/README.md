# Project handoff implementation

This branch carries proposal work instructions into projects and technician visits, including approved changes. It has not been deployed. The database migrations and matching UI must be released together.

## Implemented behavior

- Labor-bearing items create editable tasks by default, including programming and phase labor. Intentional deletion or consolidation does not reseed tasks. One shared layout groups by room by default or labor phase, and shows task, group and overall estimates. Manual estimates remain manual.
- New projects retain an immutable sold snapshot of overall scope, room scope, equipment instructions and task definitions. Approved changes publish separate immutable scope versions and reconcile project tasks in the same approval transaction. Project managers and technicians can read the original and approved versions.
- Removing an item in a change order offers keep labor or remove labor, including added items and bulk removal. Keeping labor converts the source into a visible labor-only line with its labor and tasks retained; removing both cancels outstanding work without erasing completed history. Application retries do not duplicate lines or snapshots.
- Duplication and revision copy rooms, items, phase labor, task instructions, estimates and coverage using new mapped IDs. Intentional task deletion remains respected. Legacy recovery is an explicit preview and selected-item repair; a reviewed snapshot is honestly labelled and never presented as a recovered original sold scope.
- Every creation entry point uses the universal work-order form, including service work. Selecting a project loads its customer/site and selectable tasks. Work-order types and scheduling fields are identical across origins. Each technician gets a separate visit and independent task choices/instructions.
- Work orders, tasks, parts and linked service scheduling commit atomically. The server validates organization, project, customer and technician relationships. Today's Work shows visit assignments; Full Project includes scopes, equipment, all tasks and cross-visit history.
- Partial, blocked and finished portion are distinct from completing the entire project task. Retry IDs and expected versions protect progress updates; stale updates require explicit review. Close-out saves the visit outcome and completion record atomically.
- Opening a visit online saves its full instructions locally. Offline progress is durably queued per account with its original retry ID and version. Reconnect retries are serialized; conflicts retain the notes for review instead of silently overwriting newer work.
- The existing single whole-record pop-out remains the proposal/sales-order workspace, including related tabs. It does not overwrite the main site's navigation state. Task and sales-order scope drafts survive refresh in that tab; unsaved editors warn before closing.

## Verification

- `npm run test:handoff`: PGlite PostgreSQL checks against connected schema column definitions, React runtime tests and offline queue tests. Covers atomic failure/retry, tenant boundaries, shared/distinct assignments, progress/history/reopening, close-out, deletion exclusions, retained labor, approved snapshot rollback, revision and duplication mapping, reviewed legacy repair, account isolation and conflicts.
- `npm run test:handoff:browser`: component browser fixtures covering Light/Dark at 320px, 390px, a short viewport and desktop, scopes, offline instructions, persistent task drafts, labor choices and form parity. These use mocked application data and do not establish production sign-in or physical iPhone behavior.
- `npm run build` passes. Repository-wide TypeScript checking has pre-existing failures; comparison to current main found no additional error signatures in this change.

## Final audit corrections

The final pass checked the connected database's triggers, constraints and policies. Regression fixtures now include automatic proposal-settings creation, settings uniqueness, purchased-part cost validation and labor recalculation on line-item writes. Corrections allow retained labor to have zero equipment cost, replace fresh default settings atomically when copying content, remove the equipment charge from newly added retained-labor records, make retention retries idempotent, and clear hidden labor charges on full removal. Original snapshots include phase instructions; general equipment notes are visible to technicians, deleting a labor phase refreshes automatic estimates, and new projects/sold snapshots exclude fully removed work even when copied from a prior order. The repeat build, handoff and responsive browser checks passed after these corrections.

## Release and field checks

Review and apply both handoff migrations with the matching UI on a staging database before production. Exercise signed-in role permissions and all creation entry points against real records, large projects, account switching, all-day session refresh, concurrent edits and field connectivity. Older original scopes cannot be reconstructed when no source was recorded; use the explicit legacy review. Native mobile-client parity is a separate delivery if that client is used. No production data migration, merge or deployment has been performed.
