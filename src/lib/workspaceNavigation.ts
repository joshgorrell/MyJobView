// Keep original module keys for permissions and links; consolidate only menus.
export const workspaceParents: Record<string, string> = {
  tasks: 'feed', prospects: 'pipeline_board', leads: 'pipeline_board',
  fishbowl: 'pipeline_board', sales_performance: 'sales_dashboard', customer_comms: 'dispatch_dashboard', time_approval: 'payroll', labor_dashboard: 'dispatch_dashboard',
};
export function workspaceMenuKey(key: string) { return workspaceParents[key] || key; }
export function showWorkspaceMenu(key: string, access: (key: string) => boolean) {
  return !['individual_dashboard', 'team_leaderboard', 'materials'].includes(key)
    // A user with both Sales views gets one entry; dashboard-only users retain access.
    && !(key === 'sales_dashboard' && access('pipeline_board'))
    && !(workspaceParents[key] && access(workspaceParents[key]));
}
export function workspaceMenuLabel(key: string, fallback: string) {
  return key === 'payroll' ? 'Time & Payroll' : (key === 'pipeline_board' || key === 'sales_dashboard') ? 'Sales' : fallback;
}
