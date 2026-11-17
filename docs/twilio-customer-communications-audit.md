# Twilio Customer Communications — Existing-System Audit (Issue #1069)

Date: 2026-11-17. Scope: source-level inspection of default branch, not production configuration or a live send test.

## Already present
- Admin > Integrations has Twilio account SID, phone number, auth-token configuration and an on-my-way template (`src/components/Admin/IntegrationsSettings.tsx`).
- `send-on-my-way-sms` is implemented and `work_orders.on_my_way_sent_at/by` exists.
- `send-review-request-sms` sends real Twilio messages, with a direct Google-review URL supplied by the caller.
- Appointment reminder schema includes `contacts.sms_opt_in`, `appointments.send_reminder`, `reminder_hours_before`, `reminder_sent_at`, and `sms_logs` (`20251117132000_add_sms_reminders.sql`).
- Proposal follow-up/review functionality exists in `lost-opportunity-review` and Reviews components. Reuse existing proposal/customer portal paths rather than building parallel pages.

## Confirmed code-level gaps / blockers
1. `send-sms-reminder` **does not send SMS**: it logs and returns simulated success; Twilio request is commented out. Do not claim reminders are delivered.
2. `send-on-my-way-sms` marks `on_my_way_sent_at` even if Twilio returns an error, and returns `success: true` even if `smsDelivered` is false. It also simulates success if credentials are missing. Must fix before enabling.
3. `send-on-my-way-sms` reads work orders with service-role privileges after checking only that a user is authenticated; authorization to this work order/dealer is not established in this function. Similar contact access/tenant checks need review in `send-review-request-sms`.
4. `send-review-request-sms` accepts a caller-provided `reviewUrl` and optionally a raw phone number. Enforce trusted destination, explicit permissions, opt-in/suppression and rate limits.
5. These functions send directly and independently; there is no shared queue, delivery status reconciliation, per-feature configuration, deduplication, or consistent opt-out check visible in these paths.
6. The original `company_settings` Twilio schema stores an auth-token column. The integration UI intentionally avoids reading the token back; verify DB access restrictions, encrypted secret storage, and migration compatibility before modifying credentials.
7. `company_settings` reads use `.single()`/`.maybeSingle()` without explicit dealer filters in the inspected senders. Verify actual tenancy model and avoid assuming a global settings row is safe for all dealers.
8. Existing `sms_logs` and consent fields are a useful starting point but need lifecycle/tenant-isolation audit before reuse.

## Safe implementation order
1. Audit company/dealer relationships, RLS, work-order permissions, contact ownership, actual Twilio configuration, reminder scheduling and existing review/proposal URLs.
2. Build a server-side SMS dispatch service with dealer-scoped config, consent/suppression, rate limiting, message idempotency, audit log, Twilio status callbacks, and real failures (never simulated success). Default new features OFF.
3. Refactor on-my-way and reminders onto dispatch; only mark sent after Twilio acceptance, with distinct accepted/delivered states. Validate authorization and avoid exposing secrets.
4. Add Admin > Communications > Text Messaging settings and previews, using the existing integration credential panel rather than duplicating it.
5. Wire proposal sent/follow-up and review request to existing customer portal links; stop follow-ups on terminal proposal states. Google review links must be equally accessible regardless of private rating.
6. Add inbound replies, appointment confirm/reschedule requests and later invoice/service triggers.

## Release gates
- No production sends from tests; sandbox/staging mocks first.
- Automated tests: tenant isolation, work-order authorization, STOP/START, opt-in, quiet hours, repeated clicks, reschedule/cancel, Twilio rejection and callback authenticity.
- No migration or runtime changes in this audit PR.
