import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Wrench, X, AlertCircle, Plus, CheckCircle2, Pencil, Trash2, ClipboardList } from 'lucide-react';

interface PhaseWithNotes {
  id: string;
  labor_phase_id: string;
  phase_name: string;
  tech_notes: string;
}

interface ProjectTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  labor_phase_id: string | null;
  estimated_hours: number | null;
  source_line_item_id: string | null;
}

interface TwoPhaseLaborEditorProps {
  lineItemId: string;
  itemDescription: string;
  productId?: string | null;
  proposalId?: string;
  onClose: () => void;
  onSave: () => void;
}

export default function TwoPhaseLaborEditor({
  lineItemId,
  itemDescription,
  productId,
  proposalId,
  onClose,
  onSave
}: TwoPhaseLaborEditorProps) {
  const { profile } = useAuth();
  const [phases, setPhases] = useState<PhaseWithNotes[]>([]);
  const [generalNotes, setGeneralNotes] = useState('');
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [defaultInstallTask, setDefaultInstallTask] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: '', description: '' });
  const [taskSaving, setTaskSaving] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'notes' | 'tasks'>('notes');

  useEffect(() => {
    loadData();
  }, [lineItemId]);

  async function loadData() {
    try {
      setLoading(true);
      setError(null);

      const [phasesRes, tasksRes, productRes] = await Promise.all([
        supabase
          .from('proposal_line_item_labor_phases')
          .select(`
            id,
            labor_phase_id,
            tech_notes,
            labor_phases:labor_phase_id (name)
          `)
          .eq('line_item_id', lineItemId)
          .order('sort_order'),
        supabase
          .from('project_tasks')
          .select('*')
          .eq('source_line_item_id', lineItemId)
          .order('created_at'),
        productId
          ? supabase
              .from('products')
              .select('default_install_task')
              .eq('id', productId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null })
      ]);

      if (phasesRes.error) throw phasesRes.error;
      if (tasksRes.error) throw tasksRes.error;

      const phaseData: PhaseWithNotes[] = (phasesRes.data || []).map((p: any) => ({
        id: p.id,
        labor_phase_id: p.labor_phase_id,
        phase_name: p.labor_phases?.name || 'Unknown Phase',
        tech_notes: p.tech_notes || ''
      }));

      setPhases(phaseData);

      if (phaseData.length === 0) {
        const { data: singleNoteData } = await supabase
          .from('proposal_line_items')
          .select('tech_notes')
          .eq('id', lineItemId)
          .maybeSingle();
        setGeneralNotes((singleNoteData as any)?.tech_notes || '');
      }

      setTasks(tasksRes.data || []);

      const installTask = (productRes.data as any)?.default_install_task || '';
      setDefaultInstallTask(installTask);

      if (!editingTaskId && !showCreateTask && tasksRes.data?.length === 0) {
        setTaskForm({ title: itemDescription || '', description: installTask });
      }

    } catch (err: any) {
      console.error('Error loading tech notes data:', err);
      setError('Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveNotes() {
    setSaving(true);
    setError(null);
    try {
      if (phases.length > 0) {
        for (const phase of phases) {
          await supabase
            .from('proposal_line_item_labor_phases')
            .update({ tech_notes: phase.tech_notes || null })
            .eq('id', phase.id);
        }
      } else {
        await supabase
          .from('proposal_line_items')
          .update({ tech_notes: generalNotes || null } as any)
          .eq('id', lineItemId);
      }
      onSave();
      onClose();
    } catch (err: any) {
      console.error('Error saving tech notes:', err);
      setError('Failed to save notes. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateTask() {
    if (!taskForm.title.trim()) return;
    setTaskSaving(true);
    setError(null);
    try {
      const insertData: any = {
        title: taskForm.title.trim(),
        description: taskForm.description.trim() || null,
        status: 'open',
        source_line_item_id: lineItemId,
        sort_order: tasks.length,
        organization_id: profile?.organization_id
      };

      if (proposalId) {
        const { data: salesOrder } = await supabase
          .from('sales_orders')
          .select('project_id')
          .eq('proposal_id', proposalId)
          .maybeSingle();
        if (salesOrder?.project_id) {
          insertData.project_id = salesOrder.project_id;
        }
      }

      const { data, error: insertError } = await supabase
        .from('project_tasks')
        .insert(insertData)
        .select()
        .single();

      if (insertError) throw insertError;

      setTasks(prev => [...prev, data]);
      setShowCreateTask(false);
      setTaskForm({ title: itemDescription || '', description: defaultInstallTask });
    } catch (err: any) {
      console.error('Error creating task:', err);
      setError('Failed to create task. Please try again.');
    } finally {
      setTaskSaving(false);
    }
  }

  async function handleUpdateTask() {
    if (!editingTaskId || !taskForm.title.trim()) return;
    setTaskSaving(true);
    setError(null);
    try {
      const { data, error: updateError } = await supabase
        .from('project_tasks')
        .update({
          title: taskForm.title.trim(),
          description: taskForm.description.trim() || null,
        })
        .eq('id', editingTaskId)
        .select()
        .single();

      if (updateError) throw updateError;

      setTasks(prev => prev.map(t => t.id === editingTaskId ? data : t));
      setEditingTaskId(null);
      setTaskForm({ title: itemDescription || '', description: defaultInstallTask });
    } catch (err: any) {
      console.error('Error updating task:', err);
      setError('Failed to update task. Please try again.');
    } finally {
      setTaskSaving(false);
    }
  }

  async function handleDeleteTask(taskId: string) {
    setDeletingTaskId(taskId);
    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from('project_tasks')
        .delete()
        .eq('id', taskId);

      if (deleteError) throw deleteError;

      setTasks(prev => prev.filter(t => t.id !== taskId));
    } catch (err: any) {
      console.error('Error deleting task:', err);
      setError('Failed to delete task. Please try again.');
    } finally {
      setDeletingTaskId(null);
    }
  }

  function startEdit(task: ProjectTask) {
    setEditingTaskId(task.id);
    setShowCreateTask(false);
    setTaskForm({
      title: task.title,
      description: task.description || ''
    });
  }

  function cancelEdit() {
    setEditingTaskId(null);
    setShowCreateTask(false);
    setTaskForm({ title: itemDescription || '', description: defaultInstallTask });
  }

  function startCreate() {
    setShowCreateTask(true);
    setEditingTaskId(null);
    setTaskForm({ title: itemDescription || '', description: defaultInstallTask });
  }

  const hasNotes = phases.some(p => p.tech_notes.trim()) || generalNotes.trim();
  const taskStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-emerald-600 bg-emerald-50';
      case 'in_progress': return 'text-blue-600 bg-blue-50';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="text-gray-600 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-orange-100 rounded-lg flex items-center justify-center">
              <Wrench className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Task & Tech Notes</h2>
              <p className="text-xs text-gray-500 truncate max-w-xs">{itemDescription}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 bg-gray-50">
          <button
            onClick={() => setActiveTab('notes')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'notes'
                ? 'border-orange-500 text-orange-600 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Wrench className="w-4 h-4" />
            Tech Notes
            {hasNotes && (
              <span className="w-1.5 h-1.5 bg-orange-500 rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('tasks')}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === 'tasks'
                ? 'border-blue-500 text-blue-600 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            Tasks
            {tasks.length > 0 && (
              <span className="ml-1 text-xs bg-blue-100 text-blue-700 font-semibold px-1.5 py-0.5 rounded-full">
                {tasks.length}
              </span>
            )}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-6">

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Tech Notes Tab */}
          {activeTab === 'notes' && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  These notes are for technicians only and appear on install reports.{' '}
                  <strong>Customers will never see these notes.</strong>
                </p>
              </div>

              {phases.length > 0 ? (
                phases.map((phase, idx) => (
                  <div key={phase.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      {phase.phase_name} Notes
                    </label>
                    <textarea
                      value={phase.tech_notes}
                      onChange={(e) => {
                        const updated = [...phases];
                        updated[idx] = { ...updated[idx], tech_notes: e.target.value };
                        setPhases(updated);
                      }}
                      placeholder={`Special instructions for ${phase.phase_name}...`}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none text-sm"
                    />
                  </div>
                ))
              ) : (
                <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Technician Notes
                  </label>
                  <textarea
                    value={generalNotes}
                    onChange={(e) => setGeneralNotes(e.target.value)}
                    placeholder="Special instructions, warnings, or requirements for this item..."
                    rows={5}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none text-sm"
                  />
                </div>
              )}
            </div>
          )}

          {/* Tasks Tab */}
          {activeTab === 'tasks' && (
            <div className="space-y-4">

              {/* Existing tasks */}
              {tasks.length > 0 && (
                <div className="space-y-3">
                  {tasks.map(task => (
                    <div key={task.id} className="border border-gray-200 rounded-lg bg-white overflow-hidden">
                      {editingTaskId === task.id ? (
                        <div className="p-4 space-y-3">
                          <input
                            type="text"
                            value={taskForm.title}
                            onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                            placeholder="Task title"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                          />
                          <textarea
                            value={taskForm.description}
                            onChange={e => setTaskForm(f => ({ ...f, description: e.target.value }))}
                            placeholder="Task description (optional)"
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none text-sm"
                          />
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={cancelEdit}
                              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleUpdateTask}
                              disabled={taskSaving || !taskForm.title.trim()}
                              className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
                            >
                              {taskSaving ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="p-4 flex items-start gap-3">
                          <CheckCircle2 className={`w-4 h-4 mt-0.5 flex-shrink-0 ${task.status === 'completed' ? 'text-emerald-500' : 'text-gray-300'}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className={`text-sm font-medium ${task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                                {task.title}
                              </p>
                              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${taskStatusColor(task.status)}`}>
                                {task.status.replace('_', ' ')}
                              </span>
                            </div>
                            {task.description && (
                              <p className="text-xs text-gray-500 mt-1">{task.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => startEdit(task)}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Edit task"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteTask(task.id)}
                              disabled={deletingTaskId === task.id}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                              title="Delete task"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Create task form */}
              {showCreateTask ? (
                <div className="border border-blue-200 rounded-lg bg-blue-50 p-4 space-y-3">
                  <h4 className="text-sm font-semibold text-blue-900">New Task</h4>
                  <input
                    type="text"
                    value={taskForm.title}
                    onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Task title"
                    className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-sm"
                    autoFocus
                  />
                  <textarea
                    value={taskForm.description}
                    onChange={e => setTaskForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Task description (optional)"
                    rows={3}
                    className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white resize-none text-sm"
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={cancelEdit}
                      className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateTask}
                      disabled={taskSaving || !taskForm.title.trim()}
                      className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      {taskSaving ? 'Creating...' : 'Create Task'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={startCreate}
                  className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Task
                </button>
              )}

              {tasks.length === 0 && !showCreateTask && (
                <p className="text-xs text-gray-400 text-center -mt-2">
                  Tasks linked here will appear in the project task list once the proposal is approved.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm font-medium"
          >
            {activeTab === 'tasks' ? 'Close' : 'Cancel'}
          </button>
          {activeTab === 'notes' && (
            <button
              onClick={handleSaveNotes}
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Notes'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
