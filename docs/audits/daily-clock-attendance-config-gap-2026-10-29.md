# Attendance configuration gap — PR #354

## Confirmed in source
- `src/components/Admin/PointsAndRewards.tsx` currently loads and edits `points_configuration` for tasks, questions, contacts, connections, leads and manual time-entry loss; `company_settings.photo_upload_points` is separate.
- There are **no attendance early/on-time/late/very-late controls** in the existing Points Configuration form.
- The existing October 22 rewards audit documents daily attendance values early +10, on-time +5, late -5, very late -10 and existing schedule/PTO/holiday/offline-correction behavior.
- `src/components/Shared/AttendanceBadge.tsx` reads persisted attendance snapshots from `clock_in_rewards_log`; those are the source for confirmation points.
- Existing employee menu comes from server `get_reward_points_menu`; configuration and menu must agree.

## Required implementation before merge
1. Locate the installed daily attendance awarding function(s), relevant migrations, company-scoped settings and scheduled policy; confirm exact grace thresholds and exemptions. Do not assume all attendance awards use `points_configuration`.
2. Add company-scoped, admin-only attendance points and thresholds in the **existing** Points Configuration screen, with explicit default values preserving current behavior. Negative penalty values must be validated and displayed clearly.
3. Update the **server-side** attendance producer to read that same configuration at event time. Persist awarded snapshot; do not retroactively re-score historical records when an admin changes settings.
4. Make settings changes auditable; ensure RLS and RPC authorization prevent cross-tenant writes.
5. Ensure `get_reward_points_menu` describes the actual configured values.
6. Verify no duplicate awards across offline retries, corrections or repeated clock actions.
7. Run actual database, browser, native, employee-time and rewards tests. Reconcile PRs #352/#353 before release.

## Release status
Implementation is incomplete. Do not merge this branch until server-side configuration and tests are complete. No production database verification has been performed.
