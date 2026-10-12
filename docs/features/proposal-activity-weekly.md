# Weekly proposal Activity in Flow

Each assigned rep gets one private weekly **Proposal Activity** post in Flow/My Work. Expanding the post shows engaged proposals first and sent-but-unopened proposals separately. Each row links to the exact proposal's Activity dialog. First-open Flow events remain separate, one per proposal; subsequent visits and clicks stay on Activity.

## Schedule and contents

Monday at **8:00 a.m. in the dealer's organization timezone**, the database publishes the previous complete Monday–Sunday period. Cron checks every 15 minutes, and PostgreSQL handles local week boundaries and daylight-saving changes. Missing/invalid timezones fall back to America/Chicago. A delayed scheduler catches up once during the current week without backfilling old weeks.

The assigned rep is `proposals.created_by`, the same field the existing proposal editor uses for the selected sales representative. Publication requires an active employee with current Proposals and Flow permission. An email address is unnecessary.

Engaged rows show visits, latest visit, approximate active time, most-viewed section, and selected clicks. Unopened rows are current, sent, portal-visible proposals with no recorded opens. Archived proposals and inactive revisions are excluded at publication. Empty reports do not create posts.

Time is attributed to visits started during the report week rather than splitting a visit at the boundary. Older foreground duration is excluded. Visits with no active duration say that timing is not reported. Viewing is an estimate, and clicks do not mean an approval or payment was completed.

## Privacy and reliability

Weekly posts and first-open events are targeted to the assigned rep. Other reps and other dealers cannot read them. The report details RPC checks active identity, dealer, recipient, and current Flow/Proposals permissions. Proposals reassigned since publication are filtered out of the old rep's response. Prepared snapshots/email payloads are not exposed through browser table grants.

Weekly uniqueness is enforced by organization, rep, and week. Creating the report, inserting the Flow event, and marking it published occur in one database transaction; retries cannot create another post. The recipient field also puts the post in My Work even when individual contacts have different owners.

There is **no weekly email**, Edge Function, provider call, or notification/push dispatch. The publication function is callable only by the database owner/scheduler. The replacement migration cancels any pending old email rows, removes the old email worker RPC and HTTP invocation function, and replaces its cron command with native Flow publication. Historical migration files and any historical delivery audit columns remain intact.

## Deployment

The tracking, first-open Flow, and Flow-only weekly backend migrations were applied and verified in MJV on October 12, 2026. The weekly email worker was not deployed. The expandable weekly-post display still requires merging/deploying this follow-up frontend change.

1. Apply `20261012130517_proposal_engagement_sessions.sql` and `20261012132908_proposal_activity_flow_and_weekly.sql` if not already applied.
2. Apply `20261012140748_weekly_proposal_activity_flow_posts.sql`. It uses the existing pg_cron infrastructure and schedules `proposal-activity-weekly-due-reports` to call `private.publish_weekly_proposal_activity()` every 15 minutes. If migrations are applied in sequence, the older HTTP schedule migration is superseded by this replacement.
3. Deploy the frontend from this follow-up PR. **Do not deploy the removed proposal-activity-weekly email function.** No weekly email credentials or Vault endpoint setup is needed.
4. If the old Edge Function was deployed separately, remove it during cleanup; its removed worker RPC already prevents future queue processing. Existing unrelated system emails and billing/invoice workers are unaffected.
5. Smoke-test the assigned rep's Flow/My Work: a first open appears once and its link opens Activity. After the scheduled publication, expand the weekly post and test links to both engaged and unopened proposals. Confirm a different rep cannot read the post/report.

The cron schedule can be paused without affecting visit tracking or first-open events. Publication failures appear in the normal cron run history. Publishing is automatic after deployment; the code merge alone does not apply database migrations.

## Verification

`npm run test:proposal-engagement` covers the tracking model, database permissions, first-open/My Work events, Monday/DST boundaries, private weekly publication, duplicate prevention, reassignment filtering, inactive/revoked access, and replacement of the email/HTTP scheduler.

`npm run test:proposal-engagement:browser` covers the actual tracking hook, Activity dialog links, and weekly Flow post expansion, grouped metrics, click labels, link targets, lazy loading, retry behavior, and mobile/desktop layouts. Existing Flow workspace/database and proposal preview regressions are also checked.
