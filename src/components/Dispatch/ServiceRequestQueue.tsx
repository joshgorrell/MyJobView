import { notifyTechJobAssigned } from '../../lib/dispatchNotifications';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { CreateWorkOrderModal } from '../Production/CreateWorkOrderModal';
import type { ServiceRequestContext } from '../Production/CreateWorkOrderModal';
import { WorkOrderSchedulePicker } from '../Production/WorkOrderSchedulePicker';
import { QuickActionModal } from '../Shared/QuickActionModal';
import ConfirmModal from '../ui/ConfirmModal';
import {
  AlertCircle,
  Calendar,
  Clock,
  MapPin,
  User,
  Phone,
  Mail,
  FileText,
  CheckCircle,
  XCircle,
  ArrowRight,
  Briefcase,
  Filter,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Paperclip,
  UserPlus,
  ListTodo,
  ClipboardList,
  MessageSquareWarning,
  RotateCcw,
  AlertTriangle,
  PhoneCall,
  Layers,
  CheckSquare
} from 'lucide-react';
import { ServiceRequestForm } from '../Service/ServiceRequestForm';
import { ContactQuickViewModal } from '../Shared/ContactQuickViewModal';

interface ServiceRequest {
  id: string;
  created_at: string;
  request_type: 'service' | 'project' | null;
  project_id: string | null;
  projects?: { id: string; name: string; project_number: string } | null;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  job_location_address: string;
  job_location_city: string | null;
  job_location_state: string | null;
  job_location_zip: string | null;
  job_description: string;
  billable_type: string;
  billable_by: string;
  priority: string;
  earliest_date?: string | null;
  customer_contact_instruction?: string;
  warranty_type?: string | null;
  warranty_reference?: string | null;
  warranty_notes?: string | null;
  requested_tech_ids: string[] | null;
  estimated_duration: string | null;
  requested_date: string | null;
  requested_time: string | null;
  status: string;
  notes: string | null;
  attachments: any;
  created_by: string;
  contact_id: string | null;
  customer_location_id?: string | null;
  source_type: 'punchlist' | 'staff_form' | 'customer_portal' | 'other';
  kickback_reason: string | null;
  kicked_back_by: string | null;
  kicked_back_at: string | null;
  customer_contact_confirmed_at: string | null;
  customer_contact_confirmed_by: string | null;
  contacts: {
    id: string;
    company_name: string | null;
    full_name: string;
  } | null;
  profiles: {
    id: string;
    full_name: string;
  };
  kicked_back_by_profile?: {
    id: string;
    full_name: string;
  } | null;
  contact_confirmed_by_profile?: {
    id: string;
    full_name: string;
  } | null;
}

interface Technician {
  id: string;
  full_name: string;
  role: string;
}

export function ServiceRequestQueue() {
  const { profile, loading: authLoading } = useAuth();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [techs, setTechs] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRequest, setExpandedRequest] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'queue' | 'needs_info'>('queue');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterSourceType, setFilterSourceType] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [convertingTo, setConvertingTo] = useState<string | null>(null);
  const [kickbackTarget, setKickbackTarget] = useState<ServiceRequest | null>(null);
  const [resubmitTarget, setResubmitTarget] = useState<ServiceRequest | null>(null);
  const [confirmingContact, setConfirmingContact] = useState<string | null>(null);
  const [selectedRequestIds, setSelectedRequestIds] = useState<Set<string>>(new Set());
  const [showCombineModal, setShowCombineModal] = useState(false);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [quickViewContactId, setQuickViewContactId] = useState<string | null>(null);

  const isManager = profile?.role === 'admin' ||
    String(profile?.role) === 'service_manager' ||
    profile?.role === 'manager';

  useEffect(() => {
    if (authLoading) return;
    if (!profile) {
      setLoading(false);
      return;
    }
    loadData();
    loadTechs();

    const channel = supabase
      .channel('service-requests-queue')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'service_requests'
      }, loadData)
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [profile, authLoading, filterPriority, filterSourceType]);

  async function loadData() {
    try {
      let query = supabase
        .from('service_requests')
        .select(`
          *,
          contacts (
            id,
            company_name,
            full_name
          ),
          profiles!service_requests_created_by_fkey (
            id,
            full_name
          ),
          kicked_back_by_profile:profiles!service_requests_kicked_back_by_fkey (
            id,
            full_name
          ),
          contact_confirmed_by_profile:profiles!service_requests_customer_contact_confirmed_by_fkey (
            id,
            full_name
          ),
          projects (
            id,
            name,
            project_number
          )
        `)
        .order('created_at', { ascending: false });

      if (filterPriority !== 'all') {
        query = query.eq('priority', filterPriority);
      }

      if (filterSourceType !== 'all') {
        query = query.eq('source_type', filterSourceType);
      }

      query = query.not('status', 'in', '("cancelled","closed")');

      const { data, error } = await query;

      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error('Error loading service requests:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadTechs() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('is_technician', true).eq('is_active', true)
        .order('full_name');

      if (error) throw error;
      setTechs(data || []);
    } catch (error) {
      console.error('Error loading techs:', error);
    }
  }

  async function updateRequestStatus(requestId: string, status: string) {
    try {
      const { error } = await supabase
        .from('service_requests')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', requestId);

      if (error) throw error;
      await loadData();
    } catch (error) {
      console.error('Error updating request status:', error);
      alert('Failed to update request status');
    }
  }

  async function cancelRequest(requestId: string) {
    await updateRequestStatus(requestId, 'cancelled');
  }

  async function handleToggleCustomerContact(request: ServiceRequest) {
    if (!profile) return;
    setConfirmingContact(request.id);
    try {
      const alreadyConfirmed = !!request.customer_contact_confirmed_at;
      const { error } = await supabase
        .from('service_requests')
        .update({
          customer_contact_confirmed_at: alreadyConfirmed ? null : new Date().toISOString(),
          customer_contact_confirmed_by: alreadyConfirmed ? null : profile.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', request.id);
      if (error) throw error;
      await loadData();
    } catch (error) {
      console.error('Error toggling customer contact:', error);
    } finally {
      setConfirmingContact(null);
    }
  }

  function getPriorityColor(priority: string) {
    switch (priority) {
      case 'emergency':
        return 'text-red-400 bg-red-500/10 border-red-500/20';
      case 'urgent':
        return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
      default:
        return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
    }
  }

  function getPriorityIcon(priority: string) {
    if (priority === 'emergency' || priority === 'urgent') {
      return <AlertCircle className="w-4 h-4" />;
    }
    return <Clock className="w-4 h-4" />;
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'open':
        return 'text-yellow-400 bg-yellow-500/10';
      case 'scheduled':
        return 'text-blue-400 bg-blue-500/10';
      case 'in_progress':
        return 'text-orange-400 bg-orange-500/10';
      case 'closed':
        return 'text-green-400 bg-green-500/10';
      case 'cancelled':
        return 'text-red-400 bg-red-500/10';
      case 'needs_more_info':
        return 'text-amber-400 bg-amber-500/10';
      default:
        return 'text-muted bg-elevated';
    }
  }

  function getStatusLabel(status: string) {
    switch (status) {
      case 'open':
        return 'Open';
      case 'scheduled':
        return 'Scheduled';
      case 'in_progress':
        return 'In Progress';
      case 'closed':
        return 'Closed';
      case 'cancelled':
        return 'Cancelled';
      case 'needs_more_info':
        return 'Needs More Info';
      default:
        return status;
    }
  }

  function getSourceTypeIcon(sourceType: string) {
    switch (sourceType) {
      case 'punchlist':
        return <ListTodo className="w-4 h-4" />;
      case 'staff_form':
        return <ClipboardList className="w-4 h-4" />;
      case 'customer_portal':
        return <User className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  }

  function getSourceTypeLabel(sourceType: string) {
    switch (sourceType) {
      case 'punchlist':
        return 'Punchlist';
      case 'staff_form':
        return 'Staff Form';
      case 'customer_portal':
        return 'Customer Portal';
      default:
        return 'Other';
    }
  }

  function getSourceTypeColor(sourceType: string) {
    switch (sourceType) {
      case 'punchlist':
        return 'text-teal-400 bg-teal-500/10 border-teal-500/20';
      case 'staff_form':
        return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
      case 'customer_portal':
        return 'text-green-400 bg-green-500/10 border-green-500/20';
      default:
        return 'text-muted bg-elevated border-strong';
    }
  }

  const isMyRequest = (request: ServiceRequest) => request.created_by === profile?.id;

  const constraintContactId = selectedRequestIds.size > 0
    ? requests.find(r => selectedRequestIds.has(r.id))?.contact_id ?? null
    : null;

  function canSelectRequest(request: ServiceRequest): boolean {
    if (request.status !== 'open' || !request.contact_id) return false;
    if (constraintContactId && request.contact_id !== constraintContactId) return false;
    const first = requests.find(item => selectedRequestIds.has(item.id));
    if (first && (request.project_id !== first.project_id || request.billable_type !== first.billable_type || [request.job_location_address,request.job_location_city,request.job_location_state,request.job_location_zip].map(value => (value || '').trim().toLowerCase()).join('|') !== [first.job_location_address,first.job_location_city,first.job_location_state,first.job_location_zip].map(value => (value || '').trim().toLowerCase()).join('|'))) return false;
    return true;
  }

  function toggleRequestSelection(requestId: string) {
    setSelectedRequestIds(prev => {
      const next = new Set(prev);
      if (next.has(requestId)) {
        next.delete(requestId);
      } else {
        next.add(requestId);
      }
      return next;
    });
  }

  const selectedRequests = requests.filter(r => selectedRequestIds.has(r.id));

  const queueRequests = requests.filter(r => r.status !== 'needs_more_info');
  const needsInfoRequests = requests.filter(r => r.status === 'needs_more_info');
  const filteredRequests = activeTab === 'needs_info' ? needsInfoRequests : queueRequests;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted">Loading service requests...</div>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4 w-full max-w-full min-w-0">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-base sm:text-2xl font-bold text-primary">Work Order Request Queue</h2>
          <p className="text-muted text-sm mt-1">
            {queueRequests.length} active {queueRequests.length === 1 ? 'request' : 'requests'}
            {needsInfoRequests.length > 0 && (
              <span className="text-amber-400 ml-2">· {needsInfoRequests.length} awaiting more info</span>
            )}
          </p>
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className="shrink-0 min-h-11 flex items-center gap-1.5 px-2 sm:px-4 py-2 text-xs sm:text-sm bg-canvas text-primary rounded-lg hover:bg-elevated transition-colors"
        >
          <Filter className="w-4 h-4" />
          Filters
          {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-canvas rounded-lg w-full max-w-full min-w-0 sm:w-fit">
        <button
          onClick={() => setActiveTab('queue')}
          className={`flex-1 min-w-0 sm:flex-none flex items-center justify-center gap-1.5 px-2 sm:px-4 min-h-11 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'queue'
              ? 'bg-orange-600 text-primary'
              : 'text-muted hover:text-primary hover:bg-elevated'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          <span className="sm:hidden">Active</span><span className="hidden sm:inline">Active Queue</span>
          {queueRequests.length > 0 && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
              activeTab === 'queue' ? 'bg-orange-500/40 text-orange-100' : 'bg-elevated text-muted'
            }`}>
              {queueRequests.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('needs_info')}
          className={`flex-1 min-w-0 sm:flex-none flex items-center justify-center gap-1.5 px-2 sm:px-4 min-h-11 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'needs_info'
              ? 'bg-amber-600 text-primary'
              : 'text-muted hover:text-primary hover:bg-elevated'
          }`}
        >
          <MessageSquareWarning className="w-4 h-4" />
          <span className="sm:hidden">Needs Info</span><span className="hidden sm:inline">Needs More Info</span>
          {needsInfoRequests.length > 0 && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
              activeTab === 'needs_info' ? 'bg-amber-500/40 text-amber-100' : 'bg-amber-500/20 text-amber-400'
            }`}>
              {needsInfoRequests.length}
            </span>
          )}
        </button>
      </div>

      {showFilters && (
        <div className="bg-canvas rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            <div>
              <label className="block text-sm font-medium text-muted mb-2">Priority</label>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="w-full min-w-0 min-h-11 px-2 sm:px-3 py-2 text-base bg-canvas border border-strong rounded-lg text-primary focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              >
                <option value="all">All Priorities</option>
                <option value="emergency">Emergency</option>
                <option value="urgent">Urgent</option>
                <option value="normal">Normal</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-muted mb-2">Source</label>
              <select
                value={filterSourceType}
                onChange={(e) => setFilterSourceType(e.target.value)}
                className="w-full min-w-0 min-h-11 px-2 sm:px-3 py-2 text-base bg-canvas border border-strong rounded-lg text-primary focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              >
                <option value="all">All Sources</option>
                <option value="punchlist">Customer Punchlist</option>
                <option value="staff_form">Staff Form</option>
                <option value="customer_portal">Customer Portal</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Combine Action Toolbar */}
      {selectedRequestIds.size >= 2 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 bg-orange-900/40 border-2 border-orange-500 rounded-lg">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center text-primary text-sm font-bold shrink-0">
              {selectedRequestIds.size}
            </div>
            <div>
              <div className="text-sm font-semibold text-orange-200">
                {selectedRequestIds.size} requests selected
              </div>
              <div className="text-xs text-orange-400 truncate max-w-[220px] sm:max-w-none">
                {selectedRequests[0]?.customer_name || 'Same customer'} — combine into scheduled visits
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedRequestIds(new Set())}
              className="px-3 py-2 text-xs bg-elevated hover:bg-elevated text-muted rounded-lg transition-colors"
            >
              Clear
            </button>
            <button
              onClick={() => setShowCombineModal(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 text-xs bg-orange-600 hover:bg-orange-500 text-primary rounded-lg font-semibold transition-colors"
            >
              <Layers className="w-3.5 h-3.5" />
              Combine into Work Order
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {filteredRequests.length === 0 ? (
        <div className="bg-canvas rounded-lg p-12 text-center">
          {activeTab === 'needs_info' ? (
            <>
              <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-primary mb-2">All Clear</h3>
              <p className="text-muted">No requests are waiting on more information.</p>
            </>
          ) : (
            <>
              <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-primary mb-2">Queue Empty</h3>
              <p className="text-muted">All service requests have been scheduled!</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredRequests.map((request) => (
            <div
              key={request.id}
              data-testid={`service-request-${request.id}`}
              className={`w-full max-w-full min-w-0 [overflow-wrap:anywhere] bg-canvas rounded-lg border transition-colors ${
                selectedRequestIds.has(request.id)
                  ? 'border-orange-500 ring-2 ring-orange-500/40'
                  : request.status === 'needs_more_info'
                  ? 'border-amber-500/40 hover:border-amber-500/60'
                  : 'border-strong hover:border-strong'
              }`}
            >
              {/* Kickback warning banner */}
              {request.status === 'needs_more_info' && request.kickback_reason && (
                <div className="flex flex-wrap items-start gap-2 px-3 py-3 bg-amber-500/10 border-b border-amber-500/30 rounded-t-lg">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-amber-400 mb-0.5">
                      More Information Required
                      {request.kicked_back_by_profile && (
                        <span className="font-normal text-amber-300/80 ml-1">
                          — flagged by {request.kicked_back_by_profile.full_name}
                          {request.kicked_back_at && (
                            <span className="ml-1">
                              on {new Date(request.kicked_back_at).toLocaleDateString()}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-amber-200/90 leading-snug">{request.kickback_reason}</p>
                  </div>
                  {isMyRequest(request) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setResubmitTarget(request);
                      }}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-primary rounded-lg text-xs font-semibold transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Update & Resubmit
                    </button>
                  )}
                </div>
              )}

              <div className="p-3">
                <div className="flex items-start gap-3">
                  {/* Multi-select checkbox — only shown on open status queue tab */}
                  {activeTab === 'queue' && (
                    <div className="flex-shrink-0 pt-1 w-5">
                      {canSelectRequest(request) ? (
                        <input
                          type="checkbox"
                          checked={selectedRequestIds.has(request.id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleRequestSelection(request.id);
                          }}
                          title="Select to combine with other requests from this customer"
                          className="w-4 h-4 rounded border-strong text-orange-600 focus:ring-orange-500 focus:ring-offset-0 cursor-pointer"
                        />
                      ) : constraintContactId ? (
                        <span
                          title={`Combine requests for the same customer, project, billing type and location. Currently selecting requests from ${selectedRequests[0]?.customer_name}`}
                          className="flex items-center justify-center w-4 h-4 text-secondary cursor-not-allowed"
                        >
                          <CheckSquare className="w-4 h-4 opacity-30" />
                        </span>
                      ) : (
                        <div className="w-4" />
                      )}
                    </div>
                  )}
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => setExpandedRequest(expandedRequest === request.id ? null : request.id)}
                  >
                    {/* Top row: customer name + timestamp + desktop Convert button */}
                    <div className="flex flex-col sm:flex-row items-start sm:justify-between gap-1 sm:gap-2 mb-1.5">
                      {request.contact_id ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); setQuickViewContactId(request.contact_id!); }}
                          className="customer-link min-w-0 max-w-full break-words font-semibold text-sm sm:text-base leading-tight transition-colors text-left"
                        >
                          {request.customer_name}
                        </button>
                      ) : (
                        <div className="min-w-0 max-w-full break-words font-semibold text-primary text-sm sm:text-base leading-tight">{request.customer_name}</div>
                      )}
                      <div className="flex min-w-0 max-w-full items-center gap-2 sm:shrink-0">
                        <div className="flex flex-wrap sm:flex-col sm:items-end gap-x-2 gap-y-0.5 min-w-0">
                          <span className="text-[11px] sm:text-xs text-muted break-words">
                            {new Date(request.created_at).toLocaleDateString()} {new Date(request.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="text-[11px] sm:text-xs text-muted break-words">
                            {request.profiles?.full_name || 'Unknown'}
                          </span>
                        </div>
                        {/* Convert button — only on desktop (sm+), only when collapsed */}
                        {expandedRequest !== request.id && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setConvertingTo(request.id); }}
                            className="hidden sm:flex items-center gap-1 px-2.5 py-1 bg-orange-600 text-primary rounded-lg hover:bg-orange-700 transition-colors text-xs font-semibold whitespace-nowrap"
                          >
                            <ArrowRight className="w-3 h-3" />
                            Schedule
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Badge row: priority + status + source — compact, limited to 3 */}
                    <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${getPriorityColor(request.priority)}`}>
                        {getPriorityIcon(request.priority)}
                        {request.priority.charAt(0).toUpperCase() + request.priority.slice(1)}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(request.status)}`}>
                        {request.status === 'needs_more_info' && <AlertTriangle className="w-3 h-3" />}
                        {getStatusLabel(request.status)}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                        request.request_type === 'project'
                          ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                          : 'text-blue-400 bg-blue-500/10 border-blue-500/20'
                      }`}>
                        {request.request_type === 'project' ? <Briefcase className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                        {request.request_type === 'project' ? 'Project' : 'Service'}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${getSourceTypeColor(request.source_type)}`}>
                        {getSourceTypeIcon(request.source_type)}
                        {getSourceTypeLabel(request.source_type)}
                      </span>
                      {request.customer_contact_confirmed_at && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                          <PhoneCall className="w-3 h-3" />
                          Contacted
                        </span>
                      )}
                    </div>

                    {/* Description preview */}
                    <div className="text-sm text-muted break-words line-clamp-2 mb-1.5">{request.job_description}</div>

                    {/* Meta row + mobile Convert button */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0 flex flex-wrap items-center gap-2 text-xs text-muted">
                        {request.estimated_duration && (
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {request.estimated_duration}
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <DollarSign className="w-3 h-3" />
                          {request.billable_type === 'billable' ? 'Billable' : 'Warranty'}
                        </div>
                        {request.requested_tech_ids && request.requested_tech_ids.length > 0 && (
                          <div className="flex items-center gap-1">
                            <UserPlus className="w-3 h-3" />
                            {request.requested_tech_ids.length} tech{request.requested_tech_ids.length !== 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                      {/* Convert button — only on mobile (hidden sm+), only when collapsed */}
                      {expandedRequest !== request.id && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setConvertingTo(request.id); }}
                          className="sm:hidden flex items-center gap-1 min-h-11 px-3 py-2 bg-orange-600 text-primary rounded-lg hover:bg-orange-700 transition-colors text-xs font-semibold whitespace-nowrap shrink-0"
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                          Schedule
                        </button>
                      )}
                      <button aria-label={expandedRequest === request.id ? 'Collapse request' : 'Expand request'}
                        onClick={e => {e.stopPropagation();setExpandedRequest(expandedRequest === request.id ? null : request.id);}}
                        className="shrink-0 min-h-11 px-2 text-muted hover:text-primary">
                        {expandedRequest === request.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* Expanded Details */}
                    {expandedRequest === request.id && (
                      <div className="mt-3 space-y-3 pt-3 border-t border-strong">
                        {/* Address */}
                        <div className="flex items-start gap-2.5">
                          <MapPin className="w-4 h-4 text-muted mt-0.5 shrink-0" />
                          <div>
                            <div className="text-xs font-medium text-muted mb-0.5">Address</div>
                            <div className="text-sm text-primary leading-snug">
                              {request.job_location_address}
                              {(request.job_location_city || request.job_location_state || request.job_location_zip) && (
                                <span className="text-muted">
                                  {request.job_location_city && `, ${request.job_location_city}`}
                                  {request.job_location_state && `, ${request.job_location_state}`}
                                  {request.job_location_zip && ` ${request.job_location_zip}`}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Full description */}
                        <div className="flex items-start gap-2.5">
                          <FileText className="w-4 h-4 text-muted mt-0.5 shrink-0" />
                          <div>
                            <div className="text-xs font-medium text-muted mb-0.5">Full Description</div>
                            <div className="text-sm text-primary whitespace-pre-wrap">{request.job_description}</div>
                          </div>
                        </div>

                        <div className="text-sm text-secondary space-y-1">
                          <p>{request.customer_contact_instruction === 'requester' ? 'Requester will coordinate with customer' : request.customer_contact_instruction === 'already_contacted' ? 'Customer already contacted / schedule as requested' : 'Dispatch should contact customer'}</p>
                          {request.earliest_date && <p>Do not schedule before: {request.earliest_date}</p>}
                          {request.warranty_type && <p>Warranty: {request.warranty_type} · {request.warranty_reference} · {request.warranty_notes}</p>}
                          {request.estimated_duration && <p>Estimated duration: {request.estimated_duration}</p>}
                        </div>
                        {/* Contact details grid */}
                        {(request.customer_phone || request.customer_email || request.requested_date || request.attachments?.length > 0) && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {request.customer_phone && (
                              <a href={`tel:${request.customer_phone}`} className="flex items-center gap-2 px-3 py-2 bg-canvas rounded-lg text-xs text-muted hover:text-primary hover:bg-elevated transition-colors">
                                <Phone className="w-3.5 h-3.5 text-muted shrink-0" />
                                {request.customer_phone}
                              </a>
                            )}
                            {request.customer_email && (
                              <a href={`mailto:${request.customer_email}`} className="flex min-w-0 items-center gap-2 px-3 py-2 bg-canvas rounded-lg text-xs text-muted hover:text-primary hover:bg-elevated transition-colors break-all">
                                <Mail className="w-3.5 h-3.5 text-muted shrink-0" />
                                <span className="truncate">{request.customer_email}</span>
                              </a>
                            )}
                            {request.requested_date && (
                              <div className="flex items-center gap-2 px-3 py-2 bg-canvas rounded-lg text-xs text-muted">
                                <Calendar className="w-3.5 h-3.5 text-muted shrink-0" />
                                Need by: {request.requested_date.split('T')[0]}
                                {request.requested_time && ` · ${request.requested_time}`}
                              </div>
                            )}
                            {request.attachments && request.attachments.length > 0 && (
                              <div className="flex items-center gap-2 px-3 py-2 bg-canvas rounded-lg text-xs text-muted">
                                <Paperclip className="w-3.5 h-3.5 text-muted shrink-0" />
                                {request.attachments.length} attachment{request.attachments.length !== 1 ? 's' : ''}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Linked project */}
                        {request.request_type === 'project' && request.projects && (
                          <div className="flex items-center gap-2 px-3 py-2 bg-emerald-900/30 rounded-lg border border-emerald-700/40">
                            <Briefcase className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <div className="text-xs text-emerald-300">
                              <span className="text-primary font-medium">{request.projects.name}</span>
                              <span className="text-emerald-400/70"> ({request.projects.project_number})</span>
                            </div>
                          </div>
                        )}

                        {/* Contact record */}
                        {request.contacts && (
                          <div className="flex items-center gap-2 px-3 py-2 bg-canvas rounded-lg">
                            <User className="w-3.5 h-3.5 text-muted shrink-0" />
                            <div className="text-xs text-muted">
                              <span className="text-primary">{request.contacts.full_name}</span>
                              {request.contacts.company_name && <span className="text-muted"> · {request.contacts.company_name}</span>}
                            </div>
                          </div>
                        )}

                        {request.notes && (
                          <div className="p-3 bg-canvas rounded-lg border border-strong">
                            <div className="text-xs font-medium text-muted mb-1">Notes</div>
                            <div className="text-sm text-muted whitespace-pre-wrap">{request.notes}</div>
                          </div>
                        )}

                        {/* Customer contact status */}
                        <div className={`flex items-start gap-2.5 p-3 rounded-lg border ${
                          request.customer_contact_confirmed_at
                            ? 'bg-emerald-500/10 border-emerald-500/20'
                            : 'bg-canvas border-strong'
                        }`}>
                          <PhoneCall className={`w-4 h-4 mt-0.5 shrink-0 ${request.customer_contact_confirmed_at ? 'text-emerald-400' : 'text-muted'}`} />
                          <div>
                            <div className={`text-xs font-medium mb-0.5 ${request.customer_contact_confirmed_at ? 'text-emerald-400' : 'text-muted'}`}>
                              Customer Contact
                            </div>
                            {request.customer_contact_confirmed_at ? (
                              <div className="text-xs text-emerald-300">
                                Confirmed {new Date(request.customer_contact_confirmed_at).toLocaleString()}
                                {request.contact_confirmed_by_profile && (
                                  <span className="text-emerald-400/70"> by {request.contact_confirmed_by_profile.full_name}</span>
                                )}
                              </div>
                            ) : (
                              <div className="text-xs text-muted">Not yet confirmed</div>
                            )}
                          </div>
                        </div>

                        {/* Action buttons — full-width row at bottom of expanded section */}
                        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 pt-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); setConvertingTo(request.id); }}
                            className="col-span-2 sm:col-span-1 sm:flex-1 min-w-0 px-3 py-2.5 sm:py-2 bg-orange-600 text-primary rounded-lg hover:bg-orange-700 transition-colors text-xs font-semibold flex items-center justify-center gap-1.5"
                          >
                            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                            Schedule Work Order
                          </button>

                          <button
                            onClick={(e) => { e.stopPropagation(); handleToggleCustomerContact(request); }}
                            disabled={confirmingContact === request.id}
                            title={request.customer_contact_confirmed_at ? 'Click to undo' : 'Mark customer contacted'}
                            className={`sm:flex-1 min-w-0 px-3 py-2.5 sm:py-2 rounded-lg transition-colors text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-50 ${
                              request.customer_contact_confirmed_at
                                ? 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30'
                                : 'bg-elevated text-muted hover:bg-elevated'
                            }`}
                          >
                            <PhoneCall className="w-3.5 h-3.5 shrink-0" />
                            {request.customer_contact_confirmed_at ? 'Contacted' : 'Mark Contacted'}
                          </button>

                          {isManager && request.status === 'open' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setKickbackTarget(request); }}
                              className="sm:flex-1 min-w-0 px-3 py-2.5 sm:py-2 bg-amber-600/20 text-amber-400 rounded-lg hover:bg-amber-600/30 transition-colors text-xs font-medium flex items-center justify-center gap-1.5"
                            >
                              <MessageSquareWarning className="w-3.5 h-3.5 shrink-0" />
                              Need Info
                            </button>
                          )}

                          {(request.status === 'open' || request.status === 'scheduled' || request.status === 'needs_more_info') && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setConfirmCancelId(request.id); }}
                              className="px-3 py-2.5 sm:py-2 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition-colors text-xs font-medium flex items-center justify-center gap-1.5"
                            >
                              <XCircle className="w-3.5 h-3.5 shrink-0" />
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCombineModal && selectedRequests.length >= 2 && (
        <CombineWorkOrderModal
          serviceRequests={selectedRequests}
          techs={techs}
          onClose={() => setShowCombineModal(false)}
          onSuccess={() => {
            setShowCombineModal(false);
            setSelectedRequestIds(new Set());
            loadData();
          }}
        />
      )}

      {convertingTo && (() => {
        const req = requests.find(r => r.id === convertingTo);
        if (!req) return null;
        const srContext: ServiceRequestContext = {
          id: req.id,
          customer_name: req.customer_name,
          customer_phone: req.customer_phone,
          customer_email: req.customer_email,
          job_location_address: req.job_location_address,
          job_location_city: req.job_location_city,
          job_location_state: req.job_location_state,
          job_location_zip: req.job_location_zip,
          job_description: req.job_description,
          billable_type: req.billable_type,
          priority: req.priority,
          notes: req.notes,
          earliest_date: req.earliest_date,
          customer_contact_instruction: req.customer_contact_instruction,
          warranty_type: req.warranty_type,
          warranty_reference: req.warranty_reference,
          warranty_notes: req.warranty_notes,
          estimated_duration: req.estimated_duration,

          contact_id: req.contact_id,
          customer_location_id: req.customer_location_id,
          requested_tech_ids: req.requested_tech_ids,
          requested_date: req.requested_date,
          requested_time: req.requested_time,
          source_type: req.source_type,
          request_type: req.request_type,
          project_id: req.project_id
        };
        return (
          <CreateWorkOrderModal
            serviceRequest={srContext}
            onClose={() => setConvertingTo(null)}
            onSuccess={() => {
              setConvertingTo(null);
              loadData();
            }}
          />
        );
      })()}

      {kickbackTarget && (
        <KickbackModal
          serviceRequest={kickbackTarget}
          onClose={() => setKickbackTarget(null)}
          onSuccess={() => {
            setKickbackTarget(null);
            loadData();
          }}
        />
      )}

      {resubmitTarget && (
        <ServiceRequestForm
          onClose={() => setResubmitTarget(null)}
          onSuccess={() => {
            setResubmitTarget(null);
            loadData();
          }}
          editingRequest={resubmitTarget}
        />
      )}

      <ConfirmModal
        isOpen={confirmCancelId !== null}
        title="Cancel Work Order Request"
        message="Are you sure you want to cancel this work order request?"
        variant="danger"
        confirmLabel="Cancel Request"
        onConfirm={() => {
          if (confirmCancelId) {
            cancelRequest(confirmCancelId);
          }
          setConfirmCancelId(null);
        }}
        onCancel={() => setConfirmCancelId(null)}
      />
      {quickViewContactId && (
        <ContactQuickViewModal
          contactId={quickViewContactId}
          onClose={() => setQuickViewContactId(null)}
        />
      )}
    </div>
  );
}

interface KickbackModalProps {
  serviceRequest: ServiceRequest;
  onClose: () => void;
  onSuccess: () => void;
}

function KickbackModal({ serviceRequest, onClose, onSuccess }: KickbackModalProps) {
  const { profile } = useAuth();
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!reason.trim()) {
      alert('Please describe what information is missing.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('service_requests')
        .update({
          status: 'needs_more_info',
          kickback_reason: reason.trim(),
          kicked_back_by: profile?.id,
          kicked_back_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', serviceRequest.id);

      if (error) throw error;
      onSuccess();
    } catch (error) {
      console.error('Error kicking back request:', error);
      alert('Failed to send request back. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-canvas w-full max-w-lg rounded-2xl border border-strong shadow-2xl">
        <div className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-strong bg-canvas rounded-t-2xl">
          <div className="w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <MessageSquareWarning className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-primary">Request More Information</h3>
            <p className="text-xs text-muted mt-0.5">
              This will notify <span className="text-primary">{serviceRequest.profiles?.full_name || 'the submitter'}</span> to update their request
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto p-1.5 hover:bg-elevated rounded-lg transition-colors text-muted hover:text-primary"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-canvas rounded-xl p-3 border border-strong">
            <div className="text-xs text-muted mb-0.5">Service Request</div>
            <div className="font-medium text-primary text-sm">{serviceRequest.customer_name}</div>
            <div className="text-xs text-muted mt-0.5 line-clamp-2">{serviceRequest.job_description}</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-primary mb-2">
              What information is missing or unclear? <span className="text-red-400">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="e.g., Need the exact system model number, customer hasn't confirmed if they have an existing service contract, unclear if this is a new install or a repair..."
              className="w-full px-4 py-3 bg-canvas border border-strong rounded-xl text-primary text-sm placeholder-gray-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
              autoFocus
            />
            <p className="text-xs text-muted mt-1.5">
              Be specific — this message will be sent directly to {serviceRequest.profiles?.full_name || 'the submitter'} so they know exactly what to update.
            </p>
          </div>

          <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-xs text-amber-300">
              The request will be marked <strong>Needs More Info</strong> and removed from the scheduling queue until it is updated and resubmitted.
            </p>
          </div>
        </div>

        <div className="flex gap-3 px-4 sm:px-6 pb-4 sm:pb-6">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2.5 bg-elevated text-primary rounded-xl hover:bg-elevated transition-colors text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !reason.trim()}
            className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-primary rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold flex items-center justify-center gap-2"
          >
            <MessageSquareWarning className="w-4 h-4" />
            {loading ? 'Sending...' : 'Send Back for More Info'}
          </button>
        </div>
      </div>
    </div>
  );
}


interface CombineWorkOrderModalProps {
  serviceRequests: ServiceRequest[];
  techs: Technician[];
  onClose: () => void;
  onSuccess: () => void;
}

function CombineWorkOrderModal({ serviceRequests, techs, onClose, onSuccess }: CombineWorkOrderModalProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [selectedTechs, setSelectedTechs] = useState<string[]>([]);
  const [schedule, setSchedule] = useState({ date: '', start: '', end: '' });
  const [hours, setHours] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [description, setDescription] = useState(serviceRequests.map((sr, i) => `${i + 1}. ${sr.job_description}`).join('\n\n'));
  const key = useRef(crypto.randomUUID());
  const submitting = useRef(false);
  const earliest = serviceRequests.map(sr => sr.earliest_date || '').sort().slice(-1)[0];
  const valid = selectedTechs.length > 0 && !!schedule.date && !!schedule.start && !!schedule.end && !scheduleError && Number(hours) > 0 && Number.isFinite(Number(hours)) && !!description.trim() && confirmed;
  async function save() {
    if (!valid || submitting.current) return;
    submitting.current = true; setLoading(true); setError('');
    try {
      const { data, error } = await supabase.rpc('create_combined_work_orders', { p_request_id: key.current, p_service_request_ids: serviceRequests.map(sr => sr.id), p_tech_ids: selectedTechs,
        p_date: schedule.date, p_start: schedule.start, p_end: schedule.end, p_estimated_hours: Number(hours), p_description: description.trim(),
        p_internal_notes: serviceRequests.map(sr => [sr.notes, sr.earliest_date && `Do not schedule before: ${sr.earliest_date}`, sr.warranty_type && `Warranty: ${sr.warranty_type}; ${sr.warranty_reference || ''}; ${sr.warranty_notes || ''}`].filter(Boolean).join('\n')).join('\n\n') });
      if (error) throw error;
      for (const [index, technicianId] of [...selectedTechs].sort().entries()) {
        await notifyTechJobAssigned(technicianId, { work_order_number: data?.[index]?.work_order_number || '', title: description.trim(), customer_name: serviceRequests[0].customer_name, scheduled_date: schedule.date, address: serviceRequests[0].job_location_address });
      }
      onSuccess();
    } catch (e) { setError((e as { message?: string }).message || 'Unable to combine requests. Try again.'); }
    finally { submitting.current = false; setLoading(false); }
  }
  return <QuickActionModal title="Combine service requests" subtitle={serviceRequests[0]?.customer_name} icon={<Layers />} scrollBody={false} onClose={() => { if (!loading) onClose(); }}>
    <div className="flex flex-col min-h-0">
      <div className="overflow-y-auto min-h-0 p-4 space-y-4">
        <p className="text-sm text-secondary">Combine {serviceRequests.length} requests into one scheduled visit per technician. All work orders stay linked.</p>
        <label className="block text-sm">Visit description<textarea aria-label="Combined visit description" value={description} onChange={e => setDescription(e.target.value)} rows={4} className="block w-full rounded-lg border border-subtle bg-canvas p-2" /></label>
        <label className="block text-sm">Estimated hours per technician<input aria-label="Combined estimated hours" type="number" min="0.1" step="0.1" value={hours} onChange={e => setHours(e.target.value)} className="block w-full rounded-lg border border-subtle bg-canvas p-2" /></label>
        <WorkOrderSchedulePicker organizationId={profile?.organization_id} technicians={techs} technicianIds={selectedTechs} onTechniciansChange={setSelectedTechs} value={schedule} onChange={setSchedule} onValidationChange={setScheduleError} earliestDate={earliest} initialMode="manual" />
        <label className="flex items-center gap-3 text-sm min-h-11"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Customer confirmed this visit</label>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
      <div className="shrink-0 p-4 border-t border-subtle flex gap-3">
        <button type="button" disabled={loading} onClick={onClose} className="flex-1 min-h-11 rounded-lg border border-subtle">Cancel</button>
        <button type="button" disabled={loading || !valid} onClick={save} className="flex-1 min-h-11 rounded-lg bg-blue-600 text-white disabled:opacity-50">{loading ? 'Saving…' : `Create ${selectedTechs.length || ''} scheduled visit${selectedTechs.length === 1 ? '' : 's'}`}</button>
      </div>
    </div>
  </QuickActionModal>;
}
