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
- VIP uses the familiar punchlist workflow: add individual issues/photos, edit or remove unrequested items, select items (or Select All), enter the service address, and Request Service. Saving an item never requests a visit. Requested items stay linked to that visit; cancelled requests release the items for another visit. General service requests have no project ID. Plan benefits determine billing; access does not promise free labor. Up to 10 JPG/PNG/WebP photos (10 MB each) may be attached per save.
- Previous online requests remain visible when VIP access ends.

## Scheduling and completion

Project visit requests enter the existing Work Order Request Queue with `request_type = project` and the project's ID. `project_punchlist_requests` links the existing canonical tasks; it is a scheduling relation, not another task list. Scheduling automatically attaches original tasks to every sibling work order, without duplicate assignments. Existing task progress reporting and explicit whole-project-task completion remain authoritative.

New portal service requests enter the same queue with `source_type = customer_portal` and `request_type = service`. Dispatch, scheduling, and sibling technician work orders can see the customer photos; project visits retain original canonical task links. Completing all sibling visits closes the originating request; unfinished project tasks remain open for follow-up.

## Existing items

No existing records or service requests are deleted. Earlier customer punchlist items with a valid explicit project grant, or exactly one unambiguous Test & Tune project grant, are linked into `project_tasks`. Original IDs, requests, photos, and visit checklists remain available, with progress synchronized for legacy visits. **Earlier Items** contains the remaining unmatched items; staff choose the correct project explicitly. Assigning a cross-customer or cross-organization project is rejected.

Legacy portal mutation routes are closed. Hidden migrated items cannot be recovered through the old REST endpoints. Unmatched customer items remain view-only in the portal while staff resolve or place them. Existing internal `task_photos` and task audit data are never included in customer projections.

## Membership activation

After Test & Tune expires, the portal offers **View VIP Plans**. Customers with an active comped plan go directly to Service Requests. A paid purchase uses `vip-membership-checkout`: authenticated contact ownership, server-priced plan/tax snapshot, stable QuickBooks customer/invoice, secure hosted payment link, and a Check Payment Status action. The customer can close checkout and resume the same plan/invoice. No card details are collected in this portal.

Payment verification rereads the remote invoice from the same configured organization, realm, and environment; it checks invoice ID, customer, exact total, and full settlement. An unpaid or partially paid invoice never activates access. The service-role-only confirmation transaction activates the pending subscription, starts its billing period, writes one hosted-invoice payment record, and marks checkout paid. Duplicate events/retries are idempotent. Signed QBO payment/invoice webhooks, payment synchronization, and explicit customer status checks all run that same reconciliation. Cancelled subscriptions and conflicting active plans are sent for provider review rather than reactivated.

Incomplete portal claims fail closed; authenticated portal metadata also supports customers without a separate profile. Database guards reject browser activation, self-comping, changing entitlement dates or plan definitions, and customer changes to billing tax/account identity. Active paid status is shown only when the server entitlement is valid; an expired active record cannot hide purchase options. Hosted purchase enables recurring invoicing for the selected frequency, not an automatic card charge or stored card mandate. Existing staff activation and audited comp grants remain available.

## Release

1. Apply `20261019180250_project_punchlist_and_vip_service.sql` and `20261019183304_vip_service_list_and_checkout.sql`. Deploy `vip-membership-checkout`, `security-qbo-billing-setup`, `quickbooks-payment-webhook`, and `quickbooks-sync-payments` with the frontend. Do not deploy the frontend before its RPCs exist.
2. Review **Earlier Items** and place unmatched customer records. Review any previously shared project tasks without a customer description; they stay hidden until staff provide one.
3. Test with a portal account for an active project, an expired project, an active paid plan, a comped plan, and an expired VIP plan. Confirm shared descriptions and photos, and verify technician/internal notes remain absent.
4. In Admin → QuickBooks Settings, map the VIP membership income item to an active QBO Service item with the correct income account. Confirm Payments is enabled on the intended production realm and configure signed payment webhooks. The inspected connection is sandbox; no live charge was made. Complete a hosted payment acceptance test in that environment, then verify production setup before advertising live paid enrollment. Missing configuration fails closed with a contact-your-representative message.

Implementation and tests were prepared without changing the production database or deploying the frontend.

## Validation

- `npm run test:punchlist` includes the new database matrix with actual Postgres RLS roles (PGlite), project date boundaries, staff-only raw tables, safe projections, cross-contact/org denial, legacy placement/privacy, canonical sibling visits, paid/comped/expired VIP, pending enrollment, direct activation rejection, retries, and private photo ownership.
- Existing punchlist handoff, Test & Tune scheduler, VIP plan, and program access tests.
- `npm run test:project-support:browser` covers phone/desktop layout, item creation, visit requests, multi-issue service, expired access/history, and default-private staff sharing.
- `node tests/punchlist/vip-checkout.mjs`: full/partial/unpaid/cancelled, exact invoice/customer/company/amount checks, retries, and setup failures using simulated QBO responses.
- `node tests/punchlist/vip-membership-browser.mjs`: expired account → hosted checkout → pending verification → paid → Service Requests, plus comped account and configuration failure at phone/desktop sizes. These are automated fixtures, not a real provider transaction.
- Production build.
- Full TypeScript check has 11 pre-existing diagnostics in unchanged BusinessCard, Header, LostOpportunityReviews, DesignBriefModal, DesignQueue, and TaskForm files. The unchanged base produces the same diagnostics; this change introduces none.
