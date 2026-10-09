// Only implemented pages and named capabilities belong in the permission editor.
// Legacy database rows retain their IDs for historical references and bookmarks.
const retiredKeys = new Set([
  "connections",
  "sales_activity",
  "preferences",
  "by_office",
  "proposal_messages_admin",
  "company_settings",
  "user_management",
  "role_permissions",
  "menu_builder",
  "offices",
  "priority_management",
  "pay_types",
  "integrations",
  "department_access",
  "unassigned_jobs",
  "payments",
  "job_costing",
  "reports",
  "quickbooks",
  "feature_suggestions",
]);

export interface PermissionModule {
  id: string;
  module_key: string;
  department_id: string;
  display_name?: string;
  is_active?: boolean;
}

export function isPermissionModule(module: PermissionModule): boolean {
  return module.is_active !== false && !retiredKeys.has(module.module_key);
}

export function isNavigationModule(module: PermissionModule): boolean {
  return isPermissionModule(module) && module.module_key !== "messages";
}

export function permissionLabel(key: string, fallback: string): string {
  return (
    (
      {
        reviews: "Feedback",
        messages: "Flow: Customer Messages",
        settings: "System Administration",
      } as Record<string, string>
    )[key] || fallback
  );
}

// Shared page grants use ANY explicit role grant. A user revoke takes precedence
// over a conflicting user grant; resolve conflicts once, without query-order dependence.
export function effectiveModuleAccess(
  key: string,
  modules: PermissionModule[],
  roleAccess: ReadonlyMap<string, boolean>,
  overrides: ReadonlyMap<string, boolean>,
  role: string,
): boolean {
  if (key === "preferences" || key === "feature_suggestions") return true;
  if (key === "settings") return role === "admin";
  const siblings = modules.filter(
    (m) => m.module_key === key && isPermissionModule(m),
  );
  if (!siblings.length) return false;
  if (role === "admin") return true;
  if (siblings.some((m) => overrides.get(m.id) === false)) return false;
  if (siblings.some((m) => overrides.get(m.id) === true)) return true;
  return siblings.some((m) => roleAccess.get(m.id) === true);
}

export function uniquePermissionModules<T extends PermissionModule>(
  modules: T[],
): T[] {
  const result = new Map<string, T>();
  for (const module of modules.filter(isPermissionModule)) {
    if (!result.has(module.module_key)) result.set(module.module_key, module);
  }
  return [...result.values()];
}

export const permissionOverridesMap = (
  rows: { module_id: string; override_type: string }[],
) => new Map(rows.map((row) => [row.module_id, row.override_type === "grant"]));

export const notifyPermissionsChanged = () =>
  window.dispatchEvent(new Event("permissions-changed"));

export function resolveLegacyPage(key: string): string {
  return (
    (
      {
        connections: "feed",
        sales_activity: "feed",
        messages: "feed",
        proposal_messages_admin: "feed",
        by_office: "sales_dashboard",
        company_settings: "settings_company",
        user_management: "settings_users",
        role_permissions: "settings_roles",
        menu_builder: "settings_departments",
        department_access: "settings_departments",
        offices: "settings_company",
        priority_management: "settings_priorities",
        pay_types: "settings_timeclock",
        integrations: "settings_integrations",
        quickbooks: "settings_integrations",
        unassigned_jobs: "dispatch_dashboard",
        payments: "invoices",
        job_costing: "finance_dashboard",
        reports: "finance_dashboard",
      } as Record<string, string>
    )[key] || key
  );
}

export function isPreferredNavigationCopy(
  module: PermissionModule,
  modules: PermissionModule[],
  departments: { id: string; name: string }[],
  role: string,
): boolean {
  if (module.module_key !== "invoices") return true;
  const preferred =
    role === "sales" || role === "business_development"
      ? "sales"
      : role === "manager" || role === "service_manager" || role === "tech"
        ? "production"
        : "finance";
  const siblings = modules.filter(
    (m) => m.module_key === "invoices" && isNavigationModule(m),
  );
  const chosen =
    siblings.find((m) =>
      departments.some((d) => d.id === m.department_id && d.name === preferred),
    ) || siblings[0];
  return module.id === chosen?.id;
}
