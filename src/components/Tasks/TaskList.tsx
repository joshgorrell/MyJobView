import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Clock, Flag, Calendar, Edit2, Trash2, Plus } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Task } from '../../lib/types';
import { formatDistanceToNow } from '../../lib/utils';
import { TaskForm } from './TaskForm';
import { useAuth } from '../../contexts/AuthContext';
import { offlineSupabaseUpdate, offlineSupabaseDelete, offlineSupabaseInsert } from '../../lib/offlineSupport';
import ConfirmModal from '../ui/ConfirmModal';

interface TaskListProps {
  leadId: string;
}

export function TaskList({ leadId }: TaskListProps) {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadTasks();

    const channel = supabase
      .channel('tasks_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tasks',
        filter: `lead_id=eq.${leadId}`
      }, () => {
        loadTasks();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leadId]);

  async function loadTasks() {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*, profiles(full_name)')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const sortedTasks = (data || []).sort((a, b) => {
        if (a.priority === 'urgent' && b.priority !== 'urgent') return -1;
        if (a.priority !== 'urgent' && b.priority === 'urgent') return 1;

        if (a.status === 'completed' && b.status !== 'completed') return 1;
        if (a.status !== 'completed' && b.status === 'completed') return -1;

        if (a.due_date && !b.due_date) return -1;
        if (!a.due_date && b.due_date) return 1;
        if (a.due_date && b.due_date) {
          return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
        }

        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      setTasks(sortedTasks);
    } catch (error) {
      console.error('Error loading tasks:', error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleTaskStatus(task: Task) {
    try {
      const newStatus = task.status === 'completed' ? 'pending' : 'completed';
      const updateData: any = {
        status: newStatus,
        completed_at: newStatus === 'completed' ? new Date().toISOString() : null
      };

      if (newStatus === 'completed' && !(task as any).assigned_to && !(task as any).claimed_by) {
        updateData.claimed_by = profile?.id;
      }

      const result = await offlineSupabaseUpdate('tasks', updateData, task.id);

      if (result.error) throw result.error;

      if (newStatus === 'completed' && profile) {
        await offlineSupabaseInsert('feed_events', {
          event_type: 'task_completed',
          task_id: task.id,
          lead_id: leadId,
          user_id: profile.id,
          metadata: {
            task_title: task.title,
          },
        });

        const pointsToAward = (task as any).points || 10;
        await supabase.rpc('award_points', {
          p_user_id: profile.id,
          p_points: pointsToAward,
          p_reason: `Completed task: ${task.title}`
        });
      }

      loadTasks();
    } catch (error) {
      console.error('Error updating task:', error);
      alert('Failed to update task status');
    }
  }

  async function deleteTask(taskId: string) {

    try {
      const task = tasks.find(t => t.id === taskId);

      if (task && profile) {
        await supabase.from('feed_events').insert({
          event_type: 'task_deleted',
          task_id: taskId,
          lead_id: leadId,
          user_id: profile.id,
          metadata: {
            task_title: task.title,
          },
        });
      }

      const result = await offlineSupabaseDelete('tasks', taskId);
      if (result.error) throw result.error;
      loadTasks();
    } catch (error) {
      console.error('Error deleting task:', error);
      alert('Failed to delete task');
    }
  }

  const priorityConfig = {
    low: { color: 'text-gray-400', bg: 'bg-gray-500/20', label: 'Low' },
    medium: { color: 'text-blue-400', bg: 'bg-blue-500/20', label: 'Medium' },
    high: { color: 'text-orange-400', bg: 'bg-orange-500/20', label: 'High' },
    urgent: { color: 'text-red-400', bg: 'bg-red-500/20', label: 'Urgent' },
  };

  const statusConfig = {
    pending: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', label: 'Pending' },
    in_progress: { color: 'text-blue-400', bg: 'bg-blue-500/20', label: 'In Progress' },
    completed: { color: 'text-green-400', bg: 'bg-green-500/20', label: 'Completed' },
    cancelled: { color: 'text-gray-400', bg: 'bg-gray-500/20', label: 'Cancelled' },
  };

  function calculateAging(createdAt: string, completedAt?: string | null): string {
    const start = new Date(createdAt);
    const end = completedAt ? new Date(completedAt) : new Date();
    const diffMs = end.getTime() - start.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (diffDays > 0) {
      return `${diffDays}d ${diffHours}h`;
    } else if (diffHours > 0) {
      const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      return `${diffHours}h ${diffMinutes}m`;
    } else {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return `${diffMinutes}m`;
    }
  }

  const completedTasks = tasks.filter(t => t.status === 'completed' && t.completed_at);
  const avgCompletionTime = completedTasks.length > 0
    ? completedTasks.reduce((sum, task) => {
        const diffMs = new Date(task.completed_at!).getTime() - new Date(task.created_at).getTime();
        return sum + diffMs;
      }, 0) / completedTasks.length
    : 0;

  const avgDays = Math.floor(avgCompletionTime / (1000 * 60 * 60 * 24));
  const avgHours = Math.floor((avgCompletionTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const avgMinutes = Math.floor((avgCompletionTime % (1000 * 60 * 60)) / (1000 * 60));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-gray-400">Loading tasks...</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-cyan-400" />
            Tasks
            <span className="text-sm text-gray-400">({tasks.length})</span>
          </h3>
          {completedTasks.length > 0 && (
            <p className="text-xs text-gray-500">
              Avg completion: {avgDays > 0 ? `${avgDays}d ` : ''}{avgHours > 0 ? `${avgHours}h ` : ''}{avgMinutes}m
            </p>
          )}
        </div>
        <button
          onClick={() => {
            setEditingTask(undefined);
            setShowForm(true);
          }}
          className="px-3 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:shadow-lg hover:shadow-cyan-500/50 transition-all text-sm font-medium flex items-center gap-1"
        >
          <Plus className="w-4 h-4" />
          Add Task
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="text-center py-8 text-gray-500 bg-gray-800/30 rounded-lg border border-gray-700">
          <Clock className="w-8 h-8 mx-auto mb-2 text-gray-600" />
          <p>No tasks yet</p>
          <p className="text-sm mt-1">Create your first task to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => {
            const priority = priorityConfig[task.priority];
            const status = statusConfig[task.status];
            const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed';
            const canEdit = profile?.id === task.user_id;

            return (
              <div
                key={task.id}
                className={`bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border transition-all ${
                  task.status === 'completed'
                    ? 'border-green-500/30 opacity-75'
                    : isOverdue
                    ? 'border-red-500/50 shadow-lg shadow-red-500/10'
                    : 'border-purple-500/30'
                }`}
              >
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => canEdit && toggleTaskStatus(task)}
                    disabled={!canEdit}
                    className={`flex-shrink-0 mt-0.5 ${canEdit ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
                  >
                    {task.status === 'completed' ? (
                      <CheckCircle2 className="w-5 h-5 text-green-400" />
                    ) : (
                      <Circle className="w-5 h-5 text-gray-500 hover:text-cyan-400 transition-colors" />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h4 className={`font-medium ${
                        task.status === 'completed' ? 'line-through text-gray-500' : 'text-white'
                      }`}>
                        {task.title}
                      </h4>
                      {canEdit && (
                        <div className="flex gap-1 flex-shrink-0">
                          <button
                            onClick={() => {
                              setEditingTask(task);
                              setShowForm(true);
                            }}
                            className="p-1.5 text-cyan-400 hover:bg-gray-700 rounded transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(task.id)}
                            className="p-1.5 text-red-400 hover:bg-red-500/20 rounded transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {task.description && (
                      <p className={`text-sm mb-2 ${
                        task.status === 'completed' ? 'text-gray-600' : 'text-gray-400'
                      }`}>
                        {task.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`px-2 py-1 rounded font-medium ${priority.bg} ${priority.color} flex items-center gap-1`}>
                        <Flag className="w-3 h-3" />
                        {priority.label}
                      </span>
                      <span className={`px-2 py-1 rounded font-medium ${status.bg} ${status.color}`}>
                        {status.label}
                      </span>
                      <span className={`px-2 py-1 rounded font-medium ${
                        task.status === 'completed'
                          ? 'bg-green-500/20 text-green-400'
                          : isOverdue
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-blue-500/20 text-blue-400'
                      } flex items-center gap-1`}>
                        <Clock className="w-3 h-3" />
                        {task.status === 'completed' && task.completed_at
                          ? `Completed in ${calculateAging(task.created_at, task.completed_at)}`
                          : `Age: ${calculateAging(task.created_at)}`
                        }
                      </span>
                      {task.due_date && (
                        <span className={`px-2 py-1 rounded font-medium flex items-center gap-1 ${
                          isOverdue
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-gray-700 text-gray-300'
                        }`}>
                          <Calendar className="w-3 h-3" />
                          {new Date(task.due_date).toLocaleDateString()}
                        </span>
                      )}
                      {task.profiles && (
                        <span className="text-gray-500">
                          by {task.profiles.full_name}
                        </span>
                      )}
                      <span className="text-gray-600">
                        {formatDistanceToNow(task.created_at)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <TaskForm
          leadId={leadId}
          task={editingTask}
          onClose={() => {
            setShowForm(false);
            setEditingTask(undefined);
          }}
          onSuccess={() => {
            setShowForm(false);
            setEditingTask(undefined);
            loadTasks();
          }}
        />
      )}

      <ConfirmModal
        isOpen={confirmDeleteId !== null}
        title="Delete Task"
        message="Are you sure you want to delete this task? This cannot be undone."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => { const id = confirmDeleteId; setConfirmDeleteId(null); id && deleteTask(id); }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
