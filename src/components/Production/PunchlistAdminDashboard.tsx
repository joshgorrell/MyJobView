import { punchlistDescription } from '../../lib/punchlist';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  ClipboardList,
  CheckCircle2,
  FileText,
  Send,
  Search,
  Eye,
  Image as ImageIcon,
  MessageSquare,
  User,
  Users,
  Mail,
  Phone,
  Calendar,
  Filter,
  X,
  ChevronDown,
  ChevronUp,
  CheckCheck,
  RotateCcw,
  HelpCircle,
  Star,
  TrendingUp,
  AlertCircle,
  Layers,
  ArrowRight,
  Info,
  Trash2
} from 'lucide-react';
import { PunchlistInviteManager } from './PunchlistInviteManager';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../Shared/Toast';
import { markPunchlistSeen } from '../../hooks/usePunchlistUnseenCount';
import { PunchlistTaskDetailModal } from '../Portal/PunchlistTaskDetailModal';
import { ContactQuickViewModal } from '../Shared/ContactQuickViewModal';

interface PunchlistTask {
  id: string;
  contact_id: string;
  title: string;
  details: string | null;
  customer_notes: string | null;
  priority_order: number;
  status: string;
  created_at: string;
  updated_at: string;
  requested_at: string | null;
  completed_at: string | null;
  completed_by_customer?: boolean;
  installer_notes: string | null;
  service_request_id?: string | null;
  work_order_id?: string | null;
  combined_description?: string | null;
  contact: {
    full_name: string;
    first_name?: string | null;
    last_name?: string | null;
    email: string;
    phone: string;
  };
  access_grant: {
    access_type: string;
    expiration_date: string | null;
  } | null;
  photos?: Array<{
    id: string;
    photo_url: string;
    caption: string | null;
    uploaded_at: string;
  }>;
  service_request?: {
    id: string;
    status: string;
    work_order_id: string | null;
    work_order?: {
      id: string;
      work_order_number: string;
    } | null;
  } | null;
}

export function PunchlistAdminDashboard({ onOpenSalesOrder }: { onOpenSalesOrder?: (salesOrderId: string) => void } = {}) {
  const { profile, loading: authLoading } = useAuth();
  const toast = useToast();
  const [tasks, setTasks] = useState<PunchlistTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'punchlist' | 'customers'>('punchlist');
  const [openInviteCount, setOpenInviteCount] = useState(0);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [showHelp, setShowHelp] = useState(false);
  const [showBatchRequestModal, setShowBatchRequestModal] = useState(false);
  const [contactFilter, setContactFilter] = useState<{ id: string; name: string } | null>(null);
  const [detailTask, setDetailTask] = useState<PunchlistTask | null>(null);
  const [quickViewContactId, setQuickViewContactId] = useState<string | null>(null);

  useEffect(() => {
    // Wait for auth to complete before attempting to load
    if (authLoading) {
      return;
    }

    if (profile?.id) {
      markPunchlistSeen(profile.id);
    }

    setLoading(true);
    loadTasks();

    const tasksSubscription = supabase
      .channel('admin_punchlist_tasks_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'punchlist_tasks' },
        () => {
          loadTasks();
        }
      )
      .subscribe();

    return () => {
      tasksSubscription.unsubscribe();
    };
  }, [authLoading]);

  async function loadTasks() {
    try {
      const { data, error } = await supabase
        .from('punchlist_tasks')
        .select(`
          *,
          contact:contacts!inner(full_name, first_name, last_name, email, phone),
          access_grant:punchlist_access_grants(access_type, expiration_date),
          photos:punchlist_task_photos(*),
          service_request:service_requests!service_request_id(
            id,
            status,
            work_order_id,
            work_order:work_orders!work_order_id(
              id,
              work_order_number
            )
          )
        `)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      // Sort tasks with priority: Requested first, then Draft, then Completed
      // Within each status, keep the date ordering
      const sortedTasks = (data || []).sort((a, b) => {
        const statusPriority: Record<string, number> = {
          'requested': 1,
          'scheduled': 2,
          'draft': 3,
          'completed': 4
        };

        const priorityA = statusPriority[a.status] || 4;
        const priorityB = statusPriority[b.status] || 4;

        // First sort by status priority
        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }

        // Within the same status, sort by updated_at (most recent first)
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });

      setTasks(sortedTasks);
    } catch (error) {
      console.error('Error loading punchlist tasks:', error);
    } finally {
      setLoading(false);
    }
  }

  async function updateTaskStatus(taskId: string, newStatus: string) {
    try {
      if (newStatus === 'requested') {
        const task = tasks.find(t => t.id === taskId);
        if (!task) {
          throw new Error('Task not found');
        }

        const doRequest = async () => {
          const { error } = await supabase.rpc('request_punchlist_service', {
            p_task_ids: [taskId],
            p_contact_id: task.contact_id,
            p_notes: null
          });

          if (error) throw error;

          toast.success('The task has been marked as requested.', 'Service request created');
          loadTasks();
        };

        toast.confirm('This will create a service request for this punchlist item.', doRequest, 'Mark as Requested?');
      } else if (newStatus === 'scheduled') {
        const { error } = await supabase
          .from('punchlist_tasks')
          .update({ status: 'scheduled' })
          .eq('id', taskId);

        if (error) throw error;
        loadTasks();
      } else if (newStatus === 'completed') {
        const { error } = await supabase.rpc('mark_punchlist_task_completed', {
          p_task_id: taskId, p_completed_by_customer: false
        });
        if (error) throw error;
        loadTasks();
      } else if (newStatus === 'draft') {
        toast.confirm('This will mark the task as incomplete and remove the completion date.', async () => {
          try {
            const { error } = await supabase.rpc('update_punchlist_item', { p_task_id: taskId, p_action: 'reopen' });

            if (error) throw error;
            toast.success('Task has been reopened and marked as incomplete.');
            loadTasks();
          } catch (error: any) {
            toast.error(error.message, 'Failed to update task');
          }
        }, 'Reopen this task?');
        return;
      }
    } catch (error: any) {
      console.error('Error updating task:', error);
      toast.error(error.message, 'Failed to update task');
    }
  }

  async function handleAdminRecallTask(task: Pick<PunchlistTask, 'id' | 'service_request' | 'work_order_id'>) {
    const hasWorkOrder = task.service_request?.work_order_id || task.work_order_id;
    if (hasWorkOrder) return;

    toast.confirm(
      'Return this item to Not Requested? Other items in the request remain requested.',
      async () => {
        try {
          const { error } = await supabase.rpc('update_punchlist_item', { p_task_id: task.id, p_action: 'cancel' });
          if (error) throw error;

          toast.success('Item returned to Not Requested.');
          setDetailTask(null);
          loadTasks();
        } catch (error: any) {
          toast.error(error.message, 'Failed to recall task');
        }
      },
      'Cancel Request for Item?'
    );
  }

  async function handleAdminDeleteTask(task: Pick<PunchlistTask, 'id' | 'service_request' | 'work_order_id'>) {
    const hasWorkOrder = task.service_request?.work_order_id || task.work_order_id;
    if (hasWorkOrder) return;

    toast.confirm(
      'Permanently remove this item? Other items in the request remain requested. This cannot be undone.',
      async () => {
        try {
          const { error } = await supabase.rpc('update_punchlist_item', { p_task_id: task.id, p_action: 'delete' });
          if (error) throw error;

          toast.success('Task deleted.');
          setDetailTask(null);
          loadTasks();
        } catch (error: any) {
          toast.error(error.message, 'Failed to delete task');
        }
      },
      'Delete Task?'
    );
  }

  // Helper functions for multi-select
  const toggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

  const selectableTasks = tasks.filter(
    task => task.status === 'draft' && !task.service_request_id && !task.work_order_id
  );

  const toggleSelectAll = () => {
    if (selectableTasks.length > 0 && selectableTasks.every(task => selectedTaskIds.has(task.id))) {
      setSelectedTaskIds(new Set());
    } else {
      setSelectedTaskIds(new Set(selectableTasks.map(t => t.id)));
    }
  };

  const stats = {
    draft: tasks.filter(t => t.status === 'draft').length,
    requested: tasks.filter(t => t.status === 'requested').length,
    scheduled: tasks.filter(t => t.status === 'scheduled').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    total: tasks.length,
  };

  const filteredTasks = tasks.filter(task => {
    // Filter by contact if set
    if (contactFilter && task.contact_id !== contactFilter.id) {
      return false;
    }

    // Filter by status
    if (selectedFilter !== 'all' && task.status !== selectedFilter) {
      return false;
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        task.title.toLowerCase().includes(query) ||
        task.contact.full_name.toLowerCase().includes(query) ||
        task.contact.email.toLowerCase().includes(query) ||
        task.details?.toLowerCase().includes(query)
      );
    }

    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted">Loading punchlist data...</div>
      </div>
    );
  }

  const handleSendInvite = () => {
    setOpenInviteCount(c => c + 1);
    setActiveTab('customers');
  };

  const handleViewCustomerTasks = (contactId: string, contactName: string, filterStatus: string) => {
    setContactFilter({ id: contactId, name: contactName });
    setSelectedFilter(filterStatus);
    setSearchQuery('');
    setActiveTab('punchlist');
  };

  return (
    <div className="space-y-2 sm:space-y-4 px-1 sm:px-0">
      {/* Header - Compact */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-base sm:text-xl font-bold text-primary flex items-center gap-2">
          <ClipboardList className="w-5 h-5" />
          <span className="sm:hidden">Punchlist</span><span className="hidden sm:inline">Punchlist Management</span>
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHelp(true)}
            className="p-2.5 bg-elevated hover:bg-surface text-primary rounded-lg transition-colors"
            title="How Punchlist Access Works"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
          <button
            onClick={handleSendInvite}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium whitespace-nowrap"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Send Invite</span>
          </button>
        </div>
      </div>

      {/* Tabs - Compact */}
      <div className="border-b border-subtle">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('punchlist')}
            className={`px-4 py-2 text-sm font-medium transition-all ${
              activeTab === 'punchlist'
                ? 'text-primary border-b-2 border-blue-500 bg-surface/50'
                : 'text-muted hover:text-secondary hover:bg-surface/30'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <ClipboardList className="w-4 h-4" />
              Tasks
            </div>
          </button>
          <button
            onClick={() => setActiveTab('customers')}
            className={`px-4 py-2 text-sm font-medium transition-all ${
              activeTab === 'customers'
                ? 'text-primary border-b-2 border-blue-500 bg-surface/50'
                : 'text-muted hover:text-secondary hover:bg-surface/30'
            }`}
          >
            <div className="flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              Customers
            </div>
          </button>
        </div>
      </div>

      {/* Punchlist Tab Content */}
      {activeTab === 'punchlist' && (
        <>
      {/* Search and Filter Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[140px] relative">
          <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-surface border border-subtle rounded-lg text-primary focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        {/* Status dropdown */}
        <div className="relative flex-shrink-0">
          <select
            value={selectedFilter}
            onChange={e => setSelectedFilter(e.target.value as typeof selectedFilter)}
            className="appearance-none pl-3 pr-7 py-2 bg-surface border border-subtle rounded-lg text-xs sm:text-sm text-primary focus:outline-none focus:border-gray-500 cursor-pointer hover:border-strong transition-colors"
          >
            <option value="all">All ({stats.total})</option>
            <option value="draft">Not Requested ({stats.draft})</option>
            <option value="requested">Requested ({stats.requested})</option>
            <option value="scheduled">Scheduled ({stats.scheduled})</option>
            <option value="completed">Completed ({stats.completed})</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted pointer-events-none" />
        </div>
        {(selectedFilter !== 'all' || searchQuery) && (
          <button
            onClick={() => { setSelectedFilter('all'); setSearchQuery(''); }}
            className="px-3 py-2 text-sm bg-elevated hover:bg-surface text-primary rounded-lg flex items-center gap-1.5 whitespace-nowrap"
          >
            <X className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </div>

      {/* Contact Filter Banner */}
      {contactFilter && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-amber-900/30 border border-amber-600 rounded-lg text-xs">
          <div className="flex items-center gap-2 text-amber-300">
            <User className="w-3.5 h-3.5 shrink-0" />
            <span>Showing tasks for <span className="font-semibold">{contactFilter.name}</span></span>
          </div>
          <button
            onClick={() => { setContactFilter(null); setSelectedFilter('all'); }}
            className="flex items-center gap-1 text-amber-400 hover:text-amber-200 transition-colors"
            title="Show all customers"
          >
            <X className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        </div>
      )}

      {/* Batch Action Toolbar */}
      {selectedTaskIds.size > 0 && (
        <div className="flex items-center justify-between gap-3 px-2 py-2 sm:px-4 sm:py-3 bg-blue-900/40 border-2 border-blue-500 rounded-lg">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
              {selectedTaskIds.size}
            </div>
            <div>
              <div className="text-sm font-semibold text-blue-200">
                {selectedTaskIds.size} task{selectedTaskIds.size !== 1 ? 's' : ''} selected
              </div>
              <div className="text-xs text-blue-400">
                {(() => {
                  const selected = tasks.filter(t => selectedTaskIds.has(t.id));
                  const customers = new Set(selected.map(t => t.contact_id)).size;
                  return `${customers} customer${customers !== 1 ? 's' : ''} — will create ${customers} service request${customers !== 1 ? 's' : ''}`;
                })()}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setSelectedTaskIds(new Set())}
              className="px-3 py-1.5 text-xs bg-elevated hover:bg-gray-600 text-secondary rounded-lg transition-colors"
            >
              Clear
            </button>
            <button
              onClick={() => setShowBatchRequestModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition-colors"
            >
              <Layers className="w-3.5 h-3.5" />
              Create Service Request{(() => {
                const selected = tasks.filter(t => selectedTaskIds.has(t.id));
                const customers = new Set(selected.map(t => t.contact_id)).size;
                return customers > 1 ? 's' : '';
              })()}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        {selectableTasks.length > 0 && (
          <button
            onClick={toggleSelectAll}
            className="px-1 py-1 text-xs text-brand hover:bg-elevated rounded flex items-center gap-1.5 whitespace-nowrap"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            {selectableTasks.length > 0 && selectableTasks.every(task => selectedTaskIds.has(task.id)) ? 'Deselect All' : 'Select All'}
          </button>
        )}
      </div>

      {/* Tasks List - Compact */}
      <div className="space-y-2">
        {filteredTasks.length === 0 ? (
          <div className="text-center py-8 text-muted bg-surface border border-subtle rounded-lg">
            <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="font-medium">No tasks found</p>
            <p className="text-xs mt-1">
              {searchQuery
                ? 'Try adjusting your search criteria'
                : selectedFilter !== 'all'
                ? `No ${selectedFilter.replace('_', ' ')} tasks`
                : 'Tasks will appear here when customers submit them'}
            </p>
          </div>
        ) : (
          <>

            {filteredTasks.map((task, index) => {
              // Add section headers when status changes
              const prevTask = index > 0 ? filteredTasks[index - 1] : null;
              const showSectionHeader = selectedFilter === 'all' &&
                                       (!prevTask || prevTask.status !== task.status);

              return (
                <div key={task.id}>
                  {/* Section Header */}
                  {showSectionHeader && task.status === 'requested' && (
                    <div className="text-sm font-semibold text-amber-400 px-1 py-1 mt-1 flex items-center gap-1.5">
                      <Send className="w-3.5 h-3.5" />
                      Requested Tasks
                    </div>
                  )}
                  {showSectionHeader && task.status === 'scheduled' && (
                    <div className="text-sm font-semibold text-info px-1 py-1 mt-1 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      Scheduled Tasks
                    </div>
                  )}
                  {showSectionHeader && task.status === 'draft' && (
                    <div className="text-sm font-semibold text-warning px-1 py-1 mt-1 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" />
                      Not Requested
                    </div>
                  )}
                  {showSectionHeader && task.status === 'completed' && (
                    <div className="text-sm font-semibold text-success px-1 py-1 mt-1 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Completed Tasks
                    </div>
                  )}

                  {/* Task Card */}
                  <div className={`bg-surface border rounded-lg overflow-hidden transition-colors ${
                    selectedTaskIds.has(task.id)
                      ? 'border-blue-500 ring-2 ring-blue-500/50'
                      : 'border-subtle hover:border-strong'
                  }`}>
              <div className="px-2.5 py-2 sm:p-3 flex items-start gap-2">
                <div className="w-4 shrink-0 pt-0.5">
                  {task.status === 'draft' && !task.service_request_id && !task.work_order_id && (
                    <input type="checkbox" aria-label={`Select ${punchlistDescription(task)}`}
                      checked={selectedTaskIds.has(task.id)} onChange={() => toggleTaskSelection(task.id)}
                      className="w-4 h-4 rounded border-strong text-blue-600 focus:ring-blue-500" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setDetailTask(task)}
                      className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-primary hover:text-brand">
                      {punchlistDescription(task)}
                    </button>
                    <span className="hidden sm:block"><StatusBadge status={task.status} task={task} /></span>
                    <button aria-label={expandedTask === task.id ? 'Collapse item' : 'Expand item'}
                      onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                      className="p-1 shrink-0 text-muted">
                      {expandedTask === task.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted min-w-0">
                    <button onClick={() => setQuickViewContactId(task.contact_id)}
                      className="customer-link truncate text-left min-w-0 flex-1 sm:flex-none">{task.contact.full_name}</button>
                    <span>·</span><span className="shrink-0">{new Date(task.requested_at || task.created_at).toLocaleDateString()}</span>
                    <span className={`sm:hidden shrink-0 text-[10px] ${task.status === 'draft' ? 'text-warning' : task.status === 'completed' ? 'text-success' : 'text-info'}`}>
                      · {task.status === 'draft' ? 'Not Requested' : task.status === 'completed' ? 'Completed' : task.status === 'scheduled' ? 'Scheduled' : 'Requested'}
                    </span>
                    {task.photos && task.photos.length > 0 && <span className="shrink-0 flex items-center gap-1">· <ImageIcon className="w-3 h-3" />{task.photos.length}</span>}
                  </div>
                </div>
              </div>

              {/* Expanded Details - Compact */}
              {expandedTask === task.id && (
                <div className="border-t border-subtle bg-canvas/50">
                  <div className="p-3 space-y-3">
                    <div className="flex flex-wrap gap-3 text-xs text-muted">
                      <a href={`mailto:${task.contact.email}`} className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{task.contact.email}</a>
                      {task.contact.phone && <a href={`tel:${task.contact.phone}`} className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{task.contact.phone}</a>}
                    </div>
                    {/* Customer self-completed notice */}
                    {task.status === 'completed' && task.completed_by_customer && (
                      <div className="flex items-start gap-2.5 px-3 py-2.5 bg-teal-900/40 border border-teal-600 rounded-lg">
                        <CheckCircle2 className="w-4 h-4 text-teal-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <div className="text-sm font-semibold text-teal-300">Completed by Customer</div>
                          <div className="text-xs text-teal-400 mt-0.5">The customer marked this task as resolved themselves from their portal.</div>
                        </div>
                      </div>
                    )}

                    {/* Details */}
                    {task.details && (
                      <div>
                        <div className="text-xs font-medium text-secondary mb-1 flex items-center gap-1">
                          <MessageSquare className="w-3.5 h-3.5" />
                          Description
                        </div>
                        <p className="text-xs text-muted whitespace-pre-wrap">{task.details}</p>
                      </div>
                    )}

                    {/* Installer Notes */}
                    {task.installer_notes && (
                      <div>
                        <div className="text-xs font-medium text-secondary mb-1">Installer Notes</div>
                        <p className="text-xs text-muted whitespace-pre-wrap bg-surface p-2 rounded">
                          {task.installer_notes}
                        </p>
                      </div>
                    )}

                    {/* Photos */}
                    {task.photos && task.photos.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-secondary mb-1.5 flex items-center gap-1">
                          <ImageIcon className="w-3.5 h-3.5" />
                          Photos ({task.photos.length})
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                          {task.photos.map((photo) => (
                            <div key={photo.id} className="relative group">
                              <img
                                src={photo.photo_url}
                                alt={photo.caption || 'Task photo'}
                                className="w-full h-20 object-cover rounded border border-subtle"
                              />
                              {photo.caption && (
                                <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs p-1 rounded-b truncate">
                                  {photo.caption}
                                </div>
                              )}
                              <a
                                href={photo.photo_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="absolute top-1 right-1 p-0.5 bg-black/70 hover:bg-black text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Eye className="w-3 h-3" />
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Status Actions - Compact */}
                    <div>
                      <div className="text-xs font-medium text-secondary mb-1.5">Update Status</div>
                      <div className="flex flex-wrap gap-1.5">
                        {task.status !== 'requested' && task.status !== 'scheduled' && task.status !== 'completed' && (
                          <button
                            onClick={() => updateTaskStatus(task.id, 'requested')}
                            className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs flex items-center gap-1"
                          >
                            <Send className="w-3.5 h-3.5" />
                            Create Service Request
                          </button>
                        )}
                        {task.status === 'requested' && (() => {
                          const hasWorkOrder = !!(task.service_request?.work_order_id || task.work_order_id);
                          return hasWorkOrder ? (
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-elevated/60 border border-strong rounded text-xs text-muted italic">
                              <Info className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                              Work order assigned — contact Service Manager to cancel.
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => handleAdminRecallTask(task)}
                                className="px-2.5 py-1.5 bg-gray-600 hover:bg-gray-500 text-white rounded text-xs flex items-center gap-1"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                Cancel Request for Item
                              </button>
                              <button
                                onClick={() => updateTaskStatus(task.id, 'completed')}
                                className="px-2.5 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs flex items-center gap-1"
                              >
                                <CheckCheck className="w-3.5 h-3.5" />
                                Mark Completed
                              </button>
                              <button
                                onClick={() => handleAdminDeleteTask(task)}
                                className="px-2.5 py-1.5 bg-red-700 hover:bg-red-600 text-white rounded text-xs flex items-center gap-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete
                              </button>
                            </>
                          );
                        })()}
                        {task.status !== 'requested' && task.status !== 'completed' && task.status !== 'draft' && (
                          <button
                            onClick={() => updateTaskStatus(task.id, 'completed')}
                            className="px-2.5 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs flex items-center gap-1"
                          >
                            <CheckCheck className="w-3.5 h-3.5" />
                            Mark Completed
                          </button>
                        )}
                        {task.status === 'completed' && (
                          <button
                            onClick={() => updateTaskStatus(task.id, 'draft')}
                            className="px-2.5 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded text-xs flex items-center gap-1"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Reopen
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Metadata - Timestamps */}
                    <div className="space-y-1.5 pt-2 border-t border-gray-800">
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        {task.requested_at && task.status !== 'draft' ? (
                          <span className="text-amber-400/80">
                            <span className="font-medium">Requested:</span>{' '}
                            {new Date(task.requested_at).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          </span>
                        ) : (
                          <span className="text-gray-600 italic">Not yet requested</span>
                        )}
                        {task.completed_at && (
                          <span className="text-green-400">
                            <span className="font-medium">Completed:</span>{' '}
                            {new Date(task.completed_at).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                      {task.requested_at && task.status !== 'draft' && (() => {
                        const createdMs = new Date(task.created_at).getTime();
                        const requestedMs = new Date(task.requested_at).getTime();
                        const diffDays = Math.round((requestedMs - createdMs) / 86400000);
                        if (diffDays < 0) return null;
                        const label = diffDays === 0 ? 'same day as created' : diffDays === 1 ? '1 day after created' : `${diffDays} days after created`;
                        return (
                          <div className="text-xs text-gray-600 italic">
                            Customer requested service {label}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
        </>
      )}

      {/* Customers Tab Content */}
      {activeTab === 'customers' && (
        <div>
          <PunchlistInviteManager openInviteCount={openInviteCount} onViewCustomerTasks={handleViewCustomerTasks} onOpenSalesOrder={onOpenSalesOrder} />
        </div>
      )}

      {/* Batch Service Request Modal */}
      {showBatchRequestModal && (
        <BatchRequestModal
          tasks={tasks.filter(t => selectedTaskIds.has(t.id))}
          onClose={() => setShowBatchRequestModal(false)}
          onSuccess={() => {
            setShowBatchRequestModal(false);
            setSelectedTaskIds(new Set());
            loadTasks();
          }}
        />
      )}

      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <HelpCircle className="w-6 h-6 text-blue-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Punchlist Access Control Guide</h2>
              </div>
              <button
                onClick={() => setShowHelp(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Overview */}
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">What is the Punchlist System?</h3>
                <p className="text-gray-700 leading-relaxed">
                  The Punchlist system provides customers with a dedicated portal to submit service requests, track warranty items,
                  and communicate directly with your service team. Customers can create tasks, upload photos, and monitor progress
                  in real-time. This system helps reduce phone calls, improves customer satisfaction, and streamlines your service operations.
                </p>
              </div>

              {/* Access Methods */}
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">Three Ways Customers Get Portal Access</h3>
                <p className="text-gray-700 leading-relaxed mb-4">
                  Your system supports three distinct methods for granting customers access to the Punchlist portal. Each method
                  serves different business purposes and has different access durations:
                </p>

                <div className="space-y-3">
                  {/* VIP Membership */}
                  <div className="bg-gradient-to-r from-amber-50 to-yellow-50 border-2 border-amber-300 rounded-lg p-5">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-amber-500 text-white rounded-full flex items-center justify-center flex-shrink-0">
                        <Star className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900 mb-2 text-lg">1. VIP Membership (Ongoing Access)</h4>
                        <p className="text-sm text-gray-700 mb-2">
                          <strong>When:</strong> Customer enrolls in your VIP/recurring service plan
                        </p>
                        <p className="text-sm text-gray-700 mb-2">
                          <strong>Duration:</strong> Active as long as subscription is current
                        </p>
                        <p className="text-sm text-gray-700 mb-2">
                          <strong>How to Grant:</strong> Create a VIP subscription in the Finance → VIP Plans section. Access is automatically
                          granted when the subscription is active or in trial status.
                        </p>
                        <p className="text-sm text-gray-700">
                          <strong>Use Case:</strong> Premium customers who pay for ongoing service packages, maintenance plans, or security
                          monitoring subscriptions. This is your highest tier of service access.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Test & Tune Program */}
                  <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border-2 border-blue-300 rounded-lg p-5">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-blue-500 text-white rounded-full flex items-center justify-center flex-shrink-0">
                        <TrendingUp className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900 mb-2 text-lg">2. Test & Tune Program (90 Days)</h4>
                        <p className="text-sm text-gray-700 mb-2">
                          <strong>When:</strong> Sales order is marked as complete with Test & Tune enabled
                        </p>
                        <p className="text-sm text-gray-700 mb-2">
                          <strong>Duration:</strong> 90 days from completion date
                        </p>
                        <p className="text-sm text-gray-700 mb-2">
                          <strong>How to Grant:</strong> Automatically created when completing a sales order with "Start 90-Day Test & Tune Program"
                          checked. The system creates the access grant automatically, then you can optionally send a welcome email.
                          Can also be granted manually from the Customers tab.
                        </p>
                        <p className="text-sm text-gray-700 mb-2">
                          <strong>Note:</strong> Customers who already have VIP access don't need a separate Test & Tune grant -
                          they already have punchlist access through their VIP membership.
                        </p>
                        <p className="text-sm text-gray-700">
                          <strong>Use Case:</strong> Post-installation warranty period for performance tracking and customer fine-tuning.
                          Allows customers to submit adjustments while field teams work toward labor efficiency targets.
                        </p>
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              {/* Access Priority */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-blue-600" />
                  Access Priority Order
                </h4>
                <p className="text-sm text-gray-700 mb-3">
                  If a customer has multiple access types, the system follows this priority order:
                </p>
                <ol className="text-sm text-gray-700 space-y-2 ml-4">
                  <li><strong>1. VIP Membership</strong> - Highest priority, ongoing access</li>
                  <li><strong>2. Test & Tune</strong> - Project-based warranty access</li>
                </ol>
                <p className="text-sm text-gray-600 mt-3">
                  The customer's portal will display their current access type and days remaining (if applicable).
                </p>
              </div>

              {/* How to Send Invites */}
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">How Portal Access is Granted</h3>
                <div className="space-y-3">
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h5 className="font-semibold text-gray-900 mb-2">From Sales Order Completion:</h5>
                    <p className="text-sm text-gray-700 mb-2">
                      When marking a sales order as complete with "Start 90-Day Test & Tune Program" checked:
                    </p>
                    <ul className="text-sm text-gray-700 space-y-1 ml-4 list-disc">
                      <li>The system <strong>automatically creates</strong> a Test & Tune access grant for the customer</li>
                      <li>Access is granted for 90 days, starting immediately</li>
                      <li>You can optionally send a welcome email with portal instructions (checkbox below)</li>
                      <li>If customer already has VIP access, no separate grant is created (they already have punchlist access)</li>
                    </ul>
                    <p className="text-sm text-gray-600 mt-2 italic">
                      The email is optional - access is created automatically regardless of whether you send the email.
                    </p>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h5 className="font-semibold text-gray-900 mb-2">Manual Invitation:</h5>
                    <p className="text-sm text-gray-700">
                      Go to the <strong>Customers</strong> tab → Click "Send Invite" → Select a customer → Choose access type
                      (Test & Tune or Test & Tune No Portal) → The system creates the database access grant and sends the invitation email automatically.
                    </p>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h5 className="font-semibold text-gray-900 mb-2">VIP Membership:</h5>
                    <p className="text-sm text-gray-700">
                      Create a recurring subscription in <strong>Finance → VIP Plans</strong>. Portal access is automatically
                      granted when the subscription becomes active or enters trial status. No separate invite needed.
                    </p>
                  </div>
                </div>
              </div>

              {/* Contact Info */}
              <div className="border-t border-gray-200 pt-4">
                <p className="text-sm text-gray-600 text-center">
                  For technical support with the Punchlist system, contact your system administrator.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Task Detail Modal */}
      {detailTask && (
        <PunchlistTaskDetailModal
          task={{
            ...detailTask,
            contact: detailTask.contact ? {
              first_name: detailTask.contact.first_name ?? null,
              last_name: detailTask.contact.last_name ?? null,
              email: detailTask.contact.email,
              phone: detailTask.contact.phone,
            } : null,
          }}
          isAdmin={true}
          onClose={() => setDetailTask(null)}
          onTaskUpdated={loadTasks}
          onRecall={handleAdminRecallTask}
          onDelete={handleAdminDeleteTask}
          onMarkComplete={(t) => {
            setDetailTask(null);
            updateTaskStatus(t.id, 'completed');
          }}
        />
      )}
      {quickViewContactId && (
        <ContactQuickViewModal
          contactId={quickViewContactId}
          onClose={() => setQuickViewContactId(null)}
        />
      )}
    </div>
  );
}

function StatusBadge({ status, task }: { status: string; task?: PunchlistTask }) {
  const statusConfig: Record<string, { label: string; className: string; icon: any }> = {
    draft: {
      label: 'Not Requested',
      className: 'bg-warningSoft text-warning border border-warningLine',
      icon: FileText,
    },
    scheduled: {
      label: 'Scheduled',
      className: 'bg-infoSoft text-info border border-subtle',
      icon: Calendar,
    },
    in_work_order: {
      label: 'In Work Order',
      className: 'bg-infoSoft text-info border border-subtle',
      icon: ClipboardList,
    },
    requested: {
      label: 'Requested',
      className: 'bg-infoSoft text-info border border-subtle',
      icon: Send,
    },
    completed: {
      label: 'Completed',
      className: 'bg-successSoft text-success border border-subtle',
      icon: CheckCircle2,
    },
  };

  const config = statusConfig[status] || statusConfig.draft;
  const Icon = config.icon;

  let linkedInfo = '';
  if (task?.service_request_id) {
    linkedInfo = ' (SR)';
  } else if (task?.work_order_id) {
    linkedInfo = ' (WO)';
  }

  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-medium whitespace-nowrap shrink-0 flex items-center gap-1 ${config.className}`}>
      <Icon className="w-3 h-3" />
      {config.label}{linkedInfo}
      {status === 'completed' && task?.completed_by_customer && (
        <span className="ml-1 px-1 py-0.5 bg-teal-700 text-teal-200 rounded text-xs font-semibold">
          by customer
        </span>
      )}
    </span>
  );
}

interface BatchRequestModalProps {
  tasks: PunchlistTask[];
  onClose: () => void;
  onSuccess: () => void;
}

function BatchRequestModal({ tasks, onClose, onSuccess }: BatchRequestModalProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [globalNotes, setGlobalNotes] = useState('');

  const customerGroups = tasks.reduce<Record<string, { contactId: string; contactName: string; tasks: PunchlistTask[] }>>(
    (acc, task) => {
      if (!acc[task.contact_id]) {
        acc[task.contact_id] = {
          contactId: task.contact_id,
          contactName: task.contact.full_name,
          tasks: [],
        };
      }
      acc[task.contact_id].tasks.push(task);
      return acc;
    },
    {}
  );

  const groups = Object.values(customerGroups);

  async function handleCreate() {
    setLoading(true);
    try {
      let successCount = 0;
      let taskCount = 0;

      for (const group of groups) {
        const taskIds = group.tasks.map(t => t.id);
        const { error } = await supabase.rpc('request_punchlist_service', {
          p_task_ids: taskIds,
          p_contact_id: group.contactId,
          p_notes: globalNotes.trim() || null,
        });
        if (error) throw error;
        successCount++;
        taskCount += taskIds.length;
      }

      toast.success(
        `Created ${successCount} service request${successCount !== 1 ? 's' : ''} covering ${taskCount} task${taskCount !== 1 ? 's' : ''}.`,
        'Service Requests Created'
      );
      onSuccess();
    } catch (error: any) {
      console.error('Error creating batch service requests:', error);
      toast.error(error.message || 'Failed to create service requests', 'Error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-canvas rounded-2xl w-full max-w-lg border border-subtle shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-subtle bg-surface rounded-t-2xl shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-primary">Create Service Requests</h3>
              <p className="text-xs text-muted">{tasks.length} task{tasks.length !== 1 ? 's' : ''} across {groups.length} customer{groups.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-elevated rounded-lg transition-colors text-muted hover:text-primary">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Info banner */}
          <div className="flex items-start gap-2.5 bg-blue-900/30 border border-blue-700/50 rounded-lg p-3">
            <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-300 leading-relaxed">
              One service request will be created per customer. Tasks from different customers cannot be combined — each customer gets their own request.
            </p>
          </div>

          {/* Customer groups */}
          <div className="space-y-3">
            {groups.map((group) => (
              <div key={group.contactId} className="bg-surface border border-subtle rounded-lg overflow-hidden">
                <div className="flex items-center gap-2.5 px-4 py-3 bg-gray-750 border-b border-subtle">
                  <User className="w-4 h-4 text-blue-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-primary truncate">{group.contactName}</div>
                    <div className="text-xs text-muted">{group.tasks.length} task{group.tasks.length !== 1 ? 's' : ''} selected</div>
                  </div>
                  <span className="px-2 py-0.5 bg-blue-600/20 text-blue-300 text-xs rounded-full font-medium border border-blue-600/30 whitespace-nowrap">
                    1 SR
                  </span>
                </div>
                <div className="divide-y divide-gray-700/50">
                  {group.tasks.map((task) => (
                    <div key={task.id} className="flex items-start gap-2.5 px-4 py-2.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="text-sm text-primary font-medium truncate">{punchlistDescription(task)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Optional notes */}
          <div>
            <label className="block text-xs font-semibold text-muted uppercase tracking-wide mb-1.5">
              Notes (optional — applied to all requests)
            </label>
            <textarea
              value={globalNotes}
              onChange={(e) => setGlobalNotes(e.target.value)}
              rows={3}
              placeholder="Add any notes for the service team..."
              className="w-full px-3 py-2 bg-surface border border-subtle rounded-lg text-primary text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-subtle bg-surface rounded-b-2xl shrink-0">
          <div className="text-xs text-muted">
            {groups.length} service request{groups.length !== 1 ? 's' : ''} will be created
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 bg-elevated text-primary rounded-xl hover:bg-surface transition-colors text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold"
            >
              <Send className="w-4 h-4" />
              {loading ? 'Creating...' : `Create ${groups.length} Request${groups.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
