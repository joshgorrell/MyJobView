# Supabase migration history reconciliation — 2026-10-14 (verified follow-up)

Project: `bqtsuzvuvqvgidipbsis`; repository: `joshgorrell/MyJobView`, `main`.

## Verified read-only findings

- 120 missing canonical 14-digit migration SQL files were recovered from the database's original `statements` arrays and committed to GitHub `main`.
- A fresh GitHub tree versus Supabase migration-list comparison found **zero missing canonical versions**.
- Supabase migration history has **1,773** rows: **1,375** canonical 14-digit versions and **398** nonstandard versions whose values include the filename suffix.
- All 398 nonstandard version prefixes have a corresponding SQL file in GitHub.
- Of the 398 nonstandard rows, **375** have an existing canonical history row with the same 14-digit prefix, and **23** do not.
- Nonstandard rows have `name = NULL` and `statements = NULL` (as evidenced by aggregate statement counts), so they must not be treated as a source of SQL.
- `supabase_migrations.schema_migrations.version` is a primary key. A naive bulk `UPDATE version = left(version,14)` would collide on the 375 duplicate-prefix records.
- The production migration history has **not** been changed by this recovery.

## Required safe reconciliation

1. Pause all automated migrations and confirm the active deployment workflow and Supabase CLI version.
2. Export a complete, restorable snapshot of `supabase_migrations.schema_migrations` including `version`, `name`, `statements`, and all other columns; verify row counts and save backup outside the live table.
3. Confirm each of the 375 paired records represents a redundant malformed history entry, not a distinct applied migration; inspect any associated metadata and compare corresponding GitHub file names.
4. For the 23 unmatched malformed records, validate that each canonical SQL file matches the intended applied migration and that no other version conflict exists.
5. Test the exact proposed repair against a disposable clone / isolated database with the same history; use the Supabase-supported migration repair mechanism when possible. Avoid directly editing migration history in production without tested rollback.
6. After repair, assert: no malformed versions, no duplicate canonical versions, and every remote canonical version maps to one local migration file.
7. Run the same migration validation/deployment checks used by the application, then inspect GitHub Actions and Bolt sync before considering publication.

## Safety warning

Do **not** re-run recovered historical SQL against production. Do **not** blindly delete all malformed records or normalize them in a single UPDATE. The 375/23 distinction must be handled explicitly.

## Useful read-only audit SQL

```sql
SELECT CASE WHEN version ~ '^[0-9]{14}$' THEN 'canonical' ELSE 'nonstandard' END AS kind,
       count(*) AS rows
FROM supabase_migrations.schema_migrations GROUP BY 1;

WITH malformed AS (
 SELECT version, left(version,14) AS prefix
 FROM supabase_migrations.schema_migrations
 WHERE version !~ '^[0-9]{14}$'
)
SELECT count(*) AS malformed_total,
       count(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM supabase_migrations.schema_migrations c WHERE c.version = malformed.prefix
       )) AS with_canonical,
       count(*) FILTER (WHERE NOT EXISTS (
         SELECT 1 FROM supabase_migrations.schema_migrations c WHERE c.version = malformed.prefix
       )) AS without_canonical
FROM malformed;
```
