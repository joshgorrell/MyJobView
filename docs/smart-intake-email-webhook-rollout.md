# Email intake endpoint — staged only

This endpoint is not production ready. It is **off by default** via SMART_INTAKE_EMAIL_ENABLED and is not wired to a live provider.

## Five rollout gates
1. Validate provider-native Resend webhook signature and signed payload (replace temporary shared-secret header). Check event type, timestamp, and replay window.
2. Verify actual Resend payload fields for recipient and event IDs, including email.received follow-up API fetch, HTML, attachments, and forwarded messages. The current handler expects a simplified payload and will not work with all native webhook shapes.
3. Provision a verified dealer-specific recipient in intake_destinations. Do not enable an unverified address. Ensure inbound address normalization is consistent.
4. Complete durable message/attachment persistence and human-review permissions. Ensure retries never overwrite a processed intake.
5. Run live sandbox email delivery, retry and concurrency tests, plus cross-dealer isolation checks before enabling SMART_INTAKE_EMAIL_ENABLED.

## Behavior
The existing receive-inbound-email function remains unchanged. The staged handler intentionally does not create contacts, leads, or service requests. SMS is not required.
