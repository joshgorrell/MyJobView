/** Legacy subjects remain stored, but the issue description is the item name. */
export function punchlistDescription(task: { title: string; details: string | null }) {
  return task.details?.trim() || task.title;
}

export interface PunchlistListItem {
  id: string; contact_id: string; title: string; details: string | null;
  customer_notes?: string | null; status: string; created_at: string;
  service_request_id?: string | null; work_order_id?: string | null;
  contact: { full_name: string; email?: string; phone?: string };
  service_request?: { work_order_id: string | null; status?: string } | null;
}
export function canSchedulePunchlist(task: PunchlistListItem) {
  return (task.status === 'draft' || task.status === 'requested') && !task.work_order_id && !task.service_request?.work_order_id
    && (!task.service_request || task.service_request.status === 'open');
}
export function canRequestPunchlist(task: PunchlistListItem) {
  return task.status === 'draft' && !task.service_request_id && !task.work_order_id;
}
export function punchlistList<T extends PunchlistListItem>(tasks: T[], options: {search: string; status: string; contactId?: string; order: 'newest' | 'customer'}) {
  const query = options.search.trim().toLowerCase();
  return tasks.filter(task => (!options.contactId || task.contact_id === options.contactId)
    && (options.status === 'all' || task.status === options.status)
    && (!query || [punchlistDescription(task), task.title, task.customer_notes, task.contact.full_name, task.contact.email, task.contact.phone]
      .some(value => value?.toLowerCase().includes(query))))
    .sort((a,b) => (options.order === 'customer' ? a.contact.full_name.localeCompare(b.contact.full_name) || a.contact_id.localeCompare(b.contact_id) : 0)
      || new Date(b.created_at).getTime() - new Date(a.created_at).getTime() || a.id.localeCompare(b.id));
}
