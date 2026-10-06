import { punchlistDescription, punchlistList, canSchedulePunchlist, canRequestPunchlist } from '../../lib/punchlist';
import { useState, useEffect, lazy, Suspense } from 'react';
import { supabase } from '../../lib/supabase';
import {
  ClipboardList,
  CheckCircle2,
  FileText,
  Send,
  Search,
  Eye,
  MessageSquare,
  User,
  Mail,
  Phone,
  Calendar,
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
  Info,
  Trash2
} from 'lucide-react';
import { PunchlistInviteManager } from './PunchlistInviteManager';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../Shared/Toast';
import { markPunchlistSeen } from '../../hooks/usePunchlistUnseenCount';
import { PunchlistTaskDetailModal } from '../Portal/PunchlistTaskDetailModal';
import { ContactQuickViewModal } from '../Shared/ContactQuickViewModal';

import type { ServiceRequestContext } from './CreateWorkOrderModal';
const CreateWorkOrderModal = lazy(() => import('./CreateWorkOrderModal').then(module => ({default: module.CreateWorkOrderModal})));

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
  const [listOrder, setListOrder] = useState<'newest' | 'customer'>('newest');
  const [batchMode, setBatchMode] = useState<'request' | 'schedule'>('request');
  const [scheduleQueue, setScheduleQueue] = useState<ServiceRequestContext[]>([]);
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
        .order('created_at', { ascending: false });

      if (error) throw error;

      setTasks(data || []);
      const eligible = new Set((data || []).filter(canSchedulePunchlist).map(task => task.id));
      setSelectedTaskIds(previous => new Set([...previous].filter(id => eligible.has(id))));
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

          toast.success('Sent to the Work Order Request Queue for your service manager to schedule.', 'Service Requested');
          loadTasks();
        };

        toast.confirm('Send this item to the Work Order Request Queue for your service manager to schedule?', doRequest, 'Mark as Requested?');
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
    const task = tasks.find(item => item.id === taskId);
    const existing = tasks.find(item => selectedTaskIds.has(item.id));
    if (!task || !canSchedulePunchlist(task) || (existing && existing.contact_id !== task.contact_id)) return;
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

  const stats = {
    draft: tasks.filter(t => t.status === 'draft').length,
    requested: tasks.filter(t => t.status === 'requested').length,
    scheduled: tasks.filter(t => t.status === 'scheduled').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    total: tasks.length,
  };

  const filteredTasks = punchlistList(tasks, {search: searchQuery, status: selectedFilter, contactId: contactFilter?.id, order: listOrder});
  const selectionContactId = tasks.find(task => selectedTaskIds.has(task.id))?.contact_id || contactFilter?.id;
  const selectableTasks = filteredTasks.filter(task => canSchedulePunchlist(task) && (!selectionContactId || task.contact_id === selectionContactId));
  const selectedTasks = filteredTasks.filter(task => selectedTaskIds.has(task.id) && canSchedulePunchlist(task));
  const canRequestSelected = selectedTasks.length > 0 && selectedTasks.every(canRequestPunchlist);
  const changeView = (action: () => void) => { setSelectedTaskIds(new Set()); action(); };
  const toggleSelectAll = () => {
    setSelectedTaskIds(selectableTasks.length > 0 && selectableTasks.every(task => selectedTaskIds.has(task.id))
      ? new Set() : new Set(selectableTasks.map(task => task.id)));
  };
  const startBatch = (mode: 'request' | 'schedule') => {
    if (!selectedTasks.length || new Set(selectedTasks.map(task => task.contact_id)).size !== 1) {
      toast.warning('Select items for one customer at a time'); return;
    }
    setBatchMode(mode); setShowBatchRequestModal(true);
  };
  const startDetailAction = (mode: 'request' | 'schedule') => {
    const task = tasks.find(item => item.id === detailTask?.id);
    if (!task || !canSchedulePunchlist(task) || (mode === 'request' && !canRequestPunchlist(task))) {
      toast.warning('This item is already requested or scheduled. Refresh the list.'); return;
    }
    setContactFilter({id: task.contact_id, name: task.contact.full_name});
    setSearchQuery(''); setSelectedFilter('all');
    setSelectedTaskIds(new Set([task.id]));
    setDetailTask(null); setBatchMode(mode); setShowBatchRequestModal(true);
  };


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
    setSelectedTaskIds(new Set());
    setContactFilter({ id: contactId, name: contactName });
    setSelectedFilter(filterStatus);
    setSearchQuery('');
    setActiveTab('punchlist');
  };

  return (
    <div className="space-y-2 sm:space-y-4 px-1 sm:px-0">
      <div data-testid="punchlist-toolbar" className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-1 min-w-0">
        <select aria-label="Punchlist page" value={activeTab} onChange={e => changeView(() => setActiveTab(e.target.value as 'punchlist' | 'customers'))}
          className="shrink-0 min-h-11 max-w-[110px] text-xs bg-surface border border-subtle rounded-lg text-primary px-1.5">
          <option value="punchlist">Punchlist</option><option value="customers">Customers</option>
        </select>
        {activeTab === 'punchlist' && (<>
          <div className="relative flex-1 min-w-[100px]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
            <input aria-label="Search punchlist items" value={searchQuery} onChange={e => changeView(() => setSearchQuery(e.target.value))} placeholder="Search…"
              className="w-full min-h-11 pl-7 pr-2 text-base bg-surface border border-subtle rounded-lg text-primary" />
          </div>
          <select aria-label="Punchlist order" value={listOrder} onChange={e => changeView(() => setListOrder(e.target.value as 'newest' | 'customer'))}
            className="shrink-0 min-h-11 max-w-[110px] px-1.5 text-xs bg-surface border border-subtle rounded-lg text-primary">
            <option value="newest">Newest</option><option value="customer">By Customer</option>
          </select>
          <select aria-label="Punchlist status" value={selectedFilter} onChange={e => changeView(() => setSelectedFilter(e.target.value))}
            className="shrink-0 min-h-11 max-w-[90px] px-1.5 text-xs bg-surface border border-subtle rounded-lg text-primary">
            <option value="all">All ({stats.total})</option><option value="draft">Not Requested ({stats.draft})</option>
            <option value="requested">Requested ({stats.requested})</option><option value="scheduled">Scheduled ({stats.scheduled})</option><option value="completed">Completed ({stats.completed})</option>
          </select>
          {contactFilter && <button onClick={() => changeView(() => setContactFilter(null))} title={`Clear customer filter: ${contactFilter.name}`}
            className="shrink-0 min-h-11 px-2 text-xs text-primary bg-elevated rounded-lg max-w-[120px] truncate">{contactFilter.name} ×</button>}
          {(searchQuery || selectedFilter !== 'all') && <button aria-label="Clear filters" onClick={() => changeView(() => {setSearchQuery('');setSelectedFilter('all');})} className="shrink-0 min-h-11 px-2 text-primary bg-elevated rounded-lg"><X className="w-4 h-4" /></button>}
          <button aria-label="Select all visible items for this customer" title={selectionContactId ? "Select all visible items for this customer" : "Select one item to choose a customer first"} onClick={toggleSelectAll} disabled={!selectableTasks.length || !selectionContactId}
            className="shrink-0 min-h-11 px-2 text-primary bg-elevated rounded-lg disabled:opacity-40"><CheckCheck className="w-4 h-4" /></button>
          {selectedTasks.length > 0 && <>
            <button aria-label="Clear selection" onClick={() => setSelectedTaskIds(new Set())} className="shrink-0 min-h-11 px-2 text-xs text-primary bg-elevated rounded-lg">{selectedTasks.length} ×</button>
            <button onClick={() => startBatch('schedule')} className="shrink-0 min-h-11 px-2 flex items-center gap-1 text-xs bg-blue-600 text-white rounded-lg"><Calendar className="w-4 h-4" />Schedule</button>
            <button onClick={() => startBatch('request')} disabled={!canRequestSelected} title={canRequestSelected ? 'Request service for selected items' : 'Selected items already have service requests; use Schedule'}
              className="shrink-0 min-h-11 px-2 flex items-center gap-1 text-xs bg-blue-600 text-white rounded-lg disabled:opacity-40"><Send className="w-4 h-4" />Request Service</button>
          </>}
        </>)}
        <button onClick={handleSendInvite} aria-label="Send customer invite" title="Send customer invite" className="shrink-0 min-h-11 px-2 bg-elevated text-primary rounded-lg"><Mail className="w-4 h-4" /></button>
        <button onClick={() => setShowHelp(true)} aria-label="Punchlist help" className="shrink-0 min-h-11 px-2 bg-elevated text-primary rounded-lg"><HelpCircle className="w-4 h-4" /></button>
      </div>
      {activeTab === 'punchlist' && (<>
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
              const prevTask = index > 0 ? filteredTasks[index - 1] : null;
              const showCustomerHeader = listOrder === 'customer' && (!prevTask || prevTask.contact_id !== task.contact_id);
              return (
                <div key={task.id}>
                  {showCustomerHeader && <div className="px-1 py-1 text-sm font-semibold text-primary">{task.contact.full_name}</div>}
                  {/* Task Card */}
                  <div className={`bg-surface border rounded-lg overflow-hidden transition-colors ${
                    selectedTaskIds.has(task.id)
                      ? 'border-blue-500 ring-2 ring-blue-500/50'
                      : 'border-subtle hover:border-strong'
                  }`}>
              <div className="px-2.5 py-2 sm:p-3 flex items-start gap-2">
                <div className="w-4 shrink-0 pt-0.5">
                  {canSchedulePunchlist(task) && (
                    <input type="checkbox" aria-label={`Select ${punchlistDescription(task)}`}
                      checked={selectedTaskIds.has(task.id)} onChange={() => toggleTaskSelection(task.id)}
                      disabled={!!selectionContactId && task.contact_id !== selectionContactId}
                      title={selectionContactId && task.contact_id !== selectionContactId ? 'Clear your selection before selecting a different customer' : 'Select this item'}
                      className="w-4 h-4 rounded border-strong text-blue-600 focus:ring-blue-500 disabled:opacity-30 disabled:cursor-not-allowed" />
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
                    <span>·</span><span className="shrink-0">{new Date(task.created_at).toLocaleDateString()}</span>
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
          tasks={selectedTasks}
          mode={batchMode}
          onSchedule={requests => {setShowBatchRequestModal(false);setSelectedTaskIds(new Set());setScheduleQueue(requests);loadTasks();}}
          onClose={() => setShowBatchRequestModal(false)}
          onSuccess={() => {
            setShowBatchRequestModal(false);
            setSelectedTaskIds(new Set());
            loadTasks();
          }}
        />
      )}

      {scheduleQueue.length > 0 && <Suspense fallback={<div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center text-white">Loading scheduler…</div>}>
        <CreateWorkOrderModal key={scheduleQueue[0].id} serviceRequest={scheduleQueue[0]}
          onClose={() => {setScheduleQueue([]);loadTasks();}}
          onSuccess={() => {setScheduleQueue(queue => queue.slice(1));loadTasks();}} />
      </Suspense>}

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
          onSchedule={() => startDetailAction('schedule')}
          onRequestService={() => startDetailAction('request')}
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
  mode: 'request' | 'schedule';
  onSchedule: (requests: ServiceRequestContext[]) => void;
}

function BatchRequestModal({ tasks, onClose, onSuccess, mode, onSchedule }: BatchRequestModalProps) {
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
    if (!tasks.length || groups.length !== 1) { toast.error('Select items for one customer at a time'); return; }
    setLoading(true);
    try {
      const requests: ServiceRequestContext[] = [];
      const requestIds = new Set<string>();
      let successCount = 0;
      let taskCount = 0;

      for (const group of groups) {
        const drafts = group.tasks.filter(canRequestPunchlist);
        if (drafts.length) {
          const {data, error} = await supabase.rpc('request_punchlist_service', {
            p_task_ids: drafts.map(task => task.id), p_contact_id: group.contactId, p_notes: globalNotes.trim() || null,
          });
          if (error) throw error;
          if (!data) throw new Error('The service request could not be loaded');
          requestIds.add(data);
          successCount++;
          taskCount += drafts.length;
        }
        if (mode === 'schedule') group.tasks.forEach(task => {if (task.service_request_id) requestIds.add(task.service_request_id);});
      }
      if (mode === 'schedule') {
        for (const id of requestIds) {
          const {data, error} = await supabase.from('service_requests').select('*').eq('id', id).single();
          if (error) throw error;
          if (data.contact_id !== groups[0].contactId || data.status !== 'open' || data.work_order_id) throw new Error('A selected request has already been scheduled. Refresh the list.');
          requests.push(data);
        }
        if (!requests.length) throw new Error('Select an item to schedule');
        onSchedule(requests);
        return;
      }
      toast.success(
        `Sent ${successCount} request${successCount !== 1 ? 's' : ''} covering ${taskCount} item${taskCount !== 1 ? 's' : ''} to the Work Order Request Queue for your service manager to schedule.`,
        'Sent to Service Queue'
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
              <h3 className="text-base font-bold text-primary">{mode === 'schedule' ? 'Schedule Selected Items' : 'Request Service'}</h3>
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
              {mode === 'schedule' ? 'Choose a technician and time in the work-order form for each request. Existing requests include all their linked items. If you close the scheduler, remaining items stay requested for later scheduling.' : 'Send these items as one request to the Work Order Request Queue. Your service manager will assign a technician and schedule the work.'}
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
                    {mode === 'schedule' ? 'One Customer' : '1 SR'}
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
              Notes (optional — new requests only)
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
            {mode === 'schedule' ? 'Schedule each request in turn' : `${groups.length} customer request${groups.length !== 1 ? 's' : ''}`}
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
              {loading ? 'Preparing…' : mode === 'schedule' ? 'Continue to Schedule' : `Request Service (${tasks.length})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
