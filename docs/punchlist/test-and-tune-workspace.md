# Test & Tune workspace — approved workflow

## Navigation
- Rename the standalone Production > Punchlist management entry to **Test & Tune**. Do not remove Punchlist tabs inside individual Projects or Sales Orders.
- Keep formal Service Requests on the existing Service Requests page; do not duplicate their queue in Test & Tune.
- Keep the canonical request-to-adjustment relationship. Existing Test & Tune-only test data is disposable after confirming no production customer, project, or service data depends on it. Do not delete migrations or unrelated records.
- Do not add an Earlier Items migration/placement workflow solely for disposable Test & Tune test data.

## Test & Tune workspace
- Customer/project-focused, compact searchable rows immediately under a small toolbar.
- Include all active 90-day projects and expired projects with unresolved Test & Tune tasks; provide history filters.
- The **active Test & Tune queue contains only unsubmitted customer or staff adjustments**. Requested, scheduled, and completed adjustments belong in Service Requests and its history, not active Test & Tune filters.
- Staff can enter customer-reported adjustments and mark them customer-visible with a customer-safe description. Internal notes remain private.
- Customer-entered tasks are customer-visible. Visibility does not itself request service.
- Authorized staff may select one or more unsubmitted adjustment tasks for **one customer and project**, then submit a formal service request on the customer's behalf. Record submitter, actor type, timestamp, selected task IDs and submission source; notify customer under configured preferences.
- Customers can likewise submit their own unsubmitted adjustments. Preserve task identity; reject duplicate active submissions transactionally.
- The 90-day entitlement is anchored to substantial completion, not invite date. After expiration, existing requests continue; new complimentary adjustments require authorized exception review.

## Bidirectional navigation
- On successful submission, remove exactly the selected adjustments from the active Test & Tune queue; leave unselected adjustments untouched. Preserve their canonical service-request relationship in historical records.
- Service Request detail for a Test & Tune-origin request shows a Test & Tune source label and deep link back to the originating customer/project Test & Tune history.
- A deep link must preserve the target customer/project and item context; authorization and organization boundaries apply at both ends.

## Required two-way page navigation
- The **Test & Tune** page header provides a simple **Service Requests** navigation link, opening the normal Service Requests page without automatically filtering it.
- The **Service Requests** page header provides a simple **Test & Tune** navigation link, opening the normal Test & Tune dashboard without automatically filtering it. These links are general navigation shortcuts for service staff, subject to module permission.
- **Unsubmitted Test & Tune adjustments must never appear in Service Requests or create a service request record.** Only explicit customer or authorized-staff submission creates a formal request in the existing queue.
- Each submitted adjustment must be linked to the canonical service request in persisted history. If multiple adjustments are submitted together, they share one service request; no submitted item remains in the active Test & Tune queue.
- An optional record-specific **View Test & Tune** link on a T&T-origin service request may open the originating customer/project history; this is separate from the general header shortcut. Unsubmitted adjustments remain visible only within Test & Tune.
- Preserve customer ID, project ID, request ID, and selected task IDs in route state or stable deep-link query parameters; support browser back/forward and page reload. Never use a customer name alone as a lookup key.
- On a missing/deleted target or revoked permission, show a useful unavailable/access-denied state rather than sending staff to an unrelated customer's record.
- Service Requests remains the sole formal request queue; Test & Tune is the unsubmitted adjustment collection area. Submission transfers selected items between active queues atomically and retains audit history.
- Test desktop/mobile links and permissions in both directions, including a customer with multiple projects and a single request containing multiple tasks.

## Acceptance criteria
1. Existing project Punchlist editing, sharing and technician task handling work unchanged inside Projects.
2. Service Request list retains normal service requests and Test & Tune requests without duplication.
3. Test & Tune staff view includes unsubmitted portal adjustments, not only queued requests.
4. Authorized staff can batch-submit unsubmitted adjustments, with audit trail and no duplicate requests.
5. Customer portal cannot see internal notes, estimates or staff-only items.
6. Navigation works from Test & Tune to Service Request and back, on phone and desktop.
7. Disposable Test & Tune test records may be cleared only after confirming their dependencies; no production data is deleted.
8. Validate permissions, 90-day boundaries, multi-project customers, cross-tenant isolation and tests before merge.

## Implementation (2026-10-23)
The standalone workspace now lists explicitly marked adjustments grouped by customer and project. Ordinary project Punchlist editing remains in Projects and Sales Orders. Active projects remain visible with zero adjustments; expired or suspended projects retain unresolved adjustments and history but cannot create or submit new complimentary items. Exception review is required; this release does not silently extend entitlement.

A database transaction locks the project and selected task rows, creates one request and its canonical task links, and writes an immutable receipt with actor, source, timestamp and exact task IDs. Repeated identical submissions return the original request; reusing a key with a different payload fails. Submitted tasks remain history even after a request closes. Internal notes never enter the customer projection.

Customer submission updates appear in the portal, with a customer-controlled preference. These confirmations contain only the count and submission date; they do not send email or SMS. Existing scheduling communication remains separate.

Both page shortcuts honor module access. Request-specific history links preserve customer, project and request IDs. Polling, focus refresh and realtime subscriptions reload persisted state. No records are deleted by the rollout.

The deployed database was missing the main-branch prerequisite `20261019180250_project_punchlist_and_vip_service.sql`; rollout must include that prerequisite before the new workspace migration. Keep this PR draft until local regressions, real PostgreSQL concurrency, CI and deployment checks pass.

## Submission and persistence contract (2026-10-22)
- Submitting three of five adjustments creates one formal request containing those three and leaves exactly two in Test & Tune.
- Submitted adjustments must remain absent after refresh, on another device, and after realtime reload. Local React state or session-only badges are insufficient.
- The authoritative database transaction must create the request, associate all selected adjustment IDs, record the submitting actor, and mark those adjustments as requested atomically; rollback on failure.
- Never create placeholder service requests for unsubmitted adjustments.
- No blanket deletion of existing records: first identify Test & Tune test-only records and check foreign-key references and production relationships.
