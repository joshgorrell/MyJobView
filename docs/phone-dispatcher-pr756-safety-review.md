# PR #756 safety review — migration and reconciliation prerequisites

Production audit identified the following **blocking** facts:

1. `notifications.type` has a check constraint that **does not permit** `phone_voicemail`. The current branch's notification insert will fail until the schema is extended.
2. `flow_events` has no unique index for `voicemail_messages` source events, and `notifications` has no per-voicemail/user uniqueness guarantee. Pre-insert reads do not prevent concurrent duplicates.
3. The worker marks voicemail `ready` or `review` before publishing Flow. If the publish fails, it logs and returns success. A reconciliation worker must find processed messages with missing Flow events or missing recipient notifications, and retry them.
4. `phone_voicemail_department_access` has **zero** production assignments. Department values allowed by voicemail_messages: `sales`, `service`, `projects`, `security`, `accounting`, `administration`.
5. No production cron job exists for the queue drain.

Before merge:
- Generate a migration using `supabase migration new ...` and add a new allowed notification type (preserve all existing allowed values).
- Add a partial unique index on `flow_events(organization_id,source_id,event_type)` for `source_table='voicemail_messages'`.
- Add a partial unique index on `notifications(organization_id,related_id,user_id)` for `type='phone_voicemail'`.
- Ensure notification recipients are still eligible active staff in the same organization; consider department-level review for no-recipient cases.
- Add a reconciliation path and tests proving idempotency under concurrent invocations, partial notification failures and retries.
- Verify Flow event visibility: `required_module='feed'` may not be an appropriate permission for all intended department recipients.
- Keep mailboxes disabled and do not activate cron or webhook subscriptions during schema rollout.

This is intentionally a draft PR until these items are verified.
