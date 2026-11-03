# Isolated routine and default definition rehearsal

After PR #391's table-layer reconstruction, a second offline stage installs
reviewed routine definitions and ordinary column defaults into fresh local PGlite
databases. It creates application schemas which contain functions but no tables;
their absence in a table-only reconstruction must not be mistaken for a source
schema problem.

The private October 30 catalog capture installed 791 of 799 application routines
and 2,530 of 2,534 ordinary defaults. Each successfully installed routine's
`pg_get_functiondef` and each default's deparsed expression matched the capture.
Six routine candidates were deliberately deferred for outbound-effect review.
Two routine declarations and four defaults could not be installed because the
local environment has no managed `auth` schema (`3F000`). The committed summary
names the failures; they are not silently replaced with authentication stubs.

These are **definition comparisons**, not successful function executions. The
rehearsal uses `check_function_bodies=off` to separate installation from dependency
resolution, as recursive/cross-schema routine bodies cannot all be validated in
creation order. A created function may still contain missing dependencies or fail
when invoked. No application function, procedure or default expression is invoked
as a scenario test. Triggers, views, constraints, indexes, policies, real Auth,
source role ownership/grants and publications remain outside this stage.

Every restored routine immediately has PUBLIC privileges revoked in the same
transaction. Source function bodies, security-definer settings and configuration
clauses are retained; source ownership/ACL fidelity is explicitly unverified.
Table RLS remains enabled with no restored policies. The destination has no source
rows, credentials, vault contents, scheduled jobs or outbound extensions. This is
a quarantine environment, not a usable replacement website database.

`scripts/techsafe/restore-definition-layer.mjs` compiles trusted catalog SQL and
offers a diagnostic helper used only by tests on newly constructed in-memory
PGlite instances. There is no Supabase client, credential lookup, branch creation
or deployment command. Catalog payload hashes are checked first. SQL fragments
remain trusted, privately reviewed definitions, not sanitized user uploads.

Each installation runs under a savepoint. A failed definition and its privileges
roll back together, while later independent definitions can be diagnosed. Reports
include identity, column if relevant and SQLSTATE; SQL bodies and database error
messages are excluded. No automatic retry, dependency substitution or production
history repair occurs. Reports always retain `fullBaseline=false`,
`runtimeTestsAllowed=false`, `restoreApproved=false` and `quoteReady=false`.

Validation uses both synthetic captures and the private full capture. Synthetic
checks include a routine/default that would raise if invoked, an outbound-pattern
candidate that must remain absent, PUBLIC privilege removal, exact installed
routine definitions, a procedure, an empty application schema, missing Auth
dependencies, continuing after a failed default and hash tampering. The private
run compares all successful installed definitions/defaults. PGlite runs PostgreSQL
17.5; the source capture came from 17.6. This is not native Supabase compatibility
or a concurrency/load benchmark.

Run `node tests/techsafe/restore-definition-layer.mjs` for CI's synthetic suite.
An optional second argument supplies the reviewed private capture directory used
by the table-layer rehearsal. Raw definitions and generated restore SQL remain
outside the repository; only tooling and sanitized results are committed.

Next work must restore and compare constraints/indexes, resolve managed Auth and
extension dependencies in a native isolated environment, and review direct and
indirect external effects before triggers or application scenarios are enabled.
Routine creation does not certify security, source provenance or quote readiness.
Neither live website/database, existing sales/change-order behavior, observer
activation nor synchronization is changed by this work.
