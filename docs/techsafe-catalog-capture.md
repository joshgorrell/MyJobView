# Current source catalog capture

The connected Supabase SQL interface can read authoritative catalog definitions even though it does not expose pg_dump. A native dump is not the only way to continue preparing an isolated baseline. This capture was taken directly from the current source through catalog-only queries; no user-supplied credentials or manual export were required.

On October 30, 2026 the capture collected and checked 1244 objects across eight application schemas:

| Category | Captured |
| --- | ---: |
| Relations | 409 |
| Routines | 799 |
| Custom enum/domain/range types | 1 |
| Managed Auth/Storage table metadata | 35 |

The relation set includes 386 application tables, 16 views, four sequences and three extension-owned HTTP composite types. The latter belong to the http extension; a future restorer must treat them as extension references, not create duplicate application types. Managed table metadata contains column shapes, custom application triggers and policy definitions, not user/session/storage rows. Extension, schema/default ACL, role attributes/memberships, sequence-ownership and publication metadata were also captured separately. Role attributes contain no passwords.

## Integrity and data exclusion

scripts/techsafe/catalog-capture.mjs generates bounded catalog queries with a fixed schema/category allowlist. It never executes captured definitions or application routines. Pagination is limited to 25 objects per query. Source-native JSONB text is retained exactly alongside the source-calculated SHA-256 digest. The client verifies that digest before using an object and compares the entire captured identity/hash set with a fresh source fingerprint pass. Counts, duplicate identities, missing objects, mismatched hashes and tracked catalog-state changes fail the capture check.

SQL definitions must survive JSON transport without blanket unescaping. Sequence bigint parameters are explicitly represented as decimal strings so JavaScript cannot round their values. A captured definition is data, not an instruction to execute it. The catalog stamp is a conservative guard over selected catalog row versions, not a global database lock or a native consistent-dump transaction. Separate ancillary metadata was read in its own statements; this does not certify all database state as one atomic backup.

No application rows, Auth users/sessions, storage object/bucket rows, vault secret values, cron schedules or migration-history rows were copied. Production and its history remained unchanged. Raw definition captures are intermediate validation inputs and are not committed by this PR. The committed summary records counts, a content-set hash and review flags without raw routine bodies or customer data. A limited credential-pattern screen found no matches in the captured definitions; that is not a guarantee that arbitrary embedded sensitive literals cannot exist. Review raw definitions privately before sharing or restoring them.

Six routines were flagged by a conservative outbound-pattern review. These are candidates for inspection, not six proven network calls: a URL-validation expression can also match. No captured routine was invoked. Before synthetic test activity, inspect direct and indirect network/worker effects and establish isolated egress behavior. Capturing the source does not authorize sending notifications, running jobs, copying credentials or contacting production services.

## What is and is not complete

The current catalog pages are complete for the supported categories and match freshly read source fingerprints. This is a catalog-based snapshot, not a native pg_dump artifact, an executable restore plan or proof of a faithful full-schema environment. restoreApproved and quoteReady remain false. The raw intermediate capture must not be used as a production migration or blindly replayed.

Next, construct a reviewed isolated restore plan from these definitions, including dependency order, ownership, constraints, grants/default privileges, RLS, extension-owned objects and managed-schema compatibility. Check dependency graph/ownership links and all unsupported object kinds explicitly; the reported counters are not a universal detector for every PostgreSQL feature. No login credentials or live schedules should be restored. Compare the restored object definitions/security metadata back to the source before running baseline-versus-observer financial, authorization, load, cancellation and concurrency scenarios. Publishing, checkout and historical-scope verification remain separate unfinished gates.

The older October 2 reconstructed export and broken migration history are not being repaired or treated as the current baseline. No new branch, source hook, source function, control, connection, worker or quote was created/changed/enabled by this capture.

## Tests

Run node tests/techsafe/catalog-capture.mjs. The isolated suite verifies real catalog queries, bounded pagination, data/vault-row exclusion, no application-routine invocation, exact SQL/backslash transport, bigint precision, source-native payload hashes, fresh fingerprint comparison, missing/duplicate/tampered data rejection and tracked DDL drift. It exercises capture behavior only; it does not execute a full-schema restore or claim deployment readiness.
