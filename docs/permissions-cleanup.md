# Permission catalog cleanup

The permission editor and navigation use `src/lib/permissionCatalog.ts`. Module keys are capabilities; duplicate module rows do not create independent permissions. An explicit user revoke wins across active copies, followed by an explicit grant, then the selected role default. Reset removes the explicit exception. Active administrators retain full supported page access; personal preferences and Improvements belong to every active user. Non-employees cannot receive employee PTO access.

Role changes load the selected role's saved page defaults and retain explicit user exceptions. Action checkboxes, proposal scope, record visibility, and employee classification remain separate. Add User previews departments containing allowed pages and persists all selected action flags. Manage Page Access is the common editor used by the former department/module/override dialogs and Edit User.

## Page decisions

| Catalog item | Behavior |
| --- | --- |
| My Settings / Preferences | Removed from department permissions/navigation; avatar profile entry and existing URLs remain. |
| Improvements | Universal avatar entry; removed from the Admin permission catalog. |
| Messages | Customer-message capability remains, labeled Flow: Customer Messages; standalone Sales menu removed; old URLs open Flow. |
| Invoices | One permission and one preferred department menu per role; existing row IDs/bookmarks remain. |
| Payroll / Time Approval | Real Finance workspaces with backend authority tied to page grants; payroll links hidden when unavailable. |
| Activity Log | Retained because its histories/functions are not completely replaced by Flow. |
| Tasks | Retained; Flow shows task events and links, while Tasks supplies assignment and completion. |
| By Office / Unassigned Jobs | Retired catalog aliases route to Sales Dashboard / Dispatch. |
| Legacy Admin settings aliases | Retired standalone entries route to the matching System Administration sections. |
| Payments | Retired standalone entry routes to Invoices. |
| Job Costing / Reports / QuickBooks | Unsupported standalone entries retired; existing links map to Finance Dashboard / Integrations. |
| Previously inactive pages | Excluded from permission editing and navigation. |

System Administration remains administrator-only. Duplicate department toggles are no longer an independent authorization source. The legacy `user_has_module_access` RPC now delegates to the same effective rules and restricts target users to the caller or an administrator in the same organization.

## Reviewed defaults

- Tech and Finance receive internal Flow; customer messaging remains separately controlled.
- Service Manager loses blanket sales/pipeline defaults. Existing users explicitly designated as sales reps retain those duties through user exceptions, preserving existing revokes.
- Business Development loses proposal/order/design/template defaults; individual exceptions remain available.
- Sales and Tech lose default product-editing authority unless explicitly authorized for purchasing. Finance loses default proposal creation.
- Sales and Finance lose default company-wide Tasks/Pipeline browsing. New accounts use conservative role defaults instead of granting these flags universally.

Permissions are not a substitute for record-level visibility policies. Private conversations, proposals, invoices and employee configuration retain their separate policies. This change additionally enforces product-editing authority, task assignment/tenant scope and payroll table/RPC authority on the server.

## Saving and rollout

`save_role_page_permissions` locks the role, validates the complete request, compares its revision, and updates grants transactionally. Conflicts/errors retain the editor's changes. Direct grant edits also increment the revision. `set_user_page_permissions` writes/reset exceptions transactionally across duplicate page copies and preserves notes. Permission metadata writes require an active same-organization administrator, including direct API writes.

The live MJV rollout applied the previously missing `20261002110037_enforce_employee_time_authority` and `20261005131500_task_department_assignment_and_atomic_completion` migrations plus `permission_catalog_consistency` in one atomic DO block, recording both prerequisite versions in migration history. The follow-up `align_legacy_permission_helper` migration was also applied. The create-user Edge Function was deployed with JWT verification enabled. Frontend changes still require this PR to merge/deploy. This PR also includes the earlier user-setup fixes from #157.

The private cleanup backup stores the previous module metadata, role grants, user exceptions and affected profiles for review/rollback. Historical module IDs and all pre-existing user exceptions survived the live rollout. Michael Colley's sales role, sales-rep designation and non-employee classification were verified unchanged. There were 70 active module rows before cleanup and 52 after; none of the retired keys remain active, and no Invoices role conflicts remain.

## Validation

- Production build and database permission/creation regression suites.
- Real task completion/reopen bodies: direct completion forgery, cross-tenant and disabled-user denial, single points award, repeat-completion denial.
- Effective time-review grant, revocation and tenant checks; existing employee-time authority suite.
- Desktop, tablet and 390px phone permission editor tests: role load races, save errors, revision transactions, canonical Invoices, matrix refresh, overrides/reset, administrator rules and non-employee PTO.
- Existing user setup and Flow regression suites.
- Global typecheck remains blocked by existing repository errors; a clean repository-wide typecheck is not claimed.

Supabase's advisory notices for the new authenticated SECURITY DEFINER RPCs are intentional: their administrator/tenant checks are regression-tested. The private backup has RLS enabled with no client policies and client grants revoked; its [no-policy advisory](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) reflects intentional denial of client access.
