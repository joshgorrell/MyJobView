# MJV 60-minute inactivity logout: production cutover

**Status: gated. Do not disable the existing midnight job until the replacement is deployed and verified.**

## Current production evidence (2026-10-23)
- pg_cron job `scheduled-user-logout` (jobid 8) runs `SELECT execute_scheduled_logout();` every minute.
- `session_logout_schedule.enabled=true`, timezone `America/Chicago`, logout time `00:00`; last execution 2026-10-23 05:00 UTC.
- This is a **database** cron job that deletes `auth.sessions` and `auth.refresh_tokens`, not a call to the Edge Function `force-logout-all-users`.
- Do **not** disable it ahead of replacement validation or confuse it with the unrelated Edge Function.

## Additional security changes staged in this PR (not deployed)
- Customer portal accounts without a staff profile now install the idle guard; the session analytics RPC can fail without disabling it.
- The legacy daily logout configuration is read-only in the admin UI. The session-write migration also removes browser/API INSERT/UPDATE/DELETE rights to `session_logout_schedule`; production retirement still requires a coordinated SQL change after app verification.
- IP nickname Office/Remote/Unknown classifications may only be created, edited or deleted by organization admins. Same-organization read access remains.
- Production's existing Supabase preview branches were observed in `MIGRATIONS_FAILED` status on 2026-10-23. None has been established as a clean staging target for this PR. Do not apply the new migrations directly to production as a substitute for staging tests.
- GitHub CI verifies code/build and static contracts but cannot prove the deployment ordering or JWT authorization boundary.

## Required verification before merge
1. Bring the PR up to date with `main` and resolve all conflicts. Run the session, security, typecheck, build, browser, responsive, and tenant-isolation suites against the final merge candidate.
2. Apply the IP-classification and session-write migrations in a **staging** database with production-like policies. Verify unauthorized session updates, cross-user end-session calls, and cross-organization reads are rejected; verify authorized admin reports and user session close still work.
3. Deploy the revised `session-location` Edge Function **before** revoking browser `user_sessions` UPDATE permissions. Validate that the function updates only the authenticated user's session.
4. Test visible, hidden, sleeping, reloaded, and multi-tab MJV sessions at 54/55/59/60 minutes; verify the countdown, `Stay Signed In`, `Log Out Now`, and no resurrection of expired sessions.
5. Decide and verify a **server-side** policy for access tokens. Browser `supabase.auth.signOut()` revokes refresh tokens, but previously issued JWT access tokens may remain usable until expiry. The frontend timer alone is **not** a hard 60-minute API authorization boundary.
6. Deploy the replacement app and validate a real production login and logout. Retire the old schedule only after the replacement is healthy, and remove/disable the old schedule configuration UI so it cannot be inadvertently reenabled.

## Controlled retirement (production; execute only after steps above)
Within a controlled deployment window, with database change approval:

```sql
BEGIN;
UPDATE public.session_logout_schedule
SET enabled = false, updated_at = now()
WHERE enabled = true;
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'scheduled-user-logout';
COMMIT;
```

Verify immediately:

```sql
SELECT jobid, jobname, active FROM cron.job
WHERE jobname = 'scheduled-user-logout'; -- expected: no rows
SELECT enabled, logout_time, timezone, last_run_at
FROM public.session_logout_schedule; -- expected: enabled=false
```

Keep `execute_scheduled_logout()` unavailable to normal users. Do not delete the audit history. Any rollback/re-enablement requires a new explicit deployment decision; do not silently recreate a midnight global sign-out.

## Known report limitation
`UserSessionsDashboard` currently reports session-window coverage, **not** verified work time or exact foreground interaction intervals. A reopened tab and five-minute heartbeat are not sufficient evidence for payroll or presence. Office/remote classification is a manually maintained network label, not proof of employee physical location.
