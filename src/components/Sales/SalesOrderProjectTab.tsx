import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Wrench, Clock, CheckCircle, User, AlertTriangle, ChevronDown, ChevronUp, Briefcase, ListChecks, Timer, CalendarDays, Plus, MapPin, CreditCard as Edit3, Save, X, FileText, Flag, Circle, Package, StickyNote, GitBranch, Target, TrendingUp, Info, Trash2, Pencil, DollarSign, ShieldOff, GitMerge, CheckSquare, AlertCircle, ChevronRight, Search } from 'lucide-react';
import type { SalesOrderFull } from './SalesOrderDetail';
import { CreateProjectWorkOrderModal } from '../Production/CreateProjectWorkOrderModal';
import { AddProjectTimeModal } from '../Projects/AddProjectTimeModal';

interface WorkOrder {
  id: string;
  work_order_number: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  start_date: string | null;
  target_completion_date: string | null;
  estimated_hours: number;
  actual_hours: number;
  created_at: string;
  notes: string | null;
  description: string | null;
  technician?: { full_name: string } | null;
  labor_phase?: { name: string; id: string } | null;
}

interface ProjectTask {
  id: string;
  title: string;
  description: string | null;
  estimated_hours: number;
  status: string;
  sort_order: number;
  labor_phase?: { name: string } | null;
  actual_hours: number;
}

interface LaborPhase {
  id: string;
  name: string;
  sort_order: number | null;
}

interface UnassignedSource {
  id: string;
  label: string;
  type: 'work_order' | 'project_entry';
  hours: number;
  date?: string;
  technician?: string;
}

interface LaborPhaseBreakdown {
  phase_id: string | null;
  phase_name: string;
  sold_hours: number;
  goal_hours: number;
  actual_hours: number;
  remaining_hours: number;
  unassigned_sources?: UnassignedSource[];
}

interface ProjectTimeEntry {
  id: string;
  total_hours: number;
  labor_phase_id: string | null;
  labor_phase_name?: string | null;
  entry_date: string;
  technician?: { full_name: string } | null;
}

interface PartUsed {
  id: string;
  work_order_id: string;
  work_order_number: string;
  part_name: string;
  part_sku: string | null;
  quantity: number;
  unit_cost: number | null;
  unit_price: number | null;
  total_price: number | null;
  notes: string | null;
  created_at: string;
  billing_status: 'pending' | 'billed' | 'absorbed';
  billed_change_order_id: string | null;
  absorbed_reason: string | null;
}

interface OpenChangeOrder {
  id: string;
  change_order_number: string;
  title: string;
  status: string;
}

interface SalesOrderProjectTabProps {
  order: SalesOrderFull;
  onRefresh: () => void;
}

const GOAL_PCT = 0.95;
const PM_ALLOWANCE_PCT = 0.05;

export function SalesOrderProjectTab({ order, onRefresh }: SalesOrderProjectTabProps) {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [laborBreakdown, setLaborBreakdown] = useState<LaborPhaseBreakdown[]>([]);
  const [soldLaborHours, setSoldLaborHours] = useState(0);
  const [partsUsed, setPartsUsed] = useState<PartUsed[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllWOs, setShowAllWOs] = useState(false);
  const [showCreateWO, setShowCreateWO] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [togglingTask, setTogglingTask] = useState<string | null>(null);
  const [showAllParts, setShowAllParts] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [savingTask, setSavingTask] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTaskTitle, setEditTaskTitle] = useState('');
  const [editTaskDescription, setEditTaskDescription] = useState('');
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [totalClockedHours, setTotalClockedHours] = useState(0);
  const [showAddProjectTime, setShowAddProjectTime] = useState(false);

  const [laborPhases, setLaborPhases] = useState<LaborPhase[]>([]);
  const [assigningPhaseId, setAssigningPhaseId] = useState<string | null>(null);

  // Parts billing action state
  const [partActionModal, setPartActionModal] = useState<PartUsed | null>(null);
  const [partActionMode, setPartActionMode] = useState<'choose' | 'absorb' | 'bill_existing' | 'bill_new' | 'saving'>('choose');
  const [absorbReasonText, setAbsorbReasonText] = useState('');
  const [openChangeOrders, setOpenChangeOrders] = useState<OpenChangeOrder[]>([]);
  const [selectedExistingCO, setSelectedExistingCO] = useState('');
  const [loadingCOs, setLoadingCOs] = useState(false);

  const project = order.project;

  useEffect(() => {
    loadLaborPhases();
    if (project?.id) {
      setNotesValue(project.notes || '');
      loadProjectData();
      loadSoldLaborHours();
    } else {
      setLoading(false);
    }
  }, [project?.id]);

  async function loadLaborPhases() {
    const { data } = await supabase
      .from('labor_phases')
      .select('id, name, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    setLaborPhases(data || []);
  }

  async function loadSoldLaborHours() {
    if (!order.proposal_id) return;
    try {
      const { data } = await supabase
        .from('proposal_line_items')
        .select('labor_hours, labor_phase_id, labor_phase:labor_phases(id, name)')
        .eq('proposal_id', order.proposal_id);

      const total = (data || []).reduce((s, li) => s + (li.labor_hours || 0), 0);
      setSoldLaborHours(total);
      return data || [];
    } catch (error) {
      console.error('Error loading sold labor hours:', error);
      return [];
    }
  }

  async function loadProjectData() {
    if (!project?.id) return;
    try {
      const [woResult, taskResult, soldResult] = await Promise.all([
        supabase
          .from('work_orders')
          .select(`
            id, work_order_number, title, type, status, priority,
            start_date, target_completion_date, estimated_hours, actual_hours,
            created_at, notes, description,
            technician:profiles!work_orders_assigned_to_fkey(full_name),
            labor_phase:labor_phases!work_orders_labor_phase_id_fkey(id, name)
          `)
          .eq('project_id', project.id)
          .order('created_at', { ascending: false }),

        supabase
          .from('project_tasks')
          .select(`
            id, title, description, estimated_hours, status, sort_order,
            labor_phase:labor_phases!project_tasks_labor_phase_id_fkey(name)
          `)
          .eq('project_id', project.id)
          .order('sort_order', { ascending: true }),

        order.proposal_id
          ? supabase
              .from('proposal_line_items')
              .select('labor_hours, labor_phase_id, labor_phase:labor_phases(id, name)')
              .eq('proposal_id', order.proposal_id)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const wos: WorkOrder[] = woResult.data || [];
      setWorkOrders(wos);

      const soldItems = soldResult.data || [];
      const soldTotal = soldItems.reduce((s: number, li: any) => s + (li.labor_hours || 0), 0);
      setSoldLaborHours(soldTotal);

      const woIds = wos.map(w => w.id);

      // Always fetch project-level time entries (entry_type = 'project')
      const projectTimeResult = await supabase
        .from('time_entries')
        .select('id, total_hours, labor_phase_id, entry_date, technician:profiles!time_entries_technician_id_fkey(full_name), labor_phase:labor_phases!time_entries_labor_phase_id_fkey(name)')
        .eq('project_id', project.id)
        .eq('entry_type', 'project')
        .not('clock_out', 'is', null);

      const projectTimeEntries: ProjectTimeEntry[] = (projectTimeResult.data || []).map((te: any) => ({
        id: te.id,
        total_hours: te.total_hours || 0,
        labor_phase_id: te.labor_phase_id,
        labor_phase_name: (te.labor_phase as { name: string } | null)?.name ?? null,
        entry_date: te.entry_date,
        technician: te.technician,
      }));

      if (woIds.length > 0) {
        const [partsResult, timeEntriesResult] = await Promise.all([
          supabase
            .from('service_parts_used')
            .select('id, work_order_id, part_name, part_sku, quantity, unit_cost, unit_price, total_price, notes, created_at, billing_status, billed_change_order_id, absorbed_reason')
            .in('work_order_id', woIds)
            .order('created_at', { ascending: false }),
          supabase
            .from('time_entries')
            .select('id, work_order_id, total_hours')
            .in('work_order_id', woIds)
            .not('clock_out', 'is', null),
        ]);

        const woNumberMap: Record<string, string> = {};
        wos.forEach(w => { woNumberMap[w.id] = w.work_order_number; });

        setPartsUsed((partsResult.data || []).map(p => ({
          ...p,
          work_order_number: woNumberMap[p.work_order_id] || '—',
        })));

        buildLaborBreakdown(wos, soldItems, timeEntriesResult.data || [], projectTimeEntries);
      } else {
        setPartsUsed([]);
        buildLaborBreakdown(wos, soldItems, [], projectTimeEntries);
      }

      const rawTasks = taskResult.data || [];
      if (rawTasks.length > 0) {
        const taskIds = rawTasks.map((t: any) => t.id);
        const { data: woTasks } = await supabase
          .from('work_order_tasks')
          .select('id, project_task_id')
          .in('project_task_id', taskIds);

        const woTaskIds = (woTasks || []).map((t: any) => t.id);
        const completionsByProjectTask: Record<string, number> = {};

        if (woTaskIds.length > 0) {
          const { data: comps } = await supabase
            .from('work_order_task_completions')
            .select('work_order_task_id, actual_hours')
            .in('work_order_task_id', woTaskIds);

          const woTaskToProjectTask: Record<string, string> = {};
          (woTasks || []).forEach((wt: any) => {
            if (wt.project_task_id) woTaskToProjectTask[wt.id] = wt.project_task_id;
          });

          (comps || []).forEach((c: any) => {
            const ptId = woTaskToProjectTask[c.work_order_task_id];
            if (ptId) {
              completionsByProjectTask[ptId] = (completionsByProjectTask[ptId] || 0) + (c.actual_hours || 0);
            }
          });
        }

        setTasks(rawTasks.map((t: any) => ({
          ...t,
          actual_hours: completionsByProjectTask[t.id] || 0
        })));
      } else {
        setTasks([]);
      }
    } catch (error) {
      console.error('Error loading project data:', error);
    } finally {
      setLoading(false);
    }
  }

  function buildLaborBreakdown(
    wos: WorkOrder[],
    soldItems: any[],
    woTimeEntries: { id: string; work_order_id: string; total_hours: number }[],
    projectTimeEntries: ProjectTimeEntry[] = [],
  ) {
    // Group sold hours by phase
    const soldByPhase: Record<string, number> = {};
    soldItems.forEach((li: any) => {
      const phaseId = li.labor_phase?.id ?? 'unassigned';
      soldByPhase[phaseId] = (soldByPhase[phaseId] || 0) + (li.labor_hours || 0);
    });

    // Map work orders to their labor phase
    const woPhaseMap: Record<string, { id: string; name: string }> = {};
    wos.forEach(wo => {
      woPhaseMap[wo.id] = {
        id: wo.labor_phase?.id ?? 'unassigned',
        name: wo.labor_phase?.name ?? 'Unassigned',
      };
    });

    // Map work order ID → work order number for drill-down labels
    const woNumberMap: Record<string, string> = {};
    wos.forEach(wo => { woNumberMap[wo.id] = wo.work_order_number; });
    const woTitleMap: Record<string, string> = {};
    wos.forEach(wo => { woTitleMap[wo.id] = wo.title; });

    // Accumulate actual hours per phase from WO-linked entries
    const actualByPhase: Record<string, { name: string; hours: number }> = {};
    // Track unassigned WO sources for drill-down
    const unassignedWoSources: Record<string, number> = {}; // woId -> hours

    woTimeEntries.forEach(te => {
      const phase = woPhaseMap[te.work_order_id];
      if (!phase) return;
      if (!actualByPhase[phase.id]) {
        actualByPhase[phase.id] = { name: phase.name, hours: 0 };
      }
      actualByPhase[phase.id].hours += te.total_hours || 0;
      if (phase.id === 'unassigned') {
        unassignedWoSources[te.work_order_id] = (unassignedWoSources[te.work_order_id] || 0) + (te.total_hours || 0);
      }
    });

    // Accumulate actual hours per phase from project-level entries
    const unassignedProjectSources: ProjectTimeEntry[] = [];
    projectTimeEntries.forEach(te => {
      const phaseId = te.labor_phase_id ?? 'unassigned';
      if (!actualByPhase[phaseId]) {
        const phaseName = phaseId === 'unassigned' ? 'Unassigned' : (te.labor_phase_name ?? 'Unassigned');
        actualByPhase[phaseId] = { name: phaseName, hours: 0 };
      }
      actualByPhase[phaseId].hours += te.total_hours || 0;
      if (phaseId === 'unassigned') {
        unassignedProjectSources.push(te);
      }
    });

    // Build final breakdown rows
    const allPhaseIds = new Set([...Object.keys(soldByPhase), ...Object.keys(actualByPhase)]);
    const breakdown: LaborPhaseBreakdown[] = Array.from(allPhaseIds).map(phaseId => {
      const sold = soldByPhase[phaseId] || 0;
      const actual = actualByPhase[phaseId]?.hours || 0;
      const goal = sold * GOAL_PCT;
      const row: LaborPhaseBreakdown = {
        phase_id: phaseId === 'unassigned' ? null : phaseId,
        phase_name: actualByPhase[phaseId]?.name !== 'Unassigned' && actualByPhase[phaseId]?.name
          ? actualByPhase[phaseId].name
          : soldItems.find((li: any) => (li.labor_phase?.id ?? 'unassigned') === phaseId)?.labor_phase?.name ?? 'Unassigned',
        sold_hours: sold,
        goal_hours: goal,
        actual_hours: actual,
        remaining_hours: Math.max(0, goal - actual),
      };

      // Attach drill-down sources for the Unassigned row
      if (phaseId === 'unassigned') {
        const sources: UnassignedSource[] = [];
        Object.entries(unassignedWoSources).forEach(([woId, hrs]) => {
          sources.push({
            id: woId,
            type: 'work_order',
            label: `${woNumberMap[woId] || 'WO'} — ${woTitleMap[woId] || 'Work Order'}`,
            hours: hrs,
          });
        });
        unassignedProjectSources.forEach(te => {
          sources.push({
            id: te.id,
            type: 'project_entry',
            label: te.technician?.full_name || 'Staff',
            hours: te.total_hours,
            date: te.entry_date,
          });
        });
        row.unassigned_sources = sources;
      }

      return row;
    });

    const filtered = breakdown.filter(r => r.sold_hours > 0 || r.actual_hours > 0);
    setLaborBreakdown(filtered);
    const allHours = [
      ...woTimeEntries.map(te => te.total_hours || 0),
      ...projectTimeEntries.map(te => te.total_hours || 0),
    ];
    setTotalClockedHours(allHours.reduce((s, h) => s + h, 0));
  }

  async function assignPhaseToSource(source: UnassignedSource, newPhaseId: string) {
    if (assigningPhaseId) return;
    setAssigningPhaseId(source.id);
    try {
      if (source.type === 'work_order') {
        const { error } = await supabase
          .from('work_orders')
          .update({ labor_phase_id: newPhaseId || null })
          .eq('id', source.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('time_entries')
          .update({ labor_phase_id: newPhaseId || null })
          .eq('id', source.id);
        if (error) throw error;
      }
      await loadProjectData();
      setShowUnassignedDrilldown(false);
    } catch (err) {
      console.error('Error assigning phase:', err);
    } finally {
      setAssigningPhaseId(null);
    }
  }

  async function toggleTaskStatus(task: ProjectTask) {
    if (togglingTask) return;
    setTogglingTask(task.id);
    const newStatus = task.status === 'completed' ? 'open' : 'completed';
    try {
      const { error } = await supabase
        .from('project_tasks')
        .update({ status: newStatus, completed_at: newStatus === 'completed' ? new Date().toISOString() : null })
        .eq('id', task.id);
      if (error) throw error;
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    } catch (error) {
      console.error('Error toggling task:', error);
    } finally {
      setTogglingTask(null);
    }
  }

  async function saveNotes() {
    if (!project?.id) return;
    setSavingNotes(true);
    try {
      const { error } = await supabase
        .from('projects')
        .update({ notes: notesValue })
        .eq('id', project.id);
      if (error) throw error;
      setEditingNotes(false);
      onRefresh();
    } catch (error) {
      console.error('Error saving notes:', error);
    } finally {
      setSavingNotes(false);
    }
  }

  async function addTask() {
    if (!project?.id || !newTaskTitle.trim()) return;
    setSavingTask(true);
    try {
      const maxSort = tasks.length > 0 ? Math.max(...tasks.map(t => t.sort_order)) + 1 : 0;
      const { error } = await supabase
        .from('project_tasks')
        .insert({
          project_id: project.id,
          title: newTaskTitle.trim(),
          description: newTaskDescription.trim() || null,
          status: 'open',
          sort_order: maxSort,
          estimated_hours: 0,
        });
      if (error) throw error;
      setNewTaskTitle('');
      setNewTaskDescription('');
      setShowAddTask(false);
      await loadProjectData();
    } catch (error) {
      console.error('Error adding task:', error);
    } finally {
      setSavingTask(false);
    }
  }

  async function saveEditTask(taskId: string) {
    if (!editTaskTitle.trim()) return;
    setSavingTask(true);
    try {
      const { error } = await supabase
        .from('project_tasks')
        .update({ title: editTaskTitle.trim(), description: editTaskDescription.trim() || null })
        .eq('id', taskId);
      if (error) throw error;
      setEditingTaskId(null);
      setTasks(prev => prev.map(t => t.id === taskId
        ? { ...t, title: editTaskTitle.trim(), description: editTaskDescription.trim() || null }
        : t
      ));
    } catch (error) {
      console.error('Error saving task:', error);
    } finally {
      setSavingTask(false);
    }
  }

  async function deleteTask(taskId: string) {
    setDeletingTaskId(taskId);
    try {
      const { error } = await supabase
        .from('project_tasks')
        .delete()
        .eq('id', taskId);
      if (error) throw error;
      setTasks(prev => prev.filter(t => t.id !== taskId));
    } catch (error) {
      console.error('Error deleting task:', error);
    } finally {
      setDeletingTaskId(null);
    }
  }

  function openPartAction(part: PartUsed) {
    setPartActionModal(part);
    setPartActionMode('choose');
    setAbsorbReasonText('');
    setSelectedExistingCO('');
  }

  function closePartAction() {
    setPartActionModal(null);
    setPartActionMode('choose');
    setAbsorbReasonText('');
    setSelectedExistingCO('');
  }

  async function loadOpenChangeOrders() {
    if (!order.id) return;
    setLoadingCOs(true);
    try {
      const { data } = await supabase
        .from('change_orders')
        .select('id, change_order_number, title, status')
        .eq('sales_order_id', order.id)
        .in('status', ['draft', 'pending_approval'])
        .order('created_at', { ascending: false });
      setOpenChangeOrders(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingCOs(false);
    }
  }

  async function absorbPart() {
    if (!partActionModal) return;
    setPartActionMode('saving');
    try {
      const { error } = await supabase
        .from('service_parts_used')
        .update({ billing_status: 'absorbed', absorbed_reason: absorbReasonText.trim() || null })
        .eq('id', partActionModal.id);
      if (error) throw error;
      setPartsUsed(prev => prev.map(p => p.id === partActionModal.id
        ? { ...p, billing_status: 'absorbed', absorbed_reason: absorbReasonText.trim() || null }
        : p
      ));
      closePartAction();
    } catch (e) {
      console.error(e);
      setPartActionMode('absorb');
    }
  }

  async function addPartToNewCO() {
    if (!partActionModal || !order.id || !project?.id) return;
    setPartActionMode('saving');
    try {
      const { data: orgData } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', (await supabase.auth.getUser()).data.user?.id || '')
        .maybeSingle();
      const orgId = orgData?.organization_id;

      const { data: coData, error: coErr } = await supabase
        .from('change_orders')
        .insert({
          sales_order_id: order.id,
          project_id: project.id,
          company_id: orgId,
          organization_id: orgId,
          title: `On-Site Parts: ${partActionModal.part_name}`,
          description: `Parts added on-site during work order ${partActionModal.work_order_number}.`,
          reason: 'field_change',
          type: 'addition',
          status: 'draft',
          change_amount: partActionModal.total_price || 0,
          original_contract_amount: order.contract_total || 0,
          new_contract_total: (order.contract_total || 0) + (partActionModal.total_price || 0),
        })
        .select('id, change_order_number')
        .single();
      if (coErr) throw coErr;

      const { error: liErr } = await supabase
        .from('change_order_line_items')
        .insert({
          change_order_id: coData.id,
          action_type: 'add',
          product_name: partActionModal.part_name,
          item_type: 'material',
          new_quantity: partActionModal.quantity,
          new_unit_price: partActionModal.unit_price || partActionModal.unit_cost || 0,
          new_total: partActionModal.total_price || 0,
          change_amount: partActionModal.total_price || 0,
          tech_notes: partActionModal.notes || null,
          is_taxable: true,
          sort_order: 0,
        });
      if (liErr) throw liErr;

      const { error: updErr } = await supabase
        .from('service_parts_used')
        .update({ billing_status: 'billed', billed_change_order_id: coData.id })
        .eq('id', partActionModal.id);
      if (updErr) throw updErr;

      setPartsUsed(prev => prev.map(p => p.id === partActionModal.id
        ? { ...p, billing_status: 'billed', billed_change_order_id: coData.id }
        : p
      ));
      closePartAction();
      onRefresh();
    } catch (e) {
      console.error(e);
      setPartActionMode('bill_new');
    }
  }

  async function addPartToExistingCO() {
    if (!partActionModal || !selectedExistingCO) return;
    setPartActionMode('saving');
    try {
      const { data: existingItems } = await supabase
        .from('change_order_line_items')
        .select('sort_order')
        .eq('change_order_id', selectedExistingCO)
        .order('sort_order', { ascending: false })
        .limit(1);
      const nextSort = existingItems && existingItems.length > 0 ? (existingItems[0].sort_order + 1) : 0;

      const { error: liErr } = await supabase
        .from('change_order_line_items')
        .insert({
          change_order_id: selectedExistingCO,
          action_type: 'add',
          product_name: partActionModal.part_name,
          item_type: 'material',
          new_quantity: partActionModal.quantity,
          new_unit_price: partActionModal.unit_price || partActionModal.unit_cost || 0,
          new_total: partActionModal.total_price || 0,
          change_amount: partActionModal.total_price || 0,
          tech_notes: partActionModal.notes || null,
          is_taxable: true,
          sort_order: nextSort,
        });
      if (liErr) throw liErr;

      const { error: updErr } = await supabase
        .from('service_parts_used')
        .update({ billing_status: 'billed', billed_change_order_id: selectedExistingCO })
        .eq('id', partActionModal.id);
      if (updErr) throw updErr;

      setPartsUsed(prev => prev.map(p => p.id === partActionModal.id
        ? { ...p, billing_status: 'billed', billed_change_order_id: selectedExistingCO }
        : p
      ));
      closePartAction();
      onRefresh();
    } catch (e) {
      console.error(e);
      setPartActionMode('bill_existing');
    }
  }

  async function revertPartStatus(part: PartUsed) {
    try {
      const { error } = await supabase
        .from('service_parts_used')
        .update({ billing_status: 'pending', billed_change_order_id: null, absorbed_reason: null })
        .eq('id', part.id);
      if (error) throw error;
      setPartsUsed(prev => prev.map(p => p.id === part.id
        ? { ...p, billing_status: 'pending', billed_change_order_id: null, absorbed_reason: null }
        : p
      ));
    } catch (e) {
      console.error(e);
    }
  }

  if (!project) {
    return (
      <div className="text-center py-16">
        <Briefcase className="w-14 h-14 text-gray-700 mx-auto mb-4" />
        <p className="text-gray-400 font-medium mb-1">No project linked yet</p>
        <p className="text-gray-500 text-sm">A project is automatically created when the proposal is approved.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const totalSoldHours = soldLaborHours;
  const goalHours = totalSoldHours * GOAL_PCT;
  const totalActualHours = totalClockedHours;
  const remainingHours = Math.max(0, goalHours - totalActualHours);
  const usedPct = goalHours > 0 ? (totalActualHours / goalHours) * 100 : 0;
  const overGoal = totalActualHours > goalHours && goalHours > 0;
  const overSold = totalActualHours > totalSoldHours && totalSoldHours > 0;

  const completedWOs = workOrders.filter(w => w.status === 'completed').length;
  const inProgressWOs = workOrders.filter(w => w.status === 'in_progress').length;
  const completedTasks = tasks.filter(t => t.status === 'completed').length;

  const visibleWOs = showAllWOs ? workOrders : workOrders.slice(0, 5);
  const visibleParts = showAllParts ? partsUsed : partsUsed.slice(0, 6);

  const totalPartsValue = partsUsed.reduce((s, p) => s + (p.total_price || 0), 0);
  const totalPartsQty = partsUsed.reduce((s, p) => s + (p.quantity || 0), 0);
  const pendingParts = partsUsed.filter(p => p.billing_status === 'pending');
  const billedParts = partsUsed.filter(p => p.billing_status === 'billed');
  const absorbedParts = partsUsed.filter(p => p.billing_status === 'absorbed');

  const extraPartsExist = pendingParts.length > 0;
  const overBudgetTime = overSold;
  const showChangeOrderPrompt = extraPartsExist || overBudgetTime;

  const statusColors: Record<string, string> = {
    planning: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    active: 'bg-green-500/20 text-green-400 border-green-500/30',
    complete: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
    closed: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  };

  const jobSiteAddr = project.job_site_address
    ? (typeof project.job_site_address === 'string'
        ? project.job_site_address
        : [
            project.job_site_address.street_address,
            project.job_site_address.city,
            project.job_site_address.state,
            project.job_site_address.zip_code
          ].filter(Boolean).join(', '))
    : null;

  return (
    <div className="space-y-6">

      {/* Change Order Prompt */}
      {showChangeOrderPrompt && (
        <div className="bg-amber-900/20 border border-amber-600/40 rounded-xl p-4 flex items-start gap-3">
          <GitBranch className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-300 mb-1">Consider a Change Order</p>
            <ul className="text-xs text-amber-200/70 space-y-0.5 list-disc list-inside">
              {extraPartsExist && (
                <li>{partsUsed.length} part{partsUsed.length !== 1 ? 's' : ''} added on-site ({totalPartsQty} units, ${totalPartsValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} value) — outside the original sales order</li>
              )}
              {overBudgetTime && (
                <li>{(totalActualHours - totalSoldHours).toFixed(1)}h clocked over the sold estimate — consider billing the extra labor</li>
              )}
            </ul>
          </div>
        </div>
      )}

      {/* Hours Tracking */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Labor Hours</h3>
            <div className="flex items-center gap-1 text-xs text-gray-600 bg-gray-800 border border-gray-700 rounded px-2 py-0.5">
              <Target className="w-3 h-3" />
              Goal = 95% of sold
            </div>
          </div>
          <button
            onClick={() => setShowAddProjectTime(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 hover:border-blue-500/70 text-blue-400 hover:text-blue-300 text-xs font-medium rounded-lg transition-all"
          >
            <Clock className="w-3.5 h-3.5" />
            Add Project Time
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <HourStat
            label="Sold (Estimated)"
            value={totalSoldHours > 0 ? `${totalSoldHours.toFixed(1)}h` : '—'}
            sub="From proposal line items"
            color="blue"
            icon={FileText}
          />
          <HourStat
            label="Goal (95%)"
            value={goalHours > 0 ? `${goalHours.toFixed(1)}h` : '—'}
            sub="Target on-site hours"
            color="teal"
            icon={Target}
          />
          <HourStat
            label="Actual Clocked"
            value={`${totalActualHours.toFixed(1)}h`}
            sub={overSold ? `${(totalActualHours - totalSoldHours).toFixed(1)}h over sold` : overGoal ? `${(totalActualHours - goalHours).toFixed(1)}h over goal` : undefined}
            color={overSold ? 'red' : overGoal ? 'amber' : totalActualHours > 0 ? 'green' : undefined}
            icon={Clock}
          />
          <HourStat
            label="Remaining"
            value={overGoal ? 'Over Goal' : `${remainingHours.toFixed(1)}h`}
            sub={overGoal ? `Used ${usedPct.toFixed(0)}% of goal` : `${usedPct.toFixed(0)}% of goal used`}
            color={overSold ? 'red' : overGoal ? 'amber' : 'gray'}
            icon={TrendingUp}
          />
        </div>

        {totalSoldHours > 0 && (
          <HoursProgressBar
            soldHours={totalSoldHours}
            goalHours={goalHours}
            actualHours={totalActualHours}
          />
        )}
      </div>

      {/* Labor Breakdown by Phase */}
      {laborBreakdown.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Labor Breakdown by Phase</h3>
            {laborBreakdown.some(r => r.phase_id === null && r.actual_hours > 0) && (
              <span className="flex items-center gap-1 text-xs font-medium text-amber-400 bg-amber-900/20 border border-amber-700/40 rounded-full px-2 py-0.5">
                <AlertTriangle className="w-3 h-3" />
                Unassigned hours — use drill-down to assign
              </span>
            )}
          </div>
          <div className="bg-gray-900/50 rounded-xl border border-gray-700/50 overflow-hidden">
            {/* Mobile card view */}
            <div className="md:hidden divide-y divide-gray-700/40">
              {laborBreakdown.map((row, i) => {
                const phaseOver = row.actual_hours > row.sold_hours;
                const phaseOverGoal = row.actual_hours > row.goal_hours;
                const isUnassigned = row.phase_id === null;
                const hasSources = isUnassigned && (row.unassigned_sources?.length ?? 0) > 0;
                return (
                  <div key={i} className="px-4 py-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium text-sm ${isUnassigned ? 'text-amber-400' : 'text-gray-200'}`}>{row.phase_name}</span>
                      {hasSources && (
                        <span className="text-xs text-amber-500 bg-amber-900/20 border border-amber-700/40 rounded px-1.5 py-0.5">
                          {row.unassigned_sources!.length} source{row.unassigned_sources!.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    {isUnassigned && hasSources && (
                      <div className="space-y-2 pt-1 border-t border-amber-800/30 mt-2">
                        <p className="text-xs text-amber-400 font-semibold pt-1">Unassigned Sources — assign a phase:</p>
                        {row.unassigned_sources!.map(src => (
                          <div key={src.id} className="bg-gray-900/60 rounded-lg px-3 py-2 border border-gray-700/50">
                            <div className="flex items-center gap-1.5 flex-wrap mb-1">
                              <span className="text-xs text-white font-medium">{src.label}</span>
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${src.type === 'work_order' ? 'bg-blue-900/40 text-blue-400' : 'bg-gray-800 text-gray-400'}`}>
                                {src.type === 'work_order' ? 'WO' : 'Project Time'}
                              </span>
                              {src.date && <span className="text-xs text-gray-500">{src.date}</span>}
                              <span className="text-xs text-amber-400 tabular-nums font-semibold">{src.hours.toFixed(1)}h</span>
                            </div>
                            <select
                              value=""
                              disabled={assigningPhaseId === src.id}
                              onChange={e => { if (e.target.value) assignPhaseToSource(src, e.target.value); }}
                              className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none disabled:opacity-50"
                            >
                              <option value="">Assign phase...</option>
                              {laborPhases.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Sold</span>
                        <span className="text-gray-400 tabular-nums">{row.sold_hours.toFixed(1)}h</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Goal (95%)</span>
                        <span className="text-teal-400 tabular-nums font-medium">{row.goal_hours.toFixed(1)}h</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Actual</span>
                        <span className={`tabular-nums font-semibold ${phaseOver ? 'text-red-400' : phaseOverGoal ? 'text-amber-400' : 'text-white'}`}>
                          {row.actual_hours.toFixed(1)}h
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Remaining</span>
                        <span className={`tabular-nums ${phaseOverGoal ? 'text-amber-400' : 'text-blue-300'}`}>
                          {phaseOverGoal
                            ? `+${(row.actual_hours - row.goal_hours).toFixed(1)}h over`
                            : `${row.remaining_hours.toFixed(1)}h left`
                          }
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {laborBreakdown.length > 1 && (
                <div className="px-4 py-3 bg-gray-800/40 space-y-1">
                  <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Total</div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Sold</span>
                      <span className="text-gray-400 tabular-nums font-medium">{totalSoldHours.toFixed(1)}h</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Goal</span>
                      <span className="text-teal-400 tabular-nums font-bold">{goalHours.toFixed(1)}h</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Actual</span>
                      <span className={`tabular-nums font-bold ${overSold ? 'text-red-400' : overGoal ? 'text-amber-400' : 'text-white'}`}>
                        {totalActualHours.toFixed(1)}h
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Remaining</span>
                      <span className={`tabular-nums font-medium ${overGoal ? 'text-amber-400' : 'text-blue-300'}`}>
                        {overGoal
                          ? `+${(totalActualHours - goalHours).toFixed(1)}h over`
                          : `${remainingHours.toFixed(1)}h left`
                        }
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {/* Desktop table view */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700/60">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Phase</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Sold</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-teal-600 uppercase tracking-wider">Goal (95%)</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Actual</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Remaining</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/40">
                  {laborBreakdown.map((row, i) => {
                    const phaseOver = row.actual_hours > row.sold_hours;
                    const phaseOverGoal = row.actual_hours > row.goal_hours;
                    const isUnassigned = row.phase_id === null;
                    const hasSources = isUnassigned && (row.unassigned_sources?.length ?? 0) > 0;
                    return (
                      <>
                        <tr
                          key={i}
                          className="transition-colors hover:bg-gray-800/30"
                        >
                          <td className="px-4 py-3 font-medium">
                            <div className="flex items-center gap-2">
                              {isUnassigned ? (
                                <span className="text-amber-400">{row.phase_name}</span>
                              ) : (
                                <span className="text-gray-200">{row.phase_name}</span>
                              )}
                              {hasSources && (
                                <span className="flex items-center gap-1 text-xs text-amber-500 bg-amber-900/20 border border-amber-700/40 rounded px-1.5 py-0.5">
                                  <Search className="w-3 h-3" />
                                  {row.unassigned_sources!.length} source{row.unassigned_sources!.length !== 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-400 tabular-nums">{row.sold_hours.toFixed(1)}h</td>
                          <td className="px-4 py-3 text-right text-teal-400 tabular-nums font-medium">{row.goal_hours.toFixed(1)}h</td>
                          <td className={`px-4 py-3 text-right tabular-nums font-semibold ${phaseOver ? 'text-red-400' : phaseOverGoal ? 'text-amber-400' : 'text-white'}`}>
                            {row.actual_hours.toFixed(1)}h
                          </td>
                          <td className={`px-4 py-3 text-right tabular-nums text-xs ${phaseOverGoal ? 'text-amber-400' : 'text-blue-300'}`}>
                            {phaseOverGoal
                              ? `+${(row.actual_hours - row.goal_hours).toFixed(1)}h over`
                              : `${row.remaining_hours.toFixed(1)}h left`
                            }
                          </td>
                        </tr>
                        {/* Unassigned drill-down panel — always visible when sources exist */}
                        {isUnassigned && hasSources && (
                          <tr key={`${i}-drilldown`}>
                            <td colSpan={5} className="px-0 py-0 bg-amber-950/20 border-t border-amber-800/30">
                              <div className="px-4 py-3 space-y-2">
                                <p className="text-xs text-amber-400 font-semibold uppercase tracking-wider">
                                  Unassigned Hours — Sources ({row.unassigned_sources!.length})
                                </p>
                                <p className="text-xs text-gray-500 -mt-1">
                                  These are actual clocked hours with no phase assigned. Select a phase to reassign them.
                                </p>
                                {row.unassigned_sources!.map(src => (
                                  <div key={src.id} className="flex items-center gap-3 bg-gray-900/60 rounded-lg px-3 py-2.5 border border-gray-700/50">
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm text-white font-medium truncate">{src.label}</div>
                                      <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${src.type === 'work_order' ? 'bg-blue-900/40 text-blue-400' : 'bg-gray-800 text-gray-400'}`}>
                                          {src.type === 'work_order' ? 'Work Order' : 'Project Time'}
                                        </span>
                                        {src.date && <span>{src.date}</span>}
                                        <span className="text-amber-400 tabular-nums font-semibold">{src.hours.toFixed(1)}h</span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <select
                                        value=""
                                        disabled={assigningPhaseId === src.id}
                                        onChange={e => { if (e.target.value) assignPhaseToSource(src, e.target.value); }}
                                        className="bg-gray-800 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors min-w-[130px] disabled:opacity-50"
                                      >
                                        <option value="">Assign phase...</option>
                                        {laborPhases.map(p => (
                                          <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                      </select>
                                      {assigningPhaseId === src.id && (
                                        <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
                {laborBreakdown.length > 1 && (
                  <tfoot>
                    <tr className="border-t border-gray-600/60 bg-gray-800/40">
                      <td className="px-4 py-3 text-gray-400 text-xs font-semibold uppercase tracking-wider">Total</td>
                      <td className="px-4 py-3 text-right text-gray-400 tabular-nums font-medium">{totalSoldHours.toFixed(1)}h</td>
                      <td className="px-4 py-3 text-right text-teal-400 tabular-nums font-bold">{goalHours.toFixed(1)}h</td>
                      <td className={`px-4 py-3 text-right tabular-nums font-bold ${overSold ? 'text-red-400' : overGoal ? 'text-amber-400' : 'text-white'}`}>
                        {totalActualHours.toFixed(1)}h
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums text-xs font-medium ${overGoal ? 'text-amber-400' : 'text-blue-300'}`}>
                        {overGoal
                          ? `+${(totalActualHours - goalHours).toFixed(1)}h over`
                          : `${remainingHours.toFixed(1)}h left`
                        }
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
          <p className="text-xs text-gray-600 mt-2 flex items-center gap-1.5">
            <Info className="w-3 h-3" />
            Goal = 95% of sold hours. The remaining 5% is reserved for "Project Management" phase time.
          </p>
        </div>
      )}

      {/* Work Orders */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Work Orders</h3>
            <span className="text-xs text-gray-600">{completedWOs} of {workOrders.length} completed · {inProgressWOs} in progress</span>
          </div>
          <button
            onClick={() => setShowCreateWO(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Work Order
          </button>
        </div>
        {workOrders.length === 0 ? (
          <div className="bg-gray-900/40 rounded-xl border border-gray-700/40 border-dashed p-10 text-center">
            <Wrench className="w-10 h-10 text-gray-700 mx-auto mb-3" />
            <p className="text-gray-400 text-sm font-medium">No work orders yet</p>
            <p className="text-gray-500 text-xs mt-1">Create the first work order to begin production.</p>
            <button
              onClick={() => setShowCreateWO(true)}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Work Order
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleWOs.map(wo => (
              <WorkOrderCard key={wo.id} wo={wo} soldHours={soldLaborHours} />
            ))}
            {workOrders.length > 5 && (
              <button
                onClick={() => setShowAllWOs(!showAllWOs)}
                className="flex items-center gap-2 mx-auto text-sm text-gray-400 hover:text-white transition-colors py-2"
              >
                {showAllWOs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {showAllWOs ? 'Show Less' : `Show All ${workOrders.length} Work Orders`}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Parts Added On-Site */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Parts Added On-Site</h3>
            {partsUsed.length > 0 && (
              <span className="text-xs text-gray-600">{partsUsed.length} item{partsUsed.length !== 1 ? 's' : ''} · ${totalPartsValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            )}
            {pendingParts.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-900/40 text-amber-300 border border-amber-600/40">
                <AlertCircle className="w-3 h-3" />
                {pendingParts.length} need decision
              </span>
            )}
            {billedParts.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-900/30 text-green-400 border border-green-600/30">
                <DollarSign className="w-3 h-3" />
                {billedParts.length} billed
              </span>
            )}
            {absorbedParts.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-800 text-gray-500 border border-gray-700">
                <ShieldOff className="w-3 h-3" />
                {absorbedParts.length} absorbed
              </span>
            )}
          </div>
        </div>
        {partsUsed.length === 0 ? (
          <div className="bg-gray-900/40 rounded-xl border border-gray-700/40 border-dashed p-6 text-center">
            <Package className="w-8 h-8 text-gray-700 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">No parts added outside of the sales order</p>
            <p className="text-gray-600 text-xs mt-1">Parts logged by techs on work orders will appear here for billing decisions</p>
          </div>
        ) : (
          <div className="bg-gray-900/50 rounded-xl border border-gray-700/50 overflow-hidden">
            {/* Mobile card view */}
            <div className="md:hidden divide-y divide-gray-700/40">
              {visibleParts.map(p => (
                <div key={p.id} className={`px-4 py-3 space-y-2 ${p.billing_status === 'absorbed' ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-gray-200 font-medium text-sm truncate">{p.part_name}</div>
                      {p.part_sku && <div className="text-xs text-gray-500 font-mono">{p.part_sku}</div>}
                      {p.notes && <div className="text-xs text-gray-500 italic mt-0.5">{p.notes}</div>}
                      {p.billing_status === 'absorbed' && p.absorbed_reason && (
                        <div className="text-xs text-gray-600 mt-0.5">Absorbed: {p.absorbed_reason}</div>
                      )}
                    </div>
                    <div className="shrink-0">
                      {p.billing_status === 'pending' && (
                        <button
                          onClick={() => openPartAction(p)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition-colors"
                        >
                          <AlertCircle className="w-3 h-3" />
                          Decide
                        </button>
                      )}
                      {p.billing_status === 'billed' && (
                        <div className="flex flex-col items-end gap-1">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-green-900/30 text-green-400 border border-green-600/30">
                            <DollarSign className="w-3 h-3" />
                            Billed
                          </span>
                          <button onClick={() => revertPartStatus(p)} className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors">undo</button>
                        </div>
                      )}
                      {p.billing_status === 'absorbed' && (
                        <div className="flex flex-col items-end gap-1">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-800 text-gray-500 border border-gray-700">
                            <ShieldOff className="w-3 h-3" />
                            Absorbed
                          </span>
                          <button onClick={() => revertPartStatus(p)} className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors">undo</button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <div className="text-gray-500 mb-0.5">Work Order</div>
                      <div className="text-gray-400 font-mono">{p.work_order_number}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 mb-0.5">Qty / Cost</div>
                      <div className="text-gray-300 tabular-nums">
                        {p.quantity} &times; {p.unit_cost != null && p.unit_cost > 0
                          ? `$${Number(p.unit_cost).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                          : p.unit_price != null ? `$${Number(p.unit_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500 mb-0.5">Total</div>
                      <div className="text-white tabular-nums font-medium">
                        {p.total_price != null ? `$${Number(p.total_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {partsUsed.length > 1 && (
                <div className="px-4 py-3 bg-gray-800/40 flex justify-between items-center text-xs">
                  <span className="text-gray-400 font-semibold uppercase tracking-wider">Total</span>
                  <span className="text-white tabular-nums font-bold">
                    ${totalPartsValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>
            {/* Desktop table view */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700/60">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Part</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Work Order</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Qty</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Cost</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Billing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/40">
                  {visibleParts.map(p => (
                    <tr key={p.id} className={`transition-colors ${p.billing_status === 'absorbed' ? 'opacity-60' : 'hover:bg-gray-800/30'}`}>
                      <td className="px-4 py-3">
                        <div className="text-gray-200 font-medium text-sm">{p.part_name}</div>
                        {p.part_sku && <div className="text-xs text-gray-500 font-mono">{p.part_sku}</div>}
                        {p.notes && <div className="text-xs text-gray-500 italic mt-0.5">{p.notes}</div>}
                        {p.billing_status === 'absorbed' && p.absorbed_reason && (
                          <div className="text-xs text-gray-600 mt-0.5">Absorbed: {p.absorbed_reason}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400 font-mono">{p.work_order_number}</td>
                      <td className="px-4 py-3 text-right text-gray-300 tabular-nums">{p.quantity}</td>
                      <td className="px-4 py-3 text-right text-gray-400 tabular-nums text-xs">
                        {p.unit_cost != null && p.unit_cost > 0
                          ? `$${Number(p.unit_cost).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                          : p.unit_price != null ? `$${Number(p.unit_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-white tabular-nums font-medium">
                        {p.total_price != null ? `$${Number(p.total_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {p.billing_status === 'pending' && (
                          <button
                            onClick={() => openPartAction(p)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition-colors"
                          >
                            <AlertCircle className="w-3 h-3" />
                            Decide
                          </button>
                        )}
                        {p.billing_status === 'billed' && (
                          <div className="flex flex-col items-center gap-1">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-green-900/30 text-green-400 border border-green-600/30">
                              <DollarSign className="w-3 h-3" />
                              Billed
                            </span>
                            <button
                              onClick={() => revertPartStatus(p)}
                              className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
                            >
                              undo
                            </button>
                          </div>
                        )}
                        {p.billing_status === 'absorbed' && (
                          <div className="flex flex-col items-center gap-1">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-800 text-gray-500 border border-gray-700">
                              <ShieldOff className="w-3 h-3" />
                              Absorbed
                            </span>
                            <button
                              onClick={() => revertPartStatus(p)}
                              className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
                            >
                              undo
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {partsUsed.length > 1 && (
                  <tfoot>
                    <tr className="border-t border-gray-600/60 bg-gray-800/40">
                      <td colSpan={4} className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Total</td>
                      <td className="px-4 py-3 text-right text-white tabular-nums font-bold">
                        ${totalPartsValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {partsUsed.length > 6 && (
              <div className="px-4 py-3 border-t border-gray-700/40">
                <button
                  onClick={() => setShowAllParts(!showAllParts)}
                  className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  {showAllParts ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  {showAllParts ? 'Show Less' : `Show All ${partsUsed.length} Parts`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Project Task Checklist */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Task Checklist</h3>
            {tasks.length > 0 && (
              <span className="text-xs text-gray-600">{completedTasks} of {tasks.length} completed</span>
            )}
          </div>
          {!showAddTask && (
            <button
              onClick={() => setShowAddTask(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Task
            </button>
          )}
        </div>

        {tasks.length === 0 && !showAddTask ? (
          <div className="bg-gray-900/40 rounded-xl border border-gray-700/40 border-dashed p-8 text-center">
            <ListChecks className="w-9 h-9 text-gray-700 mx-auto mb-2" />
            <p className="text-gray-400 text-sm font-medium">No tasks yet</p>
            <p className="text-gray-500 text-xs mt-1">Add checklist tasks to track installation milestones. Labor costs are already included in the sales order — add a change order if extra work arises.</p>
            <button
              onClick={() => setShowAddTask(true)}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add First Task
            </button>
          </div>
        ) : (
          <div className="bg-gray-900/50 rounded-xl border border-gray-700/50 divide-y divide-gray-700/50 overflow-hidden">
            {tasks.map(task => (
              <div key={task.id}>
                {editingTaskId === task.id ? (
                  <div className="px-4 py-3 bg-gray-800/40">
                    <input
                      type="text"
                      value={editTaskTitle}
                      onChange={e => setEditTaskTitle(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                      placeholder="Task title"
                      autoFocus
                    />
                    <input
                      type="text"
                      value={editTaskDescription}
                      onChange={e => setEditTaskDescription(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
                      placeholder="Description (optional)"
                    />
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => setEditingTaskId(null)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-white border border-gray-600 rounded-lg transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                        Cancel
                      </button>
                      <button
                        onClick={() => saveEditTask(task.id)}
                        disabled={savingTask || !editTaskTitle.trim()}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors"
                      >
                        {savingTask
                          ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          : <Save className="w-3.5 h-3.5" />
                        }
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-800/30 transition-colors group">
                    <button
                      onClick={() => toggleTaskStatus(task)}
                      disabled={togglingTask === task.id}
                      className="shrink-0 transition-transform active:scale-90"
                      title={task.status === 'completed' ? 'Mark incomplete — task will reappear on work orders' : 'Mark complete'}
                    >
                      {togglingTask === task.id ? (
                        <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                      ) : task.status === 'completed' ? (
                        <CheckCircle className="w-5 h-5 text-green-400" />
                      ) : (
                        <Circle className="w-5 h-5 text-gray-600 group-hover:text-gray-400 transition-colors" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-medium ${task.status === 'completed' ? 'text-gray-500 line-through' : 'text-white'}`}>
                          {task.title}
                        </span>
                        {task.labor_phase?.name && (
                          <span className="px-1.5 py-0.5 bg-gray-800 text-gray-400 rounded text-xs border border-gray-700">{task.labor_phase.name}</span>
                        )}
                      </div>
                      {task.description && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{task.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => {
                          setEditingTaskId(task.id);
                          setEditTaskTitle(task.title);
                          setEditTaskDescription(task.description || '');
                        }}
                        className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-gray-700 rounded-lg transition-colors"
                        title="Edit task"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => deleteTask(task.id)}
                        disabled={deletingTaskId === task.id}
                        className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-700 rounded-lg transition-colors"
                        title="Delete task"
                      >
                        {deletingTaskId === task.id
                          ? <div className="w-3.5 h-3.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />
                        }
                      </button>
                    </div>
                    {task.estimated_hours > 0 && (
                      <div className="text-right text-xs shrink-0 tabular-nums text-gray-500">
                        {task.estimated_hours.toFixed(1)}h est.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Add Task Inline Form */}
            {showAddTask && (
              <div className="px-4 py-3 bg-gray-800/40">
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addTask(); if (e.key === 'Escape') { setShowAddTask(false); setNewTaskTitle(''); setNewTaskDescription(''); } }}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                  placeholder="Task title (no labor cost — sold hours already included)"
                  autoFocus
                />
                <input
                  type="text"
                  value={newTaskDescription}
                  onChange={e => setNewTaskDescription(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
                  placeholder="Description (optional)"
                />
                <div className="flex items-center gap-2 justify-end">
                  <button
                    onClick={() => { setShowAddTask(false); setNewTaskTitle(''); setNewTaskDescription(''); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-white border border-gray-600 rounded-lg transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                    Cancel
                  </button>
                  <button
                    onClick={addTask}
                    disabled={savingTask || !newTaskTitle.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors"
                  >
                    {savingTask
                      ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <Plus className="w-3.5 h-3.5" />
                    }
                    Add Task
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Work Order Notes */}
      {workOrders.some(w => w.notes || w.description) && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Work Order Notes</h3>
          <div className="space-y-2">
            {workOrders
              .filter(w => w.notes || w.description)
              .map(wo => (
                <div key={wo.id} className="bg-gray-900/50 rounded-xl border border-gray-700/50 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <StickyNote className="w-3.5 h-3.5 text-gray-600" />
                    <span className="text-xs font-mono text-gray-500">{wo.work_order_number}</span>
                    <span className="text-xs text-gray-500">—</span>
                    <span className="text-xs text-gray-400 font-medium truncate">{wo.title}</span>
                  </div>
                  {wo.description && (
                    <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed mb-2">{wo.description}</p>
                  )}
                  {wo.notes && wo.notes !== wo.description && (
                    <p className="text-sm text-gray-400 whitespace-pre-wrap leading-relaxed">{wo.notes}</p>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Project Notes */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Project Notes</h3>
          {!editingNotes && (
            <button
              onClick={() => { setNotesValue(project.notes || ''); setEditingNotes(true); }}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit Notes
            </button>
          )}
        </div>
        <div className="bg-gray-900/50 rounded-xl border border-gray-700/50 p-4">
          {editingNotes ? (
            <div className="space-y-3">
              <textarea
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                rows={5}
                placeholder="Add project notes visible to the team..."
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={() => setEditingNotes(false)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-white border border-gray-600 rounded-lg transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancel
                </button>
                <button
                  onClick={saveNotes}
                  disabled={savingNotes}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  {savingNotes
                    ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Save className="w-3.5 h-3.5" />
                  }
                  Save Notes
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed min-h-[2rem]">
              {project.notes
                ? project.notes
                : <span className="text-gray-500 italic">No notes added yet. Click Edit Notes to add some.</span>
              }
            </p>
          )}
        </div>
      </div>

      {/* Part Billing Action Modal */}
      {partActionModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between p-5 border-b border-gray-700">
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-white">Part Billing Decision</h3>
                <p className="text-sm text-gray-400 mt-0.5 truncate">{partActionModal.part_name}</p>
                <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                  <span>Qty: <span className="text-gray-300">{partActionModal.quantity}</span></span>
                  {partActionModal.total_price != null && (
                    <span>Total: <span className="text-white font-semibold">${Number(partActionModal.total_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></span>
                  )}
                  <span className="font-mono">{partActionModal.work_order_number}</span>
                </div>
              </div>
              <button onClick={closePartAction} className="text-gray-500 hover:text-white transition-colors ml-3">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5">
              {partActionMode === 'saving' && (
                <div className="flex items-center justify-center py-8 gap-3 text-gray-400">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm">Saving...</span>
                </div>
              )}

              {partActionMode === 'choose' && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-400 mb-4">How would you like to handle this part? Parts can either be billed to the customer via a change order, or absorbed as a project cost.</p>
                  <button
                    onClick={() => { setPartActionMode('bill_new'); }}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-700 hover:border-green-600/50 bg-gray-800/50 hover:bg-green-900/10 transition-all group text-left"
                  >
                    <div className="w-10 h-10 rounded-xl bg-green-900/30 border border-green-600/30 flex items-center justify-center shrink-0 group-hover:bg-green-900/50 transition-colors">
                      <DollarSign className="w-5 h-5 text-green-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white">Bill — New Change Order</p>
                      <p className="text-xs text-gray-500 mt-0.5">Create a new draft change order with this part pre-loaded</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-green-400 transition-colors" />
                  </button>

                  <button
                    onClick={() => { setPartActionMode('bill_existing'); loadOpenChangeOrders(); }}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-700 hover:border-blue-600/50 bg-gray-800/50 hover:bg-blue-900/10 transition-all group text-left"
                  >
                    <div className="w-10 h-10 rounded-xl bg-blue-900/30 border border-blue-600/30 flex items-center justify-center shrink-0 group-hover:bg-blue-900/50 transition-colors">
                      <GitMerge className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white">Bill — Add to Existing CO</p>
                      <p className="text-xs text-gray-500 mt-0.5">Add this part as a line item to an open change order</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-blue-400 transition-colors" />
                  </button>

                  <button
                    onClick={() => setPartActionMode('absorb')}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-700 hover:border-gray-500 bg-gray-800/50 hover:bg-gray-800 transition-all group text-left"
                  >
                    <div className="w-10 h-10 rounded-xl bg-gray-800 border border-gray-600 flex items-center justify-center shrink-0 group-hover:bg-gray-700 transition-colors">
                      <ShieldOff className="w-5 h-5 text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white">Absorb — Do Not Bill</p>
                      <p className="text-xs text-gray-500 mt-0.5">Track the cost internally — this will affect project profitability</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 transition-colors" />
                  </button>
                </div>
              )}

              {partActionMode === 'bill_new' && (
                <div className="space-y-4">
                  <button onClick={() => setPartActionMode('choose')} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors">
                    <ChevronDown className="w-3 h-3 rotate-90" /> Back
                  </button>
                  <div className="bg-green-900/10 border border-green-600/20 rounded-xl p-4">
                    <p className="text-sm text-green-300 font-medium mb-1">A new draft change order will be created</p>
                    <p className="text-xs text-green-200/60">You can edit the change order details, add more line items, and submit it for approval from the Change Orders tab.</p>
                  </div>
                  <div className="bg-gray-800 rounded-xl p-3 text-xs text-gray-400 space-y-1">
                    <div className="flex justify-between"><span>Part:</span><span className="text-white font-medium">{partActionModal.part_name}</span></div>
                    <div className="flex justify-between"><span>Qty:</span><span className="text-white">{partActionModal.quantity}</span></div>
                    <div className="flex justify-between"><span>Unit price:</span><span className="text-white">${Number(partActionModal.unit_price || partActionModal.unit_cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                    <div className="flex justify-between border-t border-gray-700 pt-1 mt-1"><span>Change amount:</span><span className="text-green-400 font-semibold">${Number(partActionModal.total_price || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                  </div>
                  <button
                    onClick={addPartToNewCO}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-semibold text-sm transition-colors"
                  >
                    <CheckSquare className="w-4 h-4" />
                    Create Change Order
                  </button>
                </div>
              )}

              {partActionMode === 'bill_existing' && (
                <div className="space-y-4">
                  <button onClick={() => setPartActionMode('choose')} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors">
                    <ChevronDown className="w-3 h-3 rotate-90" /> Back
                  </button>
                  {loadingCOs ? (
                    <div className="flex items-center justify-center py-6 gap-2 text-gray-500 text-sm">
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      Loading change orders...
                    </div>
                  ) : openChangeOrders.length === 0 ? (
                    <div className="bg-gray-800 rounded-xl p-5 text-center">
                      <AlertCircle className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                      <p className="text-gray-400 text-sm font-medium">No open change orders</p>
                      <p className="text-gray-500 text-xs mt-1">There are no draft or pending-approval change orders on this sales order.</p>
                      <button
                        onClick={() => setPartActionMode('bill_new')}
                        className="mt-3 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        Create a new one instead
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-gray-400">Select an open change order to add this part to:</p>
                      <div className="space-y-2 max-h-52 overflow-y-auto">
                        {openChangeOrders.map(co => (
                          <label key={co.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${selectedExistingCO === co.id ? 'border-blue-500 bg-blue-900/15' : 'border-gray-700 hover:border-gray-600 bg-gray-800/50'}`}>
                            <input
                              type="radio"
                              name="existing_co"
                              value={co.id}
                              checked={selectedExistingCO === co.id}
                              onChange={() => setSelectedExistingCO(co.id)}
                              className="mt-0.5 accent-blue-500"
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-white">{co.title}</p>
                              <p className="text-xs text-gray-500 font-mono">{co.change_order_number} · {co.status.replace('_', ' ')}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                      <button
                        onClick={addPartToExistingCO}
                        disabled={!selectedExistingCO}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm transition-colors"
                      >
                        <GitMerge className="w-4 h-4" />
                        Add to Change Order
                      </button>
                    </>
                  )}
                </div>
              )}

              {partActionMode === 'absorb' && (
                <div className="space-y-4">
                  <button onClick={() => setPartActionMode('choose')} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors">
                    <ChevronDown className="w-3 h-3 rotate-90" /> Back
                  </button>
                  <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4">
                    <p className="text-sm text-gray-300 font-medium mb-1">Absorb this part as a project cost</p>
                    <p className="text-xs text-gray-500">The cost of this part ({partActionModal.total_price != null ? `$${Number(partActionModal.total_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : 'unknown'}) will count against this project's profitability but will not be billed to the customer.</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-400 block mb-1.5">Reason (optional)</label>
                    <textarea
                      value={absorbReasonText}
                      onChange={e => setAbsorbReasonText(e.target.value)}
                      rows={2}
                      placeholder="e.g. Warranty replacement, our installation error, goodwill gesture..."
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500 resize-none"
                    />
                  </div>
                  <button
                    onClick={absorbPart}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gray-700 hover:bg-gray-600 text-white font-semibold text-sm transition-colors"
                  >
                    <ShieldOff className="w-4 h-4" />
                    Absorb — Do Not Bill
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Work Order Modal */}
      {showCreateWO && project && (
        <CreateProjectWorkOrderModal
          onClose={() => setShowCreateWO(false)}
          onSuccess={() => {
            setShowCreateWO(false);
            loadProjectData();
          }}
          projectId={project.id}
          contactId={order.contact_id}
        />
      )}

      {showAddProjectTime && project && (
        <AddProjectTimeModal
          preselectedProjectId={project.id}
          preselectedProjectName={`${project.project_number || ''} — ${project.name || order.title || ''}`}
          onClose={() => setShowAddProjectTime(false)}
          onSave={() => {
            setShowAddProjectTime(false);
            loadProjectData();
          }}
        />
      )}
    </div>
  );
}

function WorkOrderCard({ wo, soldHours }: { wo: WorkOrder; soldHours: number }) {
  const statusStyles: Record<string, string> = {
    completed: 'bg-green-500/20 text-green-400 border border-green-500/30',
    in_progress: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    assigned: 'bg-teal-500/20 text-teal-400 border border-teal-500/30',
    pending: 'bg-gray-500/20 text-gray-400 border border-gray-600/30',
    on_hold: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
    cancelled: 'bg-red-500/20 text-red-400 border border-red-500/30',
  };
  const priorityDot: Record<string, string> = {
    urgent: 'bg-red-500',
    high: 'bg-amber-500',
    medium: 'bg-blue-500',
    low: 'bg-gray-500',
  };

  const actualH = wo.actual_hours || 0;
  const estH = wo.estimated_hours || 0;
  const goalH = estH * GOAL_PCT;
  const overGoal = actualH > goalH && goalH > 0;
  const overEst = actualH > estH && estH > 0;

  return (
    <div className="bg-gray-900/50 rounded-xl border border-gray-700/50 p-4 hover:border-gray-600 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className="text-xs font-mono text-gray-500">{wo.work_order_number}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusStyles[wo.status] || statusStyles.pending}`}>
              {wo.status.replace(/_/g, ' ')}
            </span>
            <span className="px-2 py-0.5 bg-gray-800 text-gray-400 rounded-full text-xs border border-gray-700 capitalize">{wo.type}</span>
            {wo.priority && (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <span className={`w-1.5 h-1.5 rounded-full inline-block ${priorityDot[wo.priority] || priorityDot.medium}`} />
                {wo.priority === 'urgent' && <AlertTriangle className="w-3 h-3 text-red-400" />}
                <span className="capitalize">{wo.priority}</span>
              </span>
            )}
          </div>
          <h4 className="text-white text-sm font-semibold leading-snug mb-1">{wo.title}</h4>
          <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
            {wo.technician?.full_name && (
              <span className="flex items-center gap-1">
                <User className="w-3 h-3" />
                {wo.technician.full_name}
              </span>
            )}
            {wo.labor_phase?.name && (
              <span className="flex items-center gap-1">
                <Briefcase className="w-3 h-3" />
                {wo.labor_phase.name}
              </span>
            )}
            {wo.start_date && (
              <span className="flex items-center gap-1">
                <CalendarDays className="w-3 h-3" />
                {new Date(wo.start_date + 'T00:00:00').toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-sm font-bold ${overEst ? 'text-red-400' : overGoal ? 'text-amber-400' : 'text-white'}`}>
            {actualH.toFixed(1)}h
          </div>
          {estH > 0 && (
            <>
              <div className="text-xs text-teal-600">goal {(goalH).toFixed(1)}h</div>
              <div className="text-xs text-gray-500">of {estH.toFixed(1)}h est.</div>
            </>
          )}
          {overEst && <div className="text-xs text-red-400 mt-0.5">over estimate</div>}
          {overGoal && !overEst && <div className="text-xs text-amber-400 mt-0.5">over goal</div>}
        </div>
      </div>
    </div>
  );
}

function HoursProgressBar({ soldHours, goalHours, actualHours }: { soldHours: number; goalHours: number; actualHours: number }) {
  const overGoal = actualHours > goalHours;
  const overSold = actualHours > soldHours;

  const pct = goalHours > 0 ? (actualHours / goalHours) * 100 : 0;
  const clampedPct = Math.min(pct, 100);

  let barColor = 'bg-green-500';
  let textColor = 'text-green-400';
  let statusLabel = 'On Track';
  let statusBadgeClass = 'bg-green-500/15 text-green-400 border border-green-500/30';

  if (overSold) {
    barColor = 'bg-red-500';
    textColor = 'text-red-400';
    statusLabel = 'Over Sold Estimate';
    statusBadgeClass = 'bg-red-500/15 text-red-400 border border-red-500/30';
  } else if (overGoal) {
    barColor = 'bg-amber-500';
    textColor = 'text-amber-400';
    statusLabel = 'Over Goal';
    statusBadgeClass = 'bg-amber-500/15 text-amber-400 border border-amber-500/30';
  } else if (pct >= 85) {
    barColor = 'bg-amber-500';
    textColor = 'text-amber-400';
    statusLabel = 'Nearing Goal';
    statusBadgeClass = 'bg-amber-500/15 text-amber-400 border border-amber-500/30';
  }

  const remainingH = overGoal ? 0 : goalHours - actualHours;
  const goalPctOfBar = soldHours > 0 ? (goalHours / soldHours) * 100 : 95;

  return (
    <div className="bg-gray-900/60 rounded-xl border border-gray-700/60 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <Timer className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-semibold text-white">Labor Hours vs. Goal</span>
        </div>
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusBadgeClass}`}>
          {statusLabel}
        </span>
      </div>

      <div className="flex items-end gap-3 mb-4">
        <div className={`text-4xl font-black tabular-nums ${textColor}`}>
          {pct.toFixed(1)}%
        </div>
        <div className="pb-1 text-sm text-gray-400 leading-tight">
          <div className="font-medium text-white">{actualHours.toFixed(1)}h clocked</div>
          <div>of {goalHours.toFixed(1)}h goal ({soldHours.toFixed(1)}h sold)</div>
        </div>
      </div>

      {/* Progress bar with goal marker */}
      <div className="relative mb-2">
        <div className="h-5 bg-gray-800 rounded-full overflow-hidden border border-gray-700/60">
          <div
            className={`h-full rounded-full transition-all duration-700 ${barColor}`}
            style={{ width: `${clampedPct}%` }}
          />
        </div>
        {/* 95% / goal marker */}
        <div
          className="absolute top-0 h-5 flex flex-col items-center"
          style={{ left: `${Math.min(goalPctOfBar, 100)}%`, transform: 'translateX(-50%)' }}
        >
          <div className="w-0.5 h-5 bg-teal-500/60" />
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
        <span>0h</span>
        <span className="flex items-center gap-1 text-teal-600">
          <Target className="w-3 h-3" />
          {goalHours.toFixed(1)}h goal (95%)
        </span>
        <span className="flex items-center gap-1">
          <Flag className="w-3 h-3" />
          {soldHours.toFixed(1)}h sold
        </span>
      </div>

      <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-700/50">
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800/60 rounded-lg border border-gray-700/50 text-xs text-gray-300">
          <Clock className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-white font-medium">{actualHours.toFixed(1)}h</span>
          <span className="text-gray-500">clocked</span>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800/60 rounded-lg border border-teal-700/40 text-xs text-gray-300">
          <Target className="w-3.5 h-3.5 text-teal-600" />
          <span className="text-teal-400 font-medium">{goalHours.toFixed(1)}h</span>
          <span className="text-gray-500">goal</span>
        </div>
        {!overGoal ? (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800/60 rounded-lg border border-gray-700/50 text-xs text-gray-300">
            <ListChecks className="w-3.5 h-3.5 text-gray-500" />
            <span className="text-white font-medium">{remainingH.toFixed(1)}h</span>
            <span className="text-gray-500">remaining</span>
          </div>
        ) : (
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium ${statusBadgeClass}`}>
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>{(actualHours - goalHours).toFixed(1)}h over goal</span>
          </div>
        )}
      </div>
    </div>
  );
}

function HourStat({ icon: Icon, label, value, sub, color }: {
  icon: typeof Clock; label: string; value: string; sub?: string; color?: string;
}) {
  const valColor = color === 'green' ? 'text-green-400'
    : color === 'amber' ? 'text-amber-400'
    : color === 'blue' ? 'text-blue-400'
    : color === 'teal' ? 'text-teal-400'
    : color === 'red' ? 'text-red-400'
    : 'text-white';
  const iconColor = color === 'green' ? 'text-green-600'
    : color === 'amber' ? 'text-amber-600'
    : color === 'blue' ? 'text-blue-600'
    : color === 'teal' ? 'text-teal-600'
    : color === 'red' ? 'text-red-600'
    : 'text-gray-600';
  return (
    <div className="bg-gray-900/50 rounded-xl border border-gray-700/50 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${iconColor}`} />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className={`text-xl font-bold ${valColor} tabular-nums`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}
