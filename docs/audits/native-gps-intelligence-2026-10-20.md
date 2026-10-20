# Native GPS Intelligence: audit and implementation plan (2026-10-20)

## Architectural decision
The native app is the only continuous breadcrumb collector. Web clocks capture GPS at explicit punch actions only. Managers consume server-side location and route history through the web dashboard.

## Verified source-level findings
- `mobile/src/screens/TimeClockScreen.tsx` starts native tracking after successful daily clock-in and stops after daily clock-out. Both calls are fire-and-forget; the UI can report success even if tracking fails.
- `mobile/src/services/LocationTrackingService.ts` stores technician and shift IDs only in instance fields. Background task callbacks drop updates when these fields are empty, including after process re-creation. Task registration is inside an instance method, not guaranteed at module evaluation.
- `mobile/src/services/OfflineStorage.ts` supports queued breadcrumbs and clock GPS, but pending breadcrumb sync is not scoped to the authenticated user; inspect tenant ownership and RLS before production use.
- `mobile/App.tsx` invokes `initializeLocationTracking()` during app startup despite GPS tests asserting it should not; this may request location permissions before the user starts a shift.
- `mobile/src/services/ClockEventGps.ts` persists daily clock GPS; native job-clock GPS coverage requires separate inspection.
- `src/lib/gpsTracking.ts` intentionally disables web continuous GPS.
- `mobile/package.json` declares Expo SDK 50 and React Native 0.73.6; reconcile with ongoing TestFlight modernization before making native changes.
- Source-level review only: no simulator, physical device, live database, or CI validation performed.

## Phase 1 — Native tracking reliability (highest priority)
1. Register background task at module scope in a module loaded at app startup.
2. Persist active tracking session securely and atomically, including authenticated user, organization, daily clock entry, start time, and state. Resolve session in background handler without relying on component or singleton memory.
3. Verify session ownership before writes. Include organization ownership in server-side authorization and RLS; never trust client-provided organization IDs alone.
4. Restore and reconcile tracking after process restart, app relaunch, logout, session expiry, clock-out on another device, and permission changes.
5. Track only during authorized working periods, clearly disclose tracking, and provide visible tracking status; fail closed after clock-out.
6. Make start/stop outcomes observable, retryable, and actionable in the UI. Do not represent successful clock-in as proof of successful GPS tracking.
7. Make breadcrumb upload idempotent; avoid random timestamp IDs as the sole deduplication strategy. Scope offline sync to authenticated owner.
8. Test background process re-creation, no network, low battery, denied/revoked permission, force quit, and multi-account handoff on real iOS/Android devices.

## Phase 2 — Clock-event evidence and classification
- Preserve actual punch coordinates, GPS accuracy, attempt/capture timestamps and failure evidence for daily and job in/out.
- Classify by geofences for office, assigned job and opt-in known home location; distinguish unknown and ambiguous. Protect home addresses with strict access rules.
- Ensure native job-clock paths use the same durable evidence flow as daily punches.

## Phase 3 — Manager maps
- Show current location with last-seen timestamp and accuracy; never label stale location as live.
- Show clock punches, daily breadcrumb trail, job associations and route replay; manager access must be scoped to their organization and authorization.
- Add configurable retention and access auditing.

## Phase 4 — Route intelligence
- Snapshot expected route and ETA at dispatch/departure, accounting for traffic when available.
- Map-match GPS trail; detect dwell stops, travel delays and deviations, with low-confidence and missing-data indicators.
- Categorize stops as job-related, approved, personal or unknown only with evidence or manager input.
- Compare expected vs actual travel and present reviewable exceptions, not automatic claims of time theft or wage deductions.

## Acceptance criteria
- A daily clock-in on a physical device starts a durable tracking session and produces breadcrumbs while backgrounded.
- Background task can write valid points after OS process re-creation without relying on in-memory IDs.
- All four punch types retain event-specific GPS evidence or an explicit capture failure.
- Clock-out and logout stop future collection; restart does not resume an ended shift.
- Offline points sync exactly once to the correct authenticated employee and organization.
- Manager can view a clearly timestamped current location and replay actual route beside an expected route.
- No GPS feature changes are merged until automated tests, RLS tests, and real-device scenarios pass.

## Web employee clock retirement — approved direction, gated rollout
Decision: employee daily clock, job clock and break punches should ultimately be native-app-only; retain web timesheets, corrections, approvals, payroll/job-cost reporting and manager GPS maps. This is a policy and implementation plan, NOT an immediate disablement.

### Initial entry-point inventory
- `src/components/Technician/DailyClock.tsx`: web daily clock flow.
- `src/components/Layout/TimeClockModal.tsx`: web clock modal.
- `src/components/Production/WorkOrderTimeControl.tsx`: job time controls.
- `src/components/Production/TechnicianWorkCenter.tsx`: technician work center; inspect indirect punch actions.
- `src/components/Shared/ClockOutModal.tsx`: web clock-out flow.
- Search additional pages, keyboard actions, APIs, RPCs and mobile browser views before disabling any entry point.

### Rollout gates
1. Inventory every web employee punch path and the corresponding Supabase mutation; classify manager corrections separately from employee punches.
2. Verify native daily in/out, job in/out, break in/out, offline queueing and GPS evidence, including salary/hourly variations and permission denial.
3. Repair native background tracking and complete iOS TestFlight field tests.
4. Add organization-scoped setting `employee_clock_channel` (proposed values `web_and_mobile`, `mobile_only`), default existing tenants to unchanged behavior. Admin overrides and historical entries remain accessible.
5. Under `mobile_only`, hide/disable employee punch controls in all web surfaces with a clear app handoff. Enforce channel policy server-side for employee-originated mutations without blocking authorized manager edits, imports or synchronization. Server cannot reliably trust a client-provided channel flag; use an authenticated native-specific mechanism or equivalent verifiable architecture.
6. Pilot with Electronic Life only after native acceptance criteria pass; measure GPS capture success, sync lag, missed punches and support incidents. Preserve rollback switch.
7. Retire web employee punching broadly only after pilot signoff. Do not disable QuickBooks Time or iPoint integrations as part of this work.

### Additional acceptance criteria
- Every employee-facing web clock action respects the organization policy, including direct API attempts.
- Manager corrections and historical timesheets remain functional in both policy modes.
- Native-only mode never strands an employee without a documented missed-punch/manager correction procedure.
- Changing policy does not delete historical data or interfere with existing reporting and payroll integrations.
