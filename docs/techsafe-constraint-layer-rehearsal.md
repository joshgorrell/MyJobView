# Isolated constraint and index rehearsal

This extends PR #392's offline definition reconstruction with primary/unique keys,
check constraints, foreign keys and indexes. The only runner uses newly constructed
in-memory PGlite databases. There is no Supabase client, production migration or
connected-database deployment command.

The full private capture installed 2,178 constraints (531 primary/unique keys, 525
checks and 1,122 application foreign keys) and all 1,893 indexes. It reused 531
matching backing indexes and created the remaining 1,362. Of 4,071 compared native
definitions, 4,070 matched exactly. The check
`public.proposal_loss_feedback.proposal_loss_feedback_reasons_check` deparsed with
different AND grouping/parentheses after reconstruction. That difference is
reported, not normalized away or certified equivalent. It remains a fidelity
finding for native-environment review. Another 41 foreign keys require managed
`auth.users` and failed explicitly with `3F000`; they were not replaced by a fake
Auth table. Six constraint triggers remain deferred.

Catalog payload hashes are verified before compiling trusted SQL. Keys install
before foreign keys so the referenced application keys exist. Captured constraint
definitions preserve deferrability, validation state and referential actions.
Invalid/not-ready source indexes fail compilation. Six source constraint triggers
remain deferred alongside all other business triggers; installing a foreign key's
internal PostgreSQL triggers does not install application notification/workflow
triggers.

Primary/unique constraints create their own indexes. The index stage reads any
already existing object's native index definition, validity and readiness, and
reuses it only on an exact match. A same-name object with a different definition
is an explicit diagnostic failure. `IF NOT EXISTS` is not used to hide mismatches,
and no existing index is dropped or rewritten.

Each item runs under a savepoint. Missing managed Auth tables and other failed
dependencies are recorded by object identity and SQLSTATE while independent work
continues. A custom index-mismatch diagnostic has a null SQLSTATE and a separate
reason. Reports exclude raw SQL bodies and database error messages. Successful
objects are compared against the capture using native `pg_get_constraintdef` and
`pg_get_indexdef` metadata, including validation/validity/readiness fields.

The synthetic suite tests actual FK, primary-key and check enforcement, including
a `NOT VALID` constraint's enforcement on new writes. It also tests deferred FK
syntax, expression/partial/covering indexes, exact reuse of backing indexes,
same-name index mismatch rejection, missing Auth isolation, deferred constraint
triggers and corrupt capture rejection. These are generic structural tests, not
MyJobView business or financial scenarios. Source application data is not copied.

DDL can resolve or evaluate expressions, so privately review raw definitions
before using them even on a test database. This rehearsal runs without production
credentials, managed services, outbound extensions or source rows. The prior
routine/default stage defers outbound-pattern candidates and restores no source
privileges; table RLS remains in quarantine mode. None of this certifies safe
execution of all direct or indirect application routines.

Run `node tests/techsafe/restore-constraint-layer.mjs` for CI's synthetic suite.
An optional second argument names the reviewed private capture directory for the
complete structural replay. The sanitized full-capture results are committed in
`techsafe-constraint-layer-summary.json`; raw captures and generated restore SQL
are not committed. It uses PGlite 0.3.14 / PostgreSQL 17.5 against the previously
verified October 30 source capture from PostgreSQL 17.6, not a fresh live-schema
assertion or a native Supabase restore.

`fullBaseline`, `runtimeTestsAllowed`, `restoreApproved` and `quoteReady` remain
false. Native managed Auth/extension compatibility, views, source owners/ACLs,
default ACLs, policies/RLS fidelity and reviewed business triggers are still
required before baseline-versus-observer application, financial, failure, load
and concurrency scenarios. Existing source evidence ambiguities remain unresolved.
No production schema/history/data, sales-order/change-order workflow, connection
control, observer activation, sync worker or Techsafe coverage is changed.
