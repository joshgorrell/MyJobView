# Smart Intake release gates

- [ ] Confirm live provider signature verification and replay protection. Shared-secret-only prototype is not sufficient.
- [ ] Ensure intake is durable before acknowledgement and duplicate webhooks are idempotent.
- [ ] Enforce organization membership and RLS on history, messages, events, and attachments.
- [ ] Enforce immutable audit history at database level (the current schema does not yet guarantee this).
- [ ] Prevent CSV formula injection and restrict export to authorized staff.
- [ ] Confirm blank, duplicate, forwarded, failed, irrelevant and missing-message scenarios.
- [ ] Validate attachment storage, scanning, secure retrieval and retention.
- [ ] Confirm dealer email-only operation without SMS provider.
- [ ] Run migrations in staging, execute automated tests and validate UI across device sizes.
- [ ] Keep existing receive-inbound-email path unchanged until replacement is proven.

Current state: draft PR only; no migration applied and no production deployment.
