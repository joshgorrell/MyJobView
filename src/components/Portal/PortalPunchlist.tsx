import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmModal from '../ui/ConfirmModal';
import {
  ClipboardList,
  Plus,
  Clock,
  AlertCircle,
  Star,
  Calendar,
  TrendingUp,
  CheckCircle2,
  MessageSquare,
  Eye,
  EyeOff,
  GripVertical,
  Save,
  Send,
  X,
  Image as ImageIcon,
  Trash2,
  Camera,
  Upload,
  ExternalLink,
  ArrowLeft,
  Phone,
  Mail,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Search,
  Filter,
  SlidersHorizontal,
  HelpCircle,
  RotateCcw
} from 'lucide-react';
import { FileUploadZone } from '../FileUpload/FileUploadZone';
import { CameraCapture } from '../Contacts/CameraCapture';
import { TrialStatusBanner } from './TrialStatusBanner';
import { PunchlistTaskDetailModal } from './PunchlistTaskDetailModal';

interface PunchlistTask {
  id: string;
  title: string;
  details: string | null;
  customer_notes: string | null;
  priority_order: number;
  status: string;
  created_at: string;
  updated_at: string;
  requested_at: string | null;
  completed_at: string | null;
  installer_notes: string | null;
  service_request_id: string | null;
  work_order_id: string | null;
  photos?: TaskPhoto[];
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

interface TaskPhoto {
  id: string;
  task_id: string;
  photo_url: string;
  caption: string | null;
  uploaded_at: string;
}

interface AccessInfo {
  has_access: boolean;
  access_type: string | null;
  days_remaining: number | null;
  expiration_date: string | null;
  subscription_plan_name: string | null;
}

interface PortalPunchlistProps {
  previewContactId?: string;
}

async function markTaskComplete(taskId: string) {
  const { error } = await supabase.rpc('mark_punchlist_task_completed', {
    p_task_id: taskId,
    p_completed_by_customer: true
  });
  if (error) throw error;
}

export function PortalPunchlist({ previewContactId }: PortalPunchlistProps = {}) {
  const { profile, user } = useAuth();
  const [accessInfo, setAccessInfo] = useState<AccessInfo | null>(null);
  const [tasks, setTasks] = useState<PunchlistTask[]>([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [customerFirstName, setCustomerFirstName] = useState<string | null>(null);
  const [contactOrgId, setContactOrgId] = useState<string | null>(null);
  const [autoSaveTimeout, setAutoSaveTimeout] = useState<NodeJS.Timeout | null>(null);
  const [showCamera, setShowCamera] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null);
  const [showNewTaskCamera, setShowNewTaskCamera] = useState(false);
  const [newTaskPhotos, setNewTaskPhotos] = useState<File[]>([]);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'draft' | 'requested' | 'scheduled' | 'completed'>('all');
  const [filterTimeframe, setFilterTimeframe] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [showHelp, setShowHelp] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [deleteConfirmTaskId, setDeleteConfirmTaskId] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [detailTask, setDetailTask] = useState<PunchlistTask | null>(null);
  const [appUrl, setAppUrl] = useState<string>('https://myjobview.com');

  const [newTask, setNewTask] = useState({
    title: '',
    details: '',
  });

  const getContactId = () => {
    if (previewContactId) return previewContactId;
    const urlParams = new URLSearchParams(window.location.search);
    const urlContact = urlParams.get('contact');
    if (urlContact) return urlContact;
    const impersonatingContactId = localStorage.getItem('admin_impersonating_contact');
    if (impersonatingContactId) return impersonatingContactId;
    if (profile?.contact_id) return profile.contact_id;
    return user?.user_metadata?.contact_id || null;
  };

  const getCustomerName = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlName = urlParams.get('name');
    if (urlName) return urlName;
    const impersonatingName = localStorage.getItem('admin_impersonating_name');
    return impersonatingName || null;
  };

  useEffect(() => {
    supabase
      .from('company_settings')
      .select('app_url')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.app_url) setAppUrl(data.app_url);
      });
  }, []);

  useEffect(() => {
    const contactId = getContactId();

    if (contactId) {
      setLoading(true);
      checkAccess(contactId);
      loadTasks(contactId);

      supabase
        .from('contacts')
        .select('first_name, organization_id')
        .eq('id', contactId)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.first_name) setCustomerFirstName(data.first_name);
          if (data?.organization_id) setContactOrgId(data.organization_id);
        });

      const subscription = supabase
        .channel(`portal_punchlist_tasks_${contactId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'punchlist_tasks',
            filter: `contact_id=eq.${contactId}`,
          },
          () => {
            loadTasks(contactId);
          }
        )
        .subscribe();

      return () => {
        subscription.unsubscribe();
      };
    } else {
      setLoading(false);
    }
  }, [previewContactId, profile?.contact_id, user?.user_metadata?.contact_id]);

  async function checkAccess(contactId: string) {
    if (!contactId) return;

    try {
      const { data: pendingGrants } = await supabase
        .from('punchlist_access_grants')
        .select('id, status')
        .eq('contact_id', contactId)
        .eq('status', 'pending');

      if (pendingGrants && pendingGrants.length > 0) {
        try {
          await supabase.rpc('accept_punchlist_invitation', {
            p_contact_id: contactId,
          });
        } catch (acceptError) {
          console.error('Error accepting invitation:', acceptError);
        }
      }

      const { data, error } = await supabase.rpc('get_punchlist_access_info', {
        p_contact_id: contactId,
      });

      if (error) throw error;

      if (data && data.length > 0) {
        setAccessInfo(data[0]);
      } else {
        setAccessInfo({
          has_access: false,
          access_type: null,
          days_remaining: null,
          expiration_date: null,
          subscription_plan_name: null,
        });
      }
    } catch (error) {
      console.error('Error checking access:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadTasks(contactId: string) {
    if (!contactId) return;

    try {
      const { data: tasksData, error } = await supabase
        .from('punchlist_tasks')
        .select(`
          *,
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
        .eq('contact_id', contactId)
        .order('priority_order', { ascending: true });

      if (error) throw error;
      setTasks(tasksData || []);
    } catch (error) {
      console.error('Error loading tasks:', error);
    }
  }

  async function handleCreateTask() {
    const contactId = getContactId();

    if (!contactId || !newTask.title.trim()) return;

    const orgId = contactOrgId || user?.user_metadata?.organization_id || null;
    if (!orgId) {
      alert('Unable to determine your organization. Please refresh and try again.');
      return;
    }

    try {
      const maxPriority = tasks.length > 0 ? Math.max(...tasks.map(t => t.priority_order)) : 0;

      const { data: createdTask, error } = await supabase.from('punchlist_tasks').insert({
        contact_id: contactId,
        organization_id: orgId,
        title: newTask.title,
        details: newTask.details,
        priority_order: maxPriority + 1,
        status: 'draft',
      }).select().maybeSingle();

      if (error) throw error;

      if (newTaskPhotos.length > 0 && createdTask) {
        for (const photo of newTaskPhotos) {
          await handlePhotoCapture(createdTask.id, photo);
        }
      }

      setNewTask({ title: '', details: '' });
      setNewTaskPhotos([]);
      setIsCreating(false);
      loadTasks(contactId);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : (typeof error === 'object' && error !== null && 'message' in error ? String((error as {message: unknown}).message) : String(error));
      console.error('Error creating task:', error);
      alert(`Failed to create task: ${msg}`);
    }
  }

  function handleNewTaskPhotoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    setNewTaskPhotos([...newTaskPhotos, file]);
    event.target.value = '';
  }

  function handleNewTaskPhotoCapture(file: File) {
    setNewTaskPhotos([...newTaskPhotos, file]);
    setShowNewTaskCamera(false);
  }

  function removeNewTaskPhoto(index: number) {
    setNewTaskPhotos(newTaskPhotos.filter((_, i) => i !== index));
  }

  async function handleUpdateTask(taskId: string, updates: Partial<PunchlistTask>) {
    try {
      const { error } = await supabase
        .from('punchlist_tasks')
        .update(updates)
        .eq('id', taskId);

      if (error) throw error;

      const contactId = getContactId();
      if (contactId) loadTasks(contactId);
    } catch (error) {
      console.error('Error updating task:', error);
    }
  }

  function handleTaskChange(taskId: string, field: string, value: any) {
    setTasks(prevTasks =>
      prevTasks.map(task => (task.id === taskId ? { ...task, [field]: value } : task))
    );

    if (autoSaveTimeout) {
      clearTimeout(autoSaveTimeout);
    }

    const timeout = setTimeout(() => {
      handleUpdateTask(taskId, { [field]: value });
    }, 1000);

    setAutoSaveTimeout(timeout);
  }

  async function handleDeleteTask(taskId: string) {
    setDeleteConfirmTaskId(taskId);
  }

  async function confirmDeleteTask() {
    if (!deleteConfirmTaskId) return;
    const taskId = deleteConfirmTaskId;
    setDeleteConfirmTaskId(null);

    try {
      const { error } = await supabase.from('punchlist_tasks').delete().eq('id', taskId);

      if (error) throw error;

      const contactId = getContactId();
      if (contactId) loadTasks(contactId);
    } catch (error) {
      console.error('Error deleting task:', error);
    }
  }

  async function handlePhotoCapture(taskId: string, file: File) {
    try {
      setUploadingPhoto(taskId);

      const fileExt = file.name.split('.').pop();
      const fileName = `${taskId}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('punchlist-photos')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('punchlist-photos')
        .getPublicUrl(fileName);

      const { error: dbError } = await supabase
        .from('punchlist_task_photos')
        .insert({
          task_id: taskId,
          photo_url: publicUrl,
          uploaded_by: profile?.id
        });

      if (dbError) throw dbError;

      const contactId = getContactId();
      if (contactId) loadTasks(contactId);
      setShowCamera(null);
    } catch (error: any) {
      console.error('Error uploading photo:', error);
      alert(`Failed to upload photo: ${error.message}`);
    } finally {
      setUploadingPhoto(null);
    }
  }

  async function handlePhotoUpload(taskId: string, event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    await handlePhotoCapture(taskId, file);
  }

  async function handleDeletePhoto(photoId: string, photoUrl: string) {
    setConfirmModal({
      title: 'Delete Photo',
      message: 'Delete this photo?',
      onConfirm: () => executeDeletePhoto(photoId, photoUrl)
    });
  }

  async function executeDeletePhoto(photoId: string, photoUrl: string) {
    try {
      const fileName = photoUrl.split('/punchlist-photos/')[1];

      await supabase.storage
        .from('punchlist-photos')
        .remove([fileName]);

      const { error } = await supabase
        .from('punchlist_task_photos')
        .delete()
        .eq('id', photoId);

      if (error) throw error;

      const contactId = getContactId();
      if (contactId) loadTasks(contactId);
    } catch (error) {
      console.error('Error deleting photo:', error);
      alert('Failed to delete photo');
    }
  }

  async function handleSubmitTasks(taskIds?: string[]) {
    const contactId = getContactId();

    const tasksToSubmit = taskIds
      ? tasks.filter(t => taskIds.includes(t.id) && t.status === 'draft')
      : tasks.filter(t => t.status === 'draft');

    if (tasksToSubmit.length === 0) {
      alert('No draft tasks available to submit.');
      return;
    }

    const message = taskIds
      ? `Request service for this task? This will notify our team and they will contact you to schedule.`
      : `Request service for ${tasksToSubmit.length} task(s)? This will create a service request and our team will contact you to schedule.`;

    setConfirmModal({
      title: 'Request Service',
      message,
      onConfirm: async () => {
        try {
          const { error } = await supabase.rpc('request_punchlist_service', {
            p_task_ids: tasksToSubmit.map(t => t.id),
            p_contact_id: contactId,
            p_notes: null
          });

          if (error) throw error;

          alert('Service requested successfully! Our team has been notified and will contact you soon.');
          setSelectedTaskIds(new Set());
          if (contactId) loadTasks(contactId);
        } catch (error: any) {
          console.error('Error requesting service:', error);
          alert(`Failed to request service: ${error.message || 'Unknown error'}`);
        }
      }
    });
  }

  async function handleMarkComplete(task: PunchlistTask) {
    const hasWorkOrder = task.service_request?.work_order_id;
    const message = hasWorkOrder
      ? 'Mark this task as complete? A work order has been scheduled — our team will be notified that you resolved this yourself.'
      : 'Mark this task as complete?';

    setConfirmModal({
      title: 'Mark Complete',
      message,
      onConfirm: async () => {
        try {
          await markTaskComplete(task.id);

          if (task.service_request_id && !hasWorkOrder) {
            await supabase
              .from('service_requests')
              .update({ status: 'cancelled' })
              .eq('id', task.service_request_id);
          }

          const contactId = getContactId();
          if (contactId) loadTasks(contactId);
        } catch (error) {
          console.error('Error marking complete:', error);
          alert('Failed to mark task as complete');
        }
      }
    });
  }

  async function handleCancelServiceRequest(serviceRequestId: string, task: PunchlistTask) {
    const hasWorkOrder = task.service_request?.work_order_id;

    if (hasWorkOrder) {
      alert('This task already has a work order assigned — it cannot be cancelled at this stage. Please contact us if you need to make changes.');
      return;
    }

    setConfirmModal({
      title: 'Cancel Service Request',
      message: 'Cancel this service request? The task will return to your draft tasks and you can resubmit it later if needed.',
      onConfirm: async () => {
        try {
          await supabase
            .from('service_requests')
            .update({ status: 'cancelled' })
            .eq('id', serviceRequestId);

          await supabase
            .from('punchlist_tasks')
            .update({ status: 'draft', service_request_id: null })
            .eq('id', task.id);

          const contactId = getContactId();
          if (contactId) loadTasks(contactId);
        } catch (error: any) {
          console.error('Error cancelling service request:', error);
          alert(`Failed to cancel service request: ${error.message || 'Unknown error'}`);
        }
      }
    });
  }

  async function handleDeleteRequestedTask(task: PunchlistTask) {
    const hasWorkOrder = task.service_request?.work_order_id || task.work_order_id;
    if (hasWorkOrder) return; // guarded in UI; belt-and-suspenders

    setConfirmModal({
      title: 'Delete Task',
      message: 'This will also cancel your open service request and permanently remove this task. This cannot be undone.',
      onConfirm: async () => {
        try {
          if (task.service_request_id) {
            await supabase
              .from('service_requests')
              .update({ status: 'cancelled' })
              .eq('id', task.service_request_id);
          }
          await supabase.from('punchlist_tasks').delete().eq('id', task.id);
          setDetailTask(null);
          const contactId = getContactId();
          if (contactId) loadTasks(contactId);
        } catch (error: any) {
          console.error('Error deleting task:', error);
          alert(`Failed to delete task: ${error.message || 'Unknown error'}`);
        }
      }
    });
  }

  async function handleReopenTask(taskId: string) {
    setConfirmModal({
      title: 'Reopen Task',
      message: 'Reopen this task? It will be moved back to your draft items.',
      onConfirm: async () => {
        try {
          await supabase
            .from('punchlist_tasks')
            .update({ status: 'draft', completed_at: null })
            .eq('id', taskId);

          const contactId = getContactId();
          if (contactId) loadTasks(contactId);
        } catch (error) {
          console.error('Error reopening task:', error);
          alert('Failed to reopen task');
        }
      }
    });
  }

  const toggleTaskExpansion = (taskId: string) => {
    setExpandedTasks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

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

  const toggleSelectAll = () => {
    if (selectedTaskIds.size === draftTasks.length && draftTasks.length > 0) {
      setSelectedTaskIds(new Set());
    } else {
      setSelectedTaskIds(new Set(draftTasks.map(t => t.id)));
    }
  };

  const isToday = (date: string) => {
    const today = new Date();
    const taskDate = new Date(date);
    return taskDate.toDateString() === today.toDateString();
  };

  const isThisWeek = (date: string) => {
    const today = new Date();
    const taskDate = new Date(date);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    return taskDate >= weekAgo && taskDate <= today;
  };

  const isThisMonth = (date: string) => {
    const today = new Date();
    const taskDate = new Date(date);
    return taskDate.getMonth() === today.getMonth() && taskDate.getFullYear() === today.getFullYear();
  };

  const filteredTasks = tasks.filter(task => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesTitle = task.title.toLowerCase().includes(query);
      const matchesDetails = task.details?.toLowerCase().includes(query);
      if (!matchesTitle && !matchesDetails) return false;
    }

    if (filterStatus !== 'all' && task.status !== filterStatus) return false;

    if (filterTimeframe === 'today' && !isToday(task.created_at)) return false;
    if (filterTimeframe === 'week' && !isThisWeek(task.created_at)) return false;
    if (filterTimeframe === 'month' && !isThisMonth(task.created_at)) return false;

    return true;
  });

  const draftTasks = filteredTasks.filter(t => t.status === 'draft');
  const requestedTasks = filteredTasks.filter(t => t.status === 'requested');
  const scheduledTasks = filteredTasks.filter(t => t.status === 'scheduled');
  const completedTasks = filteredTasks.filter(t => t.status === 'completed');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!loading && accessInfo !== null && !accessInfo.has_access) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-gradient-to-br from-blue-50 to-slate-50 border-2 border-blue-300 rounded-lg p-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <ClipboardList className="w-8 h-8 text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Punchlist Portal</h2>
            <p className="text-gray-600 text-lg">VIP Members Get Priority Service &amp; Support</p>
          </div>

          <div className="bg-white rounded-lg p-6 mb-6">
            <h3 className="text-lg font-bold text-gray-900 mb-3">What is the Punchlist?</h3>
            <p className="text-gray-700 mb-4">
              The Punchlist is your direct line to our service team. Create service items, add photos,
              track progress, and communicate with our team—all in one place.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-semibold text-gray-900">Document Issues</div>
                  <div className="text-sm text-gray-600">Add photos and detailed descriptions</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-semibold text-gray-900">Track Progress</div>
                  <div className="text-sm text-gray-600">See real-time status updates</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-semibold text-gray-900">Priority Service</div>
                  <div className="text-sm text-gray-600">Get scheduled faster than standard calls</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="font-semibold text-gray-900">Service History</div>
                  <div className="text-sm text-gray-600">Complete record of all service items</div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <a
              href="/portal/vip-benefits"
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 bg-[#0f2347] hover:bg-[#1a3a6e] text-white rounded-xl font-semibold text-sm transition-colors shadow-md"
            >
              <Star className="w-5 h-5 text-yellow-400" />
              Explore VIP Benefits
            </a>
            <a
              href="/portal/vip-membership"
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 bg-yellow-500 hover:bg-yellow-600 text-white rounded-xl font-semibold text-sm transition-colors shadow-md"
            >
              <Sparkles className="w-4 h-4" />
              View Plans & Pricing
            </a>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between gap-4">
            <p className="text-gray-600 text-sm">
              Just finished a project? Ask us about our free <strong>90-Day Test &amp; Tune</strong> trial.
            </p>
            <a
              href="/portal/contact"
              className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-blue-300 text-blue-700 hover:bg-blue-50 rounded-lg font-medium text-sm transition-colors"
            >
              <Mail className="w-4 h-4" />
              Contact Us
            </a>
          </div>
        </div>
      </div>
    );
  }

  const urlParams = new URLSearchParams(window.location.search);
  const isImpersonating = urlParams.get('contact') || previewContactId;
  const impersonatingName = urlParams.get('name');

  const content = (
    <div className="space-y-3">
      {isImpersonating && previewContactId && (
        <div className="bg-orange-900/30 border border-orange-700 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-orange-400" />
              <div>
                <div className="text-sm font-medium text-white">Portal Preview Mode</div>
                <div className="text-xs text-gray-400">Viewing customer's punchlist portal</div>
              </div>
            </div>
          </div>
        </div>
      )}
      {isImpersonating && !previewContactId && (
        <div className="bg-orange-900/30 border border-orange-700 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Eye className="w-5 h-5 text-orange-400" />
              <div>
                <div className="text-sm font-medium text-white">Viewing as Customer</div>
                <div className="text-xs text-gray-400">{impersonatingName}</div>
              </div>
            </div>
            <button
              onClick={() => {
                localStorage.removeItem('admin_impersonating_contact');
                localStorage.removeItem('admin_impersonating_name');
                window.close();
              }}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
            >
              Exit Preview
            </button>
          </div>
        </div>
      )}

      {accessInfo.access_type === 'test_and_tune' && accessInfo.days_remaining !== null && accessInfo.expiration_date && (
        <TrialStatusBanner
          daysRemaining={accessInfo.days_remaining}
          expirationDate={accessInfo.expiration_date}
          subscriptionPlanName={accessInfo.subscription_plan_name}
          showDetails={false}
          compact={true}
        />
      )}

      {accessInfo.access_type === 'vip_membership' && (
        <div className="bg-gradient-to-r from-yellow-50 to-yellow-100 border border-yellow-300 rounded-lg p-2.5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-yellow-200 rounded-full flex items-center justify-center">
              <Star className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <div className="text-sm font-bold text-yellow-900">VIP Member</div>
              <div className="text-xs text-yellow-700">{accessInfo.subscription_plan_name || 'Active VIP Membership'}</div>
            </div>
          </div>
        </div>
      )}

      {/* Compact Header Bar with Stats, Search, and Actions */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-3">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
          {/* Stats */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setFilterStatus('draft')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors text-sm font-medium ${
                filterStatus === 'draft' ? 'bg-orange-100 text-orange-700' : 'hover:bg-gray-100 text-gray-700'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              {draftTasks.length} Draft
            </button>
            <button
              onClick={() => setFilterStatus('requested')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors text-sm font-medium ${
                filterStatus === 'requested' ? 'bg-amber-100 text-amber-700' : 'hover:bg-gray-100 text-gray-700'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              {requestedTasks.length} Requested
            </button>
            <button
              onClick={() => setFilterStatus('scheduled')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors text-sm font-medium ${
                filterStatus === 'scheduled' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-700'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              {scheduledTasks.length} Scheduled
            </button>
            <button
              onClick={() => setFilterStatus('completed')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors text-sm font-medium ${
                filterStatus === 'completed' ? 'bg-green-100 text-green-700' : 'hover:bg-gray-100 text-gray-700'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {completedTasks.length} Done
            </button>
            <button
              onClick={() => setShowHelp(true)}
              className="p-1.5 hover:bg-blue-100 rounded-lg transition-colors"
              title="How it works"
            >
              <HelpCircle className="w-4 h-4 text-blue-600" />
            </button>
          </div>

          {/* Search Bar */}
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tasks..."
                className="w-full pl-9 pr-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            {selectedTaskIds.size > 0 && (
              <button
                onClick={() => handleSubmitTasks(Array.from(selectedTaskIds))}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-1.5 text-sm font-medium shadow-sm hover:shadow transition-all whitespace-nowrap"
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Create service request</span>
                <span className="sm:hidden">Request</span>
                ({selectedTaskIds.size})
              </button>
            )}
            <button
              onClick={() => setIsCreating(true)}
              className="px-4 py-1.5 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white rounded-lg flex items-center gap-1.5 font-semibold shadow-sm hover:shadow-md transition-all text-sm whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Add Task
            </button>
          </div>
        </div>
      </div>

      {isCreating && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-gray-900 text-sm">New Task</h4>
            <button
              onClick={() => {
                setIsCreating(false);
                setNewTask({ title: '', details: '' });
                setNewTaskPhotos([]);
              }}
              className="p-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-3">
            <input
              type="text"
              value={newTask.title}
              onChange={e => setNewTask({ ...newTask, title: e.target.value })}
              placeholder="Task title *"
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <textarea
              value={newTask.details}
              onChange={e => setNewTask({ ...newTask, details: e.target.value })}
              placeholder="Task details (optional)"
              rows={2}
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />

            {newTaskPhotos.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {newTaskPhotos.map((photo, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={URL.createObjectURL(photo)}
                      alt={`Preview ${index + 1}`}
                      className="w-full h-24 object-cover rounded border border-gray-300"
                    />
                    <button
                      onClick={() => removeNewTaskPhoto(index)}
                      className="absolute top-1 right-1 p-1 bg-red-600 hover:bg-red-700 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setShowNewTaskCamera(true)}
                className="flex items-center gap-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm"
              >
                <Camera className="w-4 h-4" />
                Take Photo
              </button>
              <label className="flex items-center gap-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm cursor-pointer">
                <Upload className="w-4 h-4" />
                Upload Photo
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleNewTaskPhotoUpload}
                  className="hidden"
                />
              </label>
            </div>

            <button
              onClick={handleCreateTask}
              disabled={!newTask.title.trim()}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg"
            >
              Create Task
            </button>
          </div>
        </div>
      )}

      {/* Scheduled Tasks */}
      {scheduledTasks.length > 0 && (
        <>
          <div className="bg-blue-50 border-2 border-blue-400 rounded-lg p-2 mb-2">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              <div className="text-sm font-bold text-blue-900">Scheduled — Our team will be in touch with your appointment details</div>
            </div>
          </div>
          <h3 className="text-base font-semibold text-gray-900 px-2">Scheduled ({scheduledTasks.length})</h3>
          <div className="space-y-2">
            {scheduledTasks.map(task => {
              const isExpanded = expandedTasks.has(task.id);
              const truncatedTitle = task.title.length > 60 ? task.title.substring(0, 60) + '...' : task.title;

              return (
                <div
                  key={task.id}
                  className={`bg-white border-l-4 rounded-lg transition-all ${
                    isExpanded
                      ? 'border-blue-500 shadow-md p-4'
                      : 'border-blue-400 shadow-sm p-3 hover:shadow cursor-pointer'
                  }`}
                  onClick={() => !isExpanded && toggleTaskExpansion(task.id)}
                >
                  {!isExpanded && (
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-900 truncate text-sm">{truncatedTitle}</div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-gray-500">{new Date(task.created_at).toLocaleDateString()}</span>
                          {task.photos && task.photos.length > 0 && (
                            <span className="flex items-center gap-1 text-xs text-gray-600">
                              <Camera className="w-3 h-3" />
                              {task.photos.length}
                            </span>
                          )}
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Scheduled
                          </span>
                          {task.service_request?.work_order && (
                            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                              WO #{task.service_request.work_order.work_order_number}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    </div>
                  )}

                  {isExpanded && (
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-base font-semibold text-gray-900">{task.title}</h4>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleTaskExpansion(task.id); }}
                          className="p-1 hover:bg-gray-100 rounded"
                        >
                          <ChevronUp className="w-5 h-5 text-gray-400" />
                        </button>
                      </div>

                      {task.details && <p className="text-sm text-gray-600">{task.details}</p>}

                      {task.photos && task.photos.length > 0 && (
                        <div className="grid grid-cols-4 gap-2">
                          {task.photos.map((photo) => (
                            <img key={photo.id} src={photo.photo_url} alt="Task photo" className="w-full h-20 object-cover rounded border border-gray-300" />
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-2 text-xs flex-wrap">
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Scheduled
                        </span>
                        {task.service_request?.work_order && (
                          <a
                            href={`/work-order/${task.service_request.work_order.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-1 bg-green-100 text-green-700 rounded flex items-center gap-1 hover:bg-green-200 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="w-3 h-3" />
                            Work Order {task.service_request.work_order.work_order_number}
                          </a>
                        )}
                        <span className="text-gray-400 ml-auto">Added {new Date(task.created_at).toLocaleDateString()}</span>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMarkComplete(task); }}
                          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          Mark Complete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Requested Tasks */}
      {requestedTasks.length > 0 && (
        <>
          <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-2 mb-2">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              <div className="text-sm font-bold text-amber-900">Requested — Our team has been notified and will contact you to schedule</div>
            </div>
          </div>
          <h3 className="text-base font-semibold text-gray-900 px-2">Requested ({requestedTasks.length})</h3>
          <div className="space-y-2">
            {requestedTasks.map(task => {
              const hasWorkOrder = !!(task.service_request?.work_order_id || task.work_order_id);
              const canAct = !hasWorkOrder;

              return (
                <div
                  key={task.id}
                  className="bg-white border-l-4 border-amber-300 rounded-lg shadow-sm p-3 hover:shadow transition-shadow"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Clickable title opens detail modal */}
                      <button
                        onClick={() => setDetailTask(task)}
                        className="text-left font-semibold text-gray-900 text-sm hover:text-amber-700 hover:underline transition-colors leading-snug"
                      >
                        {task.title}
                      </button>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <span className="text-xs text-amber-600">
                          {task.requested_at
                            ? new Date(task.requested_at).toLocaleDateString()
                            : new Date(task.created_at).toLocaleDateString()}
                        </span>
                        {task.photos && task.photos.length > 0 && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <Camera className="w-3 h-3" />
                            {task.photos.length}
                          </span>
                        )}
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs flex items-center gap-1">
                          <Send className="w-3 h-3" />
                          Requested
                        </span>
                        {task.service_request?.work_order && (
                          <a
                            href={`/work-order/${task.service_request.work_order.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs flex items-center gap-1 hover:bg-blue-200 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="w-3 h-3" />
                            WO #{task.service_request.work_order.work_order_number}
                          </a>
                        )}
                        {task.customer_notes && (
                          <span className="flex items-center gap-1 text-xs text-blue-600">
                            <MessageSquare className="w-3 h-3" />
                            Notes added
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Quick action buttons */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {canAct && (
                        <>
                          <button
                            onClick={() => handleCancelServiceRequest(task.service_request_id!, task)}
                            title="Recall request — return to drafts"
                            className="p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteRequestedTask(task)}
                            title="Delete task"
                            className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleMarkComplete(task)}
                        title="Mark complete"
                        className="p-1.5 rounded-lg bg-green-50 hover:bg-green-100 text-green-600 transition-colors"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDetailTask(task)}
                        title="View details & add notes"
                        className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-600 transition-colors"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Draft Tasks */}
      {draftTasks.length > 0 && (
        <>
          <div className="flex items-center justify-between mt-4 px-2">
            <div>
              <h3 className="text-base font-semibold text-gray-900">Draft ({draftTasks.length})</h3>
              <p className="text-xs text-gray-500 mt-0.5">Not yet submitted — only you can see these</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); toggleSelectAll(); }}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm font-medium"
            >
              <input
                type="checkbox"
                checked={selectedTaskIds.size === draftTasks.length && draftTasks.length > 0}
                onChange={() => {}}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              {selectedTaskIds.size === draftTasks.length && draftTasks.length > 0 ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          <div className="space-y-2">
            {draftTasks.map((task) => {
              const isExpanded = expandedTasks.has(task.id);
              const truncatedTitle = task.title.length > 60 ? task.title.substring(0, 60) + '...' : task.title;

              return (
                <div
                  key={task.id}
                  className={`bg-white border-l-4 rounded-lg transition-all ${
                    isExpanded
                      ? 'border-orange-400 shadow-md p-4'
                      : 'border-gray-200 hover:border-gray-300 shadow-sm p-3 hover:shadow cursor-pointer'
                  }`}
                  onClick={() => !isExpanded && toggleTaskExpansion(task.id)}
                >
                  {!isExpanded && (
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedTaskIds.has(task.id)}
                        onChange={(e) => { e.stopPropagation(); toggleTaskSelection(task.id); }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-900 truncate text-sm">{truncatedTitle}</div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-gray-500">{new Date(task.created_at).toLocaleDateString()}</span>
                          {task.photos && task.photos.length > 0 && (
                            <span className="flex items-center gap-1 text-xs text-gray-600">
                              <Camera className="w-3 h-3" />
                              {task.photos.length}
                            </span>
                          )}
                          <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs">Draft</span>
                        </div>
                      </div>
                      <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    </div>
                  )}

                  {isExpanded && (
                    <div className="space-y-3">
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={selectedTaskIds.has(task.id)}
                          onChange={(e) => { e.stopPropagation(); toggleTaskSelection(task.id); }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0 mt-1"
                        />
                        <input
                          type="text"
                          value={task.title}
                          onChange={e => handleTaskChange(task.id, 'title', e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          className="flex-1 text-base font-semibold text-gray-900 bg-transparent border border-gray-200 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleTaskExpansion(task.id); }}
                          className="p-1 hover:bg-gray-100 rounded"
                        >
                          <ChevronUp className="w-5 h-5 text-gray-400" />
                        </button>
                      </div>

                      <textarea
                        value={task.details || ''}
                        onChange={e => handleTaskChange(task.id, 'details', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Add details..."
                        rows={2}
                        className="w-full text-sm text-gray-600 bg-transparent border border-gray-200 rounded px-2 py-1 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />

                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>{new Date(task.created_at).toLocaleDateString()}</span>
                        <span className="flex items-center gap-1 text-orange-600">
                          <Clock className="w-3 h-3" />
                          Auto-saving
                        </span>
                      </div>

                      {task.photos && task.photos.length > 0 && (
                        <div className="grid grid-cols-3 gap-2">
                          {task.photos.map((photo) => (
                            <div key={photo.id} className="relative group">
                              <img src={photo.photo_url} alt="Task photo" className="w-full h-20 object-cover rounded border border-gray-300" />
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeletePhoto(photo.id, photo.photo_url); }}
                                className="absolute top-1 right-1 p-1 bg-red-600 hover:bg-red-700 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="w-3 h-3 text-white" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); setShowCamera(task.id); }}
                          disabled={uploadingPhoto === task.id}
                          className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm disabled:opacity-50"
                        >
                          <Camera className="w-3 h-3" />
                          Take Photo
                        </button>
                        <label className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm cursor-pointer">
                          <Upload className="w-3 h-3" />
                          Upload
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handlePhotoUpload(task.id, e)}
                            className="hidden"
                            disabled={uploadingPhoto === task.id}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </label>
                        {uploadingPhoto === task.id && (
                          <span className="text-sm text-gray-600">Uploading...</span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleSubmitTasks([task.id]); }}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm flex items-center gap-1"
                        >
                          <Send className="w-3 h-3" />
                          Create service request
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMarkComplete(task); }}
                          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          Mark Complete
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }}
                          className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 rounded text-sm flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Completed Tasks */}
      {completedTasks.length > 0 && (
        <>
          <div className="flex items-center justify-between mt-4 px-2">
            <h3 className="text-base font-semibold text-gray-900">Completed ({completedTasks.length})</h3>
            <button
              onClick={() => setShowCompleted(!showCompleted)}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 text-sm font-medium"
            >
              {showCompleted ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showCompleted ? 'Hide' : 'Show'}
            </button>
          </div>

          {showCompleted && (
            <div className="space-y-2">
              {completedTasks.map(task => {
                const isExpanded = expandedTasks.has(task.id);
                const truncatedTitle = task.title.length > 60 ? task.title.substring(0, 60) + '...' : task.title;

                return (
                  <div
                    key={task.id}
                    className={`bg-white border-l-4 rounded-lg transition-all ${
                      isExpanded
                        ? 'border-green-400 shadow-md p-4'
                        : 'border-green-300 shadow-sm p-3 hover:shadow cursor-pointer'
                    }`}
                    onClick={() => !isExpanded && toggleTaskExpansion(task.id)}
                  >
                    {!isExpanded && (
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-gray-500 truncate text-sm line-through">{truncatedTitle}</div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="flex items-center gap-1 text-xs text-gray-500">
                              <CheckCircle2 className="w-3 h-3 text-green-600" />
                              {task.completed_at ? new Date(task.completed_at).toLocaleDateString() : ''}
                            </span>
                          </div>
                        </div>
                        <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      </div>
                    )}

                    {isExpanded && (
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-base font-semibold text-gray-700 line-through">{task.title}</h4>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleTaskExpansion(task.id); }}
                            className="p-1 hover:bg-gray-100 rounded"
                          >
                            <ChevronUp className="w-5 h-5 text-gray-400" />
                          </button>
                        </div>

                        {task.details && <p className="text-sm text-gray-500">{task.details}</p>}

                        {task.installer_notes && (
                          <div className="p-3 bg-gray-50 rounded border border-gray-200">
                            <div className="text-xs text-gray-600 mb-1 font-medium">Installer Notes:</div>
                            <div className="text-sm text-gray-700">{task.installer_notes}</div>
                          </div>
                        )}

                        <div className="flex items-center gap-2 text-xs flex-wrap">
                          <span className="flex items-center gap-1 text-gray-600">
                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                            Completed {task.completed_at ? new Date(task.completed_at).toLocaleDateString() : ''}
                          </span>
                          {task.service_request?.work_order && (
                            <a
                              href={`/work-order/${task.service_request.work_order.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-1 bg-green-100 text-green-700 rounded flex items-center gap-1 hover:bg-green-200 transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="w-3 h-3" />
                              Work Order {task.service_request.work_order.work_order_number}
                            </a>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleReopenTask(task.id); }}
                            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-sm flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Reopen
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {tasks.length === 0 && !isCreating && (
        <div className="text-center py-12 bg-white border border-gray-200 rounded-lg shadow-sm">
          <ClipboardList className="w-16 h-16 mx-auto mb-4 text-gray-400" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Tasks Yet</h3>
          <p className="text-gray-600 mb-4">
            Create your first punchlist task to get started
          </p>
          <button
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Your First Task
          </button>
        </div>
      )}

      {showCamera && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full">
            <CameraCapture
              onCapture={(file) => handlePhotoCapture(showCamera, file)}
              onClose={() => setShowCamera(null)}
            />
          </div>
        </div>
      )}

      {showNewTaskCamera && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full">
            <CameraCapture
              onCapture={handleNewTaskPhotoCapture}
              onClose={() => setShowNewTaskCamera(false)}
            />
          </div>
        </div>
      )}

      {showHelp && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <HelpCircle className="w-6 h-6 text-blue-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">How the Punchlist Works</h2>
              </div>
              <button onClick={() => setShowHelp(false)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">What is the Punchlist?</h3>
                <p className="text-gray-700 leading-relaxed">
                  The Punchlist is your personal service tracking tool. Document service needs, communicate with our team,
                  and track progress—all in one organized place.
                </p>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-bold text-gray-900">Step-by-Step Guide</h3>

                <div className="bg-orange-50 border-l-4 border-orange-400 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold">1</div>
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-1">Draft — Create a Task</h4>
                      <p className="text-sm text-gray-700">
                        Click "Add Task" to document an issue. Add a title, details, and photos.
                        Tasks are saved automatically and only visible to you until you request service.
                        You can also mark a draft complete yourself if you resolved it.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-amber-50 border-l-4 border-amber-400 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-amber-500 text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold">2</div>
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-1">Requested — Submit for Service</h4>
                      <p className="text-sm text-gray-700">
                        Click "Request Service" to notify our team. We'll review your request and contact you to schedule.
                        You can cancel a request before we've assigned a work order, or mark it complete if you resolved it yourself.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 border-l-4 border-blue-500 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold">3</div>
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-1">Scheduled — Work Order Created</h4>
                      <p className="text-sm text-gray-700">
                        Our team has created a work order. We'll be in touch with appointment details.
                        You can still mark it complete if you resolved it yourself before we arrive.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-green-50 border-l-4 border-green-500 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold">4</div>
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-1">Completed — Done!</h4>
                      <p className="text-sm text-gray-700">
                        The task is finished. You'll see installer notes if our team completed it.
                        You can reopen a completed task if the issue returns.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {accessInfo && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-gray-700 mb-1">Your Current Access:</p>
                  <p className="text-base font-bold text-gray-900 capitalize">
                    {accessInfo.access_type === 'vip_membership' && 'VIP Membership'}
                    {accessInfo.access_type === 'test_and_tune' && 'Test & Tune Program'}
                    {accessInfo.access_type === 'promotional' && 'Promotional Access'}
                  </p>
                  {accessInfo.days_remaining !== null && (
                    <p className="text-sm text-gray-600 mt-1">{accessInfo.days_remaining} days remaining</p>
                  )}
                </div>
              )}

              <div className="border-t border-gray-200 pt-4">
                <p className="text-sm text-gray-600 text-center">
                  Questions about using the punchlist?{' '}
                  <a href="/portal/contact" className="text-blue-600 hover:text-blue-700 font-medium">
                    Contact our support team
                  </a>
                </p>
              </div>
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

      {deleteConfirmTaskId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">Delete Task?</h3>
                <p className="text-sm text-gray-500">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to delete this draft task? Any photos attached will also be removed.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmTaskId(null)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteTask}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium"
              >
                Delete Task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task Detail Modal */}
      {detailTask && (
        <PunchlistTaskDetailModal
          task={detailTask}
          isAdmin={false}
          onClose={() => setDetailTask(null)}
          onTaskUpdated={() => {
            const contactId = getContactId();
            if (contactId) loadTasks(contactId);
          }}
          onRecall={(t) => {
            setDetailTask(null);
            if (t.service_request_id) handleCancelServiceRequest(t.service_request_id, t);
          }}
          onDelete={(t) => {
            setDetailTask(null);
            handleDeleteRequestedTask(t);
          }}
          onMarkComplete={(t) => {
            setDetailTask(null);
            handleMarkComplete(t);
          }}
        />
      )}

    </div>
  );

  if (previewContactId) {
    return content;
  }

  const isAdminImpersonating = urlParams.get('contact') || localStorage.getItem('admin_impersonating_contact');
  const adminImpersonatingName = impersonatingName || localStorage.getItem('admin_impersonating_name');

  const displayName = customerFirstName || getCustomerName();
  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="min-h-screen bg-gray-50">
      {isAdminImpersonating && (
        <div className="bg-orange-600 text-white px-4 py-2 text-center text-sm font-medium">
          Admin View: Viewing portal as {adminImpersonatingName || 'customer'}
        </div>
      )}
      <header className="bg-[#0f2347] shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (isAdminImpersonating) {
                  window.close();
                } else {
                  window.location.href = appUrl;
                }
              }}
              className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
              title={isAdminImpersonating ? 'Close preview tab' : 'Back to main site'}
            >
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <img
              src="/el_logo_color_(2).png"
              alt="Electronic Life"
              className="h-10 object-contain"
            />
            <div className="flex-1">
              <h1 className="text-xl font-bold text-white leading-tight">My Punchlist</h1>
              {displayName && !isAdminImpersonating ? (
                <p className="text-xs text-blue-200">{timeGreeting}, {displayName}</p>
              ) : (
                <p className="text-xs text-blue-200">Track service items and communicate with our team</p>
              )}
            </div>
            {accessInfo?.access_type === 'vip_membership' && (
              <div className="hidden sm:flex items-center gap-1.5 bg-yellow-500/20 border border-yellow-500/40 rounded-full px-3 py-1">
                <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
                <span className="text-xs font-semibold text-yellow-300">VIP Member</span>
              </div>
            )}
            {accessInfo?.access_type === 'test_and_tune' && (
              <div className="hidden sm:flex items-center gap-1.5 bg-blue-500/20 border border-blue-500/40 rounded-full px-3 py-1">
                <Sparkles className="w-3.5 h-3.5 text-blue-300" />
                <span className="text-xs font-semibold text-blue-300">Test & Tune</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {displayName && accessInfo?.has_access && !isAdminImpersonating && (
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{timeGreeting}, {displayName}!</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {accessInfo.access_type === 'vip_membership'
                    ? `Welcome back, VIP Member${accessInfo.subscription_plan_name ? ` — ${accessInfo.subscription_plan_name}` : ''}`
                    : accessInfo.access_type === 'test_and_tune' && accessInfo.days_remaining !== null
                    ? `You have ${accessInfo.days_remaining} day${accessInfo.days_remaining !== 1 ? 's' : ''} remaining in your Test & Tune trial`
                    : 'Here are your service items'}
                </p>
              </div>
              {accessInfo.access_type === 'vip_membership' && (
                <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Star className="w-5 h-5 text-yellow-600 fill-yellow-500" />
                </div>
              )}
              {accessInfo.access_type === 'test_and_tune' && (
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-5 h-5 text-blue-600" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        {content}
      </main>

      <footer className="border-t border-gray-200 mt-8 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-center gap-4 text-xs text-gray-400">
          <a
            href="/privacy-policy"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-600 underline underline-offset-2 transition-colors"
          >
            Privacy Policy
          </a>
          <span>·</span>
          <a
            href="/eula"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-600 underline underline-offset-2 transition-colors"
          >
            Terms of Service
          </a>
        </div>
      </footer>
    </div>
  );
}
