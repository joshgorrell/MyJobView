import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import { ArrowLeft, CreditCard as Edit2, Save, X, Plus, Clock, Calendar, User, AlertCircle, Package, CheckSquare, FileText, Camera, Wrench, Award, UserPlus, Tag, Archive, ArchiveRestore, Link, Unlink, Copy, History, Phone, PhoneOff, MapPin, Navigation, Repeat } from 'lucide-react';
import ConfirmModal from '../ui/ConfirmModal';
import { useAuth } from '../../contexts/AuthContext';
import { PartRequestForm } from './PartRequestForm';
import { JobPhotoGallery } from './JobPhotoGallery';
import { JobPhotoCapture } from './JobPhotoCapture';
import { JobCompletionWizard } from './JobCompletionWizard';
import { AddPartsModal } from './AddPartsModal';
import { CreateTaskFromWorkOrderModal } from './CreateTaskFromWorkOrderModal';
import WorkOrderTasksChecklist from './WorkOrderTasksChecklist';
import ServiceWorkOrderTaskManager from './ServiceWorkOrderTaskManager';
import { ContactLogModal } from '../Shared/ContactLogModal';
import { ContactLogHistory } from '../Shared/ContactLogHistory';

interface WorkOrderDetailProps {
  workOrderId: string;
  onBack: () => void;
}

interface WorkOrder {
  id: string;
  work_order_number: string;
  title: string;
  description: string;
  type: string;
  status: string;
  priority: string;
  start_date: string;
  target_completion_date: string;
  actual_completion_date: string | null;
  estimated_hours: number;
  actual_hours: number;
  notes: string;
  internal_notes: string;
  assigned_to: string | null;
  project_id: string | null;
  contact_id: string;
  customer_sales_rep_id: string | null;
  created_at: string;
  is_billable: boolean;
  is_archived: boolean;
  work_order_group_id: string | null;
  labor_phase_id: string | null;
  is_group_work_order: boolean;
  archived_at: string | null;
  customer_contacted: boolean;
  customer_contact_confirmed_at: string | null;
  customer_contact_confirmed_by: string | null;
  project: {
    name: string;
    project_number: string;
  } | null;
  labor_phase?: {
    name: string;
    description: string | null;
  };
  technician?: {
    full_name: string;
  };
  contact?: {
    id: string;
    full_name: string;
    company_name: string;
    street_address: string | null;
    city: string | null;
    state: string | null;
    zip_code: string | null;
  };
  sales_rep?: {
    id: string;
    full_name: string;
  };
  is_recurring_parent?: boolean;
  recurrence_parent_id?: string | null;
  recurrence_rule?: Record<string, unknown> | null;
}

interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  assigned_to: string | null;
  estimated_hours: number;
  actual_hours: number;
  completed_at: string | null;
  sort_order: number;
  technician?: {
    full_name: string;
  };
}

interface Material {
  id: string;
  material_name: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  total_cost: number;
  used_date: string;
  notes: string;
}

interface TimeEntry {
  id: string;
  entry_date: string;
  clock_in: string;
  clock_out: string | null;
  total_hours: number;
  break_minutes: number;
  status: string;
  notes: string;
  clock_in_latitude: number | null;
  clock_in_longitude: number | null;
  clock_in_gps_accuracy: number | null;
  clock_in_gps_capture_method: string | null;
  clock_out_latitude: number | null;
  clock_out_longitude: number | null;
  clock_out_gps_accuracy: number | null;
  clock_out_gps_capture_method: string | null;
  technician: {
    full_name: string;
  };
}

interface PartRequest {
  id: string;
  part_name: string;
  quantity: number;
  status: string;
  urgency: string;
  requested_at: string;
  notes: string;
  technician: {
    full_name: string;
  };
}

interface JobCompletion {
  id: string;
  completed_at: string;
  quality_score: number;
  customer_name: string;
  customer_signature_url: string | null;
  technician: {
    full_name: string;
  };
}

interface PartUsed {
  id: string;
  part_name: string;
  part_sku: string | null;
  quantity: number;
  unit_cost: number;
  unit_price: number;
  total_price: number;
  warranty_item: boolean;
  product_id: string | null;
}

export function WorkOrderDetail({ workOrderId, onBack }: WorkOrderDetailProps) {
  const { profile } = useAuth();
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [partsUsed, setPartsUsed] = useState<PartUsed[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [partRequests, setPartRequests] = useState<PartRequest[]>([]);
  const [jobPhotos, setJobPhotos] = useState<any[]>([]);
  const [jobCompletion, setJobCompletion] = useState<JobCompletion | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'materials' | 'time' | 'parts' | 'photos' | 'completion' | 'history'>('overview');
  const [editedWorkOrder, setEditedWorkOrder] = useState<Partial<WorkOrder>>({});
  const [showPartRequestForm, setShowPartRequestForm] = useState(false);
  const [showPhotoCapture, setShowPhotoCapture] = useState(false);
  const [showCompletionWizard, setShowCompletionWizard] = useState(false);
  const [showAddPartsModal, setShowAddPartsModal] = useState(false);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [linkedWorkOrders, setLinkedWorkOrders] = useState<any[]>([]);
  const [availableWorkOrders, setAvailableWorkOrders] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [customerHistory, setCustomerHistory] = useState<any[]>([]);
  const [showContactLogModal, setShowContactLogModal] = useState(false);
  const [contactLogRefreshKey, setContactLogRefreshKey] = useState(0);
  const [selectedTechId, setSelectedTechId] = useState('');
  const [selectedLinkIds, setSelectedLinkIds] = useState<string[]>([]);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [laborPhases, setLaborPhases] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    loadWorkOrderData();
    loadTechnicians();
    loadLaborPhases();
  }, [workOrderId]);

  async function loadLaborPhases() {
    const { data } = await supabase
      .from('labor_phases')
      .select('id, name')
      .eq('is_active', true)
      .order('sort_order');
    if (data) setLaborPhases(data);
  }

  async function loadTechnicians() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('role', 'tech')
        .order('full_name');

      if (error) throw error;
      setTechnicians(data || []);
    } catch (error) {
      console.error('Error loading technicians:', error);
    }
  }

  async function loadLinkedWorkOrders(groupId: string | null) {
    if (!groupId) {
      setLinkedWorkOrders([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('work_orders')
        .select(`
          id,
          work_order_number,
          title,
          status,
          assigned_to,
          technician:profiles!assigned_to(full_name)
        `)
        .eq('work_order_group_id', groupId)
        .neq('id', workOrderId)
        .order('created_at');

      if (error) throw error;
      setLinkedWorkOrders(data || []);
    } catch (error) {
      console.error('Error loading linked work orders:', error);
    }
  }

  async function loadAvailableWorkOrders() {
    if (!workOrder) return;

    try {
      const { data, error } = await supabase
        .from('work_orders')
        .select('id, work_order_number, title, status, work_order_group_id')
        .eq('contact_id', workOrder.contact_id)
        .neq('id', workOrderId)
        .is('work_order_group_id', null)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setAvailableWorkOrders(data || []);
    } catch (error) {
      console.error('Error loading available work orders:', error);
    }
  }

  async function loadCustomerHistory(contactId: string) {
    try {
      const { data, error } = await supabase
        .from('work_orders')
        .select(`
          id,
          work_order_number,
          title,
          description,
          type,
          status,
          notes,
          internal_notes,
          created_at,
          completed_at,
          technician:profiles!assigned_to(full_name),
          completion:job_completions(
            completion_notes,
            quality_score,
            completed_at
          )
        `)
        .eq('contact_id', contactId)
        .neq('id', workOrderId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setCustomerHistory(data || []);
    } catch (error) {
      console.error('Error loading customer history:', error);
    }
  }

  async function loadWorkOrderData() {
    try {
      const [woResult, tasksResult, materialsResult, partsUsedResult, timeResult, partsResult, photosResult, completionResult] = await Promise.all([
        supabase
          .from('work_orders')
          .select(`
            *,
            project:projects(name, project_number),
            labor_phase:labor_phases(name, description),
            technician:profiles!assigned_to(full_name),
            contact:contacts(id, full_name, company_name, street_address, city, state, zip_code),
            sales_rep:profiles!customer_sales_rep_id(id, full_name)
          `)
          .eq('id', workOrderId)
          .single(),
        supabase
          .from('work_order_tasks')
          .select('*, technician:profiles!assigned_to(full_name)')
          .eq('work_order_id', workOrderId)
          .order('sort_order'),
        supabase
          .from('work_order_materials')
          .select('*')
          .eq('work_order_id', workOrderId)
          .order('used_date', { ascending: false }),
        supabase
          .from('service_parts_used')
          .select('*')
          .eq('work_order_id', workOrderId)
          .order('created_at', { ascending: false }),
        supabase
          .from('time_entries')
          .select(`
            *,
            clock_in_latitude,
            clock_in_longitude,
            clock_in_gps_accuracy,
            clock_in_gps_capture_method,
            clock_out_latitude,
            clock_out_longitude,
            clock_out_gps_accuracy,
            clock_out_gps_capture_method,
            technician:profiles!technician_id(full_name)
          `)
          .eq('work_order_id', workOrderId)
          .order('entry_date', { ascending: false }),
        supabase
          .from('parts_requests')
          .select('*, technician:profiles!technician_id(full_name)')
          .eq('work_order_id', workOrderId)
          .order('requested_at', { ascending: false }),
        supabase
          .from('job_photos')
          .select('*')
          .eq('work_order_id', workOrderId)
          .order('captured_at', { ascending: false }),
        supabase
          .from('job_completions')
          .select('*, technician:profiles!technician_id(full_name)')
          .eq('work_order_id', workOrderId)
          .maybeSingle()
      ]);

      if (woResult.error) throw woResult.error;
      if (woResult.data) {
        setWorkOrder(woResult.data);
        loadLinkedWorkOrders(woResult.data?.work_order_group_id || null);
        loadCustomerHistory(woResult.data.contact_id);
        setEditedWorkOrder(woResult.data);
      }

      setTasks(tasksResult.data || []);
      setMaterials(materialsResult.data || []);
      setPartsUsed(partsUsedResult.data || []);
      setTimeEntries(timeResult.data || []);
      setPartRequests(partsResult.data || []);
      setJobPhotos(photosResult.data || []);
      setJobCompletion(completionResult.data);
    } catch (error) {
      console.error('Error loading work order:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!workOrder) return;

    try {
      const { error } = await supabase
        .from('work_orders')
        .update({
          title: editedWorkOrder.title,
          description: editedWorkOrder.description,
          status: editedWorkOrder.status,
          priority: editedWorkOrder.priority,
          assigned_to: editedWorkOrder.assigned_to,
          start_date: editedWorkOrder.start_date,
          target_completion_date: editedWorkOrder.target_completion_date,
          actual_completion_date: editedWorkOrder.actual_completion_date,
          estimated_hours: editedWorkOrder.estimated_hours,
          notes: editedWorkOrder.notes,
          internal_notes: editedWorkOrder.internal_notes,
          labor_phase_id: editedWorkOrder.labor_phase_id !== undefined ? editedWorkOrder.labor_phase_id : workOrder.labor_phase_id,
          updated_at: new Date().toISOString()
        })
        .eq('id', workOrderId);

      if (error) throw error;

      setEditing(false);
      loadWorkOrderData();
    } catch (error) {
      console.error('Error updating work order:', error);
    }
  }

  async function handleConfirmCustomerContact() {
    if (!profile || !workOrder) return;
    if (workOrder.customer_contact_confirmed_at) {
      setConfirmModal({
        title: 'Update Contact Timestamp',
        message: 'Customer contact has already been recorded. Do you want to update the timestamp to now?',
        onConfirm: async () => {
          try {
            const { error } = await supabase
              .from('work_orders')
              .update({
                customer_contact_confirmed_at: new Date().toISOString(),
                customer_contact_confirmed_by: profile.id,
                updated_at: new Date().toISOString()
              })
              .eq('id', workOrderId);
            if (error) throw error;
            loadWorkOrderData();
          } catch (error) {
            console.error('Error confirming customer contact:', error);
          }
        }
      });
      return;
    }
    try {
      const { error } = await supabase
        .from('work_orders')
        .update({
          customer_contact_confirmed_at: new Date().toISOString(),
          customer_contact_confirmed_by: profile.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', workOrderId);
      if (error) throw error;
      loadWorkOrderData();
    } catch (error) {
      console.error('Error confirming customer contact:', error);
    }
  }

  async function handleArchive() {
    if (!profile || !workOrder) return;

    const confirmMessage = workOrder.is_archived
      ? 'Unarchive this work order? It will appear in active queues again.'
      : 'Archive this work order? This marks the work as complete and billed. You can still view it by showing archived items.';

    setConfirmModal({
      title: workOrder.is_archived ? 'Unarchive Work Order' : 'Archive Work Order',
      message: confirmMessage,
      onConfirm: async () => {
        try {
          if (workOrder.is_archived) {
            const { error } = await supabase.rpc('unarchive_work_order', {
              p_work_order_id: workOrderId
            });
            if (error) throw error;
          } else {
            const { error } = await supabase.rpc('archive_work_order', {
              p_work_order_id: workOrderId,
              p_user_id: profile.id
            });
            if (error) throw error;
          }

          loadWorkOrderData();
          alert(workOrder.is_archived ? 'Work order unarchived successfully!' : 'Work order archived successfully!');
        } catch (error) {
          console.error('Error archiving work order:', error);
          alert('Failed to archive work order. Please try again.');
        }
      }
    });
  }

  async function handleLinkWorkOrders() {
    if (selectedLinkIds.length === 0) {
      alert('Please select at least one work order to link');
      return;
    }

    try {
      const allIds = [workOrderId, ...selectedLinkIds];
      const { error } = await supabase.rpc('link_work_orders', {
        p_work_order_ids: allIds
      });

      if (error) throw error;

      setShowLinkModal(false);
      setSelectedLinkIds([]);
      loadWorkOrderData();
      alert(`Successfully linked ${allIds.length} work orders together!`);
    } catch (error) {
      console.error('Error linking work orders:', error);
      alert('Failed to link work orders. Please try again.');
    }
  }

  async function handleUnlinkWorkOrder() {
    setConfirmModal({
      title: 'Remove from Group',
      message: 'Remove this work order from its group? This will not affect the other linked work orders.',
      onConfirm: async () => {
        try {
          const { error } = await supabase.rpc('unlink_work_order', {
            p_work_order_id: workOrderId
          });

          if (error) throw error;

          loadWorkOrderData();
          alert('Work order unlinked successfully!');
        } catch (error) {
          console.error('Error unlinking work order:', error);
          alert('Failed to unlink work order. Please try again.');
        }
      }
    });
  }

  async function handleDuplicateToTech() {
    if (!profile || !selectedTechId) {
      alert('Please select a technician');
      return;
    }

    try {
      const { error } = await supabase.rpc('duplicate_work_order_to_technician', {
        p_source_work_order_id: workOrderId,
        p_target_technician_id: selectedTechId,
        p_user_id: profile.id
      });

      if (error) throw error;

      setShowDuplicateModal(false);
      setSelectedTechId('');
      loadWorkOrderData();
      alert('Work order duplicated and linked successfully!');
    } catch (error) {
      console.error('Error duplicating work order:', error);
      alert('Failed to duplicate work order. Please try again.');
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800 border-green-200';
      case 'in_progress': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'assigned': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'on_hold': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'cancelled': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  }

  function getPriorityColor(priority: string) {
    switch (priority) {
      case 'urgent': return 'text-red-600 bg-red-50';
      case 'high': return 'text-orange-600 bg-orange-50';
      case 'medium': return 'text-amber-600 bg-amber-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  }

  function getPartStatusColor(status: string) {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-700';
      case 'pending': return 'bg-amber-100 text-amber-700';
      case 'fulfilled': return 'bg-blue-100 text-blue-700';
      case 'rejected': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading work order...</div>
      </div>
    );
  }

  if (!workOrder) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Work order not found</p>
        <button onClick={onBack} className="mt-4 text-blue-600 hover:text-blue-700">
          Go back
        </button>
      </div>
    );
  }

  const canEdit = profile?.role === 'admin' ||
    profile?.role === 'office_manager' ||
    profile?.role === 'project_manager';

  const canArchive = profile?.role === 'admin' || profile?.role === 'finance' || profile?.role === 'office_manager';

  const isAssignedTech = workOrder.assigned_to === profile?.id;

  const totalTimeHours = timeEntries.reduce((sum, t) => sum + t.total_hours, 0);
  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const pendingParts = partRequests.filter(p => p.status === 'pending').length;
  const canComplete = workOrder.status !== 'completed' && isAssignedTech && !jobCompletion;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: FileText },
    { id: 'tasks', label: 'Tasks', icon: CheckSquare, count: tasks.length },
    { id: 'parts', label: 'Parts', icon: Wrench, count: partRequests.length, badge: pendingParts },
    { id: 'photos', label: 'Photos', icon: Camera, count: jobPhotos.length },
    { id: 'materials', label: 'Materials', icon: Package, count: materials.length + partsUsed.length },
    { id: 'time', label: 'Time', icon: Clock, count: timeEntries.length },
    { id: 'completion', label: 'Completion', icon: Award, badge: jobCompletion ? 1 : 0 },
    { id: 'history', label: 'History', icon: History, count: customerHistory.length }
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <button
            onClick={onBack}
            className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg shrink-0 mt-0.5"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            {editing ? (
              <input
                type="text"
                value={editedWorkOrder.title}
                onChange={(e) => setEditedWorkOrder({ ...editedWorkOrder, title: e.target.value })}
                className="text-xl font-bold text-gray-900 px-2 py-1 border border-gray-300 rounded-lg w-full"
              />
            ) : (
              <h1 className="text-xl font-bold text-gray-900 leading-tight">{workOrder.title}</h1>
            )}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="text-sm font-mono text-gray-500">{workOrder.work_order_number}</span>
              {workOrder.project && (
                <>
                  <span className="text-gray-300">•</span>
                  <span className="text-sm text-gray-500">
                    {workOrder.project.project_number} – {workOrder.project.name}
                  </span>
                </>
              )}
              <span className="text-gray-300">•</span>
              {editing ? (
                <select
                  value={editedWorkOrder.status || workOrder.status}
                  onChange={(e) => setEditedWorkOrder({ ...editedWorkOrder, status: e.target.value })}
                  className={`text-xs font-medium px-2 py-0.5 rounded-full border ${getStatusColor(editedWorkOrder.status || workOrder.status)}`}
                >
                  <option value="pending">Pending</option>
                  <option value="assigned">Assigned</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="on_hold">On Hold</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              ) : (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(workOrder.status)}`}>
                  {(workOrder.status || '').replace('_', ' ')}
                </span>
              )}
              {workOrder.is_archived && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                  <Archive className="w-3 h-3" />
                  Archived
                </span>
              )}
              {workOrder.is_recurring_parent && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200">
                  <Repeat className="w-3 h-3" />
                  Recurring Series
                </span>
              )}
              {workOrder.recurrence_parent_id && !workOrder.is_recurring_parent && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600 border border-blue-200">
                  <Repeat className="w-3 h-3" />
                  Part of Series
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {canEdit && !editing && (
            <button
              onClick={() => setShowContactLogModal(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg font-medium border ${
                workOrder.customer_contact_confirmed_at
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                  : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
              }`}
            >
              <Phone className="w-3.5 h-3.5" />
              {workOrder.customer_contact_confirmed_at ? 'Log Contact' : 'Log Contact'}
            </button>
          )}
          {canComplete && (
            <button
              onClick={() => setShowCompletionWizard(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
            >
              <Award className="w-3.5 h-3.5" />
              Complete Job
            </button>
          )}
          {canEdit && !editing && (
            <>
              <button
                onClick={() => {
                  loadAvailableWorkOrders();
                  setShowLinkModal(true);
                }}
                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                title="Link work orders"
              >
                <Link className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowDuplicateModal(true)}
                className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                title="Duplicate to another technician"
              >
                <Copy className="w-4 h-4" />
              </button>
            </>
          )}
          {canArchive && !editing && (
            <button
              onClick={handleArchive}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              title={workOrder.is_archived ? 'Unarchive' : 'Archive'}
            >
              {workOrder.is_archived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
            </button>
          )}
          {canEdit && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <Edit2 className="w-3.5 h-3.5" />
              Edit
            </button>
          )}
          {editing && (
            <>
              <button
                onClick={() => { setEditing(false); setEditedWorkOrder(workOrder); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Save className="w-3.5 h-3.5" />
                Save
              </button>
            </>
          )}
        </div>
      </div>

      {/* Recurring Series Banner */}
      {(workOrder.is_recurring_parent || workOrder.recurrence_parent_id) && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Repeat className="w-4 h-4 text-blue-600" />
            <span className="font-semibold text-gray-900 text-sm">
              {workOrder.is_recurring_parent ? 'Recurring Series Parent' : 'Part of Recurring Series'}
            </span>
          </div>
          {workOrder.is_recurring_parent && workOrder.recurrence_rule && (
            <p className="text-xs text-blue-700">
              {(() => {
                const r = workOrder.recurrence_rule as any;
                const freqMap: Record<string, string> = { daily: 'day(s)', weekly: 'week(s)', monthly: 'month(s)', yearly: 'year(s)' };
                let summary = `Repeats every ${r.interval ?? 1} ${freqMap[r.frequency] ?? r.frequency}`;
                if (r.end_date) summary += ` until ${new Date(r.end_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
                else if (r.occurrences) summary += ` for ${r.occurrences} occurrence${r.occurrences !== 1 ? 's' : ''}`;
                return summary;
              })()}
            </p>
          )}
          {workOrder.recurrence_parent_id && !workOrder.is_recurring_parent && (
            <p className="text-xs text-blue-600">
              This is a generated instance of a recurring work order.
            </p>
          )}
        </div>
      )}

      {/* Linked Work Orders Banner */}
      {workOrder.work_order_group_id && linkedWorkOrders.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Link className="w-4 h-4 text-blue-600" />
              <span className="font-semibold text-gray-900 text-sm">
                Linked Work Orders — {linkedWorkOrders.length + 1} total (billed together)
              </span>
            </div>
            {canEdit && (
              <button
                onClick={handleUnlinkWorkOrder}
                className="flex items-center gap-1 px-2.5 py-1 text-xs text-red-600 hover:text-red-700 border border-red-200 rounded-lg hover:bg-red-50"
              >
                <Unlink className="w-3 h-3" />
                Unlink
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 border border-blue-300 rounded-lg text-sm">
              <span className="font-medium text-blue-900">{workOrder.work_order_number}</span>
              <span className="text-blue-600 text-xs">(this)</span>
            </div>
            {linkedWorkOrders.map(wo => (
              <div key={wo.id} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-blue-200 rounded-lg text-sm">
                <span className="font-medium text-gray-900">{wo.work_order_number}</span>
                {wo.technician?.full_name && (
                  <span className="text-gray-500 text-xs">{wo.technician.full_name}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {[
          { icon: CheckSquare, label: 'Tasks', value: `${completedTasks}/${tasks.length}`, color: 'text-blue-600' },
          { icon: Clock, label: 'Hours', value: `${totalTimeHours.toFixed(1)}h`, color: 'text-slate-600' },
          { icon: Package, label: 'Parts Used', value: partsUsed.length, color: 'text-green-600' },
          { icon: Wrench, label: 'Part Requests', value: partRequests.length, sub: pendingParts > 0 ? `${pendingParts} pending` : undefined, color: 'text-orange-600' },
          { icon: Camera, label: 'Photos', value: jobPhotos.length, color: 'text-purple-600' },
          { icon: Calendar, label: 'Due', value: workOrder.target_completion_date ? new Date(workOrder.target_completion_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'TBD', color: 'text-gray-600' },
        ].map(({ icon: Icon, label, value, sub, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-3">
            <div className={`flex items-center gap-1.5 text-xs text-gray-500 mb-1`}>
              <Icon className={`w-3.5 h-3.5 ${color}`} />
              {label}
            </div>
            <div className="text-lg font-bold text-gray-900">{value}</div>
            {sub && <div className="text-xs text-orange-500 mt-0.5">{sub}</div>}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 overflow-x-auto">
        <nav className="flex gap-1 min-w-max">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${
                    activeTab === tab.id ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {tab.count}
                  </span>
                )}
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded-full text-xs font-medium">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">

        {/* Overview */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Left column */}
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Description</label>
                  {editing ? (
                    <textarea
                      value={editedWorkOrder.description || ''}
                      onChange={(e) => setEditedWorkOrder({ ...editedWorkOrder, description: e.target.value })}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  ) : (
                    <p className="text-gray-800 text-sm leading-relaxed">{workOrder.description || 'No description provided.'}</p>
                  )}
                </div>

                {workOrder.notes && !editing && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Notes</label>
                    {editing ? (
                      <textarea
                        value={editedWorkOrder.notes || ''}
                        onChange={(e) => setEditedWorkOrder({ ...editedWorkOrder, notes: e.target.value })}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    ) : (
                      <p className="text-gray-800 text-sm leading-relaxed">{workOrder.notes}</p>
                    )}
                  </div>
                )}

                {editing && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Notes</label>
                    <textarea
                      value={editedWorkOrder.notes || ''}
                      onChange={(e) => setEditedWorkOrder({ ...editedWorkOrder, notes: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                )}

                {canEdit && (workOrder.internal_notes || editing) && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Internal Notes</label>
                    {editing ? (
                      <textarea
                        value={editedWorkOrder.internal_notes || ''}
                        onChange={(e) => setEditedWorkOrder({ ...editedWorkOrder, internal_notes: e.target.value })}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    ) : (
                      <p className="text-gray-800 text-sm leading-relaxed">{workOrder.internal_notes}</p>
                    )}
                  </div>
                )}

                {isAssignedTech && (
                  <div className="pt-2">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Quick Actions</label>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => setShowAddPartsModal(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        <Package className="w-3.5 h-3.5" />
                        Add Parts Used
                      </button>
                      <button
                        onClick={() => setShowCreateTaskModal(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                      >
                        <CheckSquare className="w-3.5 h-3.5" />
                        Create Task
                      </button>
                      <button
                        onClick={() => setShowPartRequestForm(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700"
                      >
                        <Wrench className="w-3.5 h-3.5" />
                        Request Parts
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Right column */}
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-xl border border-gray-200 divide-y divide-gray-100">

                  <div className="px-4 py-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Technician</span>
                    {editing ? (
                      <select
                        value={editedWorkOrder.assigned_to || ''}
                        onChange={(e) => setEditedWorkOrder({ ...editedWorkOrder, assigned_to: e.target.value || null })}
                        className="text-sm border border-gray-300 rounded px-2 py-1"
                      >
                        <option value="">Unassigned</option>
                        {technicians.map(t => (
                          <option key={t.id} value={t.id}>{t.full_name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-gray-400" />
                        {workOrder.technician?.full_name || 'Unassigned'}
                      </span>
                    )}
                  </div>

                  <div className="px-4 py-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Priority</span>
                    {editing ? (
                      <select
                        value={editedWorkOrder.priority || workOrder.priority}
                        onChange={(e) => setEditedWorkOrder({ ...editedWorkOrder, priority: e.target.value })}
                        className="text-sm border border-gray-300 rounded px-2 py-1"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    ) : (
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${getPriorityColor(workOrder.priority)}`}>
                        {workOrder.priority}
                      </span>
                    )}
                  </div>

                  <div className="px-4 py-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</span>
                    <span className="text-sm text-gray-900 capitalize">{(workOrder.type || '').replace(/_/g, ' ')}</span>
                  </div>

                  {(workOrder.labor_phase || editing) && (
                    <div className="px-4 py-3 flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Labor Phase</span>
                      {editing ? (
                        <select
                          value={editedWorkOrder.labor_phase_id ?? workOrder.labor_phase_id ?? ''}
                          onChange={e => setEditedWorkOrder({ ...editedWorkOrder, labor_phase_id: e.target.value || null })}
                          className="text-sm border border-gray-300 rounded px-2 py-1"
                        >
                          <option value="">— None —</option>
                          {laborPhases.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-sm font-medium text-blue-700">{workOrder.labor_phase?.name}</span>
                      )}
                    </div>
                  )}

                  <div className="px-4 py-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Est. Hours</span>
                    {editing ? (
                      <input
                        type="number"
                        value={editedWorkOrder.estimated_hours || 0}
                        onChange={(e) => setEditedWorkOrder({ ...editedWorkOrder, estimated_hours: parseFloat(e.target.value) })}
                        className="text-sm border border-gray-300 rounded px-2 py-1 w-20"
                        step="0.5"
                      />
                    ) : (
                      <span className="text-sm text-gray-900">{workOrder.estimated_hours || 0}h</span>
                    )}
                  </div>

                  <div className="px-4 py-3 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Target Date</span>
                    {editing ? (
                      <input
                        type="date"
                        value={editedWorkOrder.target_completion_date?.split('T')[0] || ''}
                        onChange={(e) => setEditedWorkOrder({ ...editedWorkOrder, target_completion_date: e.target.value })}
                        className="text-sm border border-gray-300 rounded px-2 py-1"
                      />
                    ) : (
                      <span className="text-sm text-gray-900">
                        {workOrder.target_completion_date
                          ? new Date(workOrder.target_completion_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : 'Not set'}
                      </span>
                    )}
                  </div>

                </div>

                {/* Customer card */}
                {workOrder.contact && (
                  <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Customer</label>
                    <div className="text-sm font-semibold text-gray-900 mb-1">
                      {workOrder.contact.full_name || workOrder.contact.company_name}
                    </div>
                    {(workOrder.contact.street_address || workOrder.contact.city) && (() => {
                      const parts = [workOrder.contact.street_address, workOrder.contact.city, workOrder.contact.state, workOrder.contact.zip_code].filter(Boolean);
                      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(', '))}`;
                      return (
                        <div className="flex items-start gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs text-gray-600 leading-snug">
                              {workOrder.contact.street_address && <span className="block">{workOrder.contact.street_address}</span>}
                              <span className="block">{[workOrder.contact.city, workOrder.contact.state, workOrder.contact.zip_code].filter(Boolean).join(', ')}</span>
                            </p>
                            <a
                              href={mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 mt-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                            >
                              <Navigation className="w-3 h-3" />
                              Navigate
                            </a>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Customer confirmed checkbox */}
                <div className={`rounded-xl border p-4 ${workOrder.customer_contacted ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-300'}`}>
                  <div className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-2 ${workOrder.customer_contacted ? 'text-emerald-700' : 'text-red-700'}`}>
                    {workOrder.customer_contacted ? <Phone className="w-3.5 h-3.5" /> : <PhoneOff className="w-3.5 h-3.5" />}
                    Customer Confirmation
                  </div>
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <div className="relative mt-0.5 shrink-0">
                      <input
                        type="checkbox"
                        checked={workOrder.customer_contacted}
                        onChange={async (e) => {
                          const newValue = e.target.checked;
                          setWorkOrder(prev => prev ? { ...prev, customer_contacted: newValue } : prev);
                          const { error } = await supabase
                            .from('work_orders')
                            .update({ customer_contacted: newValue })
                            .eq('id', workOrderId);
                          if (error) {
                            setWorkOrder(prev => prev ? { ...prev, customer_contacted: !newValue } : prev);
                          }
                        }}
                        className="sr-only"
                      />
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        workOrder.customer_contacted
                          ? 'bg-emerald-600 border-emerald-600'
                          : 'bg-white border-red-400 group-hover:border-red-500'
                      }`}>
                        {workOrder.customer_contacted && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className={`text-sm font-medium ${workOrder.customer_contacted ? 'text-emerald-800' : 'text-red-700'}`}>
                        Customer confirmed about this visit
                      </p>
                      <p className={`text-xs mt-0.5 ${workOrder.customer_contacted ? 'text-emerald-600' : 'text-red-500'}`}>
                        {workOrder.customer_contacted
                          ? 'Customer is aware of the scheduled visit'
                          : 'Customer has not been contacted yet — tap to mark confirmed'}
                      </p>
                    </div>
                  </label>
                </div>

                {/* Contact log status */}
                <div className={`rounded-xl border p-4 ${workOrder.customer_contact_confirmed_at ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                  <div className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-1 ${workOrder.customer_contact_confirmed_at ? 'text-emerald-700' : 'text-amber-700'}`}>
                    <Phone className="w-3.5 h-3.5" />
                    Customer Contact Log
                  </div>
                  {workOrder.customer_contact_confirmed_at ? (
                    <p className="text-sm text-emerald-800">
                      First logged {new Date(workOrder.customer_contact_confirmed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  ) : (
                    <p className="text-sm text-amber-700">No contact logged yet</p>
                  )}
                </div>

                <ContactLogHistory workOrderId={workOrderId} refreshKey={contactLogRefreshKey} />

                {workOrder.sales_rep && (
                  <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">
                      <UserPlus className="w-3.5 h-3.5" />
                      Sales Rep
                    </div>
                    <p className="text-sm font-semibold text-blue-900">{workOrder.sales_rep.full_name}</p>
                    <p className="text-xs text-blue-600 mt-0.5">For quotes or follow-up</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tasks */}
        {activeTab === 'tasks' && (
          <div className="space-y-6">
            <WorkOrderTasksChecklist
              workOrderId={workOrderId}
              projectId={workOrder.project_id}
              laborPhaseId={workOrder.labor_phase_id}
              workOrderGroupId={workOrder.work_order_group_id}
              isGroupWorkOrder={workOrder.is_group_work_order}
              currentUserId={profile?.id || ''}
            />

            {!workOrder.project_id && canEdit && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Manage Service Tasks</h3>
                <ServiceWorkOrderTaskManager
                  workOrderId={workOrderId}
                  workOrderGroupId={workOrder.work_order_group_id || undefined}
                  isGroupWorkOrder={workOrder.is_group_work_order}
                  onTasksChange={loadWorkOrderData}
                />
              </div>
            )}
          </div>
        )}

        {/* Parts Requests */}
        {activeTab === 'parts' && (
          <div className="space-y-4">
            {isAssignedTech && (
              <button
                onClick={() => setShowPartRequestForm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                <Plus className="w-4 h-4" />
                Request Parts
              </button>
            )}

            {partRequests.length === 0 ? (
              <div className="text-center py-12">
                <Wrench className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">No parts requested yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {partRequests.map(request => (
                  <div key={request.id} className="border border-gray-200 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-gray-900">{request.part_name}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${getPartStatusColor(request.status)}`}>
                            {request.status}
                          </span>
                          {request.urgency === 'urgent' && (
                            <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                              Urgent
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">Qty: {request.quantity}</p>
                        {request.notes && <p className="text-sm text-gray-600 mt-1">{request.notes}</p>}
                        <p className="text-xs text-gray-400 mt-2">
                          Requested by {request.technician.full_name} · {new Date(request.requested_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Photos */}
        {activeTab === 'photos' && (
          <div className="space-y-4">
            {isAssignedTech && (
              <button
                onClick={() => setShowPhotoCapture(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                <Camera className="w-4 h-4" />
                Add Photos
              </button>
            )}
            <JobPhotoGallery workOrderId={workOrderId} photos={jobPhotos} onUpdate={loadWorkOrderData} />
          </div>
        )}

        {/* Materials */}
        {activeTab === 'materials' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Parts Used</h3>
              {isAssignedTech && (
                <button
                  onClick={() => setShowAddPartsModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Parts
                </button>
              )}
            </div>

            {partsUsed.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
                <Package className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">No parts logged yet</p>
                {isAssignedTech && (
                  <button
                    onClick={() => setShowAddPartsModal(true)}
                    className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 mx-auto"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Parts Used
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="pb-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Part</th>
                      <th className="pb-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">SKU</th>
                      <th className="pb-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Qty</th>
                      <th className="pb-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Cost</th>
                      <th className="pb-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Price</th>
                      <th className="pb-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</th>
                      <th className="pb-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {partsUsed.map(part => (
                      <tr key={part.id} className={part.warranty_item ? 'bg-amber-50' : ''}>
                        <td className="py-2.5 text-gray-900 font-medium">{part.part_name}</td>
                        <td className="py-2.5 text-gray-500">{part.part_sku || '—'}</td>
                        <td className="py-2.5 text-gray-700 text-right">{part.quantity}</td>
                        <td className="py-2.5 text-gray-700 text-right">{formatCurrency(part.unit_cost)}</td>
                        <td className="py-2.5 text-gray-700 text-right">{formatCurrency(part.unit_price)}</td>
                        <td className="py-2.5 font-semibold text-gray-900 text-right">{formatCurrency(part.total_price)}</td>
                        <td className="py-2.5 text-center">
                          {part.warranty_item ? (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">Warranty</span>
                          ) : (
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">Billable</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200">
                      <td colSpan={5} className="pt-3 text-sm font-semibold text-gray-700 text-right">Total:</td>
                      <td className="pt-3 text-sm font-bold text-gray-900 text-right">
                        {formatCurrency(partsUsed.reduce((sum, p) => sum + p.total_price, 0))}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {materials.length > 0 && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-3 text-sm text-gray-500">Legacy Materials</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="pb-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Material</th>
                        <th className="pb-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Quantity</th>
                        <th className="pb-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Unit Cost</th>
                        <th className="pb-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</th>
                        <th className="pb-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {materials.map(material => (
                        <tr key={material.id}>
                          <td className="py-2.5 text-gray-900">{material.material_name}</td>
                          <td className="py-2.5 text-gray-600">{material.quantity} {material.unit}</td>
                          <td className="py-2.5 text-gray-600 text-right">{formatCurrency(material.unit_cost)}</td>
                          <td className="py-2.5 font-semibold text-gray-900 text-right">{formatCurrency(material.total_cost)}</td>
                          <td className="py-2.5 text-gray-600">{new Date(material.used_date).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Time */}
        {activeTab === 'time' && (
          <div className="space-y-3">
            {timeEntries.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">No time entries yet</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                  <span className="text-sm font-semibold text-gray-700">All Entries</span>
                  <span className="text-sm font-bold text-gray-900">{totalTimeHours.toFixed(2)}h total</span>
                </div>
                {timeEntries.map(entry => (
                  <div key={entry.id} className="border border-gray-200 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-gray-900 text-sm">{entry.technician.full_name}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                            entry.status === 'approved' ? 'bg-green-100 text-green-700' :
                            entry.status === 'submitted' ? 'bg-amber-100 text-amber-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {entry.status}
                          </span>
                          <span className="text-sm font-bold text-gray-900 ml-auto">{entry.total_hours.toFixed(2)}h</span>
                        </div>
                        <div className="text-xs text-gray-500 flex items-center gap-2">
                          <span>{new Date(entry.entry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          <span>·</span>
                          <span>
                            {new Date(entry.clock_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} –{' '}
                            {entry.clock_out ? new Date(entry.clock_out).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : 'Active'}
                          </span>
                        </div>

                        {(entry.clock_in_latitude || entry.clock_out_latitude) && (
                          <div className="mt-2 flex items-center gap-4 flex-wrap">
                            {entry.clock_in_latitude && entry.clock_in_longitude && (
                              <a
                                href={`https://www.google.com/maps?q=${entry.clock_in_latitude},${entry.clock_in_longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                              >
                                <MapPin className="w-3 h-3 text-green-500" />
                                Clock in location
                                {entry.clock_in_gps_accuracy && <span className="text-gray-400">(±{Math.round(entry.clock_in_gps_accuracy)}m)</span>}
                              </a>
                            )}
                            {entry.clock_out_latitude && entry.clock_out_longitude && (
                              <a
                                href={`https://www.google.com/maps?q=${entry.clock_out_latitude},${entry.clock_out_longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                              >
                                <MapPin className="w-3 h-3 text-red-400" />
                                Clock out location
                                {entry.clock_out_gps_accuracy && <span className="text-gray-400">(±{Math.round(entry.clock_out_gps_accuracy)}m)</span>}
                              </a>
                            )}
                          </div>
                        )}

                        {entry.notes && <p className="mt-2 text-xs text-gray-500">{entry.notes}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* Completion */}
        {activeTab === 'completion' && (
          <div className="space-y-4">
            {jobCompletion ? (
              <div className="border border-green-200 bg-green-50 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-5">
                  <Award className="w-5 h-5 text-green-600" />
                  <h3 className="font-bold text-green-900">Job Completed</h3>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-xs font-semibold text-green-700 uppercase tracking-wide block mb-0.5">Completed By</span>
                    <span className="text-gray-900 font-medium">{jobCompletion.technician.full_name}</span>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-green-700 uppercase tracking-wide block mb-0.5">Date</span>
                    <span className="text-gray-900 font-medium">{new Date(jobCompletion.completed_at).toLocaleDateString()}</span>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-green-700 uppercase tracking-wide block mb-0.5">Quality Score</span>
                    <span className="text-gray-900 font-medium">{jobCompletion.quality_score}/5</span>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-green-700 uppercase tracking-wide block mb-0.5">Customer</span>
                    <span className="text-gray-900 font-medium">{jobCompletion.customer_name}</span>
                  </div>
                </div>
                {jobCompletion.customer_signature_url && (
                  <div className="mt-4">
                    <span className="text-xs font-semibold text-green-700 uppercase tracking-wide block mb-2">Signature</span>
                    <img
                      src={jobCompletion.customer_signature_url}
                      alt="Customer signature"
                      className="max-h-20 border border-green-200 rounded-lg"
                    />
                  </div>
                )}
              </div>
            ) : canComplete ? (
              <div className="text-center py-12">
                <Award className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                <p className="text-gray-600 mb-4">This job is ready to be completed</p>
                <button
                  onClick={() => setShowCompletionWizard(true)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium mx-auto"
                >
                  <Award className="w-4 h-4" />
                  Complete Job
                </button>
              </div>
            ) : (
              <div className="text-center py-12">
                <Award className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                <p className="text-gray-500 text-sm">Job not yet completed</p>
              </div>
            )}
          </div>
        )}

        {/* Customer History */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Previous Work Orders for This Customer</h3>
              <span className="text-sm text-gray-500">{customerHistory.length} found</span>
            </div>

            {customerHistory.length === 0 ? (
              <div className="text-center py-12">
                <History className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">No previous work orders for this customer</p>
              </div>
            ) : (
              <div className="space-y-3">
                {customerHistory.map((wo: any) => (
                  <div key={wo.id} className="border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-colors">
                    <div className="flex items-start gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-gray-900 text-sm">#{wo.work_order_number}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                            wo.status === 'completed' ? 'bg-green-100 text-green-700' :
                            wo.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                            wo.status === 'on_hold' ? 'bg-amber-100 text-amber-700' :
                            wo.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {wo.status.replace(/_/g, ' ')}
                          </span>
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs capitalize">
                            {(wo.type || '').replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-gray-800 mb-1">{wo.title}</p>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(wo.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                          {wo.technician?.full_name && (
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {wo.technician.full_name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {wo.description && (
                      <div className="mt-2 p-3 bg-gray-50 rounded-lg">
                        <p className="text-xs text-gray-700 whitespace-pre-wrap">{wo.description}</p>
                      </div>
                    )}

                    {wo.notes && (
                      <div className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
                        <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">Notes</div>
                        <p className="text-xs text-gray-700 whitespace-pre-wrap">{wo.notes}</p>
                      </div>
                    )}

                    {wo.completion && wo.completion.length > 0 && (
                      <div className="mt-2 p-3 bg-green-50 rounded-lg border border-green-200">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">Completion Notes</span>
                          {wo.completion[0].quality_score && (
                            <span className="text-xs font-medium text-green-700">★ {wo.completion[0].quality_score}/5</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-700 whitespace-pre-wrap">{wo.completion[0].completion_notes}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {showPartRequestForm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-lg">
            <PartRequestForm
              workOrderId={workOrderId}
              onSuccess={() => { setShowPartRequestForm(false); loadWorkOrderData(); }}
              onCancel={() => setShowPartRequestForm(false)}
            />
          </div>
        </div>
      )}

      {showPhotoCapture && (
        <JobPhotoCapture
          workOrderId={workOrderId}
          onComplete={() => { setShowPhotoCapture(false); loadWorkOrderData(); }}
          onCancel={() => setShowPhotoCapture(false)}
        />
      )}

      {showCompletionWizard && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 overflow-y-auto">
          <JobCompletionWizard
            workOrderId={workOrderId}
            onComplete={() => { setShowCompletionWizard(false); loadWorkOrderData(); }}
            onCancel={() => setShowCompletionWizard(false)}
          />
        </div>
      )}

      {showAddPartsModal && (
        <AddPartsModal
          workOrderId={workOrderId}
          onClose={() => setShowAddPartsModal(false)}
          onSuccess={() => { setShowAddPartsModal(false); loadWorkOrderData(); }}
        />
      )}

      {showCreateTaskModal && workOrder.contact && (
        <CreateTaskFromWorkOrderModal
          workOrderId={workOrderId}
          workOrderNumber={workOrder.work_order_number}
          workOrderTitle={workOrder.title}
          contactId={workOrder.contact_id}
          contactName={workOrder.contact.full_name || workOrder.contact.company_name}
          customerSalesRepId={workOrder.customer_sales_rep_id}
          onClose={() => setShowCreateTaskModal(false)}
          onSuccess={() => { setShowCreateTaskModal(false); }}
        />
      )}

      {showContactLogModal && (
        <ContactLogModal
          workOrderId={workOrderId}
          customerName={workOrder.contact?.full_name || workOrder.contact?.company_name || 'Customer'}
          onClose={() => setShowContactLogModal(false)}
          onSaved={() => { setContactLogRefreshKey(k => k + 1); loadWorkOrderData(); }}
        />
      )}

      {/* Link Work Orders Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Link Work Orders</h2>
                <p className="text-sm text-gray-500 mt-0.5">Select work orders to link with #{workOrder.work_order_number}</p>
              </div>
              <button onClick={() => { setShowLinkModal(false); setSelectedLinkIds([]); }} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {availableWorkOrders.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Link className="w-10 h-10 mx-auto mb-3 text-gray-200" />
                  <p className="text-sm">No unlinked work orders found for this customer</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {availableWorkOrders.map(wo => (
                    <label
                      key={wo.id}
                      className={`flex items-center gap-3 p-3 border-2 rounded-xl cursor-pointer transition-all ${
                        selectedLinkIds.includes(wo.id) ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedLinkIds.includes(wo.id)}
                        onChange={(e) => {
                          setSelectedLinkIds(prev =>
                            e.target.checked ? [...prev, wo.id] : prev.filter(id => id !== wo.id)
                          );
                        }}
                        className="w-4 h-4 text-blue-600 rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 text-sm">#{wo.work_order_number}</div>
                        <div className="text-xs text-gray-500 truncate">{wo.title}</div>
                        <div className="text-xs text-gray-400 capitalize mt-0.5">{(wo.status || '').replace(/_/g, ' ')}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => { setShowLinkModal(false); setSelectedLinkIds([]); }}
                className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleLinkWorkOrders}
                disabled={selectedLinkIds.length === 0}
                className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Link {selectedLinkIds.length > 0 ? `(${selectedLinkIds.length} selected)` : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Work Order Modal */}
      {showDuplicateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Duplicate Work Order</h2>
                <p className="text-sm text-gray-500 mt-0.5">Create a copy for another technician, linked together</p>
              </div>
              <button onClick={() => setShowDuplicateModal(false)} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-800">
                Creates a duplicate, assigns to the selected tech, and links both work orders for billing.
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Select Technician</label>
                <select
                  value={selectedTechId}
                  onChange={(e) => setSelectedTechId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Choose a technician...</option>
                  {technicians.filter(t => t.id !== workOrder.assigned_to).map(tech => (
                    <option key={tech.id} value={tech.id}>{tech.full_name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
              <button
                onClick={() => setShowDuplicateModal(false)}
                className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDuplicateToTech}
                disabled={!selectedTechId}
                className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Copy className="w-3.5 h-3.5" />
                Duplicate & Link
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmModal
        isOpen={!!confirmModal}
        title={confirmModal?.title || ''}
        message={confirmModal?.message || ''}
        variant="warning"
        onConfirm={() => {
          const fn = confirmModal?.onConfirm;
          setConfirmModal(null);
          if (fn) fn();
        }}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}
