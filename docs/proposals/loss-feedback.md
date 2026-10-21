# Lost proposal feedback

Staff can record confirmed customer reasons by phone or email during the initial decline, or choose **Record loss feedback** later from the proposal menu or Sales → Lost Deals. Initial decline status and feedback save in one transaction. The proposal summary status picker uses the same form. Later entries preserve the earlier answers, with recorder and timestamp supplied by the database. Staff assessments remain separate from customer-confirmed answers.

Reviews → Lost Opportunities also supports phone/email feedback on unanswered requests, including external opportunities. Existing questionnaire submissions cannot be overwritten. The endpoint checks active tenant membership, Reviews access, submission viewing and sending permissions (or administrator role). Private questionnaire responses retain their existing access rules and are not copied into broader proposal fields.

Lost Deals combines proposal decline fields, later feedback, and private questionnaire answers the viewer can access. Multiple requests linked to one proposal count once. Confirmed customer answers take priority over staff assessments; the latest confirmed entry supplies the current reasons while all history remains visible. The report shows counts, percentages, known proposal value, monthly trends, customer-feedback coverage, sources, and a feedback-needed call list. Reason filters also narrow monthly trends.

Cancellations are separate and excluded from loss totals. Archived proposals retain their declined/cancelled outcome. Historical archives are inferred only from available archive/decline evidence. Records without a loss date appear under All time with a warning. Linked Lost Opportunity requests remain visible even when the proposal status has not been updated; cards state the underlying status, and the request does not change that status. Approved proposals are excluded.

External opportunities have unknown value and sales representative; the report does not invent either. Each external request is a separate opportunity because there is no stable proposal ID to deduplicate it. Multiple reasons can overlap, so percentages and attributed values can total more than 100% of unique losses.

## Seven-day reminder

Lost-opportunity reminders have a separate company switch and delay. The migration enables Electronic Life's lost-feedback reminder at seven days and carries forward already-enabled reminder automation for other organizations. Other review/survey timing and switches are unchanged.

One final **Tell Us Why** email links to the private questionnaire. The original invitation link continues working; both tokens remain hashed in the database. The reminder token is HMAC-derived from the server secret and request ID, so delivery retries are stable without persisting a raw token. Original token expiry is retained.

Only successfully sent requests without a response or previous reminder are eligible. Per-request opt-outs are respected. Confirmed portal, phone and email feedback stops linked reminders; staff assessments do not. Approved and cancelled proposals are skipped. Atomic claims prevent concurrent workers sending twice, and provider idempotency keys protect delivery retries. Failed delivery is not marked as sent. After a sent reminder, unanswered requests appear in Reviews → Lost Opportunities → Call list.

## Deployment

1. Apply `20261021113259_proposal_loss_feedback_reporting.sql`.
2. Deploy `lost-opportunity-review` and `send-review-followup-job`, including their imports.
3. Publish the frontend.
4. Verify Company Settings → Lost Opportunity Feedback Reminders: enabled, seven days. The separate general-review switch stays unchanged.
5. Check the next `send-review-followup-daily` scheduler run and delivery status. The existing scheduler runs at 09:00 UTC. Do not invoke the worker manually against live customers as a test.

Apply the migration before deploying the new functions or frontend. No production migration, function deployment, company setting or customer email was performed while preparing this branch.

## Validation

- `npm run test:loss-feedback`: reason/source priority, deduplication, date boundaries, role/tenant/module isolation, immutable history, database audit defaults, atomic decline rollback, archived outcomes, seven-day eligibility, questionnaire links, original-token preservation, manual-feedback suppression, concurrent workers and retry behavior.
- `npm run test:reviews`: existing private review, tenant, attachment, assessment and new manual-response endpoint tests.
- `npm run test:loss-feedback:browser`: phone/desktop layout, linked-loss deduplication, dates, archived losses, cancellations, call entry, failed-save recovery, initial decline and external feedback entry.
- Production build; lint for the new frontend components and data modules.
- Full TypeScript check compared against current main. Existing unrelated errors remain in business cards, header, design brief/queue and task form; the branch introduces no new diagnostics.
