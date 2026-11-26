# Sessions reporting audit — issue #1176

Date: 2026-11-21. Read-only observations from live MJV Supabase project.

## Confirmed findings
- `public.user_sessions`: 15,856 rows.
- IP present: 8,182; geographic state present: 260; device signature: 214; auth session linkage: 36; current page: 247.
- 102 application sessions marked active, of which 96 have last activity older than 24 hours.
- 0 flagged application sessions; this does not prove absence of suspicious activity.
- `public.session_cleanup_log`: 142 runs, last recorded 2026-10-25, no recorded failures.
- No current `cron.job` entry with a command containing 'session'. Other schedulers must be inspected before concluding no cleanup runs.
- `auth.audit_log_entries`: 0 rows; verify Supabase platform auth logs independently.
- Out-of-state IP geolocation on one account may reflect cloud-browser, VPN, carrier routing, or actual remote access; do not classify as unauthorized based solely on state.

## Required implementation verification
1. Locate application session create/heartbeat/close flows and admin Sessions UI; determine how sessions are created and why multiple records may be created per browser.
2. Find the deployed cleanup mechanism (cron, edge scheduled functions, GitHub Actions, external scheduler), then add a reliable schedule with idempotent stale-session closure.
3. Ensure stale-session closure sets `is_active=false` and `session_end` without deleting historical rows; never equate application heartbeat with authenticated token validity.
4. Record login events server-side with trusted IP/UA headers and session identifiers; do not log tokens, passwords, or secrets.
5. Ensure tenant isolation, admin-only session visibility, and RLS protections; verify reporting views do not leak across organizations.
6. Preserve unknown geolocation explicitly; never backfill a guessed state or automatically block cloud browsers.
7. Add tests for idle/active transitions, concurrent devices, auth session linking, missing metadata, and tenant separation.

## Acceptance criteria
- A newly authenticated session is linked to its auth session and captures supported metadata.
- Inactive application sessions stop appearing as active after the configured timeout; historical rows remain queryable.
- The scheduler shows recent successful executions and exposes failure diagnostics.
- Admin Sessions displays reliable timestamps, unknown-location labels, and user/device filters.
- No change to employee login steps, and no automatic revocations during rollout.

This file is a diagnostic record, **not** an implementation or claim of a production fix.
