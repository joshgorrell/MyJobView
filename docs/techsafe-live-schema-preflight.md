# Live MJV Techsafe deployment preflight — 2026-11-03

## Confirmed read-only observations
Connected MJV Supabase project `bqtsuzvuvqvgidipbsis`:
- `public.apply_change_order(uuid)` exists, SECURITY DEFINER, and has **no** Techsafe observer markers.
- `techsafe_source.application_observations` and `techsafe_source.application_observer_controls` are absent.
- Supabase migration history has **1,895 entries**, ending at `20261029202752` (`business_card_personal_banner_live_sync`); **zero** migrations have a Techsafe name.
- Existing development branches (including the default branch's migration status) report `MIGRATIONS_FAILED`. Do not interpret a branch as a clean clone.

## Deployment decision
**HOLD.** GitHub migrations dated October 30 and later have not been applied to this live MJV project. A fresh Supabase development branch that replays the broken historical migration chain is not a reliable verification environment. Do not replay, repair, or overwrite production migration history as a workaround.

## Safe next steps
1. Export a reviewed **schema-only** baseline from the live project into an isolated disposable environment; no customer data or credentials.
2. Reconcile repository migrations since the last applied live version, including non-Techsafe dependencies. Generate a reviewed forward-only deployment set rather than blindly applying the entire repository history.
3. Run `tests/techsafe/sql/live-schema-preflight.sql` read-only on the intended environment, preserve its function-definition digest and compare the exact current function body/privileges with the observer migration's guarded assumptions.
4. Validate migration replay, existing business-function parity, Auth/RLS, two-session concurrency, cancellation, lock order, rollback and performance against the isolated baseline. Never seed an enabled observer control.
5. Only after reviewed results and deployment approval, stage the private integration tables and guarded observer with controls OFF. Separately approve a monitored pilot and rollback plan. No checkout, receiver sync or activation.

This PR adds a diagnostic query and documents actual deployment state. It does not deploy database migrations, alter live data, or certify readiness.
