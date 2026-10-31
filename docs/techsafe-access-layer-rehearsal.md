# Isolated view and access-policy reconstruction

This extends PR #393's local Auth interface with the captured application's views,
row-security settings and policies. The private full-capture rehearsal installed
all 16 views and all 1,235 policies, and matched the source's RLS settings on all
386 application tables. Every compared view definition, view option/column shape,
policy definition and RLS/force-RLS flag matched. There were no access-stage
installation failures or definition differences. Earlier constraint-grouping
findings remain independently reported; this stage does not erase them.

All captured views explicitly use `security_invoker=true`; the compiler rejects
non-invoker views instead of changing their security behavior silently. It retains
the captured column names and supported view options, then revokes PUBLIC view
privileges. View creation retries only missing-relation/function errors while
progress occurs, with a bound of at most one pass per captured view. An unresolved
or non-dependency failure remains explicit; no stub view or function is invented.

All captured application tables already have RLS enabled and force-RLS disabled.
The compiler currently requires source RLS to be enabled. It preserves each
policy's command, target roles, permissive/restrictive mode, USING and WITH CHECK.
Policy role sets are compared by role name, without depending on source/local OID
allocation. Tables, routines and views remain owned by the local test owner; this
does not restore or verify source ownership and ACLs.

The only named policy roles are `anon`, `authenticated` and `service_role`. Local
rehearsal roles have no login, superuser, RLS bypass or role memberships. Existing
roles with any of those properties are rejected and the access-stage transaction
rolls back. No source grants/default ACLs, secrets or credentials are restored.
In particular, the local `service_role` deliberately does **not** reproduce the
managed provider's privileged service role. This is a quarantine setup, not proof
of native provider permissions or an externally accessible app database.

Synthetic tests create two tenant actors and a restrictive visibility rule, using
the previously reviewed local claim readers. With explicit fixture-only grants,
invoker/nested views return only the current actor's permitted rows; a restrictive
policy filters a hidden same-tenant row. Cross-tenant inserts and reassignment
updates fail WITH CHECK, missing claims yield no rows, and anonymous reads without
grants are denied. Native installed view/options/column/policy/RLS metadata match
the synthetic source. Additional tests reject non-invoker/tampered captures and
elevated existing roles, resolve a reverse-ordered nested view, and terminate an
unresolved dependency with a diagnostic. This validates the rehearsal mechanics
and generic tenant behavior, **not every source policy or production access path**.

CI runs `node tests/techsafe/restore-access-layer.mjs`. The private full replay is:
`node tests/techsafe/restore-constraint-layer.mjs /reviewed/capture --local-auth-interface --access-layer`.
It retains all prior routine/default/constraint/index comparisons and adds the
access-stage summary. Tests run on fresh PGlite 0.3.14 / PostgreSQL 17.5 using the
previously verified October 30 source capture from PostgreSQL 17.6. Raw source
definitions remain outside the repository; committed results contain counts,
identities and flags only. No current live-schema equivalence is implied.

Captured SQL is trusted, privately reviewed SQL rather than sanitized user input.
DDL can resolve/evaluate expressions, so this runner is only for disposable local
databases without production credentials, source rows, jobs or outbound extensions.
There is no Supabase client or deployment command in this tooling. Per-item
savepoints isolate failures; sanitized reports omit raw SQL and error messages.

`nativePermissionsVerified`, `fullBaseline`, `runtimeTestsAllowed`,
`restoreApproved` and `quoteReady` remain false. Source owner/ACL/default-ACL and
role behavior, native Auth/extension compatibility, reviewed business triggers and
external effects, source evidence ambiguities and financial/failure/load/concurrency
scenarios remain pending. Neither live website/database, migration history,
existing sales/change-order workflow, observer state, synchronization nor coverage
is changed.
