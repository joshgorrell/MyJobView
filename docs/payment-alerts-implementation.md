# Proactive monitoring payment alerts

Draft implementation for MJV-managed security monitoring AutoPay. No production database changes, worker deployment or customer emails have been performed.

## What changed

The existing billing worker sent advance debit notices and retained failures in billing history. It did not proactively notify customers/staff about those failures or check saved card expiration. The existing email integration is Resend; another processor or notification subscription is not needed for this email workflow. QuickBooks remains the payment processor and accounting destination.

| Situation | Customer | Staff |
| --- | --- | --- |
| Saved card within 30 days or 7 days of expiration | Email with provider contact and portal link | Email and persistent queue |
| Saved card expired/unavailable or expiration unverifiable | Email requesting a secure update | Email and queue; expired/unverified cards cannot be charged |
| Confirmed failed/returned payment during processing | Email, follow-ups on days 3 and 7 if unresolved | Email, bell notification and queue |
| Late ACH return after receipt | Email asking customer to contact provider and confirm balance before paying again | Reconciliation alert; further AutoPay debits held until an audited review |
| Timeout/uncertain outcome, stale processing lease | No claim of payment failure | Reconcile before retrying |
| Stalled invoice/notice, overdue debit job, delayed settlement or accounting sync | No claim of payment failure | Email and queue |

An independent alert worker runs every 15 minutes. Email deliveries have a durable outbox, leases, increasing retry delays up to one day, frozen message/recipient snapshots and stable Resend idempotency keys. Initial alerts are deduplicated while open; a genuinely recurring issue gets a new alert. Staff receive daily reminders after three unresolved days. Acknowledgement records ownership without resolving the issue or stopping reminders. Resolution follows the actual source state and cancels queued reminders. Provider acceptance is displayed as acceptance, not proof of inbox delivery.

A separate settlement watcher uses GET on existing QuickBooks ACH transactions. It checks eligible received payments once daily for 90 days, up to five per invocation. It never posts a charge or edits invoice/payment/commission amounts. A reported return holds subsequent automatic debits until authorized staff attest, with evidence, that the bank return, invoice, QuickBooks accounting and affected commissions have been reconciled. Those financial corrections remain explicit staff work; the alert review does not perform or pretend to perform them. Transactions outside the 90-day monitoring window and card disputes require separate reconciliation.

## Staff workflow

Contract Management shows Payment alerts across the organization. Each agreement's Monitoring billing shows its own alerts. Admin/finance can select one billing-alert email address, falling back to the company contact email. Active Admin/finance users also receive durable bell notifications. Contract Management recipients can review accessible alerts. Financial alerts, outbox rows and audit records are tenant restricted and client read-only; worker operations are service-only.

Customers receive a signed-in portal link and instructions to contact the provider. Active agreement updates use the staff **Update AutoPay payment method** control. It requires Contract Management permission, a recently verified processor method belonging to the same customer, confirmed customer authorization and a change note. It preserves signed terms and existing pause state. Uncertain/in-flight payments must be reconciled first. Replacing a method does not automatically retry a declined payment; the existing checked billing review remains necessary. Revoked mandates require fresh authorization through a separate agreement workflow.

Checks cover authorized MJV-managed monitoring accounts, not un-enrolled historical records, externally scheduled QuickBooks payments, VIP billing, or simulated legacy Stripe method records. Expiration checks use the saved processor-verified expiration; externally changed vault details must be refreshed through the enrollment workflow. SMS, email bounce/complaint webhooks, and independent infrastructure outage monitoring are follow-up integrations. Resend's idempotency retention is finite; an accepted email whose database recording repeatedly fails beyond that window can be repeated, rather than guaranteeing exactly-once delivery.

## Deployment and review

Apply the migration before the frontend. Deploy both `security-payment-alerts` and `security-payment-settlement-watch`, plus the updated `security-payment-methods` function. Their JWT bypass config is paired with the existing server-only billing worker credential; browser/portal JWTs do not authorize scheduled work. Use the existing Vault values `security_billing_project_url` and `security_billing_worker_secret`; configure `RESEND_API_KEY`, sender settings and the verified `SECURITY_ACH_SETTLED_STATUS`.

The migration schedules both jobs when the project URL secret already exists. If configured afterward, schedule `security-payment-alerts-every-15-minutes` and `security-payment-settlement-watch-every-15-minutes` to invoke their matching private functions every 15 minutes. Verify active cron jobs and successful edge responses. New signed AutoPay accounts cannot activate until both jobs are active and a scan has completed within the last hour. The UI flags a missing or more-than-one-hour-old scan; it cannot independently deliver an email during a total scheduler/email outage.

Validate on an isolated staging copy with the complete invoice/tax/notification/commission trigger graph and Supabase advisors. Use a synthetic mailbox and merchant sandbox to verify actual card decline, expired card, missing address, mail rejection, accepted-but-recording-failed retry, ACH pending/settled/returned states and the daily follow-up cadence. Verify the existing notification type `system` is allowed. Review initial alert recipients before enabling the worker against real accounts. Do not infer production readiness from unit tests alone.

## Verification

The security onboarding suite includes real SQL/RLS fixtures and the new expiry, audience, tenant, authorization, retry, frozen-message, stalled-job, settlement-observation and resolution cases. Email/worker harnesses cover dedicated authorization, provider failures, accepted IDs and unchanged retry payloads. The settlement watcher is checked to use the existing transaction ID for GET and never create another charge. Frontend build and lint of the new components/workers are included in the draft PR validation.

The production build, security onboarding suite and focused lint pass. Repository-wide typecheck has 1,502 diagnostics on both the checked base (`fb943c6`) and this feature branch before integrating the concurrent mobile proposal changes; normalized diagnostic messages show no new errors. A clean repository-wide typecheck is not claimed.
