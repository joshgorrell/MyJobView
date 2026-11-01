# Techsafe draft timing: approved sales orders before completion

Dealers may prepare and see optional Techsafe draft coverage before installation is complete or substantially complete. This policy replaces the substantial-completion requirement introduced in the earlier draft gate. It is draft visibility, not purchase/coverage activation authorization.

Supported sales-order statuses are `pending_deposit`, `pending_po`, `planning`, `active`, `complete`, and `closed`. They map to the existing Techsafe `open`/`completed` content statuses. An MJV proposal without a verified sales order is not sufficient. Unknown/cancelled/deleted states do not produce this business candidate; later reconciliation must hold or suppress an existing draft safely.

## What the draft contains

One draft per source sales order/customer contains the current approved equipment after all proven successful approved change applications. It is a whole replacement list, not separate change-order quotes or a change-order history in Techsafe. Pending/unapproved changes do not add equipment. An approved header without successful application evidence remains held; it is not permission to quote uncertain or stale equipment.

Original approval, current source bindings, complete supported application continuity/effects, selling-price evidence, and healthy authorized connection checks remain required. Unsupported manual/legacy approval paths, missing evidence, ambiguous bundles or unresolved values still produce no partial draft candidate. Existing holds remain necessary for equipment uncertainty, unavailable source/access and zero eligible equipment. Reopening or editing a project completion milestone alone is no longer a hold reason.

Only the product's stored unit selling price contributes to equipment value. Project discounts, miscellaneous percentages, aggregate fees, dealer costs and catalog retail remain irrelevant. Miscellaneous placeholders and non-products never qualify; product opt-outs, customer-supplied equipment, proven removals and the inclusive per-unit minimum still apply.

## Implementation boundary

`assessDraftEligibility` checks the order/organization/proposal identity and supported status, without reading project/completion metadata. The composed candidate still runs the full existing approval/application and equipment checks for early orders.

The additive migration `20261101135453_techsafe_precompletion_sales_order_drafts.sql` guards the exact prior private reader definition/security attributes, then replaces only `techsafe_source.read_order_draft_candidate`. It stops reading `projects`, removes completion facts from its output and recomputes the source fingerprint over the relevant order/equipment content. Editing a milestone no longer changes that candidate fingerprint. It keeps STABLE/invoker/empty-search-path security, source binding/byte limits and API execution revocations.

Historical migrations are not rewritten. There are no public MJV function, trigger, order workflow, financial or completion-status changes, no evidence backfill/replay and no observer enablement. The migration has not been applied to production by this PR. Existing fingerprint/revision streams must be reconciled when the unpublished integration is eventually enabled.

The Techsafe v2 contract already accepts `orderStatus: open`, so early candidates need no fabricated completed status or purchase date. Native customer/draft schema compatibility, actual customer/draft materialization, authenticated delivery, source revisions, freshness/read/checkout gates and coverage/payment rules remain separate work. This change does not enable live drafts, plan payments or active coverage changes.

## Verification

Pure tests cover every supported early status with the same eight-change approved equipment list; missing original approval, pending changes, approved-but-unapplied changes and unknown states still fail or remain excluded as appropriate. Getter fuses prove completion/project metadata is not read. Actual Techsafe v2 preparation accepts the resulting open-order candidate and preserves active coverage.

The private SQL fixture tests the upgrade guard, all supported statuses, no/future/cleared completion dates, missing/mismatched projects, date-independent content, selling prices, source/connection/tenant/API denial, and complete bundled applied-change preparation. The captured-schema checks compile the new private reader and compare all 13 original source operations with integration migrations installed. Fixtures are local and synthetic; native concurrency/Auth/performance and deployment readiness are not certified.
