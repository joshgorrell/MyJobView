export interface FlowEvent {
  id: number;
  organization_id: string;
  contact_id: string | null;
  project_id: string | null;
  work_order_id: string | null;
  customer_location_id: string | null;
  actor_id: string | null;
  actor_name: string;
  customer_name: string;
  project_name: string;
  work_order_number: string;
  location_name: string;
  category: string;
  summary: string;
  details: string;
  source_table: string;
  source_id: string;
  thread_id?: string | null;
  task_id?: string | null;
  mentioned_user_ids?: string[];
  preview?: string | null;
  required_module: string;
  created_at: string;
  viewed: boolean;
}
export interface FlowScope { contactId?: string; projectId?: string; workOrderId?: string }
export interface FlowTarget { kind: 'contact' | 'project' | 'work_order'; id: string; label: string }
export interface FlowFilters {
  contact_id?: string; project_id?: string; work_order_id?: string;
  office_id?: string; actor_id?: string; location_id?: string;
  category?: string; search?: string; since?: string; until?: string;
  my_work?: boolean; new_only?: boolean; mentions_only?: boolean;
}
export const FLOW_CATEGORIES: Record<string, string> = {
  work: 'Work', service: 'Service', sales: 'Sales', materials: 'Materials',
  scheduling: 'Scheduling', customer: 'Customer', financial: 'Financial', update: 'Updates', communication: 'Conversations',
};
export function scopeFilters(scope: FlowScope): FlowFilters {
  return { contact_id: scope.contactId, project_id: scope.projectId, work_order_id: scope.workOrderId };
}
export function targetScope(target: FlowTarget): FlowScope {
  return target.kind === 'contact' ? { contactId: target.id }
    : target.kind === 'project' ? { projectId: target.id } : { workOrderId: target.id };
}
export function dayLabel(timestamp: string, now = new Date()): string {
  const date = new Date(timestamp);
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === now.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}
