# Tech Stats permission remediation

## Current failure

`src/components/Production/TechStats.tsx` renders `TechProductionStats`, which calls `loadProduction` in `src/lib/techProductionData.ts`. Administrators receive the `get_tech_production` RPC. Non-administrators are instead routed through a native-only fallback, so authorized managers do not see the same historical production/utilization data.

`supabase/migrations/20261023114939_tech_production_report.sql` restricts the RPC to `can_manage_labor(org)` administrators. Merely changing the client-side role check will not grant permission, and removing the RPC check without a replacement would be unsafe.

## Required implementation

1. Implement a server-side **effective `tech_stats` permission** check for the signed-in user in their own organization, honoring active module configuration, role access, user grants, and explicit user revocations. Retain the organization-admin allowance only where consistent with the existing permissions model. Reject missing identity or organization.
2. Apply that permission to `get_tech_production` only. Do not loosen `get_labor_dashboard`, import administration, payroll configuration writes, or other labor-management RPCs.
3. Preserve the explicit field projection of the production RPC. Never return pay rates, compensation amounts, raw import payloads, project financials, or import credentials. Retain only scheduling/work-hour inputs needed for production and utilization calculations.
4. Update `loadProduction` to call the same authorized production RPC for Tech Stats viewers, including permitted service managers. Remove the role-based native-only split once the RPC gate is verified. Keep viewer/organization-scoped cache and sign-out invalidation.
5. Add regression coverage for an allowed service manager, denied unpermitted user, explicit permission revoke, cross-organization isolation, no compensation fields, and administrator parity. Verify frontend and database tests before merging.

## Release criteria

- Bobbi can open Tech Stats and see production, utilization, rankings, and technician drilldown consistent with the administrator's report for the same organization and date range.
- Bobbi cannot access payroll administration or sensitive compensation fields through the report.
- No changes to Tech Stats navigation/menu visibility.
- No production deployment or merge before authorization and regression tests pass.

The prior draft PR #272 targets an older component and must not be merged as-is.
