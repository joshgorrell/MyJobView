import { supabase } from './supabase';
import { getOrganizationTimezone } from './timezoneUtils';
export type ProjectRecord = Record<string, any>;
export interface ProjectSummary {
  project: ProjectRecord; today: string; customer: string; pm: string; office: string;
  soldHours: number; goalHours: number | null; fieldHours: number; excludedHours: number;
  pendingHours: number; lastWorked: string | null; activeTimers: number;
  percentage: number | null; remainingHours: number | null; budgetWarning: string | null;
  tasks: ProjectRecord[]; openTasks: ProjectRecord[]; blockedTasks: number;
  workOrders: ProjectRecord[]; nextVisit: ProjectRecord | null; phases: ProjectRecord[];
}
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const unique = (rows: ProjectRecord[]) => [...new Map(rows.map(row => [row.id, row])).values()];
export function scopeHours(item: ProjectRecord) {
  const phases = item.phases || [];
  const quantity = Math.max(0, number(item.quantity ?? 1));
  return (phases.length ? phases.reduce((sum: number, phase: ProjectRecord) => sum + number(phase.hours), 0)
    : number(item.labor_hours) + number(item.programming_labor_hours)) * quantity;
}
export function summarizeProjects(data: Record<string, ProjectRecord[]>, today = new Date().toISOString().slice(0, 10)): ProjectSummary[] {
  const workOrders = unique(data.workOrders || []), times = unique(data.times || []);
  const woMap = new Map(workOrders.map(wo => [wo.id, wo]));
  const phaseMap = new Map((data.phases || []).map(phase => [phase.id, phase]));
  const excluded = new Set((data.mapping || []).filter(row => row.counts_against_target === false).map(row => row.labor_phase_id));
  const person = (id: string) => (data.people || []).find(row => row.id === id)?.full_name || 'Unassigned';
  return (data.projects || []).map(project => {
    const order = Array.isArray(project.sales_order) ? project.sales_order[0] : project.sales_order;
    const baseItems = (data.items || []).filter(row => row.proposal_id === order?.proposal_id);
    const budgetPhases = new Map<string, number>();
    const addBudget = (phase: string | null, hours: number) => budgetPhases.set(phase || 'unassigned', (budgetPhases.get(phase || 'unassigned') || 0) + hours);
    baseItems.forEach(item => {
      if (item.phases?.length) item.phases.forEach((phase: ProjectRecord) => addBudget(phase.labor_phase_id, number(phase.hours) * number(item.quantity ?? 1)));
      else { addBudget(item.labor_phase_id, number(item.labor_hours) * number(item.quantity ?? 1)); addBudget(item.programming_labor_phase_id, number(item.programming_labor_hours) * number(item.quantity ?? 1)); }
    });
    let budgetWarning: string | null = null;
    const approved = new Set(unique(data.changes || []).filter(row => row.sales_order_id === order?.id && row.status === 'approved' && row.is_active !== false).map(row => row.id));
    unique(data.changeItems || []).filter(row => approved.has(row.change_order_id)).forEach(item => {
      const original = baseItems.find(row => row.id === item.proposal_line_item_id);
      const rate = number(item.labor_rate);
      const oldHours = item.original_labor_total != null && rate > 0 ? number(item.original_labor_total) / rate : original ? scopeHours(original) : null;
      let delta = number(item.labor_hours);
      if (item.action_type === 'remove' || item.action_type === 'remove_scope') {
        if (oldHours == null && delta !== 0) budgetWarning = 'Change-order labor needs review';
        delta = -(oldHours ?? delta);
      } else if (item.action_type === 'modify_quantity') {
        if (oldHours == null) budgetWarning = 'Change-order labor needs review';
        delta -= oldHours ?? 0;
      } else if (item.action_type === 'modify_price') delta = 0;
      // Remove the original scope from each phase before allocating replacement labor.
      if (original && oldHours != null && ['remove', 'remove_scope', 'modify_quantity'].includes(item.action_type) && scopeHours(original) > 0) {
        const scale = oldHours / scopeHours(original);
        if (original.phases?.length) original.phases.forEach((phase: ProjectRecord) => addBudget(phase.labor_phase_id, -number(phase.hours) * number(original.quantity ?? 1) * scale));
        else { addBudget(original.labor_phase_id, -number(original.labor_hours) * number(original.quantity ?? 1) * scale); addBudget(original.programming_labor_phase_id, -number(original.programming_labor_hours) * number(original.quantity ?? 1) * scale); }
        if (item.action_type === 'modify_quantity') addBudget(item.labor_phase_id || original.labor_phase_id, number(item.labor_hours));
      } else addBudget(item.labor_phase_id || original?.labor_phase_id, delta);
    });
    let soldHours = Math.max(0, [...budgetPhases.values()].reduce((sum, hours) => sum + hours, 0));
    // Historical jobs without recoverable proposal scope retain their saved target.
    if (!baseItems.length && number(order?.total_estimated_labor_hours) > 0) {
      soldHours = number(order.total_estimated_labor_hours); budgetPhases.clear(); addBudget(null, soldHours);
    }
    const savedGoal = !baseItems.length ? number(order?.field_labor_target_hours) : 0;
    const goalHours = budgetWarning ? null : savedGoal > 0 ? savedGoal : soldHours > 0 ? soldHours * .95 : null;
    const actualPhases = new Map<string, number>();
    let fieldHours = 0, excludedHours = 0, pendingHours = 0, lastWorked: string | null = null, activeTimers = 0;
    times.forEach(entry => {
      const wo = woMap.get(entry.work_order_id);
      const projectId = wo ? wo.project_id : entry.project_id;
      if (projectId !== project.id || ['rejected', 'cancelled', 'denied', 'void'].includes(entry.status)) return;
      const date = entry.entry_date || entry.clock_in?.slice(0, 10);
      if (date && date > today) return;
      const hours = Math.max(0, number(entry.total_hours));
      if (!entry.clock_out) activeTimers++;
      if ((hours > 0 || !entry.clock_out) && date && (!lastWorked || date > lastWorked)) lastWorked = date;
      if (!entry.clock_out) return;
      const phase = entry.labor_phase_id || wo?.labor_phase_id || 'unassigned';
      actualPhases.set(phase, (actualPhases.get(phase) || 0) + hours);
      if (excluded.has(phase)) excludedHours += hours; else fieldHours += hours;
      if (['submitted', 'pending'].includes(entry.status)) pendingHours += hours;
    });
    const tasks = unique(data.tasks || []).filter(task => task.project_id === project.id);
    const openTasks = tasks.filter(task => !['completed', 'cancelled'].includes(task.status));
    const openWorkOrders = workOrders.filter(wo => wo.project_id === project.id && !wo.is_archived && !['completed', 'complete', 'cancelled', 'canceled'].includes(wo.behavior || wo.status));
    const nextVisit = openWorkOrders.filter(wo => wo.scheduled_date >= today && wo.scheduled_start_time && wo.assigned_to).sort((a, b) => `${a.scheduled_date} ${a.scheduled_start_time}`.localeCompare(`${b.scheduled_date} ${b.scheduled_start_time}`))[0] || null;
    const phases = [...new Set([...budgetPhases.keys(), ...actualPhases.keys()])].map(id => ({ id: id === 'unassigned' ? null : id, name: phaseMap.get(id)?.name || 'Unassigned', sold_hours: budgetPhases.get(id) || 0, goal_hours: (budgetPhases.get(id) || 0) * .95, actual_hours: actualPhases.get(id) || 0, excluded: excluded.has(id) }));
    return {project, today, customer: project.contact?.company_name || project.contact?.full_name || project.contact?.contact_name || 'Unknown customer', pm: person(project.assigned_pm), office: (data.offices || []).find(row => row.id === project.office_id)?.name || 'Unassigned', soldHours, goalHours, fieldHours, excludedHours, pendingHours, lastWorked, activeTimers, percentage: goalHours ? fieldHours / goalHours * 100 : null, remainingHours: goalHours ? goalHours - fieldHours : null, budgetWarning, tasks, openTasks, blockedTasks: openTasks.filter(task => task.progress_status === 'blocked').length, workOrders: openWorkOrders, nextVisit, phases};
  });
}
async function readAll(query: () => any, orderColumn = 'id'): Promise<ProjectRecord[]> {
  const rows: ProjectRecord[] = [];
  for (let offset = 0; ; offset += 500) { const {data, error} = await query().order(orderColumn).range(offset, offset + 499); if(error) throw error; rows.push(...(data || [])); if(!data || data.length < 500) return rows; }
}
async function related(table: string, field: string, ids: string[], organizationId: string, selection = '*') {
  const values = [...new Set(ids.filter(Boolean))], rows: ProjectRecord[] = [];
  for(let index = 0; index < values.length; index += 150) rows.push(...await readAll(() => supabase.from(table).select(selection).eq('organization_id',organizationId).in(field,values.slice(index,index+150))));
  return rows;
}
export async function loadProjectSummaries(organizationId: string, projectIds?: string[]): Promise<ProjectSummary[]> {
  const projects = await readAll(() => { let query = supabase.from('projects').select('*, contact:contacts(full_name,contact_name,company_name), sales_order:sales_orders!projects_sales_order_id_fkey(id,proposal_id,total_estimated_labor_hours,field_labor_target_hours)').eq('organization_id',organizationId); return projectIds ? query.in('id',projectIds) : query; });
  if(!projects.length) return [];
  const timezone = await getOrganizationTimezone(organizationId);
  const today = new Intl.DateTimeFormat('en-CA', {timeZone: timezone, year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const timeColumns = 'id,project_id,work_order_id,total_hours,clock_in,clock_out,entry_date,labor_phase_id,status';
  const ids = projects.map(project => project.id), orders = projects.map(project => project.sales_order?.id), proposals = projects.map(project => project.sales_order?.proposal_id);
  const [workOrders,tasks,items,changes,projectTimes,phases,mapping,people,offices,options] = await Promise.all([
    related('work_orders','project_id',ids,organizationId), related('project_tasks','project_id',ids,organizationId), related('proposal_line_items','proposal_id',proposals,organizationId,'*, phases:proposal_line_item_labor_phases(*)'), related('change_orders','sales_order_id',orders,organizationId), related('time_entries','project_id',ids,organizationId,timeColumns),
    readAll(() => supabase.from('labor_phases').select('*').eq('organization_id',organizationId)),readAll(() => supabase.from('labor_phase_performance_mapping').select('*').eq('organization_id',organizationId),'labor_phase_id'),readAll(() => supabase.from('profiles').select('id,full_name').eq('organization_id',organizationId)),readAll(() => supabase.from('company_offices').select('id,name').eq('organization_id',organizationId)),readAll(() => supabase.from('work_order_options').select('*').eq('organization_id',organizationId)),
  ]);
  const [workOrderTimes,changeItems] = await Promise.all([related('time_entries','work_order_id',workOrders.map(wo=>wo.id),organizationId,timeColumns),related('change_order_line_items','change_order_id',changes.filter(row=>row.status==='approved'&&row.is_active!==false).map(row=>row.id),organizationId)]);
  workOrders.forEach(wo => {const option = options.find(row=>row.id===wo.work_order_status_id);wo.behavior=option?.behavior||wo.status;wo.status_label=option?.label||wo.status;wo.technician_name=people.find(row=>row.id===wo.assigned_to)?.full_name||wo.assigned_to_name;});
  return summarizeProjects({projects,workOrders,tasks,items,changes,changeItems,times:[...projectTimes,...workOrderTimes],phases,mapping,people,offices},today);
}
export function projectOrderLink(row: ProjectSummary) {return row.project.sales_order_id ? `/?tab=sales_orders&openOrderId=${encodeURIComponent(row.project.sales_order_id)}&orderTab=project` : `/?tab=projects&projectId=${encodeURIComponent(row.project.id)}`;}
