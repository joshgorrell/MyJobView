import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { CreateWorkOrderModal } from '../Production/CreateWorkOrderModal';
import type { ServiceRequestContext } from '../Production/CreateWorkOrderModal';
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
  ChevronLeft,
  ChevronRight,
  ListTodo,
  ClipboardList,
  MessageSquareWarning,
  RotateCcw,
  AlertTriangle,
  PhoneCall,
  Layers,
  Info,
  CheckSquare
} from 'lucide-react';
import { ServiceRequestForm } from '../Service/ServiceRequestForm';
import { ContactQuickViewModal } from '../Shared/ContactQuickViewModal';

interface ServiceRequest {
  id: string;
  created_at: string;
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
  requested_tech_ids: string[] | null;
  estimated_duration: string | null;
  requested_date: string | null;
  requested_time: string | null;
  status: string;
  notes: string | null;
  attachments: any;
  created_by: string;
  contact_id: string | null;
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
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null);
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
    profile?.role === 'service_manager' ||
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
        .eq('role', 'tech')
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
        return 'text-gray-400 bg-gray-500/10';
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
        return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
    }
  }

  const isMyRequest = (request: ServiceRequest) => request.created_by === profile?.id;

  const constraintContactId = selectedRequestIds.size > 0
    ? requests.find(r => selectedRequestIds.has(r.id))?.contact_id ?? null
    : null;

  function canSelectRequest(request: ServiceRequest): boolean {
    if (request.status !== 'open') return false;
    if (constraintContactId && request.contact_id !== constraintContactId) return false;
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
        <div className="text-gray-400">Loading service requests...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white">Service Request Queue</h2>
          <p className="text-gray-400 text-sm mt-1">
            {queueRequests.length} active {queueRequests.length === 1 ? 'request' : 'requests'}
            {needsInfoRequests.length > 0 && (
              <span className="text-amber-400 ml-2">· {needsInfoRequests.length} awaiting more info</span>
            )}
          </p>
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
        >
          <Filter className="w-4 h-4" />
          Filters
          {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-gray-800 rounded-lg w-full sm:w-fit overflow-x-auto">
        <button
          onClick={() => setActiveTab('queue')}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'queue'
              ? 'bg-orange-600 text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-700'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          Active Queue
          {queueRequests.length > 0 && (
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
              activeTab === 'queue' ? 'bg-orange-500/40 text-orange-100' : 'bg-gray-700 text-gray-300'
            }`}>
              {queueRequests.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('needs_info')}
          className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
            activeTab === 'needs_info'
              ? 'bg-amber-600 text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-700'
          }`}
        >
          <MessageSquareWarning className="w-4 h-4" />
          Needs More Info
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
        <div className="bg-gray-800 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Priority</label>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              >
                <option value="all">All Priorities</option>
                <option value="emergency">Emergency</option>
                <option value="urgent">Urgent</option>
                <option value="normal">Normal</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Source</label>
              <select
                value={filterSourceType}
                onChange={(e) => setFilterSourceType(e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-orange-500 focus:border-transparent"
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
            <div className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
              {selectedRequestIds.size}
            </div>
            <div>
              <div className="text-sm font-semibold text-orange-200">
                {selectedRequestIds.size} requests selected
              </div>
              <div className="text-xs text-orange-400 truncate max-w-[220px] sm:max-w-none">
                {selectedRequests[0]?.customer_name || 'Same customer'} — combine into one work order
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedRequestIds(new Set())}
              className="px-3 py-2 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
            >
              Clear
            </button>
            <button
              onClick={() => setShowCombineModal(true)}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 text-xs bg-orange-600 hover:bg-orange-500 text-white rounded-lg font-semibold transition-colors"
            >
              <Layers className="w-3.5 h-3.5" />
              Combine into Work Order
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {filteredRequests.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-12 text-center">
          {activeTab === 'needs_info' ? (
            <>
              <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">All Clear</h3>
              <p className="text-gray-400">No requests are waiting on more information.</p>
            </>
          ) : (
            <>
              <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">Queue Empty</h3>
              <p className="text-gray-400">All service requests have been scheduled!</p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredRequests.map((request) => (
            <div
              key={request.id}
              className={`bg-gray-800 rounded-lg border transition-colors ${
                selectedRequestIds.has(request.id)
                  ? 'border-orange-500 ring-2 ring-orange-500/40'
                  : request.status === 'needs_more_info'
                  ? 'border-amber-500/40 hover:border-amber-500/60'
                  : 'border-gray-700 hover:border-gray-600'
              }`}
            >
              {/* Kickback warning banner */}
              {request.status === 'needs_more_info' && request.kickback_reason && (
                <div className="flex items-start gap-3 px-4 py-3 bg-amber-500/10 border-b border-amber-500/30 rounded-t-lg">
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
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-white rounded-lg text-xs font-semibold transition-colors"
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
                          className="w-4 h-4 rounded border-gray-600 text-orange-600 focus:ring-orange-500 focus:ring-offset-0 cursor-pointer"
                        />
                      ) : constraintContactId && request.contact_id !== constraintContactId ? (
                        <span
                          title={`Can only combine requests from the same customer. Currently selecting requests from ${selectedRequests[0]?.customer_name}`}
                          className="flex items-center justify-center w-4 h-4 text-gray-600 cursor-not-allowed"
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
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      {request.contact_id ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); setQuickViewContactId(request.contact_id!); }}
                          className="font-semibold text-white text-base leading-tight hover:text-blue-300 transition-colors text-left"
                        >
                          {request.customer_name}
                        </button>
                      ) : (
                        <div className="font-semibold text-white text-base leading-tight">{request.customer_name}</div>
                      )}
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-xs text-gray-500">
                            {new Date(request.created_at).toLocaleDateString()} {new Date(request.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="text-xs text-gray-600">
                            {request.profiles?.full_name || 'Unknown'}
                          </span>
                        </div>
                        {/* Convert button — only on desktop (sm+), only when collapsed */}
                        {expandedRequest !== request.id && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setConvertingTo(request.id); }}
                            className="hidden sm:flex items-center gap-1 px-2.5 py-1 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-xs font-semibold whitespace-nowrap"
                          >
                            <ArrowRight className="w-3 h-3" />
                            Convert
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
                    <div className="text-sm text-gray-300 line-clamp-2 mb-1.5">{request.job_description}</div>

                    {/* Meta row + mobile Convert button */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
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
                          className="sm:hidden flex items-center gap-1 px-3 py-1.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-xs font-semibold whitespace-nowrap shrink-0"
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                          Convert
                        </button>
                      )}
                    </div>

                    {/* Expanded Details */}
                    {expandedRequest === request.id && (
                      <div className="mt-3 space-y-3 pt-3 border-t border-gray-700">
                        {/* Address */}
                        <div className="flex items-start gap-2.5">
                          <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                          <div>
                            <div className="text-xs font-medium text-gray-400 mb-0.5">Address</div>
                            <div className="text-sm text-white leading-snug">
                              {request.job_location_address}
                              {(request.job_location_city || request.job_location_state || request.job_location_zip) && (
                                <span className="text-gray-400">
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
                          <FileText className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                          <div>
                            <div className="text-xs font-medium text-gray-400 mb-0.5">Full Description</div>
                            <div className="text-sm text-white whitespace-pre-wrap">{request.job_description}</div>
                          </div>
                        </div>

                        {/* Contact details grid */}
                        {(request.customer_phone || request.customer_email || request.requested_date || request.attachments?.length > 0) && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {request.customer_phone && (
                              <a href={`tel:${request.customer_phone}`} className="flex items-center gap-2 px-3 py-2 bg-gray-900 rounded-lg text-xs text-gray-300 hover:text-white hover:bg-gray-700 transition-colors">
                                <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                {request.customer_phone}
                              </a>
                            )}
                            {request.customer_email && (
                              <a href={`mailto:${request.customer_email}`} className="flex items-center gap-2 px-3 py-2 bg-gray-900 rounded-lg text-xs text-gray-300 hover:text-white hover:bg-gray-700 transition-colors truncate">
                                <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                <span className="truncate">{request.customer_email}</span>
                              </a>
                            )}
                            {request.requested_date && (
                              <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 rounded-lg text-xs text-gray-300">
                                <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                {new Date(request.requested_date).toLocaleDateString()}
                                {request.requested_time && ` · ${request.requested_time}`}
                              </div>
                            )}
                            {request.attachments && request.attachments.length > 0 && (
                              <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 rounded-lg text-xs text-gray-300">
                                <Paperclip className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                {request.attachments.length} attachment{request.attachments.length !== 1 ? 's' : ''}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Contact record */}
                        {request.contacts && (
                          <div className="flex items-center gap-2 px-3 py-2 bg-gray-900 rounded-lg">
                            <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <div className="text-xs text-gray-300">
                              <span className="text-white">{request.contacts.full_name}</span>
                              {request.contacts.company_name && <span className="text-gray-400"> · {request.contacts.company_name}</span>}
                            </div>
                          </div>
                        )}

                        {request.notes && (
                          <div className="p-3 bg-gray-900 rounded-lg border border-gray-700">
                            <div className="text-xs font-medium text-gray-400 mb-1">Notes</div>
                            <div className="text-sm text-gray-300 whitespace-pre-wrap">{request.notes}</div>
                          </div>
                        )}

                        {/* Customer contact status */}
                        <div className={`flex items-start gap-2.5 p-3 rounded-lg border ${
                          request.customer_contact_confirmed_at
                            ? 'bg-emerald-500/10 border-emerald-500/20'
                            : 'bg-gray-900 border-gray-700'
                        }`}>
                          <PhoneCall className={`w-4 h-4 mt-0.5 shrink-0 ${request.customer_contact_confirmed_at ? 'text-emerald-400' : 'text-gray-500'}`} />
                          <div>
                            <div className={`text-xs font-medium mb-0.5 ${request.customer_contact_confirmed_at ? 'text-emerald-400' : 'text-gray-400'}`}>
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
                              <div className="text-xs text-gray-500">Not yet confirmed</div>
                            )}
                          </div>
                        </div>

                        {/* Action buttons — full-width row at bottom of expanded section */}
                        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 pt-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); setConvertingTo(request.id); }}
                            className="col-span-2 sm:col-span-1 sm:flex-1 min-w-0 px-3 py-2.5 sm:py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors text-xs font-semibold flex items-center justify-center gap-1.5"
                          >
                            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                            Convert to Work Order
                          </button>

                          <button
                            onClick={(e) => { e.stopPropagation(); handleToggleCustomerContact(request); }}
                            disabled={confirmingContact === request.id}
                            title={request.customer_contact_confirmed_at ? 'Click to undo' : 'Mark customer contacted'}
                            className={`sm:flex-1 min-w-0 px-3 py-2.5 sm:py-2 rounded-lg transition-colors text-xs font-medium flex items-center justify-center gap-1.5 disabled:opacity-50 ${
                              request.customer_contact_confirmed_at
                                ? 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30'
                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
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
          contact_id: req.contact_id,
          requested_tech_ids: req.requested_tech_ids,
          requested_date: req.requested_date,
          requested_time: req.requested_time,
          source_type: req.source_type
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
        title="Cancel Service Request"
        message="Are you sure you want to cancel this service request?"
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
      <div className="bg-gray-900 w-full max-w-lg rounded-2xl border border-gray-700 shadow-2xl">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-700 bg-gray-800 rounded-t-2xl">
          <div className="w-9 h-9 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <MessageSquareWarning className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">Request More Information</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              This will notify <span className="text-white">{serviceRequest.profiles?.full_name || 'the submitter'}</span> to update their request
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto p-1.5 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-white"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-gray-800 rounded-xl p-3 border border-gray-700">
            <div className="text-xs text-gray-500 mb-0.5">Service Request</div>
            <div className="font-medium text-white text-sm">{serviceRequest.customer_name}</div>
            <div className="text-xs text-gray-400 mt-0.5 line-clamp-2">{serviceRequest.job_description}</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              What information is missing or unclear? <span className="text-red-400">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="e.g., Need the exact system model number, customer hasn't confirmed if they have an existing service contract, unclear if this is a new install or a repair..."
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm placeholder-gray-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-none"
              autoFocus
            />
            <p className="text-xs text-gray-500 mt-1.5">
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

        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2.5 bg-gray-700 text-white rounded-xl hover:bg-gray-600 transition-colors text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !reason.trim()}
            className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold flex items-center justify-center gap-2"
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
  const [selectedTechs, setSelectedTechs] = useState<string[]>([]);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('2');
  const [description, setDescription] = useState(
    serviceRequests.map((sr, i) => `${i + 1}. [${sr.customer_name}] ${sr.job_description}`).join('\n\n')
  );
  const [internalNotes, setInternalNotes] = useState('');

  const customer = serviceRequests[0];

  function toggleTechSelection(techId: string) {
    setSelectedTechs(prev =>
      prev.includes(techId) ? prev.filter(id => id !== techId) : [...prev, techId]
    );
  }

  function formatDateTime(): string {
    if (!scheduledDate) return 'Not scheduled';
    const d = new Date(scheduledDate + 'T12:00:00');
    const dateLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    if (!scheduledTime) return dateLabel;
    const [h, m] = scheduledTime.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${dateLabel} at ${h12}:${m.toString().padStart(2, '0')} ${period}`;
  }

  async function handleCombine() {
    if (selectedTechs.length === 0 || !scheduledDate) {
      alert('Please select at least one technician and a schedule date');
      return;
    }
    if (!description.trim()) {
      alert('Please enter a job description');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('combine_service_requests_to_work_order', {
        p_service_request_ids: serviceRequests.map(sr => sr.id),
        p_tech_ids: selectedTechs,
        p_scheduled_date: scheduledDate,
        p_scheduled_time: scheduledTime || null,
        p_estimated_hours: parseFloat(estimatedHours) || 2,
        p_description: description.trim(),
        p_internal_notes: internalNotes.trim() || null,
      });

      if (error) throw error;

      for (const techId of selectedTechs) {
        const woNumber = `WO-COMBINED`;
        await notifyTechJobAssigned(techId, {
          work_order_number: woNumber,
          title: `Service: ${description.substring(0, 50)}`,
          customer_name: customer.customer_name,
          scheduled_date: scheduledDate,
          address: customer.job_location_address,
        });
      }

      alert(`${serviceRequests.length} service requests combined into 1 work order successfully!`);
      onSuccess();
    } catch (error) {
      console.error('Error combining service requests:', error);
      alert('Failed to combine service requests');
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = selectedTechs.length > 0 && !!scheduledDate && description.trim().length > 0;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-stretch justify-center z-50 p-0 sm:p-4 sm:items-center">
      <div className="bg-gray-900 w-full sm:rounded-2xl sm:max-w-7xl flex flex-col max-h-screen sm:max-h-[95vh] overflow-hidden shadow-2xl border border-gray-700">

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-700 shrink-0 bg-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-orange-600 flex items-center justify-center">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg sm:text-xl font-bold text-white">Combine into One Work Order</h3>
              <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
                {serviceRequests.length} service requests from {customer.customer_name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-white"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Body: two-panel layout — on mobile, form on top then calendar below */}
        <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">

          {/* Left panel — scrollable form */}
          <div className="w-full lg:w-[360px] xl:w-[400px] shrink-0 flex flex-col border-b lg:border-b-0 lg:border-r border-gray-700 overflow-y-auto max-h-[45vh] lg:max-h-none">
            <div className="p-4 sm:p-5 space-y-4">

              {/* Info banner */}
              <div className="flex items-start gap-2.5 bg-orange-900/20 border border-orange-700/40 rounded-lg p-3">
                <Info className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
                <div className="text-xs text-orange-300 leading-relaxed">
                  <strong>Combining {serviceRequests.length} requests</strong> into a single work order. All requests will be marked as scheduled and linked to the new work order.
                </div>
              </div>

              {/* Selected requests summary */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                  Requests Being Combined
                </label>
                <div className="bg-gray-800 border border-gray-700 rounded-lg divide-y divide-gray-700">
                  {serviceRequests.map((sr) => (
                    <div key={sr.id} className="px-3 py-2.5">
                      <div className="flex items-start gap-2">
                        <span className={`mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border ${
                          sr.priority === 'emergency' ? 'text-red-400 bg-red-500/10 border-red-500/20' :
                          sr.priority === 'urgent' ? 'text-orange-400 bg-orange-500/10 border-orange-500/20' :
                          'text-blue-400 bg-blue-500/10 border-blue-500/20'
                        }`}>
                          {sr.priority}
                        </span>
                        <p className="text-xs text-gray-300 line-clamp-2 flex-1">{sr.job_description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Customer / Location */}
              <div className="flex items-start gap-3 bg-orange-500/10 border border-orange-500/20 rounded-xl p-3">
                <MapPin className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="font-semibold text-white text-sm">{customer.customer_name}</div>
                  <div className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                    {customer.job_location_address}
                    {customer.job_location_city && `, ${customer.job_location_city}`}
                    {customer.job_location_state && `, ${customer.job_location_state}`}
                  </div>
                  {customer.customer_phone && (
                    <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                      <Phone className="w-3 h-3" />
                      {customer.customer_phone}
                    </div>
                  )}
                </div>
              </div>

              {/* Combined Description */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                  Combined Job Description *
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Enter combined job description..."
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
                />
              </div>

              {/* Technician selector */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                  Assign Technicians *
                </label>
                <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
                  {techs.map((tech, idx) => (
                    <label
                      key={tech.id}
                      className={`flex items-center gap-3 px-3 py-3 cursor-pointer transition-colors hover:bg-gray-700 ${
                        idx < techs.length - 1 ? 'border-b border-gray-700' : ''
                      } ${selectedTechs.includes(tech.id) ? 'bg-orange-500/10' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedTechs.includes(tech.id)}
                        onChange={() => toggleTechSelection(tech.id)}
                        className="w-4 h-4 text-orange-600 bg-gray-700 border-gray-600 rounded focus:ring-orange-500"
                      />
                      <User className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span className={`text-sm flex-1 ${selectedTechs.includes(tech.id) ? 'text-white font-medium' : 'text-gray-300'}`}>
                        {tech.full_name}
                      </span>
                    </label>
                  ))}
                </div>
                {selectedTechs.length > 0 && (
                  <p className="text-xs text-green-400 mt-1.5">
                    {selectedTechs.length} tech{selectedTechs.length > 1 ? 's' : ''} assigned
                  </p>
                )}
              </div>

              {/* Schedule */}
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Calendar className={`w-4 h-4 shrink-0 ${scheduledDate ? 'text-orange-400' : 'text-gray-500'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-400 font-medium">Scheduled</div>
                    <div className={`text-sm font-semibold truncate ${scheduledDate ? 'text-white' : 'text-gray-500'}`}>
                      {formatDateTime()}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1">
                    <label className="block text-[10px] text-gray-500 mb-1">Date *</label>
                    <input
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className="w-full px-2 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-xs focus:ring-1 focus:ring-orange-500"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-[10px] text-gray-500 mb-1">Time</label>
                    <input
                      type="time"
                      step="1800"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      className="w-full px-2 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-xs focus:ring-1 focus:ring-orange-500"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-[10px] text-gray-500 mb-1">Est. Hours</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      value={estimatedHours}
                      onChange={(e) => setEstimatedHours(e.target.value)}
                      className="w-full px-2 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-xs focus:ring-1 focus:ring-orange-500"
                    />
                  </div>
                </div>
              </div>

              {/* Internal notes */}
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                  Internal Notes
                </label>
                <textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  rows={2}
                  placeholder="Notes for the technician..."
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
                />
              </div>
            </div>
          </div>

          {/* Right panel — scheduling calendar */}
          <div className="flex-1 min-h-0 flex flex-col min-h-[300px] lg:min-h-0">
            {selectedTechs.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-gray-900/50">
                <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center mb-4">
                  <Calendar className="w-8 h-8 text-gray-600" />
                </div>
                <p className="text-gray-400 font-medium">Select technicians to view their schedule</p>
                <p className="text-gray-600 text-sm mt-1">Tap a time slot to schedule the work order</p>
              </div>
            ) : (
              <SchedulingCalendar
                technicianIds={selectedTechs}
                selectedDate={scheduledDate}
                selectedTime={scheduledTime}
                estimatedHours={parseFloat(estimatedHours) || 2}
                onSlotSelect={(date, time) => {
                  setScheduledDate(date);
                  setScheduledTime(time);
                }}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-t border-gray-700 bg-gray-800">
          <div className="text-xs text-gray-500 hidden sm:block">
            {canSubmit
              ? `Ready to combine ${serviceRequests.length} requests into 1 work order for ${formatDateTime()}`
              : 'Select techs + date to continue'}
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 sm:flex-none px-4 py-3 sm:py-2.5 bg-gray-700 text-white rounded-xl hover:bg-gray-600 transition-colors text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCombine}
              disabled={loading || !canSubmit}
              className="flex-1 sm:flex-none px-4 sm:px-6 py-3 sm:py-2.5 bg-orange-600 text-white rounded-xl hover:bg-orange-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm font-semibold shadow-lg shadow-orange-900/30"
            >
              <Layers className="w-4 h-4 shrink-0" />
              {loading ? 'Creating...' : `Combine ${serviceRequests.length} into 1 Work Order`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
