# Smart Intake: integration gates

1. **Schema check completed (read-only, 2026-10-14):** organizations, contacts, leads, service_requests, company_offices and company_settings use UUID IDs; contact and lead office IDs are UUID foreign keys. The staging schema references compatible ID types. No DDL was executed.
2. **Destination resolution:** a verified, enabled intake destination must map to exactly one dealer. Do not use the current first-organization fallback. Normalize recipient addresses when provisioning destinations.
3. **Authenticated webhook:** require a configured provider secret, verify actual provider signature contract (a shared header alone is not a substitute for provider HMAC), validate payload, reject unrecognized recipients. Never allow a missing secret to bypass checks.
4. **Durable ingestion:** create intake item idempotently before classification; avoid contact/lead creation until review or a validated conversion. Add retry handling and unique provider IDs.
5. **Review queue:** use existing Service Command Center or sales surfaces; expose only organization-scoped records after employee authorization. No new top-level navigation page.

## Blockers before activation
- Confirm Resend inbound webhook delivery shape, event IDs, recipient routing and signature verification.
- Apply a reviewed migration (not the docs-only staging SQL) with employee RLS policies and safe storage bucket.
- Test actual authenticated email forwards, retries, missing provider secret, attachments, unknown customer and urgent service.
- Integrate the server-side helper into the existing inbound function only after the new schema exists.
- Run npm typecheck, relevant tests, and CI; verify deployment after merge.
