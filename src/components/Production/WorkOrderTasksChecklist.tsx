import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { CheckCircle, Circle, User, Clock, Briefcase, Wrench, Zap, Layers } from 'lucide-react';

interface ProjectTask {
  id: string;
  title: string;
  description: string | null;
  estimated_hours: number;
  is_auto_completed?: boolean;
  status?: string;
  labor_phase_id?: string | null;
  labor_phase?: { name: string } | null;
  completions?: Array<{
    id: string;
    technician_id: string;
    completed_at: string;
    actual_hours: number;
    notes: string | null;
    technician?: {
      full_name: string;
    };
  }>;
}

interface WorkOrderTask {
  id: string;
  title: string;
  description: string | null;
  estimated_hours: number;
  status: string;
  completed_by: string | null;
  completed_at: string | null;
  shared_task: boolean;
  project_task_id: string | null; // Link to project task
  completions?: Array<{
    id: string;
    technician_id: string;
    completed_at: string;
    actual_hours: number;
    notes: string | null;
    technician?: {
      full_name: string;
    };
  }>;
}

interface WorkOrderTasksChecklistProps {
  workOrderId: string;
  projectId?: string | null;
  laborPhaseId?: string | null;
  workOrderGroupId?: string | null;
  isGroupWorkOrder?: boolean;
  currentUserId: string;
}

export default function WorkOrderTasksChecklist({
  workOrderId,
  projectId,
  laborPhaseId,
  workOrderGroupId,
  isGroupWorkOrder,
  currentUserId
}: WorkOrderTasksChecklistProps) {
  const [projectTasks, setProjectTasks] = useState<ProjectTask[]>([]);
  const [workOrderTasks, setWorkOrderTasks] = useState<WorkOrderTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [completingTask, setCompletingTask] = useState<string | null>(null);
  const [taskHours, setTaskHours] = useState<Record<string, number>>({});
  const [showAllPhases, setShowAllPhases] = useState(false);

  useEffect(() => {
    loadTasks();

    // Set up real-time subscription for task completions
    const subscription = supabase
      .channel('work_order_task_completions')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'work_order_task_completions',
          filter: `work_order_id=eq.${workOrderId}`
        },
        () => {
          loadTasks();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [workOrderId, projectId, laborPhaseId, workOrderGroupId, showAllPhases]);

  async function loadTasks() {
    try {
      setLoading(true);

      // Load project tasks if this is a project work order
      if (projectId) {
        let query = supabase
          .from('project_tasks')
          .select(`
            id, title, description, estimated_hours, status, is_auto_completed,
            labor_phase_id,
            labor_phase:labor_phases!project_tasks_labor_phase_id_fkey(name)
          `)
          .eq('project_id', projectId)
          .eq('status', 'open')
          .order('sort_order');

        // Filter by labor phase unless "show all phases" is active
        if (laborPhaseId && !showAllPhases) {
          query = query.eq('labor_phase_id', laborPhaseId);
        }

        const { data: tasksData, error: tasksError } = await query;

        if (tasksError) throw tasksError;

        // Load completions for each task in this work order or group
        const tasksWithCompletions = await Promise.all(
          (tasksData || []).map(async (task) => {
            let completionsQuery = supabase
              .from('work_order_task_completions')
              .select(`
                *,
                technician:profiles!work_order_task_completions_technician_id_fkey(full_name)
              `)
              .eq('project_task_id', task.id);

            if (isGroupWorkOrder && workOrderGroupId) {
              // For group work orders, show completions from all work orders in the group
              const { data: groupWorkOrders } = await supabase
                .from('work_orders')
                .select('id')
                .eq('work_order_group_id', workOrderGroupId);

              if (groupWorkOrders) {
                completionsQuery = completionsQuery.in(
                  'work_order_id',
                  groupWorkOrders.map(wo => wo.id)
                );
              }
            } else {
              completionsQuery = completionsQuery.eq('work_order_id', workOrderId);
            }

            const { data: completions } = await completionsQuery;

            return {
              ...task,
              completions: completions || []
            };
          })
        );

        setProjectTasks(tasksWithCompletions);
      }

      // Load work order specific tasks
      let woTasksQuery = supabase
        .from('work_order_tasks')
        .select('*')
        .order('sort_order');

      if (isGroupWorkOrder && workOrderGroupId) {
        // For group work orders, load shared tasks
        const { data: groupWorkOrders } = await supabase
          .from('work_orders')
          .select('id')
          .eq('work_order_group_id', workOrderGroupId);

        if (groupWorkOrders && groupWorkOrders.length > 0) {
          woTasksQuery = woTasksQuery
            .in('work_order_id', groupWorkOrders.map(wo => wo.id))
            .eq('shared_task', true);
        }
      } else {
        woTasksQuery = woTasksQuery.eq('work_order_id', workOrderId);
      }

      const { data: woTasksData, error: woTasksError } = await woTasksQuery;

      if (woTasksError) throw woTasksError;

      // Load completions for work order tasks
      const woTasksWithCompletions = await Promise.all(
        (woTasksData || []).map(async (task) => {
          let completionsQuery = supabase
            .from('work_order_task_completions')
            .select(`
              *,
              technician:profiles!work_order_task_completions_technician_id_fkey(full_name)
            `)
            .eq('work_order_task_id', task.id);

          if (isGroupWorkOrder && workOrderGroupId) {
            const { data: groupWorkOrders } = await supabase
              .from('work_orders')
              .select('id')
              .eq('work_order_group_id', workOrderGroupId);

            if (groupWorkOrders) {
              completionsQuery = completionsQuery.in(
                'work_order_id',
                groupWorkOrders.map(wo => wo.id)
              );
            }
          } else {
            completionsQuery = completionsQuery.eq('work_order_id', workOrderId);
          }

          const { data: completions } = await completionsQuery;

          return {
            ...task,
            completions: completions || []
          };
        })
      );

      setWorkOrderTasks(woTasksWithCompletions);
    } catch (error) {
      console.error('Error loading tasks:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleProjectTask(taskId: string) {
    const task = projectTasks.find(t => t.id === taskId);
    if (!task) return;

    const myCompletion = task.completions?.find(c => c.technician_id === currentUserId);

    if (myCompletion) {
      // Remove completion
      const { error } = await supabase
        .from('work_order_task_completions')
        .delete()
        .eq('id', myCompletion.id);

      if (!error) {
        loadTasks();
      }
    } else {
      // Add completion
      setCompletingTask(taskId);
    }
  }

  async function handleToggleWorkOrderTask(taskId: string) {
    const task = workOrderTasks.find(t => t.id === taskId);
    if (!task) return;

    const myCompletion = task.completions?.find(c => c.technician_id === currentUserId);

    if (myCompletion) {
      // Remove completion
      const { error } = await supabase
        .from('work_order_task_completions')
        .delete()
        .eq('id', myCompletion.id);

      if (!error) {
        loadTasks();
      }
    } else {
      // Add completion
      setCompletingTask(taskId);
    }
  }

  async function handleSaveCompletion(taskId: string, isProjectTask: boolean) {
    const hours = taskHours[taskId] || 0;

    const { error } = await supabase
      .from('work_order_task_completions')
      .insert({
        work_order_id: workOrderId,
        [isProjectTask ? 'project_task_id' : 'work_order_task_id']: taskId,
        technician_id: currentUserId,
        actual_hours: hours,
        completed_at: new Date().toISOString()
      });

    if (!error) {
      setCompletingTask(null);
      setTaskHours(prev => {
        const newHours = { ...prev };
        delete newHours[taskId];
        return newHours;
      });
      loadTasks();
    }
  }

  if (loading) {
    return <div className="text-center py-4 text-gray-500">Loading tasks...</div>;
  }

  const hasAnyTasks = projectTasks.length > 0 || workOrderTasks.length > 0;

  if (!hasAnyTasks) {
    return null; // Don't show anything if there are no tasks
  }

  // Group project tasks by phase when showing all phases
  const tasksByPhase: Record<string, { phaseName: string; tasks: ProjectTask[] }> = {};
  if (showAllPhases) {
    projectTasks.forEach((task) => {
      const phaseId = task.labor_phase_id || '__none__';
      const phaseName = task.labor_phase?.name || 'No Phase';
      if (!tasksByPhase[phaseId]) {
        tasksByPhase[phaseId] = { phaseName, tasks: [] };
      }
      tasksByPhase[phaseId].tasks.push(task);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Tasks Checklist</h3>
        {projectId && laborPhaseId && (
          <button
            onClick={() => setShowAllPhases((v) => !v)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              showAllPhases
                ? 'bg-blue-50 text-blue-700 border-blue-300'
                : 'bg-gray-100 text-gray-600 border-gray-300 hover:border-gray-400'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            {showAllPhases ? 'This Phase Only' : 'Show All Phases'}
          </button>
        )}
      </div>

      {projectTasks.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700">
            {showAllPhases ? 'All Project Tasks' : 'Project Tasks (This Phase)'}
          </h4>
          {showAllPhases
            ? Object.entries(tasksByPhase).map(([phaseId, { phaseName, tasks: phaseTasks }]) => (
                <div key={phaseId} className="space-y-2">
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                      {phaseName}
                    </span>
                    <div className="flex-1 h-px bg-blue-100" />
                  </div>
                  {phaseTasks.map((task) => (
                    <ProjectTaskRow
                      key={task.id}
                      task={task}
                      currentUserId={currentUserId}
                      completingTask={completingTask}
                      taskHours={taskHours}
                      onToggle={handleToggleProjectTask}
                      onSave={(id) => handleSaveCompletion(id, true)}
                      onCancel={() => setCompletingTask(null)}
                      onHoursChange={(id, val) =>
                        setTaskHours((prev) => ({ ...prev, [id]: val }))
                      }
                    />
                  ))}
                </div>
              ))
            : projectTasks.map((task) => (
                <ProjectTaskRow
                  key={task.id}
                  task={task}
                  currentUserId={currentUserId}
                  completingTask={completingTask}
                  taskHours={taskHours}
                  onToggle={handleToggleProjectTask}
                  onSave={(id) => handleSaveCompletion(id, true)}
                  onCancel={() => setCompletingTask(null)}
                  onHoursChange={(id, val) =>
                    setTaskHours((prev) => ({ ...prev, [id]: val }))
                  }
                />
              ))}
        </div>
      )}

      {workOrderTasks.length > 0 && (
        <div className="space-y-2">
          {projectTasks.length > 0 && (
            <h4 className="text-sm font-medium text-gray-700">Work Order Tasks</h4>
          )}
          {workOrderTasks.map((task) => {
            const myCompletion = task.completions?.find(c => c.technician_id === currentUserId);
            const otherCompletions = task.completions?.filter(c => c.technician_id !== currentUserId) || [];
            const isCompleting = completingTask === task.id;

            return (
              <div key={task.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => handleToggleWorkOrderTask(task.id)}
                    className="mt-0.5"
                  >
                    {myCompletion ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <Circle className="w-5 h-5 text-gray-400" />
                    )}
                  </button>

                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h5 className={`font-medium ${myCompletion ? 'text-gray-500 line-through' : ''}`}>
                        {task.title}
                      </h5>
                      {task.project_task_id ? (
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded flex items-center gap-1">
                          <Briefcase className="w-3 h-3" />
                          Project
                        </span>
                      ) : (
                        <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded flex items-center gap-1">
                          <Wrench className="w-3 h-3" />
                          Custom
                        </span>
                      )}
                    </div>
                    {task.description && (
                      <p className="text-sm text-gray-600 mt-1">{task.description}</p>
                    )}

                    {myCompletion && (
                      <div className="mt-2 text-xs text-green-600 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        <span>You completed this {myCompletion.actual_hours > 0 && `in ${myCompletion.actual_hours}h`}</span>
                      </div>
                    )}

                    {otherCompletions.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {otherCompletions.map((completion) => (
                          <div key={completion.id} className="text-xs text-blue-600 flex items-center gap-1">
                            <User className="w-3 h-3" />
                            <span>
                              {completion.technician?.full_name} completed this
                              {completion.actual_hours > 0 && ` in ${completion.actual_hours}h`}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {isCompleting && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Hours Spent (optional)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={taskHours[task.id] || ''}
                        onChange={(e) => setTaskHours(prev => ({ ...prev, [task.id]: parseFloat(e.target.value) || 0 }))}
                        placeholder="0"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      <button
                        onClick={() => handleSaveCompletion(task.id, false)}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                      >
                        Complete
                      </button>
                      <button
                        onClick={() => setCompletingTask(null)}
                        className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface ProjectTaskRowProps {
  task: ProjectTask;
  currentUserId: string;
  completingTask: string | null;
  taskHours: Record<string, number>;
  onToggle: (id: string) => void;
  onSave: (id: string) => void;
  onCancel: () => void;
  onHoursChange: (id: string, val: number) => void;
}

function ProjectTaskRow({
  task,
  currentUserId,
  completingTask,
  taskHours,
  onToggle,
  onSave,
  onCancel,
  onHoursChange,
}: ProjectTaskRowProps) {
  const myCompletion = task.completions?.find(c => c.technician_id === currentUserId);
  const otherCompletions = task.completions?.filter(c => c.technician_id !== currentUserId) || [];
  const isCompleting = completingTask === task.id;

  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <div className="flex items-start gap-3">
        <button onClick={() => onToggle(task.id)} className="mt-0.5">
          {myCompletion ? (
            <CheckCircle className="w-5 h-5 text-green-600" />
          ) : (
            <Circle className="w-5 h-5 text-gray-400" />
          )}
        </button>

        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h5 className={`font-medium ${myCompletion ? 'text-gray-500 line-through' : ''}`}>
              {task.title}
            </h5>
            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded flex items-center gap-1">
              <Briefcase className="w-3 h-3" />
              Project
            </span>
            {task.is_auto_completed && (
              <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded flex items-center gap-1">
                <Zap className="w-3 h-3" />
                Auto
              </span>
            )}
          </div>
          {task.description && (
            <p className="text-sm text-gray-600 mt-1">{task.description}</p>
          )}

          {task.estimated_hours > 0 && (
            <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
              <Clock className="w-3 h-3" />
              <span>{task.estimated_hours}h estimated</span>
            </div>
          )}

          {myCompletion && (
            <div className="mt-2 text-xs text-green-600 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />
              <span>You completed this {myCompletion.actual_hours > 0 && `in ${myCompletion.actual_hours}h`}</span>
            </div>
          )}

          {otherCompletions.length > 0 && (
            <div className="mt-2 space-y-1">
              {otherCompletions.map((completion) => (
                <div key={completion.id} className="text-xs text-blue-600 flex items-center gap-1">
                  <User className="w-3 h-3" />
                  <span>
                    {completion.technician?.full_name} completed this
                    {completion.actual_hours > 0 && ` in ${completion.actual_hours}h`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {isCompleting && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Hours Spent (optional)
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              step="0.5"
              min="0"
              value={taskHours[task.id] || ''}
              onChange={(e) => onHoursChange(task.id, parseFloat(e.target.value) || 0)}
              placeholder="0"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
            />
            <button
              onClick={() => onSave(task.id)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Complete
            </button>
            <button
              onClick={onCancel}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
