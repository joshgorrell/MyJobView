# Test & Tune workspace — approved workflow

## Navigation
- Rename the standalone Production > Punchlist management entry to **Test & Tune**. Do not remove Punchlist tabs inside individual Projects or Sales Orders.
- Keep formal Service Requests on the existing Service Requests page; do not duplicate their queue in Test & Tune.
- Keep the canonical `project_tasks`, `project_punchlist_requests`, and `service_requests` relationships. Do not delete legacy punchlist records or migrations.
- Preserve access to unmatched Earlier Items through a staff-only migration/placement utility, not as the primary Test & Tune tab.

## Test & Tune workspace
- Customer/project-focused, compact searchable rows immediately under a small toolbar.
- Include all active 90-day projects and expired projects with unresolved Test & Tune tasks; provide history filters.
- Show customer-entered adjustment tasks even when they are **not submitted** for service, and staff-created customer adjustments. Clearly separate draft, requested, scheduled, completed and expired eligibility.
- Staff can enter customer-reported adjustments and mark them customer-visible with a customer-safe description. Internal notes remain private.
- Customer-entered tasks are customer-visible. Visibility does not itself request service.
- Authorized staff may select one or more unsubmitted adjustment tasks for **one customer and project**, then submit a formal service request on the customer's behalf. Record submitter, actor type, timestamp, selected task IDs and submission source; notify customer under configured preferences.
- Customers can likewise submit their own unsubmitted adjustments. Preserve task identity; reject duplicate active submissions transactionally.
- The 90-day entitlement is anchored to substantial completion, not invite date. After expiration, existing requests continue; new complimentary adjustments require authorized exception review.

## Bidirectional navigation
- Test & Tune rows link to their canonical service request and any scheduled work orders.
- Service Request detail for a Test & Tune-origin request shows a Test & Tune source label and deep link back to the originating customer/project Test & Tune history.
- A deep link must preserve the target customer/project and item context; authorization and organization boundaries apply at both ends.

## Required two-way page navigation
- The **Test & Tune** page header provides **Service Requests**, opening the existing Service Requests page with its T&T-origin filter preselected.
- The **Service Requests** page header provides **Test & Tune**, opening the staff Test & Tune dashboard. This navigation is available even if the selected service request is not T&T-related, subject to module permission.
- Every submitted T&T task displays a clickable canonical service request number. Open the **specific request detail**, not just the queue. If multiple tasks share a request, they all point to the same request.
- Every T&T-origin service request detail displays a visible **View Test & Tune** link to the originating customer and project. Preselect the related submitted tasks while still showing other accumulated, unsubmitted customer adjustments for context.
- Preserve customer ID, project ID, request ID, and selected task IDs in route state or stable deep-link query parameters; support browser back/forward and page reload. Never use a customer name alone as a lookup key.
- On a missing/deleted target or revoked permission, show a useful unavailable/access-denied state rather than sending staff to an unrelated customer's record.
- Service Requests remains the sole formal request queue; Test & Tune remains the adjustment overview. Neither page duplicates or silently edits the other's underlying records.
- Test desktop/mobile links and permissions in both directions, including a customer with multiple projects and a single request containing multiple tasks.

## Acceptance criteria
1. Existing project Punchlist editing, sharing and technician task handling work unchanged inside Projects.
2. Service Request list retains normal service requests and Test & Tune requests without duplication.
3. Test & Tune staff view includes unsubmitted portal adjustments, not only queued requests.
4. Authorized staff can batch-submit unsubmitted adjustments, with audit trail and no duplicate requests.
5. Customer portal cannot see internal notes, estimates or staff-only items.
6. Navigation works from Test & Tune to Service Request and back, on phone and desktop.
7. Historical and unmatched legacy items remain accessible to authorized staff.
8. Validate permissions, 90-day boundaries, multi-project customers, cross-tenant isolation and tests before merge.

## Current implementation gap
`src/components/Production/PunchlistAdminDashboard.tsx` currently defaults to Project Punchlist and exposes Earlier Items and Customers; it is not yet a dedicated Test & Tune view. `src/components/Projects/ProjectTasksList.tsx` already queues individual project-task visits through `request_project_punchlist_visit`; staff multi-item Test & Tune submission and cross-page deep links need implementation and regression testing. This document records approved requirements, not a completed implementation.
