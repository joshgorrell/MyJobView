# Lost proposal feedback

Staff can record confirmed customer reasons by phone or email during the initial decline, or choose **Record loss feedback** later from the proposal menu or Sales → Lost Deals. Initial decline status and feedback save in one transaction. The proposal summary status picker uses the same form. Later entries preserve the earlier answers, with recorder and timestamp supplied by the database. Staff assessments remain separate from customer-confirmed answers.

Reviews → Lost Opportunities also supports phone/email/in-person feedback on unanswered requests, including external opportunities. Existing questionnaire submissions cannot be overwritten. The endpoint checks active tenant membership, Reviews access, submission viewing and sending permissions (or administrator role). Private questionnaire responses retain their existing access rules and are not copied into broader proposal fields.

Lost Deals combines proposal decline fields, later feedback, and private questionnaire answers the viewer can access. Multiple requests linked to one proposal count once. Confirmed customer answers take priority over staff assessments; the latest confirmed entry supplies the current reasons while all history remains visible. The report shows counts, percentages, known proposal value, monthly trends, customer-feedback coverage, sources, and a feedback-needed call list. Reason filters also narrow monthly trends.

Cancellations are separate and excluded from loss totals. Archived proposals retain their declined/cancelled outcome. Historical archives are inferred only from available archive/decline evidence. Records without a loss date appear under All time with a warning. Linked Lost Opportunity requests remain visible even when the proposal status has not been updated; cards state the underlying status, and the request does not change that status. Approved proposals are excluded.

External opportunities have unknown value and sales representative; the report does not invent either. Each external request is a separate opportunity because there is no stable proposal ID to deduplicate it. Multiple reasons can overlap, so percentages and attributed values can total more than 100% of unique losses.

## Fourteen-day reminder and personal follow-up

Lost-opportunity reminders have a separate company switch and delay. The migration enables Electronic Life's lost-feedback reminder at 14 days and carries forward already-enabled reminder automation for other organizations. Other review/survey timing and switches are unchanged.

One final **Tell Us Why** email links to the private questionnaire. The original invitation link continues working; both tokens remain hashed in the database. The reminder token is HMAC-derived from the server secret and request ID, so delivery retries are stable without persisting a raw token. Original token expiry is retained.

Only successfully sent requests aged 14–29 days (using the configured reminder delay), without a response or previous reminder, are eligible. Requests at least 30 days old are reserved for personal follow-up. Per-request opt-outs are respected. Confirmed portal, phone, email and in-person feedback stops linked reminders; staff assessments do not. Approved and cancelled proposals are skipped. Atomic claims prevent concurrent workers sending twice, and provider idempotency keys protect delivery retries. Failed delivery is not marked as sent. At 30 days from the original sent request, unanswered successfully sent requests appear under Needs Personal Follow-up, whether or not the automatic reminder was enabled. No day-30 email is sent. Staff can explicitly resend the survey at any time while unanswered; each successful resend records its date and sender, retains the original request age, and does not create another opportunity or reset the automatic reminder. Expired survey links are renewed by a manual resend. Recording customer feedback clears the flag.

## Deployment

1. Apply `20261021135208_lost_feedback_personal_followup.sql` after the original `20261021113259_proposal_loss_feedback_reporting.sql`.
2. Deploy `lost-opportunity-review` and `send-review-followup-job`, including their imports.
3. Publish the frontend.
4. Verify Company Settings → Lost Opportunity Feedback Reminders: enabled, 14 days. The separate general-review switch stays unchanged.
5. Check the next `send-review-followup-daily` scheduler run and delivery status. The existing scheduler runs at 09:00 UTC. Do not invoke the worker manually against live customers as a test.

Apply the migration before deploying the new functions or frontend. No production migration, function deployment, company setting or customer email was performed while preparing this branch.

## Validation

- `npm run test:loss-feedback`: reason/source priority, deduplication, date boundaries, role/tenant/module isolation, immutable history, database audit defaults, atomic decline rollback, archived outcomes, 14-day eligibility, questionnaire links, original-token preservation, manual-feedback suppression, concurrent workers and retry behavior.
- `npm run test:reviews`: private review, tenant, attachment and assessment tests, plus in-person entry, resend permissions, successful/failed resend history and original request age.
- `node tests/reviews/browser.mjs`: phone/desktop day-30 flag, explicit resend confirmation, resend history and clearing the call list after feedback.
- `npm run test:loss-feedback:browser`: phone/desktop layout, linked-loss deduplication, dates, archived losses, cancellations, call entry, failed-save recovery, initial decline and external feedback entry.
- Production build; lint for the new frontend components and data modules.
- Full TypeScript check compared against current main. Existing unrelated errors remain in business cards, header, design brief/queue and task form; the branch introduces no new diagnostics.
