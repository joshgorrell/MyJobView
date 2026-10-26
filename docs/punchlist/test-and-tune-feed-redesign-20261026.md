# Test & Tune — Punchlist Feed redesign (2026-10-26)

## Product contract
Test & Tune is a live company-wide feed of **punchlist items**, not an adjustment queue or a separate task system. The default page displays individual items, newest updated first, with compact columns for updated time, customer/project, description, source, visibility, and service status. Search descriptions company-wide (e.g. Roku); filter customer, project, status, source, visibility and date. Include requested, scheduled, completed, and unsubmitted items. Keep submitted items visible and linked to their canonical Service Request and Work Order.

## Project handoff
When a Sales Order project is marked substantially complete, all remaining incomplete project tasks enter that project's Test & Tune punchlist, default **Private**. Preserve task identity, notes, photos, audit history, and links. Completed project tasks remain in project history. Do not duplicate records or transfer unrelated tasks from other projects.

## Customer portal
Customers create and freely edit their own unsubmitted punchlist items, with photos, without creating service requests or sending staff alerts per edit. Staff can see saved items and edits in realtime. Customer-created items are customer-visible. Staff-created or transferred items default Private and may be made Public by authorized staff. Never expose private items or internal notes through portal RPCs. Explain portal data access accurately in privacy information.

## Request service
Customer may select one, multiple, or all eligible visible unsubmitted items; staff may select eligible items for the same project, including private ones. Explicit submission creates exactly one canonical Service Request with links to each selected original task, idempotent under retries/concurrency. Unselected tasks remain editable. Selected tasks remain in Test & Tune with service status derived from canonical request/dispatch/work-order records. Prevent duplicate active submission.

## UI
Compact toolbar and clickable summary counts; company-wide row feed without mandatory project picker or nested scrolling. Use icons with accessible labels/tooltips for source, public/private, and not-submitted/requested/scheduled/completed. Authorized staff may toggle visibility inline. Hover row after ~350ms for quick preview (description, customer/project, creator, dates, visibility, status, attachments, request and appointment when available). Pointer can enter preview; keyboard focus and touch have equivalent access. Row click opens full details. Responsive desktop/tablet/phone.

## Lifecycle
90-day entitlement anchored to substantial completion, not invitation date. Existing requests and historical items persist after expiration. VIP is a separate entitlement. Preserve existing exception-review protections. Verify complimentary vs billable classification before changing billing behavior.

## Acceptance tests
1. Five incomplete project tasks transfer as private with preserved IDs; completed tasks do not.
2. Customer creates and edits five items; feed updates; zero service requests until explicit submission.
3. Customer submits three; exactly one request links three original IDs; two remain unsubmitted; all five stay visible.
4. Scheduled/completed work-order status updates appear on the feed.
5. Staff-created public/private visibility and customer data isolation hold at the database layer.
6. Company-wide search, combined filters, deep links, hover/focus/touch preview, and realtime reconnection work.
7. Expired projects retain history; new complimentary submissions require proper authorization.
8. No production record deletion; migrations and UI must pass relevant regression, security, and browser checks before merge/publish.

## Known code gaps to address
- `PunchlistAdminDashboard.tsx` defaults to an Adjustments view.
- `TestTuneProjectAdjustments.tsx` groups projects, defaults to unsubmitted-only, and removes requested items from the main list.
- `get_test_tune_workspace()` selects only `is_test_and_tune` tasks and lacks feed-ready source/updated/appointment fields.
- Substantial-completion handoff of all unfinished project tasks is not established by the 20261023 migration.
- `request_project_punchlist_visit()` currently creates a billable service request; verify policy before changes.

This is a design contract, not an assertion that these changes are implemented. Implement in reviewed increments and keep main untouched until validation.
