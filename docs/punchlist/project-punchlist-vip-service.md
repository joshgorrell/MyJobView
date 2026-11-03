# Project Punchlist and VIP Service Requests

Project tasks are the project's punchlist. There is no new parallel staff task list. The general Service Request form directs new project work to Project Punchlist; existing project requests remain editable. The unread punchlist badge includes customer project submissions without double-counting migrated items.

## Behavior

- Staff use the project's **Punchlist** tab, the sales order's **Punchlist** tab, or **Production → Punchlist → Project Punchlist**. New staff items default to **Internal**.
- Staff explicitly choose **Customer-visible** and supply a separate customer description. The portal projects only that description, public progress/status, source, and customer photos. Internal titles, instructions, estimates, technician notes, and audit history remain staff-only, even on shared items.
- Customer submissions are customer-visible and tagged with their contact. Customers see only their own projects from substantial completion onward.
- New customer project submissions and visit requests are allowed from substantial completion through substantial completion + 90 days, inclusive. This uses the existing Test & Tune date anchor; invitations, VIP membership, and the daily scheduler never restart the clock. A suspended project Test & Tune grant blocks new submissions.
- The portal shows a per-project Test & Tune countdown, an Ends today state, the exact end date, and what changes afterward.
- After Test & Tune the customer list is view-only. Open obligations and photos remain; staff can continue work and queue visits without a current customer entitlement.
- Active paid or explicitly complimentary VIP subscriptions enable general online service requests. Trials, pending payments, suspended/cancelled subscriptions, future starts, expired terms, or overdue paid billing dates do not. A comp uses the selected real plan, a fixed end date, zero custom amount, and no automatic billing, send, or renewal. Existing audited comps (`comped_by` + `comped_at`) are preserved.
- VIP requests can describe several issues and include up to 10 JPG/PNG/WebP photos (10 MB each). General service requests have no project ID. Plan benefits determine billing; access does not promise free labor.
- Previous online requests remain visible when VIP access ends.

## Scheduling and completion

Project visit requests enter the existing Work Order Request Queue with `request_type = project` and the project's ID. `project_punchlist_requests` links the existing canonical tasks; it is a scheduling relation, not another task list. Scheduling automatically attaches original tasks to every sibling work order, without duplicate assignments. Existing task progress reporting and explicit whole-project-task completion remain authoritative.

New portal service requests enter the same queue with `source_type = customer_portal` and `request_type = service`. Dispatch and the scheduling form can see the original project items and customer photos. Completing all sibling visits closes the originating request; unfinished project tasks remain open for follow-up.

## Existing items

No existing records or service requests are deleted. Earlier customer punchlist items with a valid explicit project grant, or exactly one unambiguous Test & Tune project grant, are linked into `project_tasks`. Original IDs, requests, photos, and visit checklists remain available, with progress synchronized for legacy visits. **Earlier Items** contains the remaining unmatched items; staff choose the correct project explicitly. Assigning a cross-customer or cross-organization project is rejected.

Legacy portal mutation routes are closed. Hidden migrated items cannot be recovered through the old REST endpoints. Unmatched customer items remain view-only in the portal while staff resolve or place them. Existing internal `task_photos` and task audit data are never included in customer projections.

## Membership activation

The former portal checkout simulated payment and wrote `status = active` directly from the browser. It now requests pending enrollment without collecting or claiming a payment. Trusted staff/payment processing must confirm payment and activate the subscription. Database guards reject browser activation, self-comping, changing entitlement dates, or changing plan definitions. Staff billing and processor/service-role paths remain available.

## Release

1. Review and apply `20261019180250_project_punchlist_and_vip_service.sql` through the normal database migration deployment, then deploy the frontend together. Do not deploy the new frontend before the RPCs exist.
2. Review **Earlier Items** and place unmatched customer records. Review any previously shared project tasks without a customer description; they stay hidden until staff provide one.
3. Test with a portal account for an active project, an expired project, an active paid plan, a comped plan, and an expired VIP plan. Confirm shared descriptions and photos, and verify technician/internal notes remain absent.
4. Confirm the production payment-confirmation or staff activation process before advertising instant self-service paid enrollment. This PR does not add a payment processor.

Implementation and tests were prepared without changing the production database or deploying the frontend.

## Validation

- `npm run test:punchlist` includes the new database matrix with actual Postgres RLS roles (PGlite), project date boundaries, staff-only raw tables, safe projections, cross-contact/org denial, legacy placement/privacy, canonical sibling visits, paid/comped/expired VIP, pending enrollment, direct activation rejection, retries, and private photo ownership.
- Existing punchlist handoff, Test & Tune scheduler, VIP plan, and program access tests.
- `npm run test:project-support:browser` covers phone/desktop layout, item creation, visit requests, multi-issue service, expired access/history, and default-private staff sharing.
- Production build.
- Full TypeScript check has 11 pre-existing diagnostics in unchanged BusinessCard, Header, LostOpportunityReviews, DesignBriefModal, DesignQueue, and TaskForm files. The unchanged base produces the same diagnostics; this change introduces none.
