# Office visibility consolidation — rollout contract

## Verified production baseline (2026-11-17)
- `user_offices` already stores employee-to-office memberships. Do not add another membership table.
- Jon Nester is assigned to Manhattan; Justin Wright has no `user_offices` row. Both have NULL `primary_office_id`.
- Jon's manager role has no `tech_stats` module grant and no individual grant.
- The live `get_tech_production` SECURITY DEFINER RPC currently returns organization-wide roster, payroll configs, external mappings and snapshot records, and native jobs/payroll to authorized viewers.
- The live `user_can_view_record` bypasses visibility settings for admin, manager and project_manager.
- `proposal_visibility_scope` and `user_visibility_settings.visibility_scope` overlap. Existing proposal RLS has separate semantics; do not remove either without an effective-policy audit.

## Access model
1. **Membership:** `user_offices` indicates where the employee belongs. A primary office is a separate optional scheduling/default attribute.
2. **Visibility:** use one explicit admin-controlled selection of allowed offices (plus an explicit all-offices state), backed by the existing office IDs. Do not treat an empty membership list as all-offices permission.
3. **Capability:** role/module permission is required independently of visibility. Granting Tech Stats must never broaden office visibility.
4. **Administrators:** explicit organization-wide visibility. Managers and project managers must not automatically bypass visibility.
5. **Legacy/unassigned records:** no implicit unrestricted access for restricted users. Audit and backfill missing office assignments before enforcement.
6. **Cross-office projects:** define an explicit office association rule and test it before applying to projects, invoices, proposals, or customers.

## Safe implementation sequence
- [x] Audit existing user-editor controls and production authorization functions.
- [x] Correct misleading Office Assignments copy (membership is not permission).
- [ ] Confirm all active employees' office memberships and identify unassigned historical records.
- [ ] Introduce an admin-managed visibility scope using existing `user_visibility_settings` and office IDs, with a backward-compatible migration and explicit no-office state.
- [ ] Remove self-service update/insert policies on visibility settings; verify only authorized administrators can change another user's visibility.
- [ ] Add server-side Tech Stats scoping **before** granting Jon access. Filter roster, configs, mappings, external snapshots (both technician and payroll records), native jobs, and native payroll. Filter snapshots by mapped technician ID, not by UI labels. Preserve org boundaries and date validation.
- [ ] Add regression tests: Manhattan-only, multi-office, all-offices, no offices, missing mapping, mixed-office snapshot, manager bypass, unauthorized caller, permission revoke, and cross-organization.
- [ ] Backfill Justin's Manhattan membership only after verification, and grant Jon Tech Stats only after server-side tests pass.
- [ ] Reconcile proposal and general visibility policies in a separate, regression-tested rollout; do not rewrite production-wide RLS in the Tech Stats PR.

## Release gate
Do not merge or deploy an office-scoped Tech Stats feature until the full RPC payload is proven office-safe. Do not change production account permissions in this preliminary PR.
