import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import {
  X, Users, Calendar, ChevronDown, ChevronUp, Plus, Trash2,
  CheckSquare, Square, ListChecks, Layers, ChevronsUpDown
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { AvailabilityBrowserModal } from '../Shared/AvailabilityBrowserModal';

interface CreateProjectWorkOrderModalProps {
  onClose: () => void;
  onSuccess: () => void;
  projectId: string;
  contactId: string | null;
}

interface Technician {
  id: string;
  full_name: string;
}

interface LaborPhase {
  id: string;
  name: string;
}

interface ProjectTask {
  id: string;
  title: string;
  description: string | null;
  estimated_hours: number;
  labor_phase_id: string | null;
  status: string;
}

interface Task {
  id: string;
  title: string;
  description: string;
  estimated_hours: number;
  project_task_id?: string;
  labor_phase_id?: string | null;
  phase_name?: string;
}

type TaskPickerView = 'none' | 'all' | 'by-phase';

export function CreateProjectWorkOrderModal({ onClose, onSuccess, projectId, contactId }: CreateProjectWorkOrderModalProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);

  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [selectedTechnicians, setSelectedTechnicians] = useState<string[]>([]);
  const [showAvailabilityBrowser, setShowAvailabilityBrowser] = useState(false);

  const [laborPhases, setLaborPhases] = useState<LaborPhase[]>([]);
  const [selectedPhaseId, setSelectedPhaseId] = useState('');

  const [allProjectTasks, setAllProjectTasks] = useState<ProjectTask[]>([]);
  const [selectedProjectTaskIds, setSelectedProjectTaskIds] = useState<Set<string>>(new Set());
  const [taskPickerView, setTaskPickerView] = useState<TaskPickerView>('none');
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());

  const [tasks, setTasks] = useState<Task[]>([]);

  const [form, setForm] = useState({
    title: '',
    description: '',
    start_date: '',
    start_time: '',
    end_time: '',
    target_completion_date: '',
    notes: '',
    internal_notes: '',
  });

  useEffect(() => {
    loadTechnicians();
    loadLaborPhases();
  }, []);

  useEffect(() => {
    loadAllProjectTasks();
  }, [projectId]);

  async function loadTechnicians() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('role', ['tech', 'field_tech', 'technician'])
      .eq('is_active', true)
      .order('full_name');
    setTechnicians(data || []);
  }

  async function loadLaborPhases() {
    const { data } = await supabase
      .from('labor_phases')
      .select('id, name')
      .eq('is_active', true)
      .order('sort_order');
    setLaborPhases(data || []);
  }

  async function loadAllProjectTasks() {
    const { data } = await supabase
      .from('project_tasks')
      .select('id, title, description, estimated_hours, labor_phase_id, status')
      .eq('project_id', projectId)
      .neq('status', 'done')
      .order('sort_order');
    setAllProjectTasks(data || []);
  }

  const phaseMap = useMemo(() => {
    const map: Record<string, string> = {};
    laborPhases.forEach(p => { map[p.id] = p.name; });
    return map;
  }, [laborPhases]);

  const tasksByPhase = useMemo(() => {
    const groups: Record<string, { phaseName: string; tasks: ProjectTask[] }> = {};
    allProjectTasks.forEach(t => {
      const key = t.labor_phase_id || '__none__';
      const name = t.labor_phase_id ? (phaseMap[t.labor_phase_id] || 'Unknown Phase') : 'No Phase';
      if (!groups[key]) groups[key] = { phaseName: name, tasks: [] };
      groups[key].tasks.push(t);
    });
    return groups;
  }, [allProjectTasks, phaseMap]);

  // Tasks filtered by selected labor phase
  const phaseFilteredTasks = useMemo(() => {
    if (!selectedPhaseId) return allProjectTasks;
    return allProjectTasks.filter(t => t.labor_phase_id === selectedPhaseId);
  }, [allProjectTasks, selectedPhaseId]);

  const availableCount = phaseFilteredTasks.filter(t => !tasks.some(a => a.project_task_id === t.id)).length;
  const totalAddedHours = tasks.reduce((sum, t) => sum + (t.estimated_hours || 0), 0);

  function toggleTech(id: string) {
    setSelectedTechnicians(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  }

  function toggleProjectTask(id: string) {
    setSelectedProjectTaskIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function togglePhaseAll(phaseKey: string) {
    const phaseTasks = tasksByPhase[phaseKey]?.tasks || [];
    const available = phaseTasks.filter(t => !tasks.some(a => a.project_task_id === t.id));
    const allSelected = available.every(t => selectedProjectTaskIds.has(t.id));
    setSelectedProjectTaskIds(prev => {
      const next = new Set(prev);
      available.forEach(t => allSelected ? next.delete(t.id) : next.add(t.id));
      return next;
    });
  }

  function togglePhaseExpanded(phaseKey: string) {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      next.has(phaseKey) ? next.delete(phaseKey) : next.add(phaseKey);
      return next;
    });
  }

  function addAllTasks() {
    const source = selectedPhaseId ? phaseFilteredTasks : allProjectTasks;
    const toAdd = source
      .filter(pt => !tasks.some(t => t.project_task_id === pt.id))
      .map(pt => ({
        id: crypto.randomUUID(),
        title: pt.title,
        description: pt.description || '',
        estimated_hours: pt.estimated_hours,
        project_task_id: pt.id,
        labor_phase_id: pt.labor_phase_id,
        phase_name: pt.labor_phase_id ? phaseMap[pt.labor_phase_id] : undefined,
      }));
    setTasks(prev => [...prev, ...toAdd]);
    setTaskPickerView('none');
  }

  function addSelectedTasks() {
    const toAdd = allProjectTasks
      .filter(pt => selectedProjectTaskIds.has(pt.id) && !tasks.some(t => t.project_task_id === pt.id))
      .map(pt => ({
        id: crypto.randomUUID(),
        title: pt.title,
        description: pt.description || '',
        estimated_hours: pt.estimated_hours,
        project_task_id: pt.id,
        labor_phase_id: pt.labor_phase_id,
        phase_name: pt.labor_phase_id ? phaseMap[pt.labor_phase_id] : undefined,
      }));
    setTasks(prev => [...prev, ...toAdd]);
    setSelectedProjectTaskIds(new Set());
    setTaskPickerView('none');
  }

  function handleTimeSlotClick(date: string, startTime: string, endTime?: string) {
    const resolvedEnd = endTime ?? (() => {
      const [h, m] = startTime.split(':').map(Number);
      const endH = (h + 1) % 24;
      return `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    })();
    setForm(prev => ({ ...prev, start_date: date, start_time: startTime, end_time: resolvedEnd }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;

    if (!form.title.trim()) {
      alert('Please enter a work order title');
      return;
    }
    if (selectedTechnicians.length === 0) {
      alert('Please select at least one technician');
      return;
    }

    setLoading(true);
    try {
      const groupId = selectedTechnicians.length > 1 ? crypto.randomUUID() : null;

      const workOrdersToCreate = selectedTechnicians.map(techId => ({
        company_id: profile.organization_id,
        contact_id: contactId || null,
        project_id: projectId,
        labor_phase_id: selectedPhaseId || null,
        work_order_group_id: groupId,
        title: form.title,
        description: form.description || null,
        type: 'project',
        billable_type: 'project',
        priority: 'medium',
        status: 'assigned',
        assigned_to: techId,
        start_date: form.start_date || null,
        scheduled_start_time: form.start_time || null,
        scheduled_end_time: form.end_time || null,
        target_completion_date: form.target_completion_date || null,
        notes: form.notes || null,
        internal_notes: form.internal_notes || null,
        created_by: profile.id,
        office_id: profile.primary_office_id || profile.default_office_id || null,
      }));

      const { data: createdWOs, error } = await supabase
        .from('work_orders')
        .insert(workOrdersToCreate)
        .select('id');

      if (error) throw error;

      if (tasks.length > 0 && createdWOs && createdWOs.length > 0) {
        const tasksToCreate = createdWOs.flatMap((wo, idx) =>
          tasks.map((task, taskIdx) => ({
            work_order_id: wo.id,
            title: task.title,
            description: task.description || null,
            estimated_hours: task.estimated_hours,
            assigned_to: selectedTechnicians[idx],
            project_task_id: task.project_task_id || null,
            status: 'pending',
            sort_order: taskIdx,
          }))
        );

        await supabase.from('work_order_tasks').insert(tasksToCreate);
      }

      onSuccess();
    } catch (err: any) {
      console.error('Error creating work order:', err);
      alert(`Failed to create work order: ${err?.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }

  const addedTasksByPhase = useMemo(() => {
    const groups: Record<string, { phaseName: string; tasks: Task[] }> = {};
    tasks.forEach(t => {
      const key = t.labor_phase_id || '__none__';
      const name = t.phase_name || (t.labor_phase_id ? phaseMap[t.labor_phase_id] : undefined) || 'No Phase';
      if (!groups[key]) groups[key] = { phaseName: name, tasks: [] };
      groups[key].tasks.push(t);
    });
    return groups;
  }, [tasks, phaseMap]);

  // Tasks to show in the picker — filtered by selected phase if one is chosen
  const pickerTasks = taskPickerView === 'by-phase' ? allProjectTasks : phaseFilteredTasks;
  const pickerAvailableCount = pickerTasks.filter(t => !tasks.some(a => a.project_task_id === t.id)).length;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">New Work Order</h2>
            <p className="text-xs text-gray-400 mt-0.5">Project work order — customer & project pre-linked</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Title & Description */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
                Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                placeholder="e.g. Install camera system — east wing"
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Description</label>
              <textarea
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Work scope, special instructions..."
                rows={3}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
              />
            </div>
          </div>

          {/* Labor Phase */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Labor Phase</label>
            <select
              value={selectedPhaseId}
              onChange={e => {
                setSelectedPhaseId(e.target.value);
                setTaskPickerView('none');
                setSelectedProjectTaskIds(new Set());
              }}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">— None —</option>
              {laborPhases.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Schedule */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Schedule</label>
              <button
                type="button"
                onClick={() => setShowAvailabilityBrowser(true)}
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-900/30 hover:bg-blue-800/40 border border-blue-700 rounded-lg transition-colors"
              >
                <Calendar className="w-3.5 h-3.5" />
                Browse Availability
              </button>
            </div>

            {showAvailabilityBrowser && (
              <AvailabilityBrowserModal
                initialTechnicianIds={selectedTechnicians}
                onSlotSelected={(date, start, end) => {
                  handleTimeSlotClick(date, start, end);
                }}
                onTechniciansSelected={(techIds) => {
                  setSelectedTechnicians(techIds);
                }}
                onClose={() => setShowAvailabilityBrowser(false)}
              />
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Start Date</label>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Target Completion</label>
                <input
                  type="date"
                  value={form.target_completion_date}
                  onChange={e => setForm(p => ({ ...p, target_completion_date: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              {form.start_date && (
                <>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Start Time</label>
                    <input
                      type="time"
                      step="1800"
                      value={form.start_time}
                      onChange={e => setForm(p => ({ ...p, start_time: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">End Time</label>
                    <input
                      type="time"
                      step="1800"
                      value={form.end_time}
                      onChange={e => setForm(p => ({ ...p, end_time: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Technicians */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Technician(s) <span className="text-red-400">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {technicians.map(tech => {
                const selected = selectedTechnicians.includes(tech.id);
                return (
                  <button
                    key={tech.id}
                    type="button"
                    onClick={() => toggleTech(tech.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                      selected
                        ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                        : 'bg-gray-800 border-gray-600 text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    <Users className={`w-3.5 h-3.5 flex-shrink-0 ${selected ? 'text-blue-400' : 'text-gray-500'}`} />
                    <span className="truncate">{tech.full_name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tasks Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">Tasks</label>
                {tasks.length > 0 && (
                  <span className="px-2 py-0.5 bg-teal-500/20 text-teal-400 text-xs rounded-full font-medium">
                    {tasks.length} added{totalAddedHours > 0 ? ` · ${totalAddedHours}h` : ''}
                  </span>
                )}
                {selectedPhaseId && (
                  <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-xs rounded-full">
                    filtered by phase
                  </span>
                )}
              </div>
              {phaseFilteredTasks.length > 0 && (
                <span className="text-xs text-gray-500">
                  {pickerAvailableCount} available
                </span>
              )}
            </div>

            {/* Phase-filtered task list — shown inline when a phase is selected */}
            {selectedPhaseId && phaseFilteredTasks.length > 0 && taskPickerView === 'none' && (
              <div className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
                  <span className="text-xs font-medium text-gray-300">
                    {phaseMap[selectedPhaseId]} tasks
                  </span>
                  <button
                    type="button"
                    onClick={addAllTasks}
                    disabled={pickerAvailableCount === 0}
                    className="flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ListChecks className="w-3.5 h-3.5" />
                    Add All
                  </button>
                </div>
                <div className="max-h-52 overflow-y-auto">
                  {phaseFilteredTasks.map(pt => {
                    const alreadyAdded = tasks.some(t => t.project_task_id === pt.id);
                    const selected = selectedProjectTaskIds.has(pt.id);
                    return (
                      <button
                        key={pt.id}
                        type="button"
                        disabled={alreadyAdded}
                        onClick={() => toggleProjectTask(pt.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors border-b border-gray-700/50 last:border-0 ${
                          alreadyAdded
                            ? 'opacity-40 cursor-not-allowed'
                            : selected
                            ? 'bg-blue-600/15 text-blue-200'
                            : 'hover:bg-gray-700/60 text-gray-300'
                        }`}
                      >
                        {alreadyAdded
                          ? <CheckSquare className="w-3.5 h-3.5 text-teal-500 flex-shrink-0" />
                          : selected
                          ? <CheckSquare className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                          : <Square className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                        }
                        <span className="flex-1 truncate">{pt.title}</span>
                        {pt.estimated_hours > 0 && (
                          <span className="text-xs text-gray-500 flex-shrink-0">{pt.estimated_hours}h</span>
                        )}
                        {alreadyAdded && <span className="text-xs text-teal-500 flex-shrink-0">added</span>}
                      </button>
                    );
                  })}
                </div>
                {selectedProjectTaskIds.size > 0 && (
                  <div className="px-3 py-2.5 border-t border-gray-700">
                    <button
                      type="button"
                      onClick={addSelectedTasks}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Add {selectedProjectTaskIds.size} task{selectedProjectTaskIds.size !== 1 ? 's' : ''}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Quick-action buttons when no phase selected */}
            {!selectedPhaseId && allProjectTasks.length > 0 && taskPickerView === 'none' && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={addAllTasks}
                  disabled={availableCount === 0}
                  className="flex items-center gap-1.5 px-3 py-2 bg-teal-600/20 hover:bg-teal-600/30 border border-teal-600/40 text-teal-300 rounded-lg text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ListChecks className="w-3.5 h-3.5" />
                  Add All ({availableCount})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTaskPickerView('by-phase');
                    setExpandedPhases(new Set(Object.keys(tasksByPhase)));
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-600/40 text-blue-300 rounded-lg text-xs font-medium transition-all"
                >
                  <Layers className="w-3.5 h-3.5" />
                  Add by Phase
                </button>
                <button
                  type="button"
                  onClick={() => setTaskPickerView('all')}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-300 rounded-lg text-xs font-medium transition-all"
                >
                  <ChevronsUpDown className="w-3.5 h-3.5" />
                  Pick Tasks
                </button>
              </div>
            )}

            {/* Flat task picker */}
            {taskPickerView === 'all' && (
              <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
                  <span className="text-xs font-medium text-gray-300">Select tasks to add</span>
                  <button type="button" onClick={() => { setTaskPickerView('none'); setSelectedProjectTaskIds(new Set()); }} className="text-gray-500 hover:text-gray-300 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="max-h-52 overflow-y-auto">
                  {allProjectTasks.map(pt => {
                    const alreadyAdded = tasks.some(t => t.project_task_id === pt.id);
                    const selected = selectedProjectTaskIds.has(pt.id);
                    const phaseName = pt.labor_phase_id ? phaseMap[pt.labor_phase_id] : null;
                    return (
                      <button
                        key={pt.id}
                        type="button"
                        disabled={alreadyAdded}
                        onClick={() => toggleProjectTask(pt.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors border-b border-gray-700/50 last:border-0 ${
                          alreadyAdded
                            ? 'opacity-40 cursor-not-allowed'
                            : selected
                            ? 'bg-blue-600/15 text-blue-200'
                            : 'hover:bg-gray-700/60 text-gray-300'
                        }`}
                      >
                        {alreadyAdded
                          ? <CheckSquare className="w-3.5 h-3.5 text-teal-500 flex-shrink-0" />
                          : selected
                          ? <CheckSquare className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                          : <Square className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                        }
                        <span className="flex-1 truncate">{pt.title}</span>
                        {phaseName && (
                          <span className="text-xs text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded flex-shrink-0">{phaseName}</span>
                        )}
                        {pt.estimated_hours > 0 && (
                          <span className="text-xs text-gray-500 flex-shrink-0">{pt.estimated_hours}h</span>
                        )}
                        {alreadyAdded && <span className="text-xs text-teal-500 flex-shrink-0">added</span>}
                      </button>
                    );
                  })}
                </div>
                {selectedProjectTaskIds.size > 0 && (
                  <div className="px-3 py-2.5 border-t border-gray-700 bg-gray-800/80">
                    <button
                      type="button"
                      onClick={addSelectedTasks}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Add {selectedProjectTaskIds.size} task{selectedProjectTaskIds.size !== 1 ? 's' : ''}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Phase-grouped picker */}
            {taskPickerView === 'by-phase' && (
              <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
                  <span className="text-xs font-medium text-gray-300">Select tasks by phase</span>
                  <button type="button" onClick={() => { setTaskPickerView('none'); setSelectedProjectTaskIds(new Set()); }} className="text-gray-500 hover:text-gray-300 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {Object.entries(tasksByPhase).map(([phaseKey, { phaseName, tasks: phaseTasks }]) => {
                    const available = phaseTasks.filter(t => !tasks.some(a => a.project_task_id === t.id));
                    const allSelected = available.length > 0 && available.every(t => selectedProjectTaskIds.has(t.id));
                    const someSelected = available.some(t => selectedProjectTaskIds.has(t.id));
                    const isExpanded = expandedPhases.has(phaseKey);
                    const phaseHours = phaseTasks.reduce((s, t) => s + (t.estimated_hours || 0), 0);

                    return (
                      <div key={phaseKey} className="border-b border-gray-700/60 last:border-0">
                        <div className="flex items-center gap-2 px-3 py-2.5 hover:bg-gray-700/40 transition-colors">
                          <button
                            type="button"
                            onClick={() => available.length > 0 && togglePhaseAll(phaseKey)}
                            disabled={available.length === 0}
                            className="flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {allSelected
                              ? <CheckSquare className="w-4 h-4 text-blue-400" />
                              : someSelected
                              ? <CheckSquare className="w-4 h-4 text-blue-400/50" />
                              : <Square className="w-4 h-4 text-gray-500" />
                            }
                          </button>
                          <button
                            type="button"
                            onClick={() => togglePhaseExpanded(phaseKey)}
                            className="flex-1 flex items-center gap-2 text-left"
                          >
                            <span className="text-sm font-semibold text-gray-200">{phaseName}</span>
                            <span className="text-xs text-gray-500">{phaseTasks.length} task{phaseTasks.length !== 1 ? 's' : ''}</span>
                            {phaseHours > 0 && <span className="text-xs text-gray-500">· {phaseHours}h</span>}
                            {available.length === 0 && <span className="text-xs text-teal-500 ml-auto mr-1">all added</span>}
                          </button>
                          <button type="button" onClick={() => togglePhaseExpanded(phaseKey)} className="text-gray-500 flex-shrink-0">
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>

                        {isExpanded && (
                          <div className="bg-gray-900/40">
                            {phaseTasks.map(pt => {
                              const alreadyAdded = tasks.some(t => t.project_task_id === pt.id);
                              const selected = selectedProjectTaskIds.has(pt.id);
                              return (
                                <button
                                  key={pt.id}
                                  type="button"
                                  disabled={alreadyAdded}
                                  onClick={() => toggleProjectTask(pt.id)}
                                  className={`w-full flex items-center gap-2.5 pl-10 pr-3 py-2 text-sm text-left transition-colors border-t border-gray-700/30 ${
                                    alreadyAdded
                                      ? 'opacity-40 cursor-not-allowed text-gray-400'
                                      : selected
                                      ? 'bg-blue-600/10 text-blue-200'
                                      : 'hover:bg-gray-700/40 text-gray-300'
                                  }`}
                                >
                                  {alreadyAdded
                                    ? <CheckSquare className="w-3.5 h-3.5 text-teal-500 flex-shrink-0" />
                                    : selected
                                    ? <CheckSquare className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                                    : <Square className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />
                                  }
                                  <span className="flex-1 truncate">{pt.title}</span>
                                  {pt.estimated_hours > 0 && (
                                    <span className="text-xs text-gray-500 flex-shrink-0">{pt.estimated_hours}h</span>
                                  )}
                                  {alreadyAdded && <span className="text-xs text-teal-500 flex-shrink-0">added</span>}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {selectedProjectTaskIds.size > 0 && (
                  <div className="px-3 py-2.5 border-t border-gray-700 bg-gray-800/80">
                    <button
                      type="button"
                      onClick={addSelectedTasks}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      Add {selectedProjectTaskIds.size} task{selectedProjectTaskIds.size !== 1 ? 's' : ''}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Added tasks grouped by phase */}
            {tasks.length > 0 && (
              <div className="space-y-2">
                {Object.entries(addedTasksByPhase).map(([phaseKey, { phaseName, tasks: phaseTasks }]) => (
                  <div key={phaseKey}>
                    {Object.keys(addedTasksByPhase).length > 1 && (
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{phaseName}</span>
                        <div className="flex-1 h-px bg-gray-700" />
                      </div>
                    )}
                    <div className="space-y-1">
                      {phaseTasks.map(task => (
                        <div key={task.id} className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
                          <CheckSquare className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" />
                          <span className="flex-1 text-sm text-gray-200 truncate">{task.title}</span>
                          {task.estimated_hours > 0 && (
                            <span className="text-xs text-gray-500">{task.estimated_hours}h</span>
                          )}
                          <button
                            type="button"
                            onClick={() => setTasks(prev => prev.filter(t => t.id !== task.id))}
                            className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {tasks.length > 1 && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setTasks([])}
                      className="text-xs text-gray-500 hover:text-red-400 transition-colors"
                    >
                      Clear all tasks
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Customer Notes</label>
              <textarea
                value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Visible to customer..."
                rows={2}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Internal Notes</label>
              <textarea
                value={form.internal_notes}
                onChange={e => setForm(p => ({ ...p, internal_notes: e.target.value }))}
                placeholder="Internal use only..."
                rows={2}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>
          </div>

        </form>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-700 flex-shrink-0 bg-gray-900/80">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={loading || !form.title.trim() || selectedTechnicians.length === 0}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl text-sm transition-colors flex items-center gap-2"
          >
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Create Work Order{selectedTechnicians.length > 1 ? ` (${selectedTechnicians.length})` : ''}
                {tasks.length > 0 && ` · ${tasks.length} task${tasks.length !== 1 ? 's' : ''}`}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
