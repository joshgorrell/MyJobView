# PR 77 staging recovery

## Observed failure (2026-10-02)

The approved temporary branch `pr-77-employee-time-staging` failed automatic migration replay before employee-time migrations ran. Postgres logged SQLSTATE 42601 at a backslash in history migration `20251104191142_create_customer_pipeline`. A read-only check confirmed its stored SQL contains literal escaped newline text and no actual newlines. The branch contained zero public tables and zero applied migrations and was deleted to stop charges. Production and its migration history remain unchanged.

Do not mark hosted integration as passed based on the existing local fixture.

## Recover with a schema-only baseline

Use Supabase's standard schema export, which preserves functions, triggers, policies, constraints and grants without application rows. The current connection provides SQL queries but no database-export operation or direct database credentials. Obtain the export on a workstation with Supabase CLI and Docker.

Check the installed CLI commands with `supabase --help` and `supabase db dump --help`. In a locally linked MJV checkout, run:

```sh
supabase db dump -f mjv-staging-schema.sql
```

Confirm the linked project is `bqtsuzvuvqvgidipbsis` before export. Default dump is schema-only; do not add data-only or export employee/customer records. Keep connection passwords local. Inspect function definitions in the export for embedded secrets before sharing it.

References:
- https://supabase.com/docs/reference/cli/supabase-db-dump
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore

Before restoring, account for the target project's default grants: Supabase documents revoking default table privileges for anon/authenticated so they do not broaden the exported access rules. Review extension/schema/role prerequisites and restore in an empty, isolated database. Recreating a development branch alone will repeat the broken historical replay; do not repair production history as part of this feature.

Apply the existing nullable-record fix `20261002013350` before `20261002110037`. Repeat duplicate/open-allocation/missing-internal-approval preflights. Use synthetic users and records to verify actual RLS, all existing triggers, clock starts/stops, request reviews, payroll locks, travel and delayed GPS notifications. Run advisors and compare restored access rules with production. Signed-in desktop/iPhone and real-device GPS checks remain separate requirements.

## Coordination with PR 61

Reviewed PR 61 head `bb9f657d7e89fa0ab46b6b19ab25f110207d2c6b`. Both PRs modify `JobCompletionWizard.tsx` and `WorkOrderDetail.tsx`; package scripts also need combining.

The combined completion wizard must retain:
- PR 77's running-time preflight before signature upload or completion writes.
- PR 61's atomic `finalize_work_order_visit` RPC and required task outcomes.
- PR 77's removal of completion-time GPS capture, invalid auto-clock-out writes and tracking lifecycle calls. Completion itself is not a clock action.
- Recovery errors that keep the wizard open when completion fails.

The Work Order detail must retain PR 77's canonical timer and PR 61's Today's Work/default task view and assigned-technician internal-note visibility. Do not overwrite either file wholesale. Neither PR is merged here; PR 61 also has independent release blockers.

A combined test should start job time, verify completion rejects before writes, stop job time with one GPS capture, then finalize atomically without a second GPS capture. Verify rollback on missing task outcomes and idempotent retry.
