# Work order configuration and customer programs

This change builds on PR #55. Merge #55 first, then retarget the settings/program PR to main.

Apply `supabase/migrations/20261001113659_work_order_configuration_and_program_access.sql` before publishing the new frontend. It creates dealer-scoped configuration with RLS, adds optional option references to work orders, and separates explicit VIP trial grants from project Test & Tune enrollment. No existing work orders or grant dates are rewritten. Existing subscription records created by the old Punchlist invitation function are tagged as legacy Test & Tune records, without deleting them.

Publish the updated `send-punchlist-invite` Edge Function for the corrected fallback invitation wording. Saved/custom email templates take precedence and should be reviewed separately; this migration does not overwrite customized templates.

Types keep canonical behavior for existing billing/phase/reference requirements. Statuses keep canonical lifecycle stages for existing scheduling and completion automation. Archiving is a separate action. Built-in and used options can be deactivated; used options cannot be deleted. Behavior/identity changes require a new option.

Test & Tune enrollment requires a project substantial-completion date and ends 90 days from that date, regardless of invitation timing. Promotional VIP trials are explicit offers with independent dates, no automatic invoicing or renewal, and their own Punchlist access grants. Extending a VIP trial synchronizes only its grant. Cancelling a trial does not remove a valid Test & Tune grant. Historical signup grants remain in place; new signup invitations do not create access grants.

Verification:

- `npm run test:program-access`: isolated Postgres tests for dealer RLS, custom lifecycle mapping, option deletion/deactivation, cross-tenant/unauthorized access, project dates, explicit trial enrollment/cancellation/extension, and historical preservation.
- `npm run test:work-orders`: visit task scope and modal lifecycle.
- `node tests/work-orders/browser.mjs` with Playwright 1.55.1 installed: isolated work-order and Admin settings flows at 320px, 390px, short viewport, and desktop sizes. Fixtures never connect to production.
- `npm run build`.

Physical iPhone keyboard testing remains outstanding. Existing repository-wide TypeScript failures are separate from these passing production and regression checks.
