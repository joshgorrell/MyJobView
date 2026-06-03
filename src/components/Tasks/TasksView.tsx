import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Clock, Flag, Calendar, Edit2, Trash2, Plus, Filter, MessageSquare, ChevronDown, ChevronUp, HelpCircle, X, Search } from 'lucide-react';
import ConfirmModal from '../ui/ConfirmModal';
import { supabase } from '../../lib/supabase';
import { Task, Lead } from '../../lib/types';
import { formatDistanceToNow } from '../../lib/utils';
import { TaskForm } from './TaskForm';
import { TaskComments } from './TaskComments';
import { TaskWatchers } from './TaskWatchers';
import { useAuth } from '../../contexts/AuthContext';

interface TasksViewProps {
  initialShowForm?: boolean;
  onFormClose?: () => void;
  openTaskId?: string | null;
  onTaskOpened?: () => void;
}

export function TasksView({ initialShowForm = false, onFormClose, openTaskId, onTaskOpened }: TasksViewProps = {}) {
  const { profile, loading: authLoading } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [leads, setLeads] = useState<Record<string, Lead>>({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(initialShowForm);
  const [editingTask, setEditingTask] = useState<Task | undefined>();

  useEffect(() => {
    if (initialShowForm) {
      setEditingTask(undefined);
      setShowForm(true);
    }
  }, [initialShowForm]);
  const [showCompleted, setShowCompleted] = useState<boolean>(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; isDiscussion?: boolean } | null>(null);
  const [viewFilter, setViewFilter] = useState<'my' | 'all'>('my');
  const [canViewAllTasks, setCanViewAllTasks] = useState<boolean>(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLeadId, setSelectedLeadId] = useState<string>('');

  useEffect(() => {
    // Wait for auth to complete before attempting to load
    if (authLoading) {
      return;
    }

    if (!profile) {
      setLoading(false);
      return;
    }

    loadTasks();
    checkViewAllTasksPermission();
    markTaskNotificationsRead();

    const channel = supabase
      .channel('tasks_view_changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tasks',
      }, () => {
        loadTasks();
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'discussion_posts',
      }, () => {
        loadTasks();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [viewFilter, authLoading, profile]);

  // Auto-expand task when openTaskId is provided
  useEffect(() => {
    if (openTaskId && tasks.length > 0) {
      const taskExists = tasks.find(t => t.id === openTaskId);
      if (taskExists) {
        setExpandedTaskId(openTaskId);
        onTaskOpened?.();

        // Scroll to the task
        setTimeout(() => {
          const element = document.getElementById(`task-${openTaskId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2');
            setTimeout(() => {
              element.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2');
            }, 2000);
          }
        }, 100);
      }
    }
  }, [openTaskId, tasks, onTaskOpened]);

  async function markTaskNotificationsRead() {
    if (!profile) return;
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', profile.id)
        .in('type', ['task_assigned', 'task'])
        .eq('is_read', false);
    } catch (error) {
      console.error('Error marking task notifications as read:', error);
    }
  }

  async function checkViewAllTasksPermission() {
    if (!profile) return;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('can_view_all_tasks')
        .eq('id', profile.id)
        .single();

      if (error) throw error;
      setCanViewAllTasks(data?.can_view_all_tasks ?? true);
    } catch (error) {
      console.error('Error checking view all tasks permission:', error);
      setCanViewAllTasks(true); // Default to true on error
    }
  }

  async function loadTasks() {
    if (!profile) return;

    try {
      // Load regular tasks
      let tasksQuery = supabase
        .from('tasks')
        .select(`
          *,
          profiles!tasks_user_id_fkey(full_name),
          assigned_profile:profiles!tasks_assigned_to_fkey(full_name),
          contacts(full_name, company_name, phone)
        `);

      if (viewFilter === 'my') {
        tasksQuery = tasksQuery.or(`user_id.eq.${profile.id},assigned_to.eq.${profile.id}`);
      }

      const { data: tasksData, error: tasksError } = await tasksQuery
        .order('created_at', { ascending: false });

      if (tasksError) throw tasksError;

      // Load discussion posts that are tasks (without profile join to avoid RLS issues)
      let discussionQuery = supabase
        .from('discussion_posts')
        .select('*')
        .eq('post_type', 'task')
        .is('parent_id', null);

      if (viewFilter === 'my') {
        discussionQuery = discussionQuery.or(`user_id.eq.${profile.id},assigned_to.eq.${profile.id}`);
      }

      const { data: discussionTasks, error: discussionError } = await discussionQuery
        .order('created_at', { ascending: false });

      if (discussionError) throw discussionError;

      // Fetch profile data for discussion tasks
      const userIds = [...new Set(discussionTasks?.map((t: any) => t.user_id) || [])];
      const { data: profilesData } = userIds.length > 0
        ? await supabase.from('profiles').select('id, full_name').in('id', userIds)
        : { data: [] };

      const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);

      // Convert discussion tasks to task format
      const convertedDiscussionTasks = (discussionTasks || []).map((post: any) => {
        const postProfile = profilesMap.get(post.user_id);
        return {
          id: post.id,
          lead_id: post.lead_id || null,
          contact_id: post.contact_id || null,
          user_id: post.user_id,
          title: post.content.split('\n')[0].substring(0, 100),
          description: post.content,
          status: post.is_completed ? 'completed' : 'pending',
          priority: 'medium',
          due_date: null,
          completed_at: post.completed_at,
          created_at: post.created_at,
          updated_at: post.updated_at,
          profiles: postProfile,
          _isDiscussionTask: true,
          _discussionPost: post
        };
      });

      // Combine and sort with urgent priority first
      const allTasks = [...(tasksData || []), ...convertedDiscussionTasks];

      // Load leads only for the task lead_ids that are actually referenced
      const leadIds = [...new Set(allTasks.map(t => t.lead_id).filter(Boolean))];
      if (leadIds.length > 0) {
        const { data: leadsData } = await supabase
          .from('leads')
          .select('id, company_name, contact_name')
          .in('id', leadIds);

        const leadsMap: Record<string, Lead> = {};
        leadsData?.forEach((lead) => { leadsMap[lead.id] = lead; });
        setLeads(leadsMap);
      }

      const sortedTasks = allTasks.sort((a, b) => {
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
      const isDiscussionTask = (task as any)._isDiscussionTask;
      const newStatus = task.status === 'completed' ? 'pending' : 'completed';

      if (isDiscussionTask) {
        // Handle discussion post task
        const updateData: any = {
          is_completed: newStatus === 'completed',
          completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
          completed_by: newStatus === 'completed' ? profile?.id : null
        };

        const { error } = await supabase
          .from('discussion_posts')
          .update(updateData)
          .eq('id', task.id);

        if (error) throw error;

        if (newStatus === 'completed' && profile) {
          const { data: pointsConfig } = await supabase
            .from('points_configuration')
            .select('task_completion_points')
            .single();

          const postPoints = (task as any)._discussionPost?.points || pointsConfig?.task_completion_points || 10;

          await supabase.from('points_transactions').insert([{
            user_id: profile.id,
            points_amount: postPoints,
            transaction_type: 'task_completion',
            reference_id: task.id,
            description: `Completed task: ${task.title.substring(0, 50)}...`,
          }]);

          await supabase.from('notifications').insert([{
            user_id: profile.id,
            type: 'points_earned',
            title: `+${postPoints} Points!`,
            body: `You earned ${postPoints} points for completing a task`,
          }]);
        }
      } else {
        // Handle regular task
        const updateData: any = {
          status: newStatus,
          completed_at: newStatus === 'completed' ? new Date().toISOString() : null
        };

        if (newStatus === 'completed' && !(task as any).assigned_to && !(task as any).claimed_by) {
          updateData.claimed_by = profile?.id;
        }

        const { error } = await supabase
          .from('tasks')
          .update(updateData)
          .eq('id', task.id);

        if (error) throw error;

        if (newStatus === 'completed' && profile) {
          const pointsToAward = (task as any).points || 10;
          await supabase.rpc('award_points', {
            p_user_id: profile.id,
            p_points: pointsToAward,
            p_reason: `Completed task: ${task.title}`
          });
        }
      }

      loadTasks();
    } catch (error) {
      console.error('Error updating task:', error);
      alert('Failed to update task status');
    }
  }

  async function deleteTask(taskId: string, isDiscussionTask?: boolean) {
    try {
      const tableName = isDiscussionTask ? 'discussion_posts' : 'tasks';
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', taskId);

      if (error) throw error;
      loadTasks();
    } catch (error) {
      console.error('Error deleting task:', error);
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

  const filteredTasks = tasks.filter(task => {
    // Hide completed tasks unless showCompleted is checked
    if (!showCompleted && task.status === 'completed') return false;

    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const titleMatch = task.title?.toLowerCase().includes(search);
      const descriptionMatch = task.description?.toLowerCase().includes(search);
      const assignedUserName = (task as any).assigned_user_name?.toLowerCase();
      const assignedUserMatch = assignedUserName?.includes(search);
      const leadMatch = task.lead_id && leads[task.lead_id]
        ? (leads[task.lead_id].company_name?.toLowerCase().includes(search) ||
           leads[task.lead_id].contact_name?.toLowerCase().includes(search))
        : false;

      if (!titleMatch && !descriptionMatch && !assignedUserMatch && !leadMatch) {
        return false;
      }
    }

    return true;
  });

  const completedTasks = filteredTasks.filter(t => t.status === 'completed' && t.completed_at);
  const avgCompletionTime = completedTasks.length > 0
    ? completedTasks.reduce((sum, task) => {
        const diffMs = new Date(task.completed_at!).getTime() - new Date(task.created_at).getTime();
        return sum + diffMs;
      }, 0) / completedTasks.length
    : 0;

  const avgDays = Math.floor(avgCompletionTime / (1000 * 60 * 60 * 24));
  const avgHours = Math.floor((avgCompletionTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const avgMinutes = Math.floor((avgCompletionTime % (1000 * 60 * 60)) / (1000 * 60));

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading tasks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-4">
        <div className="flex flex-col gap-3">
          {/* Filter buttons and New Task button */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setViewFilter('my')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors text-sm ${
                viewFilter === 'my'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              My Tasks
            </button>
            {canViewAllTasks && (
              <button
                onClick={() => setViewFilter('all')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors text-sm ${
                  viewFilter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                All Tasks
              </button>
            )}
            <button
              onClick={() => setShowHelp(true)}
              className="inline-flex items-center gap-1 px-3 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium text-sm"
              title="Help & Instructions"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setEditingTask(undefined);
                setShowForm(true);
              }}
              className="inline-flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm ml-auto"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Task</span>
              <span className="sm:hidden">New</span>
            </button>
          </div>

          {/* Search bar - full width on mobile */}
          <div className="relative w-full">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-9 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:text-gray-900 transition-colors">
              <input
                type="checkbox"
                checked={showCompleted}
                onChange={(e) => setShowCompleted(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              Show completed tasks
            </label>
          </div>
        </div>
      </div>

      {filteredTasks.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <Clock className="w-12 h-12 mx-auto mb-3 text-gray-400" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No tasks found</h3>
          <p className="text-gray-300">Create your first task to get started</p>
        </div>
      ) : (
        <div className="space-y-1.5">
            {filteredTasks.map((task) => {
              const priority = priorityConfig[task.priority];
              const status = statusConfig[task.status];
              const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed';
              const isDiscussionTask = (task as any)._isDiscussionTask;
              const isOwner = profile?.id === task.user_id;
              const isAssigned = profile?.id === (task as any).assigned_to;
              const isAdmin = profile?.role === 'admin';
              const canEdit = isOwner || isAdmin;
              const canInteract = isOwner || isAssigned || isAdmin;
              const canDelete = isOwner || isAdmin;
              const lead = task.lead_id ? leads[task.lead_id] : null;

              const contact = (task as any).contacts;
              const customerName = contact?.full_name || contact?.company_name || null;
              const createdAt = new Date(task.created_at);
              const createdDateStr = createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

              return (
                <div
                  key={task.id}
                  id={`task-${task.id}`}
                  className={`bg-white rounded-lg border transition-all hover:shadow-sm ${
                    task.status === 'completed'
                      ? 'border-green-200 bg-green-50/30'
                      : isOverdue
                      ? 'border-red-300 bg-red-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  {/* Priority stripe */}
                  <div className={`h-0.5 rounded-t-lg ${
                    task.priority === 'urgent' ? 'bg-red-500' :
                    task.priority === 'high' ? 'bg-orange-400' :
                    task.priority === 'medium' ? 'bg-blue-400' :
                    'bg-gray-200'
                  }`} />

                  <div className="px-3 py-2">
                    {/* Main row: complete toggle + title + badges + actions */}
                    <div className="flex items-center gap-2 min-w-0">
                      {/* Complete toggle */}
                      {canInteract && (
                        <button
                          onClick={() => toggleTaskStatus(task)}
                          className="flex-shrink-0"
                          title={task.status === 'completed' ? 'Reopen' : 'Mark complete'}
                        >
                          {task.status === 'completed' ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                          ) : (
                            <Circle className="w-4 h-4 text-gray-400 hover:text-green-500 transition-colors" />
                          )}
                        </button>
                      )}

                      {/* Title */}
                      <span className={`flex-1 min-w-0 text-sm font-medium leading-tight truncate ${
                        task.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-900'
                      }`}>
                        {task.title}
                      </span>

                      {/* Inline badges - hidden on very small screens */}
                      <div className="hidden sm:flex items-center gap-1 flex-shrink-0 text-xs">
                        <span className={`px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5 ${
                          task.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                          task.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                          task.priority === 'medium' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          <Flag className="w-2.5 h-2.5" />
                          {priority.label}
                        </span>
                        {task.status !== 'completed' && (
                          <span className={`px-1.5 py-0.5 rounded font-medium ${status.bg} ${status.color}`}>
                            {status.label}
                          </span>
                        )}
                        {task.due_date && (
                          <span className={`px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5 ${
                            isOverdue ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                            <Calendar className="w-2.5 h-2.5" />
                            {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {isOverdue && ' !'}
                          </span>
                        )}
                        {(task as any).assigned_profile && (
                          <span className="px-1.5 py-0.5 rounded font-medium bg-violet-100 text-violet-700 truncate max-w-[80px]">
                            → {(task as any).assigned_profile.full_name.split(' ')[0]}
                          </span>
                        )}
                        {task.status === 'completed' && task.completed_at && (
                          <span className="text-green-600 font-medium">{calculateAging(task.created_at, task.completed_at)}</span>
                        )}
                      </div>

                      {/* Action icons */}
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button
                          onClick={() => setExpandedTaskId(expandedTaskId === task.id ? null : task.id)}
                          className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Discuss"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>
                        {canEdit && (
                          <button
                            onClick={() => { setEditingTask(task); setSelectedLeadId(task.lead_id); setShowForm(true); }}
                            className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => setConfirmDelete({ id: task.id, isDiscussion: isDiscussionTask })}
                            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {expandedTaskId === task.id ? <ChevronUp className="w-3 h-3 text-gray-400" /> : null}
                      </div>
                    </div>

                    {/* Secondary row: context + meta (compact) */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 pl-6 text-xs text-gray-400">
                      {(customerName || lead) && (
                        <span className="text-blue-600 font-medium truncate">
                          {customerName || lead?.company_name || lead?.contact_name}
                        </span>
                      )}
                      {task.profiles?.full_name && (
                        <span className="text-gray-500">{task.profiles.full_name}</span>
                      )}
                      <span>{createdDateStr}</span>
                      {/* Mobile badges */}
                      <span className={`sm:hidden px-1.5 py-0.5 rounded font-medium flex items-center gap-0.5 ${
                        task.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                        task.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                        task.priority === 'medium' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        <Flag className="w-2.5 h-2.5" />
                        {priority.label}
                      </span>
                      {isOverdue && <span className="text-red-500 font-medium">Overdue</span>}
                    </div>

                    {/* Description - only shown if task expanded */}
                    {task.description && expandedTaskId === task.id && (
                      <p className={`text-xs mt-1.5 pl-6 leading-relaxed ${
                        task.status === 'completed' ? 'text-gray-400' : 'text-gray-600'
                      }`}>
                        {task.description}
                      </p>
                    )}

                    {expandedTaskId === task.id && (
                      <div className="mt-3 pt-3 border-t border-gray-100 space-y-4">
                        <TaskWatchers taskId={task.id} />
                        <TaskComments taskId={task.id} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {showForm && (
        <TaskForm
          leadId={selectedLeadId}
          task={editingTask}
          onClose={() => {
            setShowForm(false);
            setEditingTask(undefined);
            setSelectedLeadId('');
            onFormClose?.();
          }}
          onSuccess={async () => {
            setShowForm(false);
            setEditingTask(undefined);
            setSelectedLeadId('');
            onFormClose?.();
            await new Promise(resolve => setTimeout(resolve, 100));
            await loadTasks();
          }}
        />
      )}

      {showHelp && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-full sm:max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <HelpCircle className="w-6 h-6 text-blue-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Tasks Help & Instructions</h2>
              </div>
              <button
                onClick={() => setShowHelp(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <section className="space-y-3">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Plus className="w-5 h-5 text-blue-600" />
                  Creating Tasks
                </h3>
                <p className="text-gray-700">
                  Click the <span className="font-semibold text-blue-600">New Task</span> button to create a new task. Fill in the title, description, priority, due date, and optionally assign it to a team member or link it to a lead.
                </p>
              </section>

              <section className="space-y-3">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Edit2 className="w-5 h-5 text-blue-600" />
                  Editing & Updating Tasks
                </h3>
                <p className="text-gray-700">
                  Click the <span className="font-semibold">Edit Task</span> button to modify a task. You can update any field including reassigning the task to someone else. Tasks created from Team Pulse discussions are now fully editable.
                </p>
              </section>

              <section className="space-y-3">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-blue-600" />
                  Task Discussions & Comments
                </h3>
                <p className="text-gray-700">
                  Click the <span className="font-semibold">Discuss</span> button on any task to expand the collaboration panel where you can:
                </p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                  <li><span className="font-semibold">Add Comments:</span> Share updates, ask questions, or provide feedback</li>
                  <li><span className="font-semibold">Edit Your Comments:</span> Use the edit icon to modify your comments</li>
                  <li><span className="font-semibold">Delete Comments:</span> Remove your own comments if needed</li>
                  <li><span className="font-semibold">See Live Updates:</span> Comments appear instantly for all team members</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <span className="text-cyan-400 font-bold text-xl">@</span>
                  Mentioning Team Members
                </h3>
                <p className="text-gray-700">
                  Type <span className="font-mono bg-gray-100 px-2 py-1 rounded text-cyan-600">@</span> in any comment to see a dropdown of team members. Select someone to mention them:
                </p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                  <li>Mentioned users receive instant notifications</li>
                  <li>They're automatically added as watchers on the task</li>
                  <li>Mentions are highlighted in cyan for easy visibility</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Circle className="w-5 h-5 text-blue-600" />
                  Watching Tasks
                </h3>
                <p className="text-gray-700">
                  Click the <span className="font-semibold">Watch</span> button to follow a task and receive notifications about all updates and comments.
                </p>
                <p className="text-gray-700 font-semibold">You're automatically added as a watcher when you:</p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                  <li>Create a task</li>
                  <li>Get assigned to a task</li>
                  <li>Comment on a task</li>
                  <li>Are mentioned in a task or comment</li>
                </ul>
                <p className="text-gray-700">
                  Click <span className="font-semibold">Unwatch</span> at any time to stop receiving notifications.
                </p>
              </section>

              <section className="space-y-3">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Filter className="w-5 h-5 text-blue-600" />
                  Filtering & Viewing
                </h3>
                <p className="text-gray-700">
                  Use the filter options to find specific tasks:
                </p>
                <ul className="list-disc list-inside space-y-2 text-gray-700 ml-4">
                  <li><span className="font-semibold">My Tasks:</span> See only tasks you created or are assigned to</li>
                  <li><span className="font-semibold">All Tasks:</span> View all company tasks (if you have permission)</li>
                  <li><span className="font-semibold">Filter by Lead:</span> Show tasks linked to a specific lead</li>
                  <li><span className="font-semibold">Filter by Status:</span> View tasks by their current status</li>
                  <li><span className="font-semibold">Show Completed:</span> Toggle to show or hide completed tasks</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  Task Status & Completion
                </h3>
                <p className="text-gray-700">
                  Click <span className="font-semibold text-green-600">Mark as Complete</span> to finish a task, or <span className="font-semibold text-blue-600">Mark as Incomplete</span> to reopen it. Completed tasks show completion time and can be filtered out.
                </p>
              </section>

              <section className="space-y-3">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Flag className="w-5 h-5 text-red-600" />
                  Priority Levels
                </h3>
                <p className="text-gray-700">
                  Set task priority to help your team focus on what matters most:
                </p>
                <div className="flex flex-wrap gap-2 ml-4">
                  <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-sm font-medium">Low</span>
                  <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-sm font-medium">Medium</span>
                  <span className="px-3 py-1 rounded-full bg-yellow-100 text-yellow-700 text-sm font-medium">High</span>
                  <span className="px-3 py-1 rounded-full bg-red-100 text-red-700 text-sm font-medium">Urgent</span>
                </div>
              </section>

              <section className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                <h3 className="text-lg font-semibold text-blue-900 flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  Pro Tip: Team Pulse Integration
                </h3>
                <p className="text-blue-800">
                  Tasks created from Team Pulse discussions automatically link back to the original conversation. Use this to track action items from team discussions. These tasks are now fully editable just like regular tasks!
                </p>
              </section>
            </div>

            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4">
              <button
                onClick={() => setShowHelp(false)}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
              >
                Got it, thanks!
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmDelete !== null}
        title="Delete Task"
        message="Are you sure you want to delete this task? This cannot be undone."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => {
          const d = confirmDelete;
          setConfirmDelete(null);
          if (d) deleteTask(d.id, d.isDiscussion);
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
