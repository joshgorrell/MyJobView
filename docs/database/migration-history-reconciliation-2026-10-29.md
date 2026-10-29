# MJV migration history reconciliation — 2026-10-29

## Verified findings
- MJV Supabase project: `bqtsuzvuvqvgidipbsis`.
- Supabase Preview failed on merge commit `907329ba3884cbb67b96cd3a8bf510950d7be45e`: `Remote migration versions not found in local migrations directory.`
- Remote migration-history entries: **1,875**.
- Repository `main` SQL migration files: **1,552**.
- Remote versions not matching a local filename version: **443**, comprising **45 timestamp-shaped versions** and **398 nonstandard versions**.
- At least **17** unmatched remote entries appear to refer by name to an existing repository migration with a different timestamp; therefore these are not necessarily missing schema changes.

## Safe resolution protocol
1. Obtain a read-only export of `supabase_migrations.schema_migrations` and the complete repository migration filename list; retain as evidence.
2. Classify every mismatch into: duplicate historical entry, same migration applied under a different timestamp, genuinely missing source SQL, or other.
3. Compare actual live schema/functions/policies against expected definitions for each affected migration. Do not assume the filename proves execution.
4. Back up the database and migration-history table before any repair.
5. Reconcile only proven bookkeeping discrepancies using Supabase-supported migration repair procedures in a reviewed, separate change. Never run historical DDL blindly and never mass-delete migration history.
6. Re-run migration list/diff, preview deployment, and financial regression checks. Do not call the database verified until all checks pass.

## Important scope distinction
PR #257 was merged. This database-history mismatch is pre-existing or independently accumulated and should be fixed in a dedicated follow-up; it is not evidence that customer credits were reconciled in production.
