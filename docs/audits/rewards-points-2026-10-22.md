# Rewards & Points — audit and implementation plan (2026-10-22)

## Confirmed source evidence
- `supabase/migrations/20261005131500_task_department_assignment_and_atomic_completion.sql`: tasks default to 10 points; `complete_task_atomic` records the first eligible completer and inserts `task_completion` transaction; reopening reverses points. Verify reversal against original award rather than mutable task value.
- `src/components/Tasks/TasksView.tsx`: discussion tasks update completion and insert points from the client, separate from regular task atomic RPC. This is a consistency and potential duplication risk.
- `supabase/migrations/20261016131655_time_clock_attendance_pto_routing.sql`: attendance tiers: early (>=15 min early) +10, on time +5, late (1-15 min) -5, very late (>15 min) -10. Once-per-day attendance log, offline correction delta, PTO checks, protected attendance ledger. Values are hard-coded in the function.

## Inventory to complete before implementing
Search source and schema for all writes to `points_transactions`, `points_configuration`, rewards/redemption tables, and points balance triggers; enumerate every awarding/deducting event and role eligibility. Verify proposal approval, positive/negative customer review, referrals, job notes, photos, job clock, completion, callbacks, punchlist, questions, manual adjustment, redemption and cancellation; classify each as implemented, missing, or intentionally disabled. Inspect existing Rewards UI and admin settings before modifying, preserving redemption behavior.

## Proposed architecture
1. Server-side, tenant-scoped points rule catalog with stable event key, category, title, explanation, signed point amount, eligibility, enabled state, thresholds, effective date and admin editor; seed from existing configuration with no silent balance recalculation.
2. One server-authoritative idempotent award/reversal entrypoint for all producers, using immutable source event IDs and unique transaction keys; no client direct insert/update/delete privileges. Ledger holds rule snapshot, actor, beneficiary, source, timestamp, adjustment/reversal link and reason. Do not permit self-awards.
3. Attribute department assignments to actual first completer, sales approvals to customer-owned sales rep, and reviews to explicit eligible contributor(s) per policy. Reversal uses exact prior ledger amount.
4. Rewards page tabs: Redeem Rewards (retain existing catalog and requests), Earn Points (read-only grouped applicable enabled rules and signed values), My History (ledger with explanations). Admin Points Rules and ledger review.
5. Attendance rules must respect schedules, approved PTO, exempt employees, offline sync and configurable thresholds. Avoid historical backfill unless separately approved.

## Required tests / acceptance
- Same event submitted twice, concurrently, or replayed: one award.
- Assignment individual/department first completer, reassign, reopen, recomplete; exact reversal with changed rule value.
- Discussion task completion uses same server path; reopen reversal and no duplicate points.
- Attendance boundary minutes, exempt days, PTO, offline earlier arrival correction and time zones.
- Proposal approval once, reassignment/ownership, reversals/cancellation policy.
- Reviews verified source, duplicate review suppression, attribution and fraud controls.
- Redemption atomic balance check, cancellation/refund, concurrent requests.
- Tenant isolation, role-based admin access, historical ledger reconciliation and nonnegative redemption availability.
- Rewards menu matches effective server rules; disabled rules hidden from employees, admin visible.

## Release strategy
First finish source inventory and schema reconciliation; then migration + server RPC + producer migration + UI + tests in reviewable changes. No deployment or historical points adjustment without explicit approval.

## Follow-up source inspection (2026-10-22)
- Code search is returning no indexed matches for points/rewards terms; a repository-wide producer inventory is **not yet complete**. Do not infer missing functionality from empty search results.
- Inspected `src/components/Tasks/TasksView.tsx` lines 264-320. Discussion task status is updated first; a separate points insert then occurs without checking its returned error. Therefore task completion can succeed while points fail silently. The client also creates a points notification independently; if points fail, the notification may still claim points were earned.
- Discussion task reopening clears `completed_by` and `completed_at` but contains **no corresponding points reversal** in this handler. Subsequent recompletion can insert additional awards.
- Discussion task point fallback uses `post.points || config.task_completion_points || 10`; an explicit zero is overridden. Replace with nullish fallback when migrating to server-owned rules.
- Regular task completion/reopening calls `complete_task_atomic`/`reopen_task_atomic`; discussion tasks do not. Move discussion completion, award, reversal, and notification into one server transaction.
- For regular task reopening, the migration uses current `task.points` for the reversal; ensure the reversal amount comes from the actual original award ledger row if rule/task values can change.
- No runtime implementation changes have been made by this documentation-only PR.
