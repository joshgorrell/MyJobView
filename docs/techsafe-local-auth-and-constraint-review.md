# Local Auth interface and specific constraint review

PR #392's remaining installation failures came from two routine parameter defaults,
four column defaults and 41 foreign keys referencing managed Auth. Read-only
catalog SELECTs now capture the actual four claim-reader definitions and the
`auth.users` column/default/generated/primary-key structure. No Auth users,
sessions, password/token values, identities or application rows were selected.

The small provider-definition fixture was reviewed before committing: the four
SQL routines only read request settings; table defaults are empty/null values,
booleans, zero and a generated `LEAST` timestamp. It contains column names such as
`encrypted_password`, but no user credentials or records. Its source-native UTF-8
payload hash is pinned in `local-auth-interface.mjs`; damaged or changed captures
are rejected pending a new review. This is an explicitly reviewed provider fixture,
not publication of the private application's raw routine capture.

The compiler builds only a **local structural Auth interface**. The original
claim-reader bodies are retained, not replaced by constant-return stubs. It does
not implement a native Auth service, verify JWT signatures, issue tokens, perform
login, manage sessions or validate revocation. Tests set synthetic request settings
directly and therefore cannot prove that real users are authenticated or authorized.
Source owners, role memberships, grants, full provider constraints/indexes, triggers
and security policies are not recreated. Table RLS is enabled and PUBLIC routine
privileges are revoked as quarantine measures, differing from source permissions.

The first statement is `CREATE SCHEMA auth` without `IF NOT EXISTS`: an environment
with existing native Auth fails before tables or routines can be overwritten.
Only test code executes this SQL on fresh in-memory PGlite databases. There is no
Supabase deployment path. Never apply the compiler output to a managed project.
Future native tests must use and compare the provider's real Auth environment.

With the explicit `--local-auth-interface` rehearsal option, the full capture now
installs all 793 non-deferred application routines, all 2,534 ordinary defaults,
all 2,219 non-trigger constraints and all 1,893 indexes. The prior 47 installation
failures are gone. All 3,327 application routine/default definitions matched their
capture. Of 4,112 constraint/index comparisons, 4,111 matched textually; the one
known grouping difference remains in the report. Six outbound candidates and six
constraint triggers remain deferred. No source application scenario was enabled.

## Constraint grouping review

The source rule
`public.proposal_loss_feedback.proposal_loss_feedback_reasons_check` still has
source definition SHA-256
`42f9c89cca32d74fbbf1dab7a5a8a8874b748b1cc37aa24dca71ee092aa9a1b6`.
Its three unchanged leaves test minimum cardinality, maximum cardinality and
membership in a fixed text-array whitelist. The replay groups Boolean AND
differently. The audit checks the grouping operation over all 27 combinations of
true, false and null, plus 44 actual text-array cases covering null/empty arrays,
each allowed value, invalid and null elements, multidimensional/non-default-bound
arrays and cardinality boundaries including duplicates.

`constraint-boolean-audit.sql` was run as one read-only SELECT against the source's
PostgreSQL 17.6. The current definition hash and validation state matched the
reviewed rule; both comparison mismatch counts were zero. Only catalog metadata
and synthetic values were read. If the rule is absent or its hash changes,
`source_binding_matches` is false: this review must not transfer to another rule.

The results support the same Boolean behavior for this specific reviewed grouping
change; they do not turn the DDL strings into exact matches. The full-capture
comparison continues reporting the textual difference. There is no general SQL
normalizer, automatic exception for other constraints or production rewrite.

## Validation and limits

CI runs the local Auth fixture and Boolean-audit synthetic suites. Tests compare
native installed routine and table definitions, null claim behavior, claim fallback,
legacy subject precedence, malformed UUID rejection, generated/default columns,
quarantine privileges, existing-Auth refusal, pinned integrity and missing/changed
constraint binding. The full private replay additionally compares every installed
application routine/default and constraint/index definition. PGlite runs 17.5;
the native source check ran 17.6. Sanitized results are committed separately.

The optional private replay command is:
`node tests/techsafe/restore-constraint-layer.mjs /reviewed/capture --local-auth-interface`.
Raw application definitions remain outside the repository.

`fullBaseline`, `runtimeTestsAllowed`, `restoreApproved` and `quoteReady` remain
false. Native Auth/extension compatibility, views, source owner/ACL/default-ACL/
policy/RLS fidelity, reviewed triggers and external effects, source evidence
ambiguities and financial/failure/load/concurrency scenarios remain pending.
Neither production database, website, migration history, existing sales/change-order
behavior, observer state, integration activation nor coverage was changed.
