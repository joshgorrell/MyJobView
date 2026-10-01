import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { CheckCircle, Circle, User, Briefcase, Wrench, Layers } from 'lucide-react';

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
  currentUserId
}: WorkOrderTasksChecklistProps) {
  const [projectTasks, setProjectTasks] = useState<ProjectTask[]>([]);
  const [workOrderTasks, setWorkOrderTasks] = useState<WorkOrderTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [completingTask, setCompletingTask] = useState<string | null>(null);
  const [taskHours, setTaskHours] = useState<Record<string, number>>({});
  const [showAllPhases, setShowAllPhases] = useState(false);
  const [loadError, setLoadError] = useState(false);

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
      setLoadError(false);

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

        setProjectTasks(tasksData || []);
      } else {
        setProjectTasks([]);
      }

      // Load work order specific tasks
      let woTasksQuery = supabase
        .from('work_order_tasks')
        .select('*')
        .eq('work_order_id', workOrderId)
        .order('sort_order');

      if (workOrderGroupId) {
        // For group work orders, load shared tasks
        const { data: groupWorkOrders } = await supabase
          .from('work_orders')
          .select('id')
          .eq('work_order_group_id', workOrderGroupId);

        if (groupWorkOrders && groupWorkOrders.length > 0) {
          woTasksQuery = supabase.from('work_order_tasks').select('*')
            .or(`work_order_id.eq.${workOrderId},and(work_order_id.in.(${groupWorkOrders.map(wo => wo.id).join(',')}),shared_task.eq.true)`)
            .order('sort_order');
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

          if (workOrderGroupId) {
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
      setLoadError(true);
    } finally {
      setLoading(false);
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

  if (loadError) return <p className="text-sm text-red-600" role="alert">Tasks could not be loaded. <button className="underline min-h-11" onClick={loadTasks}>Retry</button></p>;

  const assignedProjectIds = new Set(workOrderTasks.map(task => task.project_task_id).filter(Boolean));
  const referenceTasks = projectTasks.filter(task => !assignedProjectIds.has(task.id));

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-primary">Tasks for this work order</h3>
      <p className="text-sm text-secondary">These tasks are assigned to this visit. Follow the work order instructions for the scope of work.</p>
      {!workOrderTasks.length && <p className="text-sm text-muted">No checklist tasks assigned. Follow the work order instructions.</p>}
      {workOrderTasks.length > 0 && (
        <div className="space-y-2">
          {workOrderTasks.map((task) => {
            const myCompletion = task.completions?.find(c => c.technician_id === currentUserId);
            const otherCompletions = task.completions?.filter(c => c.technician_id !== currentUserId) || [];
            const isCompleting = completingTask === task.id;

            return (
              <div key={task.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => handleToggleWorkOrderTask(task.id)}
                    className="min-h-11 min-w-11 flex items-start justify-center pt-2" aria-label={`Toggle completion for ${task.title}`}
                  >
                    {myCompletion ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <Circle className="w-5 h-5 text-gray-400" />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
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
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={taskHours[task.id] || ''}
                        onChange={(e) => setTaskHours(prev => ({ ...prev, [task.id]: parseFloat(e.target.value) || 0 }))}
                        placeholder="0"
                        className="w-full sm:w-auto sm:flex-1 min-w-0 px-3 py-2 border border-strong bg-surface text-primary rounded-lg"
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
      {projectId && (
        <details className="border border-subtle rounded-lg p-3">
          <summary className="cursor-pointer min-h-11 text-sm font-semibold text-primary">Other unfinished project tasks ({referenceTasks.length})</summary>
          <p className="text-sm text-secondary my-3">Project scope for reference. These tasks are not assigned to this work order.</p>
          {laborPhaseId && <button type="button" onClick={() => setShowAllPhases(value => !value)} className="min-h-11 px-3 py-2 border border-subtle rounded-lg text-sm text-info mb-3 flex items-center gap-2"><Layers className="w-4 h-4" />{showAllPhases ? 'Show this phase' : 'Browse all phases'}</button>}
          {!referenceTasks.length && <p className="text-sm text-muted">No other unfinished tasks {laborPhaseId && !showAllPhases ? 'in this phase' : 'on this project'}.</p>}
          <ul className="space-y-2">
            {referenceTasks.map(task => <li key={task.id} className="rounded-lg border border-subtle p-3">
              <p className="font-medium text-primary break-words">{task.title}</p>
              <p className="text-xs text-muted mt-1">{task.labor_phase?.name || 'No phase'}{task.estimated_hours > 0 ? ` · ${task.estimated_hours}h sold estimate` : ''}</p>
              {task.description && <p className="text-sm text-secondary whitespace-pre-wrap mt-1">{task.description}</p>}
            </li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
