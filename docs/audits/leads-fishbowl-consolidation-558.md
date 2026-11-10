# Leads / Fishbowl consolidation — source-grounded audit (issue #558)

## Verified in main (2026-11-09)
- `src/components/Fishbowl/FishbowlView.tsx` queries `leads` with `is_fishbowl=true` and `status=unclaimed`, scopes visible leads by office, and subscribes to lead changes. Fishbowl is a view of existing leads, **not a distinct database of leads**.
- **Critical claim race:** `handleClaimLead` performs an ordinary `leads.update({assigned_to, status:'claimed', is_fishbowl:false, claimed_at})` filtered **only by lead ID**. Concurrent claimants can overwrite each other. The subsequent `feed_events` and `notifications` inserts are separate client requests, so events can disagree with final ownership or fail independently.
- `supabase/migrations/20251106122244_add_lead_claim_tracking.sql` already stores `time_to_claim_seconds` and `unclaimed_duration_seconds`; this is not immutable attribution of *who* claimed.
- `src/components/Leads/LeadDetail.tsx` already contains `reminderDate`, `savingReminder`, `reminder_date`, and proposal creation UI. Do not introduce a second reminder engine.
- `src/lib/contactCompleteness.ts` provides the shared `missingContactFields` and `isContactIncomplete` helpers for lead/service/support intake. Reuse rather than creating a new completeness definition.
- `src/components/SalesDashboard/StaleLeadsCard.tsx` already displays stale leads and navigates to Pipeline. Keep or adapt this existing reporting surface.
- Existing schema and entry points include `supabase/functions/submit-kiosk-lead/index.ts`, `src/components/Kiosk/TradeshowKiosk.tsx`, `src/hooks/useFishbowlCount.ts`, and migrations for kiosk source, claim time, and lead conversion. These require detailed parity review before removal.
- `src/components/Leads/LeadDetail.tsx` already has `deleteWithContact` and deletion confirmation state: audit its actual dependency checks before any stale-contact deletion UI.

## Implementation gates
1. **First functional PR:** Replace every client-side claim path with one authorized, organization-scoped, atomic database RPC that only claims if still unclaimed. Return explicit lost-race result; write immutable claim event in the same transaction. Test two concurrent claimants, cross-tenant requests, revoked reps, repeated requests, and notification delivery/idempotency.
2. Map all Fishbowl references in routes, count badges, email links, Flow, kiosk, reports and reward attribution. Then replace Fishbowl navigation with Sales Department view under Leads; preserve existing deep links and migrate source/assignment semantics.
3. Reuse existing `reminder_date` and Flow tasks. Define meaningful activity from actual stored interactions (not reads), prevent archival when a future follow-up exists, and add configurable 90-day stale review.
4. Use shared contact-completeness helper in cleanup. Preserve linked records and prevent deletion of contacts referenced by proposals, orders, projects, service, or other opportunities. Never auto-delete.
5. Report initial claimant separately from current assignee; preserve source and historical counts through release/reclaim. Sales Order means an **approved proposal**, not an initial lead or draft proposal.

## Not yet verified
- Exact RLS policies and database authorization on `leads` and `feed_events`.
- All claim entry points (Fishbowl and LeadDetail) and any server triggers.
- Existing reminder-to-Flow wiring and whether `reminder_date` is honored in all views.
- Kiosk anonymous-contact insert and conversion dependencies, including old data.
- Exact stale-lead calculation and schema relationships for safe deletion.

**This audit is documentation only.** It intentionally does not modify runtime behavior or apply migrations. High-risk migration and permission changes must be reviewed and tested before deployment.
