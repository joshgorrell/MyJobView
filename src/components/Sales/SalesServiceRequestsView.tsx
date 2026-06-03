import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  PhoneCall,
  Clock,
  MapPin,
  AlertCircle,
  CheckCircle,
  XCircle,
  Filter,
  ChevronDown,
  ChevronUp,
  DollarSign,
  FileText,
  User,
  Wrench,
  Calendar,
  AlertTriangle,
  ListTodo,
  ClipboardList,
  ArrowRight,
  Plus
} from 'lucide-react';
import { ContactLogModal } from '../Shared/ContactLogModal';
import { ContactLogHistory } from '../Shared/ContactLogHistory';

interface ServiceRequest {
  id: string;
  created_at: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  job_location_address: string;
  job_location_city: string | null;
  job_location_state: string | null;
  job_description: string;
  billable_type: string;
  priority: string;
  status: string;
  notes: string | null;
  contact_id: string | null;
  source_type: string;
  kickback_reason: string | null;
  kicked_back_at: string | null;
  customer_contact_confirmed_at: string | null;
  customer_contact_confirmed_by: string | null;
  work_order_id: string | null;
  contacts: {
    id: string;
    company_name: string | null;
    full_name: string;
  } | null;
  contact_confirmed_by_profile?: {
    id: string;
    full_name: string;
  } | null;
  work_order?: {
    id: string;
    work_order_number: string;
    status: string;
    assigned_to: string | null;
    start_date: string | null;
    customer_contact_confirmed_at: string | null;
    technician?: { full_name: string } | null;
  } | null;
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'open', label: 'Open' },
  { value: 'needs_more_info', label: 'Needs More Info' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const CONTACT_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'confirmed', label: 'Customer Contacted' },
  { value: 'pending', label: 'Awaiting Contact' },
];

function getPriorityColor(priority: string) {
  switch (priority) {
    case 'emergency': return 'text-red-600 bg-red-50 border-red-200';
    case 'urgent': return 'text-orange-600 bg-orange-50 border-orange-200';
    default: return 'text-blue-600 bg-blue-50 border-blue-200';
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'open': return 'text-yellow-700 bg-yellow-50';
    case 'scheduled': return 'text-blue-700 bg-blue-50';
    case 'in_progress': return 'text-orange-700 bg-orange-50';
    case 'closed': return 'text-green-700 bg-green-50';
    case 'cancelled': return 'text-red-700 bg-red-50';
    case 'needs_more_info': return 'text-amber-700 bg-amber-50';
    default: return 'text-gray-700 bg-gray-50';
  }
}

function getStatusLabel(status: string) {
  switch (status) {
    case 'open': return 'Open';
    case 'scheduled': return 'Scheduled';
    case 'in_progress': return 'In Progress';
    case 'closed': return 'Closed';
    case 'cancelled': return 'Cancelled';
    case 'needs_more_info': return 'Needs More Info';
    default: return status;
  }
}

function getSourceLabel(source: string) {
  switch (source) {
    case 'punchlist': return 'Punchlist';
    case 'staff_form': return 'Staff Form';
    case 'customer_portal': return 'Customer Portal';
    default: return 'Other';
  }
}

function getSourceIcon(source: string) {
  switch (source) {
    case 'punchlist': return <ListTodo className="w-3.5 h-3.5" />;
    case 'staff_form': return <ClipboardList className="w-3.5 h-3.5" />;
    case 'customer_portal': return <User className="w-3.5 h-3.5" />;
    default: return <FileText className="w-3.5 h-3.5" />;
  }
}

export function SalesServiceRequestsView() {
  const { profile } = useAuth();
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterContact, setFilterContact] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [contactLogTarget, setContactLogTarget] = useState<{ id: string; name: string; workOrderId?: string } | null>(null);
  const [contactLogRefreshKeys, setContactLogRefreshKeys] = useState<Record<string, number>>({});

  const isManager = profile?.role === 'admin' || profile?.role === 'sales_manager' || profile?.role === 'manager';

  useEffect(() => {
    if (profile) loadRequests();
  }, [profile, filterStatus, filterContact]);

  async function loadRequests() {
    try {
      setLoading(true);
      let query = supabase
        .from('service_requests')
        .select(`
          id, created_at, customer_name, customer_phone, customer_email,
          job_location_address, job_location_city, job_location_state,
          job_description, billable_type, priority, status, notes,
          contact_id, source_type, kickback_reason, kicked_back_at,
          customer_contact_confirmed_at, customer_contact_confirmed_by,
          work_order_id,
          contacts (id, company_name, full_name),
          contact_confirmed_by_profile:profiles!service_requests_customer_contact_confirmed_by_fkey (
            id, full_name
          ),
          work_order:work_orders!service_requests_work_order_id_fkey (
            id, work_order_number, status, assigned_to, start_date,
            customer_contact_confirmed_at,
            technician:profiles!work_orders_assigned_to_fkey (full_name)
          )
        `)
        .order('created_at', { ascending: false });

      if (!isManager) {
        query = query.eq('created_by', profile!.id);
      }

      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }

      if (filterContact === 'confirmed') {
        query = query.not('customer_contact_confirmed_at', 'is', null);
      } else if (filterContact === 'pending') {
        query = query.is('customer_contact_confirmed_at', null);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error('Error loading service requests:', error);
    } finally {
      setLoading(false);
    }
  }

  const pendingContactCount = requests.filter(r =>
    !r.customer_contact_confirmed_at &&
    r.status !== 'cancelled' &&
    r.status !== 'closed'
  ).length;

  const confirmedCount = requests.filter(r => r.customer_contact_confirmed_at).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading service requests...</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">My Service Requests</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Track your submitted service requests and customer contact status
          </p>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
        >
          <Filter className="w-4 h-4" />
          Filters
          {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="text-2xl font-bold text-gray-900">{requests.length}</div>
          <div className="text-xs text-gray-500 mt-0.5">Total Requests</div>
        </div>
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
          <div className="text-2xl font-bold text-amber-700">{pendingContactCount}</div>
          <div className="text-xs text-amber-600 mt-0.5">Awaiting Contact</div>
        </div>
        <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
          <div className="text-2xl font-bold text-emerald-700">{confirmedCount}</div>
          <div className="text-xs text-emerald-600 mt-0.5">Customer Contacted</div>
        </div>
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
          <div className="text-2xl font-bold text-blue-700">
            {requests.filter(r => r.status === 'scheduled' || r.status === 'in_progress').length}
          </div>
          <div className="text-xs text-blue-600 mt-0.5">Active / Scheduled</div>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {STATUS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Customer Contact</label>
              <select
                value={filterContact}
                onChange={(e) => setFilterContact(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {CONTACT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Request list */}
      {requests.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-sm">
          <ClipboardList className="w-14 h-14 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gray-700 mb-1">No Service Requests</h3>
          <p className="text-sm text-gray-400">
            {filterStatus !== 'all' || filterContact !== 'all'
              ? 'No requests match your current filters.'
              : 'You have not submitted any service requests yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((request) => {
            const isExpanded = expandedId === request.id;
            const contactConfirmed = !!(request.customer_contact_confirmed_at || request.work_order?.customer_contact_confirmed_at);
            const confirmedAt = request.customer_contact_confirmed_at || request.work_order?.customer_contact_confirmed_at;
            const confirmedByName = request.contact_confirmed_by_profile?.full_name;

            return (
              <div
                key={request.id}
                className={`bg-white rounded-xl border shadow-sm transition-all ${
                  request.status === 'needs_more_info'
                    ? 'border-amber-300'
                    : contactConfirmed
                    ? 'border-emerald-200'
                    : 'border-gray-200'
                }`}
              >
                {/* Kickback banner */}
                {request.status === 'needs_more_info' && request.kickback_reason && (
                  <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border-b border-amber-200 rounded-t-xl">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-semibold text-amber-700 mb-0.5">
                        Dispatch needs more information
                        {request.kicked_back_at && (
                          <span className="font-normal text-amber-600 ml-1">
                            — {new Date(request.kicked_back_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-amber-700">{request.kickback_reason}</p>
                    </div>
                  </div>
                )}

                <div
                  className="p-4 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : request.id)}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Badge row */}
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${getPriorityColor(request.priority)}`}>
                          <AlertCircle className="w-3 h-3" />
                          {request.priority.charAt(0).toUpperCase() + request.priority.slice(1)}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(request.status)}`}>
                          {request.status === 'needs_more_info' && <AlertTriangle className="w-3 h-3 mr-1" />}
                          {getStatusLabel(request.status)}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          {getSourceIcon(request.source_type)}
                          {getSourceLabel(request.source_type)}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(request.created_at).toLocaleDateString()}
                        </span>
                      </div>

                      {/* Customer + description */}
                      <div className="font-semibold text-gray-900 text-base">{request.customer_name}</div>
                      <div className="text-sm text-gray-500 line-clamp-1 mt-0.5">{request.job_description}</div>

                      {/* Meta row */}
                      <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-400">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {request.job_location_address}
                          {request.job_location_city && `, ${request.job_location_city}`}
                        </div>
                        <div className="flex items-center gap-1">
                          <DollarSign className="w-3.5 h-3.5" />
                          {request.billable_type === 'billable' ? 'Billable' : 'Warranty'}
                        </div>
                      </div>
                    </div>

                    {/* Contact status badge — right side */}
                    <div className="shrink-0 flex flex-col items-end gap-2">
                      {contactConfirmed ? (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
                          <PhoneCall className="w-3.5 h-3.5" />
                          Customer Contacted
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium">
                          <Clock className="w-3.5 h-3.5" />
                          Awaiting Contact
                        </div>
                      )}
                      {request.work_order && (
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-blue-50 border border-blue-200 text-blue-700 text-xs">
                          <Wrench className="w-3 h-3" />
                          {request.work_order.work_order_number}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Expand indicator */}
                  <div className="flex items-center justify-end mt-2">
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-100 pt-4 space-y-4">

                    {/* Customer contact status detail */}
                    <div className={`flex items-start gap-3 p-4 rounded-xl border ${
                      contactConfirmed
                        ? 'bg-emerald-50 border-emerald-200'
                        : 'bg-amber-50 border-amber-200'
                    }`}>
                      <PhoneCall className={`w-5 h-5 shrink-0 mt-0.5 ${contactConfirmed ? 'text-emerald-600' : 'text-amber-600'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className={`text-sm font-semibold ${contactConfirmed ? 'text-emerald-800' : 'text-amber-800'}`}>
                            {contactConfirmed ? 'Customer Has Been Contacted' : 'Customer Not Yet Contacted'}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setContactLogTarget({
                                id: request.id,
                                name: request.customer_name,
                                workOrderId: request.work_order?.id,
                              });
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors flex-shrink-0"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Log Contact
                          </button>
                        </div>
                        {contactConfirmed && confirmedAt ? (
                          <div className={`text-sm mt-1 ${contactConfirmed ? 'text-emerald-700' : 'text-amber-700'}`}>
                            First contact logged{' '}
                            <span className="font-medium">{new Date(confirmedAt).toLocaleString()}</span>
                            {confirmedByName && (
                              <span className="text-emerald-600"> by {confirmedByName}</span>
                            )}
                          </div>
                        ) : (
                          <div className="text-sm text-amber-700 mt-1">
                            No contact logged yet. Use "Log Contact" to record a call or voicemail.
                          </div>
                        )}
                      </div>
                    </div>

                    <ContactLogHistory
                      serviceRequestId={request.id}
                      refreshKey={contactLogRefreshKeys[request.id] ?? 0}
                    />

                    {/* Work order info */}
                    {request.work_order && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Wrench className="w-4 h-4 text-blue-600" />
                          <span className="text-sm font-semibold text-blue-800">Work Order Created</span>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <span className="text-xs text-blue-600 uppercase tracking-wide">WO Number</span>
                            <div className="font-medium text-blue-900">{request.work_order.work_order_number}</div>
                          </div>
                          <div>
                            <span className="text-xs text-blue-600 uppercase tracking-wide">Status</span>
                            <div className="font-medium text-blue-900">{getStatusLabel(request.work_order.status)}</div>
                          </div>
                          {request.work_order.technician && (
                            <div>
                              <span className="text-xs text-blue-600 uppercase tracking-wide">Assigned Tech</span>
                              <div className="font-medium text-blue-900">{request.work_order.technician.full_name}</div>
                            </div>
                          )}
                          {request.work_order.start_date && (
                            <div>
                              <span className="text-xs text-blue-600 uppercase tracking-wide">Scheduled Date</span>
                              <div className="font-medium text-blue-900">
                                {new Date(request.work_order.start_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                              </div>
                            </div>
                          )}
                        </div>
                        {request.work_order.customer_contact_confirmed_at && !request.customer_contact_confirmed_at && (
                          <div className="mt-3 flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                            <PhoneCall className="w-3.5 h-3.5" />
                            Work order contact confirmed {new Date(request.work_order.customer_contact_confirmed_at).toLocaleString()}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Job details */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                      <div className="space-y-2">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Job Description</div>
                        <div className="text-gray-800 whitespace-pre-wrap">{request.job_description}</div>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Location</div>
                          <div className="flex items-start gap-1.5 text-gray-700">
                            <MapPin className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                            <span>
                              {request.job_location_address}
                              {request.job_location_city && <br />}
                              {request.job_location_city}
                              {request.job_location_state && `, ${request.job_location_state}`}
                            </span>
                          </div>
                        </div>
                        {request.contacts && (
                          <div>
                            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Contact</div>
                            <div className="text-gray-700">{request.contacts.full_name}</div>
                            {request.contacts.company_name && (
                              <div className="text-gray-500 text-xs">{request.contacts.company_name}</div>
                            )}
                          </div>
                        )}
                        {request.notes && (
                          <div>
                            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</div>
                            <div className="text-gray-700">{request.notes}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {contactLogTarget && (
        <ContactLogModal
          serviceRequestId={contactLogTarget.id}
          workOrderId={contactLogTarget.workOrderId}
          customerName={contactLogTarget.name}
          onClose={() => setContactLogTarget(null)}
          onSaved={() => {
            setContactLogRefreshKeys(prev => ({
              ...prev,
              [contactLogTarget.id]: (prev[contactLogTarget.id] ?? 0) + 1,
            }));
            loadRequests();
          }}
        />
      )}
    </div>
  );
}
