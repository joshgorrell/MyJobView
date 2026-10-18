# Smart Intake: existing shared Service Request Queue

Approved behavior:
- Service requests are never automatically assigned or claimed.
- Once intake creates a valid service request, it appears in the existing shared Service Request Queue.
- Any authorized user with Service Center access may handle the request using existing workflows.
- Per-user notifications are independently enabled or disabled; being authorized to see the queue never depends on notification preference.
- Bobbi Holthaus and JP are examples of configurable users, not hard-coded notification recipients.
- The queue should refresh on incoming requests (Supabase Realtime with an authorization-safe subscription, or a bounded polling fallback).
- Messages that cannot yet become service requests remain visible in the Smart Intake Needs Attention queue and complete All Activity history.
- Staff actions use the existing request lifecycle and audit trail; do not introduce a second ownership or claim workflow.

Implementation note: this supersedes the earlier suggestion to claim, assign or reassign intake records and the earlier notification-routing model that required an explicit recipient list. The actual user preference persistence, realtime queue update, and live notification integration are pending.
