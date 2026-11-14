# Sales Order completion clock

The 14-calendar-month purchase window starts at the first native Sales Order
transition to `complete` or `completed`. Work Order completion dates are not used.
The dedicated clock and its history flag cannot be rewritten by ordinary inserts
or updates. Reopening and re-completing an order preserve its original date.

The export keeps the current order status (`open` after reopening) and carries
the original `completedOn` whenever one exists. Techsafe must enforce age for both
open and completed snapshots carrying that date. Receiver persistence also
rejects attempts to clear or advance an already observed completion date.

Deployment order:

1. Merge and deploy the matching Techsafe receiver/contract/checkout changes.
2. Apply only the reviewed MJV completion-clock migration and deploy the matching
   source reader/sender. Missing schema fails closed.
3. Create a fresh native-approved sandbox order after the migration, then verify
   completion, reopening, expiry, identical retry and rollback across projects.

All pre-migration Sales Orders have unverified history and remain held. No date
is backfilled from a Work Order, current status, creation date or migration time.
Historical reconciliation needs independent Sales Order completion evidence and
a separate reviewed repair. Existing purchased coverage is unchanged.

This batch does not implement approved-change certification, cancellation/hold
delivery, or the missing native payment/activation SQL. Production stays paused.
