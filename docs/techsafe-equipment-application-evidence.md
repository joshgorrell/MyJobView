# Equipment application evidence

This inactive integration step records equipment-specific evidence around the existing opt-in application observer. It adds no sender, receiver, worker, source trigger, public workflow change, activation or historical replay.

The previous observation hash covers all changes on an order. Editing a later draft can therefore make an earlier completed application look stale. The new evidence separately fingerprints each change's equipment inputs and the resulting equipment rows. Cost and retail prices are absent; equipment unit selling prices are included. Catalog exclusions and the dealer minimum remain current eligibility inputs, separate from evidence that a change was applied.

## Private database changes

The migration adds nullable hashes and execution ordinals to observations. Existing rows remain null: they cannot acquire evidence through a backfill. A guarded replacement of the two private begin/finish helpers refuses unknown implementation bodies or execution attributes. The public applier, approval functions and source triggers are unchanged. Ordinary observation errors remain contained by the existing failure boundaries.

The extended reader retains the original reader's tenant, actor, connection health and size restrictions. It uses one statement snapshot, explicit fields, and a final 4 MiB limit. Change-line ordering inputs include sort order and a timezone-independent epoch timestamp. Sequence ordinals are serialized as decimal strings to avoid JavaScript precision loss. CACHE 1 and NO CYCLE preserve allocation order; sequence order is helper execution order, not proof of transaction commit order or concurrency safety.

All new helpers are invokers with an empty search path. PUBLIC, anon, authenticated and service_role receive no execute access; the sequence likewise has no API-role privileges. Existing source execution can reach the helpers only through the already opt-in observer. No controls or connections are enabled by this migration.

## Diagnostic assessment

`assessApplicationEvidence` consumes trusted private-reader output plus a server-loaded binding. It checks required approved/completed change inputs, completed receipts, the latest observed equipment scope, later incomplete work, conflicting ordinals and malformed or orphaned evidence. Legacy observations cannot establish current equipment evidence. A later draft alone does not invalidate unchanged approved inputs.

`applicationEvidenceCurrent` is a diagnostic only. It does not prove an original baseline, intended action effects, duplicate ADD semantics, removal membership, resolved net selling prices, authorization, current connection health or checkout freshness. `scopeVerified`, `snapshotReady` and `quoteReady` always remain false. Nothing calls this assessment to authorize a quote.

## Validation and remaining gates

- Pure assessment tests cover changed inputs/scope, later drafts and approvals, missing/incomplete/legacy/orphaned evidence, ordinal conflicts and bigint bounds.
- Local PostgreSQL tests cover migration refusal on a changed helper, no backfill, same-transaction completion, API-role denial, cost/retail independence, changed sale prices, timezone independence and input ordering changes.
- The optional captured-schema regression runs 13 original source actions with and without observation, including retries, removal rejection and observer failures. It compares equipment, financial totals, order totals, statuses and errors. The existing ADD cost constraint failure is preserved; no MJV cost behavior is changed.

This adds bounded reads and hashing inside the default-off observer. Native concurrency, workload latency and cancellation behavior still need validation before enabling it. Local captured-schema tests cannot certify native Supabase extensions, network behavior or production load. Scope and net-price certification remain separate work before draft synchronization.
