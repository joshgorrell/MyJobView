# Dispatch Office Visibility — staged security proposal

This SQL is **review-only**, not an automatically applied migration. It must be promoted through the repository's migration workflow only after a transactional/staging test and approval of the unset-visibility behavior.

## Confirmed live findings
- GPS and enhanced GPS SELECT policies currently permit same-organization access regardless of Office Visibility.
- Existing `get_tech_production` already filters the report for non-admin users with explicit `own_only`, `office_only`, and `selected_offices` scopes.
- The majority of active profiles have **no** `user_visibility_settings` row. Existing Tech Stats treats that as unrestricted. This proposal intentionally preserves that behavior to avoid silently breaking users; it **does not** make all unset users office-restricted.
- GPS INSERT policies are left untouched to preserve mobile and technician time clock capture.
- Do not change `daily_clock_entries` or `time_entries` RLS until dependent payroll, Production, and mobile flows have been tested.

## Required validation before deployment
1. Run SQL in a disposable database or rollback-only transaction.
2. Test viewer/employee pairs with same org and different org, own record, selected office, unselected office, office-only, own-only, admin, and no visibility setting.
3. Verify direct authenticated REST SELECT on both GPS tables and history selector RPC, not only frontend filtering.
4. Verify inserts still work for technicians; ensure no alternate permissive SELECT policies bypass these policies.
5. Review default visibility for all active staff and explicitly configure intended office restrictions before declaring office isolation complete.
6. After deploying the database migration, switch `TechMap` history selector to `get_visible_dispatch_technicians`; deploy atomically to avoid a missing-RPC failure.
7. Separately audit Live Map's daily-clock queries, technician heartbeat access, Overview and Tech Stats drilldowns.

**Do not merge or deploy as a completed security fix:** this is the first server-side GPS access-control proposal, not a full Dispatch authorization rollout.
