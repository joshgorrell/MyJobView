# Native committed order evidence

Techsafe exports current MJV sold lines. It does not replay change orders,
recalculate contract totals, or implement another equipment reducer.

This batch adds prospective whole-order checkpoints around existing native
change-order commits. It does not replace `approve_and_apply_change_order`,
`apply_change_order` or `commit_staged_change_order_material_revision`.

Before an initial approval or the native staged writer's private transaction
authorization, a trigger verifies current scope against the original immutable
approval or latest verified checkpoint. It locks the Sales Order, proposal and
all current proposal lines. The proposal FK parent lock excludes concurrent
line additions; row locks also exclude unrelated concurrent line edits.
Historical orders without native approval evidence exit before extra scope locks.

The preparation is private and bound to the CO, transaction and backend PID.
After the existing native writer inserts an immutable revision, another trigger
checks the exact native committed CO source and captures the resulting current
whole-order basis. Other CO heads must still match the pre-commit chain. Current
CO lines and monetary headers must match their native committed records, and
their stored source hashes must verify. No historical checkpoint is backfilled.

Certification accepts a committed-order checkpoint only while its original
approval anchor, scope, hash, current native revision heads and current sold rows
match. Staged drafts do not enter sold scope. Uncommitted approvals, reversed
statuses, mutable-source drift and unrelated post-approval edits remain held.
A subsequent native commit cannot launder earlier unverified scope.

Approved removals remain excluded when their CO becomes completed. Hidden
presentation-only equipment still follows the existing source rules. Sold labor
is read from current native rows and excluded with removed equipment; it is not
replayed or added again from historical CO records.

## Storage and deployment

Preparations are exclusively owned by their CO and Sales Order and cascade on
permitted parent deletion. Successful capture consumes the preparation.
Checkpoints are immutable while their native revision and order exist; they are
owned children of those records, with cascading cleanup only if native deletion
is permitted. Existing native immutable-history deletion restrictions remain in
place. Failed deletion and transaction rollback preserve the evidence. There
are no Flow, notification, note, attachment or external-copy children for these
private records; independent business records are not deleted by this batch.

Both tables force RLS and deny API-role access. Trigger helpers are in the
private schema, have fixed empty search paths and no API-role EXECUTE grants.
No connection, credential, checkout, payment or coverage is enabled.

Apply the migration before deploying the source sender/runner graphs. Existing
historical applied-change orders still need independent reconciliation. The
sandbox credential configuration and automatic dispatch remain separate work.

## Verification

The fixture runs existing native RPC implementations from repository migrations,
including initial application and staged material revision. It exercises actual
checkpoint triggers, immutable source verification, certificate creation and
immediate delivery authorization. Cases include additions, removals/completion,
pending revisions, replay denial, original labor exclusion, historical refusal,
later-commit drift refusal, rollback, private ownership cleanup and tenant denial.

The same fixture runs on PostgreSQL 16 in CI. A second connection attempts an
unrelated proposal-line edit and a new line insertion while the native commit
transaction is open; both must hit lock_timeout. This verifies the parent/row
locks protect the complete order scope, not merely the CO's target lines.
