# Employee Work Activity — implementation contract

## Goal
In Admin > User Sessions, add a simple Work Activity tab: employee selector, week/date range, daily office/remote/unknown totals, and expandable start/end intervals. Keep existing People, Devices, History and advanced features intact.

## Evidence and definitions
- **Observed MJV activity**: interaction-backed foreground activity only, not an open browser, login duration, or payroll time. Capture interaction signals (pointer/keyboard/touch) with a bounded idle timeout, explicit foreground/background transitions, and server timestamps. Do not record keystrokes or content.
- **Documented hours**: separately show Daily Clock entries and employee-confirmed non-MJV work, with source and audit history. Never imply lack of MJV activity proves no work.
- De-duplicate overlapping browsers per employee; split intervals at company-local midnight; handle DST and partial sessions. Preserve unknown and missing data.
- Report access must be limited to authorized managers/admins, organization-scoped on the server.

## Location
- Reuse existing IP nicknames; allow friendly labels such as Coffee Shop and independent Office / Remote / Unknown classification.
- Only classify office when a trusted known office IP is configured; otherwise Unknown. Never infer physical presence from city alone. Changing labels should not erase original IP history.
- IPs are shared/dynamic and do not prove physical location. Device information is optional secondary metadata.

## Daily logout
- Use primary office IANA timezone (Electronic Life: America/Chicago), not UTC or the employee's timezone. Honor daylight saving changes.
- Reuse session_logout_schedule and force-logout-all-users infrastructure. Verify scheduled execution and actual auth revocation/deny access after midnight across all devices, including background tabs and refresh tokens.
- Warn of unsaved work before logout where feasible. Record job execution, failures and audit trail.
- Do not enable production logout until authentication enforcement and job reliability are proven.

## Acceptance tests
1. Browser visible but untouched does not accrue activity.
2. Background tab, duplicate browsers and interrupted network do not inflate activity.
3. Week crossing DST and midnight splits correctly in America/Chicago.
4. Named IP Coffee Shop is labeled Remote without being treated as proof of presence.
5. Unknown IP remains Unknown, not automatically Remote.
6. Logged hours outside MJV remain separate and attributed.
7. Cross-tenant and unauthorized report access denied.
8. At midnight Central, every authenticated session is actually blocked and requires fresh login; no silent refresh.
9. Existing User Sessions views, mobile layouts, and session-history retention remain functional.

## Current code audit
- src/contexts/AuthContext.tsx sends a 5-minute heartbeat when the document is visible, without interaction checks.
- src/components/Admin/UserSessionsDashboard.tsx exposes People / Devices / Session history.
- src/components/Admin/UserSessionsViewerEnhanced.tsx includes IP nicknames, scheduled logout UI and manual force logout.
- supabase/functions/session-location/index.ts resolves IP-based approximate location.
- Existing session analytics explicitly are not payroll time.

## Implementation order
1. Verify scheduled logout RPC/function and live configuration; harden authentication cutoff.
2. Add accurate activity intervals and secure data model.
3. Build the report and location classification using existing UI.
4. Add automated database/runtime/browser tests and review migration safety.
5. Merge only after tests and deployment checks pass.
