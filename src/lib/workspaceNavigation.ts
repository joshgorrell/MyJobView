// Keep original module keys for permissions and links; consolidate only menus.
export const workspaceParents: Record<string, string> = {
  tasks: 'feed', prospects: 'pipeline_board', leads: 'pipeline_board',
  fishbowl: 'pipeline_board', customer_comms: 'dispatch_dashboard', time_approval: 'payroll',
};
export function workspaceMenuKey(key: string) { return workspaceParents[key] || key; }
export function showWorkspaceMenu(key: string, access: (key: string) => boolean) {
  return !['individual_dashboard', 'team_leaderboard', 'materials'].includes(key)
    && !(workspaceParents[key] && access(workspaceParents[key]));
}
export function workspaceMenuLabel(key: string, fallback: string) {
  return key === 'payroll' ? 'Time & Payroll' : key === 'pipeline_board' ? 'Pipeline' : fallback;
}
