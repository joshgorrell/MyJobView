# Record deletion rule

Deleting a record must remove its exclusively dependent notes, messages, notifications, activity snapshots, and read state. Enforce this in the database transaction so UI, API, bulk, and administrative deletions behave alike. A failed deletion must roll back its cleanup.

Use foreign keys with ON DELETE CASCADE for owned child rows. For polymorphic references such as Flow source_table/source_id and notification related_id, use an explicit table/type mapping and organization checks. Never infer ownership from a matching UUID alone.

Independent business records keep their own lifecycle. A customer's contact is not owned by a lead. An invoice, payment, payroll/time entry, or completed sale is not an activity snapshot. Existing restrictions that block deletion must remain effective; do not convert every SET NULL relationship to CASCADE.

Every new deletable record type must document its dependent rows, polymorphic activity references, attachments and external copies. Add deletion tests covering cleanup, rollback, tenant isolation, and preservation of independent records. Archive and delete are distinct operations.

## Audit findings — November 11, 2026

- Lead messages/tags/notifications and many proposal/project notes already use database cascades.
- Flow snapshots have no source foreign key. PR #682 handles leads and historical orphaned lead events.
- The follow-up activity migration adds deletion triggers for 20 explicit source tables, removes scoped Flow updates when their contact/project/work order is deleted, and cleans verified notification type mappings.
- Historical cleanup outside the lead migration is intentionally not performed without a record-specific inventory.
- Broader relationship review remains: discussion posts and message threads use SET NULL for some parents; attachments and external copies need their own lifecycle audit. Their ownership must be established before changing those relationships.
