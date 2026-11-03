# Substantial completion before a Techsafe draft

An MJV sales order must reach substantial completion before it can produce a Techsafe draft candidate. Techsafe receives one final eligible equipment list, not early sales-order drafts or change-order quotes. This change adds source-side enforcement only; live transport/activation remains disabled.

## Source of readiness

MJV exposes the project's `substantial_completion_date` in `ProjectOverview`. Its Complete Sales Order action marks `sales_orders.status = 'complete'`; it also attempts to set a project milestone when starting Test & Tune. The gate uses the recorded project milestone and existing sales-order statuses, without adding a new MJV status or changing those workflows.

| Current source state | Draft candidate |
| --- | --- |
| Linked, same-tenant/order project's substantial completion date is today or earlier | Eligible for remaining verification, including when final payment/closure is pending |
| Sales order is Complete or Closed, with no conflicting future milestone | Eligible for remaining verification; a project or Test & Tune enrollment is not required |
| No reached milestone and sales order is pending deposit/PO, planning or active | Held; no business draft content is prepared |
| Explicit future milestone, invalid/unavailable completion facts, missing/mismatched linked project or unknown order status | Held |

A past project milestone remains authoritative when the order remains active for follow-up work. Clearing that milestone on an active order, or moving it into the future, makes the draft candidate unavailable. Final invoicing, full payment, labor-hour percentages and Test & Tune enrollment do not establish or block the milestone themselves.

## Enforcement

`techsafe_source.read_order_draft_candidate(connection, order)` is a new private STABLE invoker reader with an empty search path and no API-role execution grants. It checks readiness and project bindings before calling the bounded equipment reader. It preserves the existing actor, tenant, connection-health and byte gates. Project ID and completion/date facts are loaded with the equipment model in one statement snapshot. Its diagnostic fingerprint includes those facts; it is not the receiver's business-content hash.

The future exporter must use this candidate reader. Existing lower-level source/approval/application readers remain internal evidence tools: MJV needs earlier evidence to verify later final equipment, but those reads do not send anything to Techsafe or create a quote.

`prepareOrderContent` independently requires completion facts and applies the same rule before selecting equipment. Missing facts fail closed, even if an old caller supplies a Complete status. Ineligible input returns `draftEligible:false`, `content:null`, and a readiness issue. Eligible input still must pass customer, scope, exclusions, minimum and selling-price checks. The existing MJV status mapping is preserved; an active order with a reached project milestone may retain `orderStatus:'open'` in detached content, without bypassing readiness.

JavaScript compares validated ISO dates against the database-supplied `asOfDate`, not a browser clock. SQL uses `CURRENT_DATE`, consistent with MJV's existing substantial-completion punchlist/Test & Tune checks. Future/invalid/infinite dates and cross-tenant/order projects are refused.

## Draft and coverage lifecycle

After readiness, approved equipment changes must continue to update the same optional Techsafe draft through the eventual reconciler. If readiness is lost, that reconciler must hold the existing draft and prevent checkout; silently retaining a sellable stale draft is not acceptable. This PR provides the source gate and does not install that receiver/reconciliation behavior or claim it is live.

Purchased active coverage remains immutable under Techsafe's existing lifecycle rules. This gate does not modify, cancel or refresh an active plan. No coverage date is invented from substantial completion; enrollment-window and original-purchase-date checks remain separate.

## Validation and deployment boundary

Pure tests cover all existing order statuses, reached/future milestones, leap/invalid dates, missing evidence and project bindings. Local PostgreSQL tests cover early-order withholding, Complete/Closed fallback, cleared/future milestones, same-tenant project binding, current health/actor/API restrictions, changed fingerprints and read-only behavior. Existing private evidence/pair/portal-basis tests also run. Optional captured-schema compilation checks the new function against actual reconstructed source tables without seeding a connection.

Order-content tests prove that an early order produces no content and does not inspect equipment. Eligible selling-price/exclusion/customer behavior remains covered. A cross-repository check with the current Techsafe v2 preparation accepts eligible content and preserves the existing active-coverage snapshot.

There are no MJV source table, source workflow, UI, completion, approval, billing, payment or Test & Tune changes. No production migration, activation, sender or receiver is deployed. Readiness is a prerequisite, not a complete quote authorization: all `snapshotReady` and `quoteReady` flags remain false pending the remaining scope/pricing/freshness gates.
