# Isolated schema replay blocker

## Result on October 30, 2026

MyJobView #388 was verified merged. A dedicated temporary Supabase development branch was created with with_data=false to attempt full-schema validation. It reached MIGRATIONS_FAILED before any Techsafe migration ran. Read-only inspection found zero public application tables and zero recorded applied migrations in that branch. Its PostgreSQL logs recorded SQLSTATE 42601 while replaying the first legacy migration, 20251104191142 (create_customer_pipeline).

The branch was deleted after the diagnostic and its removal was verified. No production row, schema, source function, migration history, observer control or connection was changed. Other development branches were left untouched. A subsequent read-only production check still found no techsafe_source schema and the unchanged baseline applier hash 4bfa9641b1dc7fe4bddd52148b025597f8d775852eeb656b1cadaab7d2c997bd.

This prevents faithful full-schema validation through the current automatic branch replay. It does not establish a Techsafe runtime failure, and no full-schema observer, financial-trigger, load or concurrency test is claimed as passed.

## Evidence

The first recorded production migration statement is 1320 characters long. It contains 39 literal backslash-n sequences and zero actual line-feed characters. Its first bytes are 2f2a5c6e2020: a block-comment opener followed by a literal backslash and n, rather than an actual newline. In contrast, the repository's original SQL file uses actual line breaks.

Executing the captured first statement in disposable PostgreSQL reproduces syntax error 42601 before it creates an application table. Executing the unmodified repository migration in that disposable database succeeds and creates the expected two tables and six default pipeline stages. These tests run locally with no remote credentials or targets.

An eight-entry read-only history sample also found the same formatting pattern in several other early named migrations, plus alternate version strings with null name/statements. Those are review signals, not authority to delete, deduplicate or rewrite entries. The entire historical migration chain has not been audited or replayed. Missing-history-table errors during initial branch setup were observed as well; the confirmed syntax failure of the first actual migration is the reproduced blocker.

The committed fixture contains only the first historical public schema statement and its capture date/version/error code. It has no customer records, accounts, tokens, passwords or connection credentials. Full raw logs containing connection metadata are not committed.

## Repeatable diagnostic

scripts/techsafe/replay-preflight.sql samples at most the first 50 recorded migration entries and reports formatting counts, missing statements and nonstandard version labels. It performs SELECT only and returns no raw SQL or application row data. Its formatting_requires_review flag is a heuristic, not a SQL parser or full-history readiness certificate.

Do not globally replace backslash-n in migration history. Valid SQL string literals, regular expressions, procedural bodies and even harmless comments can legitimately contain that sequence. The local test includes valid string/comment escapes and a deliberate false-positive review signal to enforce this distinction.

No production repair, migration-history adjustment, baseline rewrite, branch rebase/reset or change to the old repository migration is included in this PR. The source migration used by the test is already in main and is not modified here.

## Recovery plan for integration validation

Prefer an isolated schema-only baseline route so the integration audit can proceed without changing production history:

1. Export the authoritative current schema read-only, including required application/auth/storage dependencies, functions, roles/grants, RLS, enums, views, constraints, indexes and triggers. Review the export for embedded secrets and outbound side effects; include no production data or credentials.
2. Provision a dedicated disposable environment and load that reviewed baseline there. Verify object inventories and canonical function/trigger definitions against the source, instead of silently filling gaps with stubs. Keep production targets and unrelated branches excluded from the runner.
3. Apply only the integration migrations in their real cumulative order, excluding withdrawn #382, using the exact reviewed repository contents. Seed synthetic tenants/users/orders only in that environment and verify the observer control starts off.
4. Run baseline-versus-observer scenarios across the actual authorization and financial/tax/trigger paths, then representative load, simultaneous COs, lock contention, missing-helper/control failures and cancellation tests. Keep all deployment/activation readiness gates false until these pass.
5. Finish the remaining historical/intended-scope evidence, receiver and checkout-freshness requirements before enabling synchronization. An application-return observation alone still cannot authorize a quote.

If automatic historical replay is repaired instead, make that a separately reviewed migration-history maintenance change. Map each recorded entry to authoritative original source/revision, distinguish legitimate escapes and legacy aliases, test the entire chain in isolation and define a verified rollback before any production metadata write. The current diagnostic is not a repair script. Do not run db pull/repair commands that update production migration history as part of a supposedly read-only export.

## Verification

Run node tests/techsafe/migration-replay-preflight.mjs. It reproduces the actual captured syntax error, confirms the original repository migration succeeds, verifies a failed parse leaves no application tables, checks diagnostic handling of missing/nonstandard entries and legitimate escapes, and asserts that the diagnostic contains no write commands. These tests diagnose the replay blocker; they do not certify the full schema, current source workflows or production readiness.
