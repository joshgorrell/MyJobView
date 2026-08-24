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
        const task = tasks.find(t => t.id === taskId);
        if (!task) throw new Error('Task not found');

        if (task.status === 'scheduled' && (task.service_request_id || task.work_order_id)) {
          const doComplete = async () => {
            try {
              const now = new Date().toISOString();
              const adminName = profile?.full_name || profile?.email || 'Admin';
              const auditNote = `Cancelled — punchlist task marked complete by ${adminName} on ${new Date().toLocaleString()}.`;

              await supabase
                .from('punchlist_tasks')
                .update({ status: 'completed', completed_at: now })
                .eq('id', taskId);

              if (task.service_request_id) {
                const { data: sr } = await supabase
                  .from('service_requests')
                  .select('notes')
                  .eq('id', task.service_request_id)
                  .maybeSingle();

                const existingNotes = sr?.notes ? sr.notes + '\n\n' : '';
                await supabase
                  .from('service_requests')
                  .update({ status: 'cancelled', notes: existingNotes + auditNote })
                  .eq('id', task.service_request_id);
              }

              if (task.work_order_id) {
                const { data: wo } = await supabase
                  .from('work_orders')
                  .select('internal_notes')
                  .eq('id', task.work_order_id)
                  .maybeSingle();

                const existingNotes = wo?.internal_notes ? wo.internal_notes + '\n\n' : '';
                await supabase
                  .from('work_orders')
                  .update({ status: 'cancelled', internal_notes: existingNotes + auditNote })
                  .eq('id', task.work_order_id);
              }

              toast.success('Task marked complete. The linked service request and work order have been cancelled.', 'Task Completed');
              loadTasks();
            } catch (err: any) {
              toast.error(err.message, 'Failed to complete task');
            }
          };

          toast.confirm(
            'This task has a scheduled work order. Marking it complete will cancel both the service request and the work order. This cannot be undone.',
            doComplete,
            'Cancel Work Order & Complete Task?'
          );
          return;
        }

        const updates: any = {
          status: newStatus,
          completed_at: new Date().toISOString()
        };

        const { error } = await supabase
          .from('punchlist_tasks')
          .update(updates)
          .eq('id', taskId);

        if (error) throw error;
        loadTasks();
      } else if (newStatus === 'draft') {
        toast.confirm('This will mark the task as incomplete and remove the completion date.', async () => {
          try {
            const { error } = await supabase
              .from('punchlist_tasks')
              .update({ status: 'draft', completed_at: null, requested_at: null })
              .eq('id', taskId);

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

  async function handleAdminRecallTask(task: PunchlistTask) {
    const hasWorkOrder = task.service_request?.work_order_id || task.work_order_id;
    if (hasWorkOrder) return;

    toast.confirm(
      'This will cancel the open service request and return the task to draft status.',
      async () => {
        try {
          if (task.service_request_id) {
            await supabase
              .from('service_requests')
              .update({ status: 'cancelled' })
              .eq('id', task.service_request_id);
          }
          await supabase
            .from('punchlist_tasks')
            .update({ status: 'draft', service_request_id: null, requested_at: null })
            .eq('id', task.id);
          toast.success('Task recalled to draft.');
          setDetailTask(null);
          loadTasks();
        } catch (error: any) {
          toast.error(error.message, 'Failed to recall task');
        }
      },
      'Recall to Draft?'
    );
  }

  async function handleAdminDeleteTask(task: PunchlistTask) {
    const hasWorkOrder = task.service_request?.work_order_id || task.work_order_id;
    if (hasWorkOrder) return;

    toast.confirm(
      'This will cancel the open service request and permanently delete the task. This cannot be undone.',
      async () => {
        try {
          if (task.service_request_id) {
            await supabase
              .from('service_requests')
              .update({ status: 'cancelled' })
              .eq('id', task.service_request_id);
          }
          await supabase.from('punchlist_tasks').delete().eq('id', task.id);
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
    if (selectedTaskIds.size === selectableTasks.length) {
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
        <div className="text-gray-400">Loading punchlist data...</div>
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
    <div className="space-y-4 px-3 sm:px-0">
      {/* Header - Compact */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <ClipboardList className="w-5 h-5" />
          Punchlist Management
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHelp(true)}
            className="p-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
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
      <div className="border-b border-gray-700">
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('punchlist')}
            className={`px-4 py-2 text-sm font-medium transition-all ${
              activeTab === 'punchlist'
                ? 'text-white border-b-2 border-blue-500 bg-gray-800/50'
                : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800/30'
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
                ? 'text-white border-b-2 border-blue-500 bg-gray-800/50'
                : 'text-gray-400 hover:text-gray-300 hover:bg-gray-800/30'
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
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        {/* Status dropdown */}
        <div className="relative flex-shrink-0">
          <select
            value={selectedFilter}
            onChange={e => setSelectedFilter(e.target.value as typeof selectedFilter)}
            className="appearance-none pl-3 pr-7 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-200 focus:outline-none focus:border-gray-500 cursor-pointer hover:border-gray-600 transition-colors"
          >
            <option value="all">All ({stats.total})</option>
            <option value="draft">Draft ({stats.draft})</option>
            <option value="requested">Requested ({stats.requested})</option>
            <option value="scheduled">Scheduled ({stats.scheduled})</option>
            <option value="completed">Completed ({stats.completed})</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>
        {selectableTasks.length > 0 && (
          <button
            onClick={toggleSelectAll}
            className="px-3 py-2 text-sm bg-blue-700 hover:bg-blue-600 text-white rounded-lg flex items-center gap-1.5 whitespace-nowrap"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            {selectedTaskIds.size === selectableTasks.length ? 'Deselect All' : 'Select All'}
          </button>
        )}
        {(selectedFilter !== 'all' || searchQuery) && (
          <button
            onClick={() => { setSelectedFilter('all'); setSearchQuery(''); }}
            className="px-3 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded-lg flex items-center gap-1.5 whitespace-nowrap"
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
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-blue-900/40 border-2 border-blue-500 rounded-lg">
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
              className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
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

      {/* Tasks List - Compact */}
      <div className="space-y-2">
        {filteredTasks.length === 0 ? (
          <div className="text-center py-8 text-gray-400 bg-gray-800 border border-gray-700 rounded-lg">
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
                    <div className="text-sm font-semibold text-amber-400 px-2 py-2 mt-2 flex items-center gap-1.5">
                      <Send className="w-3.5 h-3.5" />
                      Requested Tasks
                    </div>
                  )}
                  {showSectionHeader && task.status === 'scheduled' && (
                    <div className="text-sm font-semibold text-blue-400 px-2 py-2 mt-2 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      Scheduled Tasks
                    </div>
                  )}
                  {showSectionHeader && task.status === 'draft' && (
                    <div className="text-sm font-semibold text-yellow-400 px-2 py-2 mt-2 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" />
                      Draft Tasks
                    </div>
                  )}
                  {showSectionHeader && task.status === 'completed' && (
                    <div className="text-sm font-semibold text-green-400 px-2 py-2 mt-2 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Completed Tasks
                    </div>
                  )}

                  {/* Task Card */}
                  <div className={`bg-gray-800 border rounded-lg overflow-hidden transition-colors ${
                    selectedTaskIds.has(task.id)
                      ? 'border-blue-500 ring-2 ring-blue-500/50'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}>
              {/* Task Header - Clickable and Compact */}
              <div className="p-3">
                <div className="flex items-start gap-3">
                  {/* Checkbox placeholder - always reserve space for uniform card height */}
                  <div className="flex-shrink-0 pt-1 w-4">
                    {task.status === 'draft' && !task.service_request_id && !task.work_order_id && (
                      <input
                        type="checkbox"
                        checked={selectedTaskIds.has(task.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleTaskSelection(task.id);
                        }}
                        className="w-4 h-4 rounded border-gray-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
                      />
                    )}
                  </div>

                  {/* Main Content - Clickable */}
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <StatusBadge status={task.status} task={task} />
                      {task.photos && task.photos.length > 0 && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 bg-gray-700 rounded text-xs text-gray-300">
                          <ImageIcon className="w-3 h-3" />
                          {task.photos.length}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDetailTask(task); }}
                      className="text-left text-base font-semibold text-white mb-1 hover:text-amber-300 transition-colors leading-snug"
                    >
                      {task.title}
                    </button>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-400 min-w-0">
                      <div className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5" />
                        {task.contact_id ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); setQuickViewContactId(task.contact_id); }}
                            className="text-blue-400 hover:text-blue-300 text-left font-medium transition-colors"
                          >
                            {task.contact.full_name}
                          </button>
                        ) : (
                          <span>{task.contact.full_name}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5" />
                        <span className="truncate max-w-[200px]">{task.contact.email}</span>
                      </div>
                      {task.contact.phone && (
                        <div className="flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5" />
                          <span>{task.contact.phone}</span>
                        </div>
                      )}
                      {task.requested_at && task.status !== 'draft' ? (
                        <div className="flex items-center gap-1 text-amber-400/80" title={`Customer requested service: ${new Date(task.requested_at).toLocaleString()}`}>
                          <Send className="w-3 h-3" />
                          <span>Requested {new Date(task.requested_at).toLocaleDateString()}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1" title={`Created: ${new Date(task.created_at).toLocaleString()}`}>
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{new Date(task.created_at).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>

                    {/* Quick Preview - Compact */}
                    {task.details && expandedTask !== task.id && (
                      <p className="text-xs text-gray-400 mt-1.5 line-clamp-1">{task.details}</p>
                    )}
                  </div>

                  {/* Expand/Collapse Icon */}
                  <div className="flex-shrink-0 pt-1">
                    {expandedTask === task.id ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </div>
              </div>

              {/* Expanded Details - Compact */}
              {expandedTask === task.id && (
                <div className="border-t border-gray-700 bg-gray-900/50">
                  <div className="p-3 space-y-3">
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
                        <div className="text-xs font-medium text-gray-300 mb-1 flex items-center gap-1">
                          <MessageSquare className="w-3.5 h-3.5" />
                          Description
                        </div>
                        <p className="text-xs text-gray-400 whitespace-pre-wrap">{task.details}</p>
                      </div>
                    )}

                    {/* Installer Notes */}
                    {task.installer_notes && (
                      <div>
                        <div className="text-xs font-medium text-gray-300 mb-1">Installer Notes</div>
                        <p className="text-xs text-gray-400 whitespace-pre-wrap bg-gray-800 p-2 rounded">
                          {task.installer_notes}
                        </p>
                      </div>
                    )}

                    {/* Photos */}
                    {task.photos && task.photos.length > 0 && (
                      <div>
                        <div className="text-xs font-medium text-gray-300 mb-1.5 flex items-center gap-1">
                          <ImageIcon className="w-3.5 h-3.5" />
                          Photos ({task.photos.length})
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                          {task.photos.map((photo) => (
                            <div key={photo.id} className="relative group">
                              <img
                                src={photo.photo_url}
                                alt={photo.caption || 'Task photo'}
                                className="w-full h-20 object-cover rounded border border-gray-700"
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
                      <div className="text-xs font-medium text-gray-300 mb-1.5">Update Status</div>
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
                            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-700/60 border border-gray-600 rounded text-xs text-gray-400 italic">
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
                                Recall to Draft
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
      label: 'Draft',
      className: 'bg-yellow-900/50 text-yellow-300 border border-yellow-700',
      icon: FileText,
    },
    scheduled: {
      label: 'Scheduled',
      className: 'bg-blue-900/50 text-blue-300 border border-blue-700',
      icon: Calendar,
    },
    in_work_order: {
      label: 'In Work Order',
      className: 'bg-purple-900/50 text-purple-300 border border-purple-700',
      icon: ClipboardList,
    },
    requested: {
      label: 'Requested',
      className: 'bg-blue-900/50 text-blue-300 border border-blue-700',
      icon: Send,
    },
    completed: {
      label: 'Completed',
      className: 'bg-green-900/50 text-green-300 border border-green-700',
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
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium flex items-center gap-1 ${config.className}`}>
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
      <div className="bg-gray-900 rounded-2xl w-full max-w-lg border border-gray-700 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-800 rounded-t-2xl shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Create Service Requests</h3>
              <p className="text-xs text-gray-400">{tasks.length} task{tasks.length !== 1 ? 's' : ''} across {groups.length} customer{groups.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-white">
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
              <div key={group.contactId} className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
                <div className="flex items-center gap-2.5 px-4 py-3 bg-gray-750 border-b border-gray-700">
                  <User className="w-4 h-4 text-blue-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{group.contactName}</div>
                    <div className="text-xs text-gray-400">{group.tasks.length} task{group.tasks.length !== 1 ? 's' : ''} selected</div>
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
                        <div className="text-sm text-white font-medium truncate">{task.title}</div>
                        {task.details && (
                          <div className="text-xs text-gray-400 truncate mt-0.5">{task.details}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Optional notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              Notes (optional — applied to all requests)
            </label>
            <textarea
              value={globalNotes}
              onChange={(e) => setGlobalNotes(e.target.value)}
              rows={3}
              placeholder="Add any notes for the service team..."
              className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-700 bg-gray-800 rounded-b-2xl shrink-0">
          <div className="text-xs text-gray-500">
            {groups.length} service request{groups.length !== 1 ? 's' : ''} will be created
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 bg-gray-700 text-white rounded-xl hover:bg-gray-600 transition-colors text-sm font-medium"
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
