# MyJobView iOS V7 — TestFlight release validation

Status: **NOT RELEASE-APPROVED** until every required gate is signed off.

## Build and distribution

1. From `mobile/`, install dependencies from the committed lockfile, then run `npx tsc --noEmit` and the native time-clock test checks in CI.
2. Confirm EAS production environment variables (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`) target the intended production project. Never print keys in logs.
3. Confirm Apple bundle ID `com.myjobview.app`, EAS project ID, Apple Team and App Store Connect app ID match the intended listing.
4. From `mobile/`, run `eas build --platform ios --profile production`; record build URL, Git SHA, version and build number.
5. Submit the completed build with `eas submit --platform ios --profile production --latest` only after it is confirmed to be the correct build. Wait for App Store Connect processing, then assign to internal TestFlight testers. **Do not release publicly.**

## Device test matrix — actual iPhone, not simulator

Use separate test employees configured as (A) hourly + Daily Clock, (B) Job Time-only, and (C) manager. Avoid real payroll data.

| ID | Scenario | Required observation |
| --- | --- | --- |
| AUTH-1 | Sign in/out, relaunch, session restoration | Correct tenant, no stale identity, sign-out stops GPS |
| AUTH-2 | Forgot password, open newest recovery email, set password, sign in | Neutral recovery URL works and is allowlisted; no other tenant exposed |
| CLOCK-1 | Hourly employee clock in, background app, reopen | Live elapsed time persists, correct server record |
| CLOCK-2 | Start Job Time, then try Shop/Training | Second activity refused; original stays active |
| CLOCK-3 | Start Shop/Training, then try Job Time | Second activity refused; no overlapping entry |
| CLOCK-4 | Attempt Daily Clock-out with active Job/Shop/Training | Blocked, clear explanation, original timer remains active |
| CLOCK-5 | Stop activity, then Daily Clock-out | Confirmation required; only one completed shift |
| CLOCK-6 | Start break, attempt Daily Clock-out | Blocked until break ended |
| CLOCK-7 | Job Time-only employee starts Shop/Training and views Time History | Works without Daily Clock; correct activity labels |
| CLOCK-8 | Two devices attempt overlapping activities simultaneously | At most one open activity in database |
| GPS-1 | Foreground location permission + clock in | Location and accuracy metadata recorded |
| GPS-2 | Background permission, lock screen, walk/drive a safe route | Breadcrumbs continue while clocked in |
| GPS-3 | Deny/revoke background permission | Clear status, no misleading claim tracking is active |
| GPS-4 | Clock out and sign out | OS background tracking stops, no later breadcrumbs |
| OFFLINE-1 | Clock in online, switch airplane mode, record offline punch | Pending-sync state shown; no false server confirmation |
| OFFLINE-2 | Restore network and sync | Exactly one reconciled punch, correct times/GPS |
| OFFLINE-3 | Offline clock-out with unverified activity | Marked pending review, never silently accepted as final payroll |
| UI-1 | iPhone light/dark, small/large font | Official logo visible, buttons accessible, no clipping |
| UI-2 | Force close/reopen while active | Timer and server status restored, easy to stop |

## Required release sign-off

- [ ] Latest main SHA recorded and all required CI green
- [ ] Production EAS configuration reviewed
- [ ] Supabase Auth redirect allowlist includes `https://myjobview.com/?account_setup=reset`
- [ ] Password recovery tested end to end with a test employee
- [ ] iPhone device matrix passed, evidence attached for failures/retests
- [ ] No duplicate/open timer or GPS stop defects
- [ ] Correct icon, splash, login and MyJobView tenant branding
- [ ] Internal TestFlight build processed and installed successfully
- [ ] Product owner approves broader tester rollout

## Stop conditions

Stop rollout if password recovery redirects to the wrong host, overlapping employee time can be created, hourly Daily Clock-out bypasses active activity/break guards, GPS persists after sign-out, offline sync duplicates payroll records, or login points at the wrong Supabase project.

## Recovery

Do not overwrite production payroll records to test. If a TestFlight build fails, halt tester rollout and issue a new build after fixes. Keep the last known-good build available to internal testers.
