# Native approval source certification

The new private path is `createNativeTechsafeOrderSender` in
`supabase/functions/_shared/techsafe-native-order-sender.mjs`. It composes real
PostgreSQL approval verification, certificate/export persistence, the existing
Sales Order sender, immediate delivery reauthorization, and generation-bound
private receiver credentials. It is disabled by default. It does not activate an existing connection. The authenticated
`techsafe-send-sales-order` Edge Function independently verifies dealer-admin
identity and organization before invoking the composed sender. It is disabled
unless `TECHSAFE_NATIVE_SENDER_ENABLED=true` and a private
`TECHSAFE_SOURCE_DATABASE_URL` is configured; receiver secrets remain separate.

Apply `20261113152226_techsafe_native_approval_basis.sql` before using this path.
The deferred native proposal-approval trigger records sold facts only when the
Sales Order is newly created in that approval transaction. It captures the final
transaction state, includes sold labor, excludes cost/margin/internal notes, and
stores an immutable original basis. Reopening a historical order never backfills
or certifies its mutable current rows. Ordinary historical orders are untouched.

Certification owns a SERIALIZABLE transaction and verifies an active binding,
current native approval basis, complete sold parts/labor, and generation. Only
then does it persist a candidate revision and the existing complete-equipment
certificate, with the exact v2 export and event. An identical retry reuses the
persisted event/revision. Changed customer/completion/settings data requires a
new revision. Failed certification rolls back revision, certificate, and export.
A separate SERIALIZABLE delivery gate rechecks current source and the exact
persisted export. The legacy SQL authorizer continues denying other paths.

This initial path supports clean newly approved orders without applied change
orders. Draft COs do not change sold scope. Any approved/applied CO still requires
a verified native committed-change boundary and is held; it is not replayed over
current Sales Order rows. Julio's legacy discrepancies remain unresolved, and
none of his equipment is restored by this change.

## Remaining live work

- Provision a restricted private SQL connection and generation-matched receiver
  secrets in the runtime. Never store them in Git, chat, logs, or browser data.
- Verify authenticated runtime invocation after private configuration.
- Pair a clean native-approved test Sales Order and perform the first controlled
  receiver import with checkout disabled.
- Extend source commitment to approved CO updates, then verify actual receiver
  replay/update behavior and purchased-plan immutability end to end.

`node tests/techsafe/native-approval-basis-postgres.mjs` runs actual PostgreSQL
SQL using pinned PGlite. It covers native deferred capture, legacy rejection,
changed financial/scope facts, role isolation, source certificate/export writes,
retry identity, real source-to-sender composition, stale/fabricated delivery,
held connections, single-connection pool safety, and rollback after write failure.
The final HTTP receipt is simulated; this is not a production import test.
