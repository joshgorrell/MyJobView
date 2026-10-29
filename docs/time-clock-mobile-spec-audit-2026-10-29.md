# MyJobView Field Time Clock — Specification and UX Audit
Date: 2026-10-29
Status: Source-code review and database schema verification; **not** an iOS visual/device acceptance test.
Baseline: Prior approved requirements plus current native and web implementation. Original complete signed-off screen mockups/specification were not available for direct comparison.

## Intended employee experience
1. Hourly / Daily Clock employee: one authoritative Daily Clock for payroll, unpaid breaks deducted; job timers, Shop Time, and Training classify utilization without double-paying time.
2. Job Time employee: no Daily Clock; approved job, Shop Time, and Training determine payable hours. Both employee types must clock each customer job.
3. Each punch attempts GPS; failure never erases a valid punch. Offline punches preserve original timestamps and owner, synchronize safely, and surface conflicts for manager review.
4. Employees can start/end jobs, capture notes and photos, see accurate status and time history, and understand whether time is submitted, approved, pending sync, or requires review.
5. Manager changes are never silently overwritten. Never leave active job/internal timers or breaks when ending a workday. Travel and location evidence remain auditable.
6. A mobile-first experience with coherent MyJobView branding, clear large touch targets, straightforward navigation, and no contradictory statuses.

## Audit findings (evidence in current source)
| Priority | Finding | Evidence | Status |
| --- | --- | --- | --- |
| P1 | Native Dashboard labels Job Time employees "Not Clocked In" and displays Daily Clock hours, although they do not use Daily Clock. | mobile/src/screens/DashboardScreen.tsx | Fix in PR #352 |
| P1 | Completed Daily Clock shift disappears from native Time Clock after clock-out because load queries only open shifts. | mobile/src/screens/TimeClockScreen.tsx | Fix in PR #352 |
| P1 | Pending offline clock-out renders "Total Hours: 0.00" even though hours are unverified, which can mislead payroll. | mobile/src/screens/TimeClockScreen.tsx | Fix in PR #352 |
| P1 | Dashboard Sign Out bypasses the Settings screen's active-workday verification. | mobile/src/screens/DashboardScreen.tsx; mobile/src/screens/SettingsScreen.tsx | Route through guarded Settings in PR #352 |
| P2 | Offline clock-in success text says offline clock-out is unavailable, contradicting merged offline clock-out implementation. | mobile/src/screens/TimeClockScreen.tsx | Fix in PR #352 |
| P2 | Native Work Order detail shows Job Time but directs users to a web browser to start/stop time, add notes/photos, and complete work. This interrupts the native flow and requires real-device acceptance. | mobile/src/screens/WorkOrderDetailScreen.tsx | Open design/functional acceptance |
| P2 | Native Time History reads only daily_clock_entries. Job Time employees may see no time history despite recorded time_entries. | mobile/src/screens/TimeHistoryScreen.tsx | Open |
| P2 | Native Dashboard's active Daily Clock "Today" statistic is gross elapsed time, not necessarily net payable time after breaks. | mobile/src/screens/DashboardScreen.tsx | Relabel "Elapsed Today" in PR #352; net pay calculation remains server authority |
| P2 | Sync Now in Settings displays "All offline data has been synced!" without independently checking remaining pending/conflict counts. | mobile/src/screens/SettingsScreen.tsx | Open |
| P2 | GPS/clock UI uses a large clock, gradient status card and banners; no verified screenshots across iPhone sizes, dynamic text, VoiceOver, dark mode, or low connectivity. | mobile/src/screens/TimeClockScreen.tsx; mobile/src/theme | Device UX acceptance required |
| P2 | Offline clock transitions require cached policy less than 24 hours old; this policy age is an implementation restriction, not confirmed as an approved product requirement. | mobile/src/screens/TimeClockScreen.tsx; mobile/src/services/OfflineStorage.ts | Product decision required |
| P2 | Native Shop Time/Training card says "Your daily clock keeps running" even for Job Time employees who never use Daily Clock. | mobile/src/components/InternalTimeCard.tsx | Open copy issue |
| P2 | GPS, travel bonus approval, office radius and route comparison need end-to-end product validation; presence of location tracking is not proof of complete payroll travel-bonus workflow. | mobile/src/services/LocationTrackingService.ts; web time tracking modules | Device/business acceptance required |

## Positive confirmations
- Native Daily Clock uses explicit clock-in/out actions, break start/end, GPS capture, offline evidence, and a pending-sync state.
- Web customer Work Order Job Time starts/stops and attempts GPS; regression wiring was merged in PR #349.
- Shop Time and Training are distinct activity types with manager-review workflows.
- Offline Daily Clock-Out synchronization now checks activity overlap at the original punch time (PR #351).
- Database fields for job timer, break and administrative adjustment checks were verified against the connected project.

## Required acceptance matrix before TestFlight build 7
- Hourly employee: online clock-in, job start/end, break start/end, offline clock-out, reconnect, accurate net pay and job utilization.
- Job Time employee: no Daily Clock prompts or misleading status; start/end customer job and internal time, approved-only payroll, readable history.
- GPS allowed, denied, stale/cached, disabled and reconnect; location failure never loses the punch.
- Offline created shift, offline close of server shift, same event replayed twice, another-device shift conflict, overlap after punch and timer started after punch.
- Admin-edited shift, open breaks, job timer overlap, Shop/Training overlap, rejected and approved time.
- iPhone small/large screens, long names, accessibility text sizes, VoiceOver, light/dark mode, foreground/background transitions, browser return from Work Order.
- Correct labels for recorded vs payable hours, pending sync vs approved, active vs completed; no false "all synced" notification.

## Release recommendation
Do not release TestFlight build 7 solely on passing static/CI tests. Merge reviewed code fixes, close open P2 user-facing contradictions, and complete actual device and payroll reconciliation acceptance. This document is an audit, not proof that untested paths work.
