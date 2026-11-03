# All Activity implementation checklist

1. Query history by organization and filters, newest first, with capped pagination. Staff RLS and role membership must be enforced before exposing the helper in the UI.
2. Detail drawer displays original message, messages, processing attempts, delivery events, and staff actions. Attachments require private signed access with auditing.
3. Show reason labels for missing, failed, awaiting information, reviewed, dismissed, and converted cases. Never claim that a missing record proves no email was sent.
4. Make retry, reassign, link, dismiss and reopen server-side actions with authorization, idempotency and audit. Do not permit staff deletion of evidence.
5. Verify blank inbound emails, duplicates, tenant isolation, forwarded employee emails, and processing errors using real provider sandbox traffic.

Implementation status: query and timeline helpers are committed, but UI, RLS policies, ingestion and execution of tests are pending. These helpers are not safe to expose to unverified clients.
