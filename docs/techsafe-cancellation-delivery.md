# Native cancellation delivery

The existing private native sender first checks the locked Sales Order and its
owning proposal. If either is natively cancelled, or a transactionally captured
native deletion tombstone exists for the exact connection scope, it sends the receiver's existing
negative `hold` contract with reason `source_unavailable`. It sends no equipment,
customer details, completion claims, pricing or coverage authorization.

The hold is persisted before HTTP in `techsafe_source.negative_order_exports`.
It shares the existing per-order revision ledger with positive snapshots, uses
one durable event ID for identical retries, and is rechecked against the native
source, active connection, generation and ledger immediately before delivery.
Reopening between preparation and authorization blocks the stale cancellation.
The database connection is released before network IO. Receipt identities must
match before the sender reports acknowledgment.

Deploy the matching Techsafe receiver fix first: pricing thresholds must be added
only to snapshots, never holds. Then apply the reviewed negative-export storage
migration and deploy the MJV sender. Missing storage or a held/paused/revoked
connection fails closed. No connection is activated by this batch.

This wires cancellation into explicit native sender invocations. Automatic
event scheduling/retry remains outstanding. A cancelled or deleted order must
still be dispatched; local invalidation alone is not remote
delivery. Positive approved-change certification remains separate.

The receiver holds new imported-flow pricing/checkout and retains the last
snapshot. Native proposal equipment, payment records and purchased coverage are
not rewritten by the hold. Final activation/payment enforcement remains gated on
the separately reviewed financial schema and lifecycle wiring.

## Ownership and deletion

Negative export rows are exclusively owned children of their composite revision
ledger key. A foreign key cascades only those private retry rows when the owning
ledger row is deleted, in the same transaction. There are no polymorphic Flow
references, notes, attachments or credentials for this new private record type.
Independent native orders, customers, proposals and remote receipts keep their
existing lifecycle and deletion restrictions. Database tests cover scoped cleanup,
rollback and preservation of the native order.

## Permitted native Sales Order deletion

Techsafe does not decide whether MJV permits deletion. Native billing,
procurement and other business restrictions remain unchanged. The integration's
two Sales Order foreign keys previously added an unintended blanket restriction;
the deletion migration replaces those keys with exact live-scope validation on
connection creation/rebinding and preserves the existing identity-update guard.

A permitted native DELETE captures only order/organization/proposal identity and
deletion time in a private tombstone, in the same transaction. Native approval
evidence is an exclusively owned child and cascades; direct mutation of evidence
for a live order still fails. The connection, revision stream, export receipts and
independent native proposal remain independent records. There are no Flow,
notification, note or attachment children of this tombstone. No native invoice,
purchase order, customer or remote purchased coverage is deleted by Techsafe.

The tombstone authorizes negative delivery only. Missing source rows without a
tombstone do not qualify. A reused deleted UUID cannot revive a connection. A
deletion between preparation and delivery invalidates the older cancellation
event; retry produces a later stable deletion hold. Paused/revoked connections
still fail closed. Native failure/rollback restores evidence and removes the
uncommitted tombstone. Tests exercise deletion, rollback, restricting native
children, organization isolation, preserved provenance and stale-event denial.

Deploy the migration before the matching sender (the sender reads the new
tombstone table), after the compatible receiver is already deployed. No
connection is activated and no historical deletion is inferred or backfilled.
