# MJV Smart Intake — Implementation Contract (Stage 1)

Status: planning branch; no production migrations or deployments.

## Existing findings
- `receive-inbound-email` extracts forwarded sales leads but inserts a new `contacts` row when no email match exists. This conflicts with the no-partial-customer requirement.
- `leads` has `is_incomplete`, `raw_email_content`, `raw_email_subject`, and `lead_source`.
- `service_requests` is the existing preliminary/unassigned service path; `work_orders` is for finalized assigned jobs.
- `contacts` is actively populated, while `customers` appears unused; confirm authoritative UI path before changes.
- `message_threads` and `messages` require established context IDs; they cannot alone hold unassociated inbound conversations.
- Existing `sms_logs` tracks outbound sends. `send-sms-reminder` currently simulates delivery.
- `receive-inbound-email` currently selects an organization without destination-based tenant resolution and its webhook secret check is conditional on the secret existing.

## Non-negotiable invariants
1. Store every legitimate inbound event durably before AI classification. Unknown contacts do not cause writes to `contacts` or `customers`.
2. Identify tenant from a verified destination mapping, never arbitrary payload claims or a global first organization.
3. Authenticate provider webhooks; fail closed if secret/configuration is missing.
4. Deduplicate on tenant + channel + provider event ID and preserve message threads/replies.
5. Distinguish employee sender from actual customer, particularly on forwards.
6. Validate final customer/lead/service request creation using existing business rules. Do not create work orders or dispatch automatically.
7. Retain attachments securely with tenant-scoped storage access and malware/type/size controls.
8. AI may summarize, classify, extract and request missing data; uncertain matches, unsafe communications, and urgent issues go to human review.
9. Every unresolved intake remains visible, actionable, and auditable. Dismissal is reversible, with reason.
10. Customer replies and employee replies continue the same intake, not new leads.

## Stage 1 minimal model (proposed, not migrated)
- `intake_items`: organization_id, office_id, channel, provider, provider_event_id, sender identity, destination, subject, body reference, status, classification, priority, assigned queue, contact_id nullable, lead_id nullable, service_request_id nullable, missing_fields JSON, last_activity_at, timestamps.
- `intake_messages`: intake_id, direction, sender role, provider message ID, body, delivery status, timestamps.
- `intake_attachments`: intake_message_id, private storage key, MIME, size, checksum, scan state, AI summary.
- `intake_events`: actor (AI/employee/provider), action, changes, timestamp.
- `intake_destinations`: verified email/phone destination to organization/office/channel mapping.

Review existing tables for reuse before migration; avoid duplicating message storage unnecessarily.

## State machine
received -> analyzing -> (ready | awaiting_customer | awaiting_employee | needs_review) -> processed.
Other states: duplicate_linked, dismissed, failed_retryable. Urgent cases alert support immediately, regardless of completeness.

## Rollout
1. Confirm existing frontend validation and email provider contract; design tenant-safe schema and RLS.
2. Add durable authenticated ingestion and queue, with no partial contact creation. Keep current route intact until tested.
3. Add matching/classification/AI follow-ups and manual exception controls within existing service and lead views.
4. Add provider-backed two-way SMS/MMS and email attachments, then controlled rollout per dealer.

## Acceptance tests
- Known customer, unknown customer, duplicate name, forwarded employee email, direct email, unknown sender, sales vs service, repeated webhook, concurrent delivery, reply threading, photos/PDF, malicious attachment, ambiguous match, opt-out, urgent issue, tenant isolation, missing webhook secret, provider outage, and recoverable dismissal.
- Confirm no new contact is created from incomplete intake.
- Confirm no simulated SMS is treated as delivered.
- Confirm every unresolved intake appears in the existing review UI.
