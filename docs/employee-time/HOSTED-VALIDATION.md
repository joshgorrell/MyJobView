# Hosted employee-time validation (2026-10-02)

## Environment and scope

Created the approved temporary Supabase branch `pr-77-schema-validation` (project `rtpzjjkhmnjsbiltwtyo`). Automatic historical replay still failed on the previously identified escaped SQL. Using SQL directly on the isolated branch, restored current application schema definitions from read-only production catalog snapshots, with no application data. No production writes or deployment occurred.

The original GitHub reconstruction was not applied unchanged. Corrections preserved all 13 generated columns, the Flow identity column, three additional non-identity sequences, the seven jobs-schema tables, custom function schemas, non-extension functions, view security_invoker options, actual constraints/indexes/triggers/policies, explicit object/column/schema/function ACLs, and matching default privileges. Platform-managed auth/storage objects remain supplied by Supabase. Cron jobs, files, secrets, live users and customer records were not copied.

All 13 restored view definitions/options matched production. Function hashes differed only for the five functions intentionally replaced by the prerequisite/time-authority migrations. A user-setup review table appeared in production after the initial snapshot; the checked-in `20261001201849_user_setup_reviews.sql` was applied to staging to align that unrelated addition. This is a tested catalog reconstruction, not a claim of a complete pg_dump or repaired historical replay.

Applied `20261002013350_fix_employee_config_nullable_record_checks.sql`, then `20261002110037_enforce_employee_time_authority.sql`, transactionally in staging. Both succeeded against restored full application tables and existing rules.

## Executed scenarios

`tests/employee-time/hosted-scenarios.sql` uses synthetic tenants, users, employees, configuration, a project and Work Order. It switches to the authenticated database role with synthetic JWT subject claims to exercise real RLS and triggers. It does not test browser authentication or HTTP/PostgREST.

Passed:
- Job Time Daily Clock rejection with the expected authority error.
- Assigned Work Order start, retry returning the same entry, project inheritance and job stop.
- Saving start/stop GPS coordinate/method fields on job time and coordinate fields on Daily Clock.
- Direct unapproved non-WO time rejection with the expected authority error.
- Foreign-tenant and inactive-manager review rejection with the expected permission error.
- Atomic manual approval and idempotent repeat review.
- Configured Daily Clock start/stop with existing duration/status rules.
- Existing travel trigger creates one request without a Daily Clock; retries/stops do not duplicate it.
- Delayed Daily Clock coordinates create one home notification per action; repeated coordinates do not duplicate alerts.
- Internal approval schedules work without manufacturing payable hours; completion/retry creates one submitted entry; pay approval remains separate.
- Locked payroll period rejects manual review and retains a pending request with no entry.

The SQL transaction rolls all synthetic application/auth records back. Follow-up counts for profiles, time entries, Daily Clock entries and manual requests were zero.

## Advisors and remaining checks

Compared security advisors with production. The only additional findings were authenticated SECURITY DEFINER execution on `start_work_order_time`, `review_manual_job_time_request`, and `review_internal_time`. These are intentional client RPC endpoints with explicit authentication, tenant, active-role/assignment and ownership checks, and PUBLIC/anon revocations; rejection scenarios ran against the hosted database. Existing baseline advisor findings remain outside this change.

Advisor reference: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

Keep PR 77 draft pending signed-in desktop/iPhone UI, actual HTTP/API integration, real-device GPS accuracy/permission behavior, and coordination with PR 61's canonical completion changes. These backend checks do not certify those client/device behaviors. Updated notification email Edge Function remains undeployed. The branch dashboard may continue reporting historical MIGRATIONS_FAILED despite successful manual schema restoration; do not use branch merge/rebase/reset as the release mechanism.

The temporary branch can be deleted once no longer needed; it uses the approved hourly rate while active.
