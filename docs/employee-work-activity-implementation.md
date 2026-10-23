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

## 60-minute MJV inactivity logout
- Inactivity means no trusted pointer, keyboard, touch, or wheel interaction **within MyJobView**. Work in other tabs does not count.
- Warn at 55 minutes with a centered countdown; any qualifying interaction dismisses the warning and resets the full 60-minute clock. At 60 minutes, sign out. Returning to a sleeping/background tab checks elapsed time immediately.
- A reload counts as activity only when the previous idle window has not already expired. Browsers cannot reliably distinguish manual from automatic reloads.
- This browser behavior is **not** a complete server-side security boundary. Verify session/JWT revocation and protected API authorization before claiming hard enforcement.
- Retire the existing Central-time midnight logout only in a coordinated deployment, after the replacement is verified. The existing production cron and schedule are currently active; do not disable early.
- Distinguish work-activity evidence from login/session coverage and payroll time.

## Acceptance tests
1. Browser visible but untouched does not accrue activity.
2. Background tab, duplicate browsers and interrupted network do not inflate activity.
3. Week crossing DST and midnight splits correctly in America/Chicago.
4. Named IP Coffee Shop is labeled Remote without being treated as proof of presence.
5. Unknown IP remains Unknown, not automatically Remote.
6. Logged hours outside MJV remain separate and attributed.
7. Cross-tenant and unauthorized report access denied.
8. At 55 minutes of MJV inactivity the warning appears; any MJV interaction extends the session, but unrelated tabs do not. At 60 minutes, browser and protected server access require a fresh login; reload cannot revive an expired session.
9. Existing User Sessions views, mobile layouts, and session-history retention remain functional.

## Current code audit
- src/contexts/AuthContext.tsx sends a 5-minute heartbeat when the document is visible, without interaction checks.
- src/components/Admin/UserSessionsDashboard.tsx exposes People / Devices / Session history.
- src/components/Admin/UserSessionsViewerEnhanced.tsx includes IP nicknames, scheduled logout UI and manual force logout.
- supabase/functions/session-location/index.ts resolves IP-based approximate location.
- Existing session analytics explicitly are not payroll time.

## Implementation order
1. Verify live midnight logout and plan its retirement, including hardening server-side session authorization.
2. Add accurate activity intervals and secure data model.
3. Build the report and location classification using existing UI.
4. Add automated database/runtime/browser tests and review migration safety.
5. Merge only after tests, server-side enforcement, and a safe coordinated production cutover are verified.
