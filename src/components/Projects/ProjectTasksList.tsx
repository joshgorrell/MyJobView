import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { CheckCircle, Circle, Edit2, Trash2, Plus, ChevronDown, ChevronRight, Zap, Users } from 'lucide-react';
import ConfirmModal from '../ui/ConfirmModal';

interface ProjectTask {
  id: string;
  title: string;
  description: string | null;
  labor_phase_id: string | null;
  estimated_hours: number;
  status: 'open' | 'completed' | 'cancelled';
  sort_order: number;
  completed_at: string | null;
  is_auto_completed?: boolean;
  labor_phase?: {
    name: string;
  };
  completion_count?: number;
  total_actual_hours?: number;
  completed_by_techs?: Array<{
    full_name: string;
    completed_at: string;
  }>;
}

interface ProjectTasksListProps {
  projectId: string;
  canEdit?: boolean;
}

export default function ProjectTasksList({ projectId, canEdit = false }: ProjectTasksListProps) {
  const [tasks, setTasks] = useState<ProjectTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [filterPhase, setFilterPhase] = useState<string>('all');
  const [showAddTask, setShowAddTask] = useState(false);
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [laborPhases, setLaborPhases] = useState<Array<{ id: string; name: string }>>([]);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  useEffect(() => {
    loadTasks();
    loadLaborPhases();
  }, [projectId]);

  async function loadTasks() {
    try {
      setLoading(true);

      // Load tasks with labor phase info and completion counts
      // Only items with labor/time and a labor phase can be tasks
      const { data: tasksData, error: tasksError } = await supabase
        .from('project_tasks')
        .select(`
          *,
          labor_phase:labor_phases(name)
        `)
        .eq('project_id', projectId)
        .gt('estimated_hours', 0)
        .not('labor_phase_id', 'is', null)
        .order('sort_order');

      if (tasksError) throw tasksError;

      // Get completion details for each task
      const tasksWithCounts = await Promise.all(
        (tasksData || []).map(async (task) => {
          // Get all completions for this task
          const { data: completions } = await supabase
            .from('work_order_task_completions')
            .select(`
              actual_hours,
              completed_at,
              technician:profiles!work_order_task_completions_technician_id_fkey(full_name)
            `)
            .eq('project_task_id', task.id)
            .order('completed_at', { ascending: false });

          const totalActualHours = completions?.reduce((sum, c) => sum + (c.actual_hours || 0), 0) || 0;
          const completedByTechs = completions?.map(c => ({
            full_name: c.technician?.full_name || 'Unknown',
            completed_at: c.completed_at
          })) || [];

          return {
            ...task,
            completion_count: completions?.length || 0,
            total_actual_hours: totalActualHours,
            completed_by_techs: completedByTechs
          };
        })
      );

      setTasks(tasksWithCounts);
    } catch (error) {
      console.error('Error loading tasks:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadLaborPhases() {
    const { data, error } = await supabase
      .from('labor_phases')
      .select('id, name')
      .order('sort_order');

    if (!error && data) {
      setLaborPhases(data);
    }
  }

  function togglePhase(phaseId: string) {
    const newExpanded = new Set(expandedPhases);
    if (newExpanded.has(phaseId)) {
      newExpanded.delete(phaseId);
    } else {
      newExpanded.add(phaseId);
    }
    setExpandedPhases(newExpanded);
  }

  async function handleToggleComplete(taskId: string, currentStatus: string) {
    const newStatus = currentStatus === 'completed' ? 'open' : 'completed';
    const { error } = await supabase
      .from('project_tasks')
      .update({
        status: newStatus,
        completed_at: newStatus === 'completed' ? new Date().toISOString() : null
      })
      .eq('id', taskId);

    if (!error) {
      loadTasks();
    }
  }

  async function handleDeleteTask(taskId: string) {
    const { error } = await supabase
      .from('project_tasks')
      .delete()
      .eq('id', taskId);

    if (!error) {
      loadTasks();
    }
  }

  async function handleAddTask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const laborPhaseId = formData.get('labor_phase_id') as string;
    const estimatedHours = parseFloat(formData.get('estimated_hours') as string) || 0;

    // Validate requirements: tasks must have labor hours and a labor phase
    if (!laborPhaseId || estimatedHours <= 0) {
      alert('Tasks must have both labor hours (greater than 0) and an assigned labor phase.');
      return;
    }

    const { error } = await supabase
      .from('project_tasks')
      .insert({
        project_id: projectId,
        title: formData.get('title'),
        description: formData.get('description'),
        labor_phase_id: laborPhaseId,
        estimated_hours: estimatedHours,
        status: 'open',
        sort_order: tasks.length
      });

    if (!error) {
      setShowAddTask(false);
      loadTasks();
      e.currentTarget.reset();
    }
  }

  async function handleUpdateTask(taskId: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const laborPhaseId = formData.get('labor_phase_id') as string;
    const estimatedHours = parseFloat(formData.get('estimated_hours') as string) || 0;

    // Validate requirements: tasks must have labor hours and a labor phase
    if (!laborPhaseId || estimatedHours <= 0) {
      alert('Tasks must have both labor hours (greater than 0) and an assigned labor phase.');
      return;
    }

    const { error } = await supabase
      .from('project_tasks')
      .update({
        title: formData.get('title'),
        description: formData.get('description'),
        labor_phase_id: laborPhaseId,
        estimated_hours: estimatedHours
      })
      .eq('id', taskId);

    if (!error) {
      setEditingTask(null);
      loadTasks();
    }
  }

  // Group tasks by labor phase
  const groupedTasks = tasks.reduce((acc, task) => {
    const phaseId = task.labor_phase_id || 'no-phase';
    const phaseName = task.labor_phase?.name || 'No Phase';

    if (!acc[phaseId]) {
      acc[phaseId] = { name: phaseName, tasks: [] };
    }
    acc[phaseId].tasks.push(task);
    return acc;
  }, {} as Record<string, { name: string; tasks: ProjectTask[] }>);

  // Filter tasks if needed
  const filteredGroups = filterPhase === 'all'
    ? groupedTasks
    : { [filterPhase]: groupedTasks[filterPhase] || { name: '', tasks: [] } };

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading tasks...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Project Tasks</h3>

        <div className="flex items-center gap-2">
          <select
            value={filterPhase}
            onChange={(e) => setFilterPhase(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
          >
            <option value="all">All Phases</option>
            {laborPhases.map((phase) => (
              <option key={phase.id} value={phase.id}>
                {phase.name}
              </option>
            ))}
          </select>

          {canEdit && (
            <button
              onClick={() => setShowAddTask(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
            >
              <Plus className="w-4 h-4" />
              Add Task
            </button>
          )}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-xs text-blue-800">
          Only project items with labor hours and an assigned labor phase are shown as tasks. Items without both requirements cannot be assigned to work orders.
        </p>
      </div>

      {showAddTask && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <form onSubmit={handleAddTask} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Task Title *
              </label>
              <input
                type="text"
                name="title"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="e.g., Install security panel in living room"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                name="description"
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="Technical notes for installation..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Labor Phase *
                </label>
                <select
                  name="labor_phase_id"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">Select Phase...</option>
                  {laborPhases.map((phase) => (
                    <option key={phase.id} value={phase.id}>
                      {phase.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Estimated Hours *
                </label>
                <input
                  type="number"
                  name="estimated_hours"
                  required
                  step="0.5"
                  min="0.5"
                  defaultValue="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2">
              <p className="text-xs text-yellow-800">
                Tasks must have both labor hours and a labor phase to be assignable to work orders
              </p>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowAddTask(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Add Task
              </button>
            </div>
          </form>
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No tasks yet. Tasks are automatically created from approved proposals, or you can add them manually.
        </div>
      ) : (
        <div className="space-y-2">
          {Object.entries(filteredGroups).map(([phaseId, group]) => (
            <div key={phaseId} className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => togglePhase(phaseId)}
                className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  {expandedPhases.has(phaseId) ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  <span className="font-medium">{group.name}</span>
                  <span className="text-sm text-gray-500">
                    ({group.tasks.filter(t => t.status !== 'completed').length} open, {group.tasks.filter(t => t.status === 'completed').length} complete)
                  </span>
                </div>
                <span className="text-sm text-gray-600">
                  {group.tasks.reduce((sum, t) => sum + t.estimated_hours, 0).toFixed(1)}h estimated
                </span>
              </button>

              {expandedPhases.has(phaseId) && (
                <div className="divide-y divide-gray-200">
                  {group.tasks.map((task) => (
                    <div key={task.id} className="p-4 hover:bg-gray-50">
                      {editingTask === task.id ? (
                        <form onSubmit={(e) => handleUpdateTask(task.id, e)} className="space-y-3">
                          <input
                            type="text"
                            name="title"
                            defaultValue={task.title}
                            required
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                          <textarea
                            name="description"
                            defaultValue={task.description || ''}
                            rows={2}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                          <div className="grid grid-cols-2 gap-3">
                            <select
                              name="labor_phase_id"
                              defaultValue={task.labor_phase_id || ''}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            >
                              <option value="">No Phase</option>
                              {laborPhases.map((phase) => (
                                <option key={phase.id} value={phase.id}>
                                  {phase.name}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              name="estimated_hours"
                              step="0.5"
                              min="0"
                              defaultValue={task.estimated_hours}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            />
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button
                              type="button"
                              onClick={() => setEditingTask(null)}
                              className="px-3 py-1 text-sm text-gray-700 hover:bg-gray-100 rounded"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                            >
                              Save
                            </button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <div className="flex items-start gap-3">
                            <button
                              onClick={() => handleToggleComplete(task.id, task.status)}
                              className="mt-0.5"
                              disabled={!canEdit}
                            >
                              {task.status === 'completed' ? (
                                <CheckCircle className="w-5 h-5 text-green-600" />
                              ) : (
                                <Circle className="w-5 h-5 text-gray-400" />
                              )}
                            </button>

                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className={`font-medium ${task.status === 'completed' ? 'text-gray-500 line-through' : ''}`}>
                                  {task.title}
                                </h4>
                                {task.is_auto_completed && (
                                  <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded flex items-center gap-1">
                                    <Zap className="w-3 h-3" />
                                    Auto-Complete
                                  </span>
                                )}
                              </div>
                              {task.description && (
                                <p className="text-sm text-gray-600 mt-1">{task.description}</p>
                              )}
                              <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-gray-500">
                                <span>{task.estimated_hours}h estimated</span>
                                {task.total_actual_hours! > 0 && (
                                  <span className="text-green-600">
                                    {task.total_actual_hours.toFixed(1)}h actual
                                  </span>
                                )}
                                {task.completion_count! > 0 && (
                                  <span className="text-blue-600 flex items-center gap-1">
                                    <Users className="w-3 h-3" />
                                    {task.completion_count} completion{task.completion_count !== 1 ? 's' : ''}
                                  </span>
                                )}
                              </div>
                              {task.completed_by_techs && task.completed_by_techs.length > 0 && (
                                <div className="mt-2 space-y-1">
                                  {task.completed_by_techs.slice(0, 3).map((tech, idx) => (
                                    <div key={idx} className="text-xs text-gray-600">
                                      Completed by {tech.full_name} on {new Date(tech.completed_at).toLocaleDateString()}
                                    </div>
                                  ))}
                                  {task.completed_by_techs.length > 3 && (
                                    <div className="text-xs text-gray-500 italic">
                                      +{task.completed_by_techs.length - 3} more...
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {canEdit && task.status !== 'completed' && (
                              <div className="flex gap-1">
                                <button
                                  onClick={() => setEditingTask(task.id)}
                                  className="p-1 hover:bg-gray-200 rounded"
                                >
                                  <Edit2 className="w-4 h-4 text-gray-600" />
                                </button>
                                <button
                                  onClick={() => setConfirmModal({ title: 'Delete Task', message: 'Delete this task? This will not affect already completed work orders.', onConfirm: () => handleDeleteTask(task.id) })}
                                  className="p-1 hover:bg-gray-200 rounded"
                                >
                                  <Trash2 className="w-4 h-4 text-red-600" />
                                </button>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={confirmModal !== null}
        title={confirmModal?.title ?? ''}
        message={confirmModal?.message ?? ''}
        onConfirm={() => { confirmModal?.onConfirm(); setConfirmModal(null); }}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}
