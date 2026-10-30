# Isolated table-layer rehearsal

PR #390's current catalog capture can now be compiled into the first structural
stage of a disposable local database. This is an offline compiler and PGlite
rehearsal, not a Supabase migration or a production restore command.

The October 30 capture reconstructed 386 application tables and 5,777 columns,
including all 25 stored generated columns, one identity column, four sequences
and the custom enum. The test compared table/column identity, SQL types and
precision, nullability, collations, identity/generated modes and generated
expressions against the original capture. Every sequence's configuration matched,
including its bigint parameters represented as decimal strings. No source row or
sequence current value was copied. This used the prior verified capture; it did
not make a new claim that production remained identical after capture.

`scripts/techsafe/restore-table-layer.mjs` verifies source-native payload hashes
before compiling. Enum labels and identifiers are quoted. Captured SQL type,
collation and generated-expression fragments are **trusted SQL**, not sanitized
user input: privately review captures before using them. The module has no SQL
client, network calls, deployment entry point or automatic execution. Only the
test runner executes its output, on newly constructed in-memory PGlite databases.

The compiler creates application schemas, enums, standalone sequences, tables and
identity sequences; then applies serial sequence ownership. Identity sequences
are created through their column definition rather than duplicated. Extension-owned
HTTP composite references are omitted and must eventually come from their native
extension. Unsupported table inheritance, partitioning, custom type kinds and
unrecognized generated/identity forms fail rather than silently approximating them.

All scaffold tables have RLS enabled and no policies are restored. This deliberately
differs from some source tables. No source grants, default ACLs, owners, functions,
triggers, views, ordinary defaults, constraints, indexes, publications, provider
Auth/Storage internals, credentials, jobs or application data are installed.
Deferred object counts are recorded in the rehearsal summary. This stage therefore
cannot be used to assess business behavior, financial calculations or permissions.
The compiler always returns `fullBaseline=false`, `runtimeTestsAllowed=false`,
`restoreApproved=false` and `quoteReady=false`.

Validation:

- CI uses synthetic catalog captures to check quoted identifiers, enum literals,
  generated calculations, identity start/increment and large sequence values.
- A source trigger that raises on insert is absent from the destination; source
  application rows are absent too. Table RLS is enabled. Missing identity metadata,
  tampered payloads and unsupported inheritance fail.
- A private local run used all current captured table definitions and compared
  their structure in a new in-memory database. The raw captured definitions remain
  outside the repository. The committed summary contains counts and flags only.

Run the synthetic suite with `node tests/techsafe/restore-table-layer.mjs`.
An optional second argument names the private capture directory for the full
structural rehearsal. It must contain all four catalog page files and
`extra-metadata.json`. This path is for reviewed local captures, not untrusted uploads.

Next restore stages must resolve extension and managed-schema dependencies before
installing routines, views, ordinary defaults and constraints. Review both direct
and indirect outbound effects before installing triggers or running synthetic
application scenarios. Preserve and compare source ownership, ACLs, default ACLs,
RLS and policies in the final isolated environment; this quarantine configuration
is not a substitute. A native Supabase/PostgreSQL environment comparison and
baseline-versus-observer financial, failure, load and concurrency tests remain
pending. No source migration history repair, production deployment, observer
activation, synchronization or quote enablement is part of this change.
