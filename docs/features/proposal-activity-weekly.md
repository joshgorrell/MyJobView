# Proposal Activity in Flow and weekly email

An assigned rep gets one Flow event when a customer first opens a proposal, with a **View Activity** link. Visits and clicks stay on the proposal Activity page. A weekly email consolidates the rep's own proposals, with engaged proposals first and sent-but-unopened proposals separately.

## Behavior

- The rep is `proposals.created_by`, the field the existing proposal editor uses for its selected sales representative. Inactive users and users without Proposals permission are excluded from reports.
- A first-open event is targeted to that rep, appears in My Work even if the contact is assigned elsewhere, and requires current Flow/Proposals access and proposal visibility. Another rep cannot read the targeted event. The existing generic status-only `sent → portal` event is suppressed to prevent a duplicate. Other proposal status changes retain their existing Flow behavior.
- There is one first-open event per proposal record. New published versions of the same record do not generate another event. Previously viewed proposals are not backfilled. Visits, duration updates, and clicks never create additional Flow posts or push/email notifications.
- Monday at **8:00 a.m. in the dealer's organization timezone**, each eligible rep gets one email for the previous complete Monday–Sunday period. UTC cron polls every 15 minutes; timezone and DST boundaries are calculated in PostgreSQL. Missing/invalid timezones fall back to America/Chicago. A delayed worker catches up once during the current week; old weeks are not backfilled.
- Engaged rows show visits, latest visit, approximate active time, the most-viewed section, and selected clicks. Unopened rows are current, sent, portal-visible proposals with no recorded views. Inactive revisions and archived proposals are excluded. No email is generated when both sections are empty.
- Active time refers to visits started during the report period. A visit spanning the week boundary is not split into daily segments. Older foreground duration is excluded; visits with no active duration say that timing is not reported.
- Each row links to the exact proposal's **Activity** dialog after the normal employee sign-in and module checks. The link overrides a previously saved open proposal. The existing proposal editor's Activity Log now uses this same dialog.

## Delivery and security

The new `proposal-activity-weekly` Edge Function uses the existing `_shared/system-email.ts`, Resend credential, and tenant sender settings. No email is sent in browser code. The cron request reuses the existing server-only Vault credential/endpoint used by invoice delivery: `security_billing_worker_secret` and `security_billing_project_url`.

Weekly rows are unique by organization, recipient, and week. Worker RPCs are service-role-only; the Edge handler additionally verifies the dedicated worker token. Claims use row locks, lease tokens, bounded retries, and a frozen prepared email with a stable provider idempotency key. Retries stop within 23 hours of report creation to stay inside the email provider's idempotency window. An accepted email is recorded as sent; this does not claim inbox delivery.

Before claiming/retrying, the worker checks recipient activity, Proposals permission, current proposal assignments, and any prepared recipient address. A changed assignment/access/address skips the whole old report rather than sending a stale payload. Prepared report/email contents are not exposed through browser table grants; a rep can read only their own delivery status columns. Ordinary browser JWTs and anonymous users cannot dispatch, prepare, or acknowledge emails.

## Deployment

1. Apply `20261012130517_proposal_engagement_sessions.sql` and `20261012132908_proposal_activity_flow_and_weekly.sql`.
2. Deploy the `proposal-activity-weekly` function with the bundled `index.ts`, `worker.ts`, `reportEmail.ts`, and shared system-email module. Its `verify_jwt=false` setting is intentional: authorization is the dedicated server-only Vault token.
3. Confirm the existing Vault project URL/worker credential and existing `RESEND_API_KEY` are configured. Sender comes from each dealer's verified `company_settings`; application links use `app_url`, then the dealer subdomain on myjobview.com, then myjobview.com. No new credentials or paid analytics service are required.
4. Apply `20261012132915_proposal_activity_weekly_schedule.sql` after the function is deployed. Existing pg_cron/pg_net/Vault infrastructure is reused. The schedule is named `proposal-activity-weekly-due-reports`.
5. Deploy the frontend from the same PR.
6. Smoke-test with an owning customer and assigned rep: first open appears once in Flow/My Work, return visits add no posts, and View Activity opens the correct dialog. For email rollout, inspect generated queued rows and use a controlled rep mailbox; verify provider acceptance and the Activity links. No real email was sent by the isolated tests.

Disabling the cron job pauses weekly delivery without affecting proposal tracking or first-open Flow events. Failed/skipped delivery reasons are stored in `proposal_activity_weekly_reports`. Do not reset a sent report or alter a cached email payload to force a resend; use a deliberate new delivery identity for any manual resend workflow.

## Verification

`npm run test:proposal-engagement` includes deterministic attention tests, database authorization/aggregation/Flow/worker tests, Monday/DST window checks, assignment changes, inactive/permission exclusions, email content, worker authentication, and idempotent retries.

`npm run test:proposal-engagement:browser` covers the actual tracking hook, Activity UI, direct-link route/dialog, stale local state, keyboard focus, and mobile/desktop layouts. `node tests/flow/workspace-browser.mjs` checks the actual Flow View Activity link and existing Flow interactions/follow-ups. Existing proposal preview, list, and Flow database regressions also run before release.
