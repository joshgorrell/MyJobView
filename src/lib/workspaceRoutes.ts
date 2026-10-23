import { resolveLegacyPage } from './permissionCatalog';

// Explicit workspace routes keep public pages and portal aliases separate.
const pages = [
  "bonus_approvals",
  "bug_management",
  "calendar",
  "change_orders",
  "commission_management",
  "commissions",
  "contact_import",
  "contacts",
  "contract_import",
  "contract_management",
  "customer_comms",
  "daily_clock",
  "daily_clock_sessions",
  "daily_sales_report_import",
  "design_queue",
  "dispatch_dashboard",
  "equipment_warranty",
  "feature_suggestions",
  "feed",
  "finance_dashboard",
  "fishbowl",
  "gps_diagnostics",
  "help",
  "historical_sales_import",
  "improvements",
  "individual_dashboard",
  "inventory",
  "invoices",
  "job_acceptance",
  "job_photos",
  "job_status",
  "leads",
  "maintenance_agreements",
  "materials",
  "my_mileage",
  "my_time_off",
  "mycard",
  "parts_requests",
  "payroll",
  "pipeline_board",
  "points_rewards",
  "portal_punchlist",
  "preferences",
  "production_dashboard",
  "production_manager",
  "products",
  "products_catalog",
  "project_work_orders",
  "projects",
  "proposals",
  "prospects",
  "pto_management",
  "punchlist",
  "purchase_orders",
  "recur",
  "report_templates",
  "reviews",
  "rewards_dashboard",
  "sales",
  "sales_dashboard",
  "sales_orders",
  "sales_performance",
  "sales_service_requests",
  "security_onboarding",
  "service_billing",
  "service_request_analytics",
  "service_requests",
  "settings",
  "sticky-notes",
  "tasks",
  "tax_filing_guide",
  "tax_reports",
  "team_leaderboard",
  "tech_center",
  "tech_map",
  "tech_skills",
  "tech_stats",
  "tech_status",
  "test_tune",
  "test_tune_settings",
  "time",
  "time_approval",
  "time_clock_management",
  "labor_dashboard",
  "travel_bonus",
  "travel_bonus_settings",
  "vehicle-tracking",
  "vip-plans",
  "work_orders",
];
const overrides: Record<string, string> = { feed: '/flow', calendar: '/schedule', punchlist: '/test-and-tune', security_onboarding: '/security-setup' };
export function workspacePath(page: string): string | null {
  const resolved = resolveLegacyPage(page);
  if (resolved.startsWith('settings_')) return '/settings/' + resolved.slice(9).replace(/_/g, '-');
  return pages.includes(resolved) ? overrides[resolved] || '/' + resolved.replace(/_/g, '-') : null;
}
export function workspacePage(pathname: string): string | null {
  const path = pathname.replace(/\/$/, '');
  if (path.startsWith('/settings/')) {
    const section = path.slice(10);
    if (/^[a-z]+(?:-[a-z]+)*$/.test(section)) return 'settings_' + section.replace(/-/g, '_');
  }
  if (path === '/project-punchlist') return 'punchlist'; // Backward-compatible staff bookmark
  return pages.find(page => workspacePath(page) === path) || null;
}
export function pageFromLocation(location: Pick<URL, 'pathname' | 'search'>, fallback = 'feed'): string {
  // Query links still work, including relative links from an existing clean URL.
  const legacy = new URLSearchParams(location.search).get('tab');
  return legacy ? resolveLegacyPage(legacy) : workspacePage(location.pathname) || resolveLegacyPage(fallback);
}
export function workspaceUrl(location: URL, page: string): string | null {
  const path = workspacePath(page);
  if (!path) return null;
  const next = new URL(location);
  next.pathname = path;
  next.searchParams.delete('tab');
  if (!['service_requests', 'service_request_analytics', 'punchlist'].includes(resolveLegacyPage(page))) next.searchParams.delete('serviceRequestId');
  return next.pathname + next.search + next.hash;
}
export function isPortalProposalRoute(pathname: string, search: string, portalUser: boolean, impersonating: boolean): boolean {
  if (pathname === '/portal/proposals' || pathname.startsWith('/portal/proposals/')) return true;
  if (pathname.startsWith('/proposals/') && pathname !== '/proposals/') return true;
  return (pathname === '/proposals' || pathname === '/proposals/') &&
    (portalUser || impersonating || new URLSearchParams(search).has('portal_token'));
}
