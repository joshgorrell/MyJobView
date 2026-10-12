# Customer Punchlist work-order flow

A technician's default Today's Work view shows the visit address and directions, appointment, assigned technicians, Scope / Description, Customer Punchlist, and any Internal Tasks. Description-only visits keep work-order completion notes; no artificial checklist is created.

Customer Punchlist entries reference the original customer record through a visit association. They are not copied into project_tasks or work_order_tasks. Six selected original items therefore appear as six separate Customer Punchlist entries on the visit. Requests carry a brief scope summary, rather than repeating every item's text in the description. Existing combined historical descriptions are not parsed or rewritten.

A shared technician visit shows the same original items on each assignment. One completion updates the original item's status and the open assignments. Stale writes are rejected. Each remaining item needs a remaining-work explanation before that visit can be closed. Closing a visit does not imply every customer item is complete. After the final linked visit ends, unfinished originals return to the open list for another request. Earlier visit outcomes remain associated with their original work orders.

All technician notes are internal: item completion notes, remaining work, internal instructions, Internal Task progress notes, and the work-order summary. Customer views receive item status only. Previously stored installer notes are preserved in a staff-only table and cleared from customer-readable Punchlist rows. Staff note records, visit outcomes, work-order data, job completions, and task update/history records are protected from portal-profile access.

Customers require active Test & Tune/VIP access for Punchlist actions. Trusted portal claims work without a staff profile; editable user metadata does not authorize actions. Access-check errors stop the customer interface and show a retry. Administrative access functions require an active employee with the relevant module and management role in the same organization. Ordinary employees and portal users cannot grant, renew, or suspend access.

## Coordinated release

Do not publish the new frontend alone, and do not blindly replay every repository migration. The audit found historical production migration versions that differ from the filenames. Preserve those historical entries.

1. On isolated staging with the full current production schema, apply the missing existing `20261006004224_simplify_customer_invites_comped_vip.sql` migration. It supplies the comped membership function and audit columns. Avoid replaying already-applied program/configuration migrations under a second version.
2. Apply `20261012181950_punchlist_visit_handoff_and_access.sql`, then `20261012183126_test_tune_scheduler_delivery.sql`. The first preserves existing notes, links only explicitly associated existing requests/visits, and adds access guards. The second prepares the scheduler and retry state. Test existing customized schemas and trigger graphs, portal-profile/no-profile access, shared-visit concurrency, and saved custom email templates.
3. Deploy `send-punchlist-invite` and `process-test-tune-starts` with the new configuration. The processor accepts a dedicated scheduler secret or the existing service role credential; the invitation sender resolves employee/tenant authority and recipient ownership, and keeps prior portal links valid on send failure.
4. Publish the frontend from this PR through Bolt. Staff note editing must be released with the backend note-storage change. Confirm a signed-in customer/staff/technician flow and physical iPhone Safari interaction.
5. Configure a fresh dedicated scheduler secret as the `TEST_TUNE_SCHEDULER_SECRET` Edge Function secret and the same value in Vault as `test_tune_scheduler_token`. Set `test_tune_scheduler_url` to the project API URL. Never put a service role key in cron or source code. The migration deliberately leaves the daily cron job inactive; verify the credentials and function with a controlled staging run before enabling `process-test-tune-starts-daily` in production. Its prepared schedule is 13:15 UTC daily (08:15 Central daylight time, 07:15 Central standard time).
6. Verify successful mail-provider acceptance, a usable customer access link, the delivery acknowledgment, and mailbox receipt before calling the automatic flow live. Monitor cron/Edge Function runs and retry-needed responses. Provider idempotency has finite retention; receipt of an HTTP 200 with success=false never counts as a sent invitation.

The processor preserves the established Day-7 invitation eligibility while the 90-day access period ends 90 days after substantial completion. An already-ended project receives no new period. A project-scoped active grant is reused. Existing started projects and manually handled grants are not automatically reinvited; their historical delivery is not fabricated. Starting the period and preparing its grant is atomic; a failed delivery remains retryable. The stable delivery key reuses its token and mail-provider idempotency key. No project-independent membership or automatic billing is created.

## Verification

- `npm run test:punchlist:handoff`: isolated Postgres checks for six originals, shared visits, no duplicate Internal Tasks, per-item outcomes, private notes, no-profile/expired access, stale writes, management/tenant restrictions, closed-visit history, Day-7 dates, and delivery retries.
- `npm run test:punchlist`, `npm run test:program-access`, `npm run test:service-requests`, and `npm run test:work-orders`: existing regressions.
- `npm run test:punchlist:handoff:browser` and `node tests/punchlist/dashboard-browser.mjs` after a build, with Playwright Chromium available: actual work-order/component fixtures at phone and desktop widths, both themes, description-only visits, six entries, individual/unfinished updates, customer note privacy, and accessible dashboard controls.

Tests do not send real emails or alter production. This PR alone does not activate the scheduler or deploy the application.
