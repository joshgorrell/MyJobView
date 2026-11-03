# Smart Intake: Complete activity history

The Service Command Center will contain two views within its existing navigation: **Intake Queue** (actionable cases) and **All Activity** (searchable history). No new top-level page.

## History guarantees
- Preserve every message that reaches authenticated intake, even blank, incomplete, irrelevant, duplicate, or processing-failed submissions.
- Store immutable original payload evidence securely, plus normalized sender/recipient, message content, attachments, provider event IDs and timestamps. Apply retention and redaction policies to sensitive data.
- Track each processing transition with timestamp, actor, reason, error category and resulting record ID. Never silently discard unknown or incomplete requests.
- Preserve outbound follow-ups, provider delivery receipts, and employee actions. Separate **provider accepted**, **MJV received**, **MJV processed**, and **service request created**.
- If no matching message is found, display **No matching inbound message found**, not **customer did not send**.
- Dealer boundaries must be enforced in every history query and detail lookup.

## Investigation workflow
Search by sender email/phone, recipient, subject, body, intake ID, service request ID, date range, channel, and status. Open a record to view raw message evidence, attachments, AI decision explanations, linked customer/lead/service/work order, attempts, delivery events, and staff audit. Authorized employees can retry safely or create/link a request through existing workflows, recording the action. Original events cannot be edited or deleted by staff.

## Access
Dealer admins and authorized service managers may view history within their organization. More limited employee access follows existing service permissions. Downloads of original content and attachment access must be logged. Do not expose provider credentials or authentication tokens.

## Acceptance scenarios
Blank email; unmatched sender; duplicate webhook delivery; forwarded employee email; irrelevant inquiry; processing failure; customer complaint; disabled channel; malicious attachment; provider rejection; missing external email. Each scenario must be distinguishable in history.
