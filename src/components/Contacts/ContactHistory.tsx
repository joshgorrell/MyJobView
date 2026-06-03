import { useState, useEffect, useCallback } from 'react';
import { FileText, ShoppingCart, Briefcase, Wrench, MessageSquare, CheckCircle2, Calendar, DollarSign, Users, ClipboardList, AlertCircle, RefreshCw, Star, Package } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ContactHistoryProps {
  contactId: string;
  onNavigateToProposal?: (proposalId: string) => void;
}

interface HistoryItem {
  id: string;
  type: string;
  title: string;
  description?: string;
  date: string;
  icon: any;
  iconColor: string;
  bgColor: string;
  status?: string;
  amount?: number;
  link?: string;
}

export function ContactHistory({ contactId, onNavigateToProposal }: ContactHistoryProps) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  const loadHistory = useCallback(async () => {
    setLoading(true);
    const items: HistoryItem[] = [];

    try {
      // Load proposals
      const { data: proposals } = await supabase
        .from('proposals')
        .select('id, proposal_number, status, total, created_at')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });

      if (proposals) {
        proposals.forEach(p => {
          items.push({
            id: `proposal-${p.id}`,
            type: 'proposal',
            title: `Proposal ${p.proposal_number}`,
            description: `Status: ${p.status}`,
            date: p.created_at,
            icon: FileText,
            iconColor: 'text-blue-600',
            bgColor: 'bg-blue-50',
            status: p.status,
            amount: p.total,
            link: `/proposals?id=${p.id}`
          });
        });
      }

      // Load sales orders
      const { data: salesOrders } = await supabase
        .from('sales_orders')
        .select('id, order_number, status, contract_total, created_at')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });

      if (salesOrders) {
        salesOrders.forEach(so => {
          items.push({
            id: `sales-order-${so.id}`,
            type: 'sales_order',
            title: `Sales Order ${so.order_number}`,
            description: `Status: ${so.status}`,
            date: so.created_at,
            icon: ShoppingCart,
            iconColor: 'text-green-600',
            bgColor: 'bg-green-50',
            status: so.status,
            amount: so.contract_total
          });
        });
      }

      // Load projects
      const { data: projects } = await supabase
        .from('projects')
        .select('id, project_name, status, created_at')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });

      if (projects) {
        projects.forEach(proj => {
          items.push({
            id: `project-${proj.id}`,
            type: 'project',
            title: proj.project_name,
            description: `Status: ${proj.status}`,
            date: proj.created_at,
            icon: Briefcase,
            iconColor: 'text-purple-600',
            bgColor: 'bg-purple-50',
            status: proj.status,
            link: `/projects?id=${proj.id}`
          });
        });
      }

      // Load work orders
      const { data: workOrders } = await supabase
        .from('work_orders')
        .select('id, work_order_number, work_order_type, status, created_at')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });

      if (workOrders) {
        workOrders.forEach(wo => {
          items.push({
            id: `work-order-${wo.id}`,
            type: 'work_order',
            title: `Work Order ${wo.work_order_number}`,
            description: `${wo.work_order_type} - ${wo.status}`,
            date: wo.created_at,
            icon: Wrench,
            iconColor: 'text-orange-600',
            bgColor: 'bg-orange-50',
            status: wo.status,
            link: `/dispatch?workorder=${wo.id}`
          });
        });
      }

      // Load appointments
      const { data: appointments } = await supabase
        .from('appointments')
        .select('id, title, appointment_type, scheduled_start, created_at')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });

      if (appointments) {
        appointments.forEach(apt => {
          items.push({
            id: `appointment-${apt.id}`,
            type: 'appointment',
            title: apt.title || 'Appointment',
            description: `${apt.appointment_type} - ${new Date(apt.scheduled_start).toLocaleString()}`,
            date: apt.created_at,
            icon: Calendar,
            iconColor: 'text-indigo-600',
            bgColor: 'bg-indigo-50'
          });
        });
      }

      // Load invoices
      const { data: invoices } = await supabase
        .from('invoices')
        .select('id, invoice_number, status, total, created_at')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });

      if (invoices) {
        invoices.forEach(inv => {
          items.push({
            id: `invoice-${inv.id}`,
            type: 'invoice',
            title: `Invoice ${inv.invoice_number}`,
            description: `Status: ${inv.status}`,
            date: inv.created_at,
            icon: DollarSign,
            iconColor: 'text-emerald-600',
            bgColor: 'bg-emerald-50',
            status: inv.status,
            amount: inv.total,
            link: `/invoices?id=${inv.id}`
          });
        });
      }

      // Load tasks
      const { data: tasks } = await supabase
        .from('tasks')
        .select('id, title, status, priority, due_date, created_at')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });

      if (tasks) {
        tasks.forEach(task => {
          items.push({
            id: `task-${task.id}`,
            type: 'task',
            title: task.title,
            description: `${task.priority} priority - ${task.status}`,
            date: task.created_at,
            icon: CheckCircle2,
            iconColor: 'text-cyan-600',
            bgColor: 'bg-cyan-50',
            status: task.status,
            link: `/tasks?id=${task.id}`
          });
        });
      }

      // Load connections
      const { data: connections } = await supabase
        .from('connections')
        .select('id, connection_type, connection_date, notes, profiles!connections_created_by_fkey(full_name)')
        .eq('contact_id', contactId)
        .order('connection_date', { ascending: false });

      if (connections) {
        connections.forEach(conn => {
          items.push({
            id: `connection-${conn.id}`,
            type: 'connection',
            title: `${conn.connection_type.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}`,
            description: conn.notes || `By ${(conn as any).profiles?.full_name || 'Unknown'}`,
            date: conn.connection_date,
            icon: Users,
            iconColor: 'text-blue-600',
            bgColor: 'bg-blue-50'
          });
        });
      }

      // Load service requests
      const { data: serviceRequests } = await supabase
        .from('service_requests')
        .select('id, request_type, status, priority, created_at')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });

      if (serviceRequests) {
        serviceRequests.forEach(sr => {
          items.push({
            id: `service-request-${sr.id}`,
            type: 'service_request',
            title: `Service Request - ${sr.request_type}`,
            description: `${sr.priority} priority - ${sr.status}`,
            date: sr.created_at,
            icon: AlertCircle,
            iconColor: 'text-red-600',
            bgColor: 'bg-red-50',
            status: sr.status
          });
        });
      }

      // Load punchlist invites
      const { data: punchlistInvites } = await supabase
        .from('punchlist_pending_invites')
        .select('id, project_name, status, created_at')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });

      if (punchlistInvites) {
        punchlistInvites.forEach(pl => {
          items.push({
            id: `punchlist-${pl.id}`,
            type: 'punchlist',
            title: `Punchlist - ${pl.project_name}`,
            description: `Status: ${pl.status}`,
            date: pl.created_at,
            icon: ClipboardList,
            iconColor: 'text-yellow-600',
            bgColor: 'bg-yellow-50',
            status: pl.status
          });
        });
      }

      // Load recurring subscriptions
      const { data: subscriptions } = await supabase
        .from('recurring_subscriptions')
        .select('id, plan_id, status, start_date, created_at, recurring_plans(plan_name)')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });

      if (subscriptions) {
        subscriptions.forEach(sub => {
          items.push({
            id: `subscription-${sub.id}`,
            type: 'subscription',
            title: `Subscription - ${(sub as any).recurring_plans?.plan_name || 'Plan'}`,
            description: `Status: ${sub.status}`,
            date: sub.created_at,
            icon: RefreshCw,
            iconColor: 'text-teal-600',
            bgColor: 'bg-teal-50',
            status: sub.status
          });
        });
      }

      // Load review requests
      const { data: reviewRequests } = await supabase
        .from('review_requests')
        .select('id, method, sent_at, email_opened, link_clicked, review_completed, notes, created_at, profiles!review_requests_sent_by_fkey(full_name)')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });

      if (reviewRequests) {
        reviewRequests.forEach(rr => {
          let reviewStatus = 'Pending';
          let reviewStatusColor = 'text-gray-500';
          if (rr.review_completed) {
            reviewStatus = 'Review Completed';
            reviewStatusColor = 'text-green-600';
          } else if (rr.link_clicked) {
            reviewStatus = 'Link Clicked';
            reviewStatusColor = 'text-blue-600';
          } else if (rr.email_opened) {
            reviewStatus = 'Email Opened';
            reviewStatusColor = 'text-amber-600';
          }

          const methodLabel = rr.method === 'qr_code' ? 'QR Code'
            : rr.method === 'sms' ? 'SMS'
            : rr.method === 'manual' ? 'Manual'
            : rr.method === 'survey' ? 'Survey'
            : 'Email';

          const sentBy = (rr as any).profiles?.full_name;

          items.push({
            id: `review-${rr.id}`,
            type: 'review_request',
            title: `Review Request (${methodLabel})`,
            description: `${reviewStatus}${sentBy ? ` · Sent by ${sentBy}` : ''}`,
            date: rr.sent_at || rr.created_at,
            icon: Star,
            iconColor: rr.review_completed ? 'text-green-600' : 'text-amber-600',
            bgColor: rr.review_completed ? 'bg-green-50' : 'bg-amber-50',
            status: reviewStatus
          });
        });
      }

      // Load security contracts
      const { data: securityContracts } = await supabase
        .from('security_contracts')
        .select('id, contract_number, status, created_at')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });

      if (securityContracts) {
        securityContracts.forEach(sc => {
          items.push({
            id: `security-contract-${sc.id}`,
            type: 'security_contract',
            title: `Security Contract ${sc.contract_number}`,
            description: `Status: ${sc.status}`,
            date: sc.created_at,
            icon: FileText,
            iconColor: 'text-red-600',
            bgColor: 'bg-red-50',
            status: sc.status,
            link: `/finance/security-contracts?id=${sc.id}`
          });
        });
      }

      // Sort all items by date
      items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setHistory(items);
    } catch (error) {
      console.error('Error loading contact history:', error);
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const filteredHistory = filter === 'all'
    ? history
    : history.filter(item => item.type === filter);

  const filterOptions = [
    { value: 'all', label: 'All Activity' },
    { value: 'proposal', label: 'Proposals' },
    { value: 'sales_order', label: 'Sales Orders' },
    { value: 'project', label: 'Projects' },
    { value: 'work_order', label: 'Work Orders' },
    { value: 'appointment', label: 'Appointments' },
    { value: 'invoice', label: 'Invoices' },
    { value: 'task', label: 'Tasks' },
    { value: 'connection', label: 'Connections' },
    { value: 'service_request', label: 'Service Requests' },
    { value: 'punchlist', label: 'Punchlist' },
    { value: 'subscription', label: 'Subscriptions' },
    { value: 'security_contract', label: 'Security Contracts' },
    { value: 'review_request', label: 'Reviews' }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900">Activity Summary</h3>
          <span className="text-sm font-medium text-gray-700">
            {filteredHistory.length} of {history.length} items
          </span>
        </div>

        {/* Filter Chips */}
        <div className="flex flex-wrap gap-2">
          {filterOptions.map(option => {
            const count = option.value === 'all'
              ? history.length
              : history.filter(h => h.type === option.value).length;

            if (count === 0 && option.value !== 'all') return null;

            return (
              <button
                key={option.value}
                onClick={() => setFilter(option.value)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                  filter === option.value
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white text-gray-700 border border-gray-300 hover:border-blue-400 hover:text-blue-600'
                }`}
              >
                {option.label}
                <span className={`ml-1.5 ${
                  filter === option.value ? 'text-blue-200' : 'text-gray-500'
                }`}>
                  ({count})
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {filteredHistory.length === 0 ? (
        <div className="text-center py-12">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-500">
            {filter === 'all' ? 'No activity history found' : `No ${filterOptions.find(o => o.value === filter)?.label.toLowerCase()} found`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredHistory.map((item, index) => {
            const Icon = item.icon;
            const itemDate = new Date(item.date);
            const today = new Date();
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            const isToday = itemDate.toDateString() === today.toDateString();
            const isYesterday = itemDate.toDateString() === yesterday.toDateString();

            // Check if we need a date separator
            let showDateSeparator = false;
            let separatorText = '';

            if (index === 0 || new Date(filteredHistory[index - 1].date).toDateString() !== itemDate.toDateString()) {
              showDateSeparator = true;
              if (isToday) {
                separatorText = 'Today';
              } else if (isYesterday) {
                separatorText = 'Yesterday';
              } else {
                separatorText = itemDate.toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                });
              }
            }

            const handleClick = () => {
              if (item.type === 'proposal' && onNavigateToProposal) {
                const proposalId = item.id.replace('proposal-', '');
                onNavigateToProposal(proposalId);
              } else if (item.link) {
                window.location.href = item.link;
              }
            };

            return (
              <div key={item.id}>
                {showDateSeparator && (
                  <div className={`flex items-center gap-3 ${index > 0 ? 'mt-6 mb-3' : 'mb-3'}`}>
                    <div className="flex-1 h-px bg-gray-200"></div>
                    <span className="text-sm font-semibold text-gray-700 px-3">
                      {separatorText}
                    </span>
                    <div className="flex-1 h-px bg-gray-200"></div>
                  </div>
                )}

                <div
                  onClick={handleClick}
                  className={`flex items-start gap-3 p-4 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all ${item.link ? 'cursor-pointer' : ''}`}
                >
                  <div className={`flex-shrink-0 w-10 h-10 ${item.bgColor} rounded-lg flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${item.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900 flex items-center gap-2">
                          {item.title}
                          {item.link && (
                            <span className="text-xs text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                              View →
                            </span>
                          )}
                        </h4>
                        {item.type === 'review_request' && item.status ? (
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                              item.status === 'Review Completed'
                                ? 'bg-green-100 text-green-700'
                                : item.status === 'Link Clicked'
                                ? 'bg-blue-100 text-blue-700'
                                : item.status === 'Email Opened'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              {item.status === 'Review Completed' && '★ '}
                              {item.status}
                            </span>
                            {item.description && (() => {
                              const sentByPart = item.description.split(' · Sent by ')[1];
                              return sentByPart ? (
                                <span className="text-xs text-gray-500">Sent by {sentByPart}</span>
                              ) : null;
                            })()}
                          </div>
                        ) : item.description ? (
                          <p className="text-sm text-gray-600 mt-0.5">{item.description}</p>
                        ) : null}
                        {item.amount && (
                          <p className="text-sm font-medium text-gray-900 mt-1">
                            ${item.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-medium text-gray-600">
                          {itemDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        {!isToday && !isYesterday && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {itemDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
