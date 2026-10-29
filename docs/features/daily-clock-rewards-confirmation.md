# Daily Clock Confirmation & Rewards — implementation contract

Status: approved design; implementation in progress. Branch: feature/daily-clock-rewards-confirmation.

## Non-negotiable behavior
- Apply to eligible **daily** clock-in/out only, not job/shop/training clocks. Respect hourly vs job-time payroll eligibility.
- On verified success show a polished, nonblocking 2–3 second animated flash ("YOU'RE IN!" or "YOU'RE OFF!") with no dismissal control; accessible live announcement and reduced-motion support; mobile, tablet and desktop layouts; dark/light themes.
- Use the authoritative attendance snapshot from `clock_in_rewards_log` (`daily_clock_entry_id`, `event_type`, `points_awarded`, `minutes_delta`, `scheduled_time`, `actual_time`). Never calculate points client-side or assume a fixed +5 at clock-out.
- If the reward is not yet available, show successful clock status without an invented points value. Optionally update while flash is visible; never block the punch awaiting rewards.
- Offline queued action is **pending sync**, not server-confirmed success; do not claim points until reconciled. Failed/conflicted punches need persistent, actionable error states.
- Preserve GPS evidence, active-job/break clock-out gates, clock-out verification, payroll calculations and idempotent offline reconciliation.
- Read company-specific attendance values/thresholds from existing settings; preserve existing values until changed by an authorized admin. Do not create a parallel rewards balance or ledger.
- Rewards catalog, redemption and balances stay under existing Points & Rewards. Confirm missing attendance settings controls before adding any. All changes must be tenant-scoped and auditable.
- No additional completion/clock-out award without a separately approved configured earning rule.

## Integration points
- Web: `src/components/Layout/TimeClockModal.tsx`, `src/components/Shared/ClockOutModal.tsx`, `src/components/Shared/AttendanceBadge.tsx`.
- Native: `mobile/src/screens/TimeClockScreen.tsx` and dashboard clock controls.
- Rewards: `src/components/Admin/PointsAndRewards.tsx`, `src/components/Rewards/RewardsDashboard.tsx`; existing reward RPCs and attendance ledger.
- Reconcile open PRs #352 and #353 before touching their clock paths.

## Acceptance gates
1. Online clock-in/out: one flash per confirmed event, correct labels and no manual dismissal.
2. Early/on-time/late/very-late and approved exceptions: display exactly persisted award or no award.
3. No duplicate awards after retries, repeat renders, double-taps, device switches, offline replay or corrections.
4. Offline queued/failed/conflict states never claim server-confirmed points.
5. Admin config changes reflected in subsequent authoritative awards, not retroactively reclassified.
6. Mobile iPhone/iPad/web responsive and accessibility tests.
7. Regression: GPS, breaks, job timer gates, payroll type, clock-out verification, redemption, balances.
8. Run typecheck, build, employee-time and rewards test suites; verify latest main and CI before merge.
