import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  Clock,
  AlertTriangle,
  CheckCircle,
  DollarSign,
  FileText,
  User,
  Calendar,
  TrendingUp,
  Filter,
  Eye,
  Link,
  Archive
} from 'lucide-react';

interface BillingQueueItem {
  id: string;
  work_order_id: string;
  contact_id: string;
  billable_by: string;
  assigned_to_user_id: string;
  status: string;
  completed_at: string;
  billing_deadline: string;
  escalation_level: number;
  escalated_to_dispatch_at: string | null;
  escalated_to_admin_at: string | null;
  work_order: {
    work_order_number: string;
    description: string;
    billable_type: string;
    type: string;
    work_order_group_id: string | null;
    is_billable: boolean;
    is_archived: boolean;
  };
  contact: {
    full_name: string;
    company_name: string;
  };
  assigned_user: {
    full_name: string;
  };
}

interface GroupedBillingQueueItem {
  groupId: string | null;
  items: BillingQueueItem[];
  isGroup: boolean;
  primaryItem: BillingQueueItem;
}

interface ServiceBillingQueueProps {
  onSelectItem?: (item: BillingQueueItem) => void;
}

export function ServiceBillingQueue({ onSelectItem }: ServiceBillingQueueProps) {
  const { profile } = useAuth();
  const [activeQueue, setActiveQueue] = useState<'ready' | 'assigned' | 'unpaid'>('ready');
  const [items, setItems] = useState<BillingQueueItem[]>([]);
  const [groupedItems, setGroupedItems] = useState<GroupedBillingQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterBillableBy, setFilterBillableBy] = useState<string>('all');
  const [filterWorkOrderType, setFilterWorkOrderType] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const isManager = profile?.role === 'admin' || profile?.role === 'dispatch' || profile?.role === 'production_manager' || profile?.role === 'service_manager';

  useEffect(() => {
    loadQueueItems();

    const channel = supabase
      .channel('service-billing-queue')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'service_billing_queue'
      }, loadQueueItems)
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [activeQueue, filterBillableBy, filterWorkOrderType, showArchived]);

  async function loadQueueItems() {
    try {
      let query = supabase
        .from('service_billing_queue')
        .select(`
          *,
          work_order:work_orders(work_order_number, description, billable_type, type, work_order_group_id, is_billable, is_archived),
          contact:contacts(full_name, company_name),
          assigned_user:profiles!assigned_to_user_id(full_name)
        `)
        .order('completed_at', { ascending: true });

      // Filter by queue type
      if (activeQueue === 'ready') {
        query = query.eq('status', 'ready_for_billing');
      } else if (activeQueue === 'assigned') {
        query = query.in('status', ['assigned', 'in_progress']);
        if (!isManager) {
          query = query.eq('assigned_to_user_id', profile?.id);
        }
      } else if (activeQueue === 'unpaid') {
        query = query.in('status', ['invoice_sent', 'payment_pending', 'overdue']);
      }

      // Filter by billable_by
      if (filterBillableBy !== 'all') {
        query = query.eq('billable_by', filterBillableBy);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Filter by work order type and billable status (client-side since it's nested)
      let filteredData = (data || []).filter(item => {
        if (!item.work_order) return false;

        // Only show billable work orders
        if (!item.work_order.is_billable) return false;

        // Filter archived work orders unless explicitly shown
        if (!showArchived && item.work_order.is_archived) return false;

        // Filter by work order type
        if (filterWorkOrderType !== 'all' && item.work_order.type !== filterWorkOrderType) {
          return false;
        }

        return true;
      });

      setItems(filteredData);

      // Group linked work orders
      const grouped = groupWorkOrders(filteredData);
      setGroupedItems(grouped);
    } catch (error) {
      console.error('Error loading billing queue:', error);
    } finally {
      setLoading(false);
    }
  }

  function groupWorkOrders(items: BillingQueueItem[]): GroupedBillingQueueItem[] {
    const grouped: { [key: string]: BillingQueueItem[] } = {};
    const ungrouped: BillingQueueItem[] = [];

    items.forEach(item => {
      const groupId = item.work_order?.work_order_group_id;
      if (groupId) {
        if (!grouped[groupId]) {
          grouped[groupId] = [];
        }
        grouped[groupId].push(item);
      } else {
        ungrouped.push(item);
      }
    });

    const result: GroupedBillingQueueItem[] = [];

    // Add grouped items
    Object.entries(grouped).forEach(([groupId, groupItems]) => {
      result.push({
        groupId,
        items: groupItems,
        isGroup: true,
        primaryItem: groupItems[0]
      });
    });

    // Add ungrouped items
    ungrouped.forEach(item => {
      result.push({
        groupId: null,
        items: [item],
        isGroup: false,
        primaryItem: item
      });
    });

    return result;
  }

  function getDaysOverdue(deadline: string): number {
    const deadlineDate = new Date(deadline);
    const today = new Date();
    const diffTime = today.getTime() - deadlineDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  function getEscalationBadge(item: BillingQueueItem) {
    if (item.escalation_level === 0) return null;

    if (item.escalated_to_admin_at) {
      return (
        <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-bold rounded flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          ESCALATED TO ADMIN
        </span>
      );
    }

    if (item.escalated_to_dispatch_at) {
      return (
        <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs font-bold rounded flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          ESCALATED TO DISPATCH
        </span>
      );
    }

    return null;
  }

  function getStatusBadge(status: string) {
    const badges = {
      ready_for_billing: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Ready' },
      assigned: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Assigned' },
      in_progress: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'In Progress' },
      invoice_created: { bg: 'bg-green-100', text: 'text-green-800', label: 'Invoice Created' },
      invoice_sent: { bg: 'bg-cyan-100', text: 'text-cyan-800', label: 'Invoice Sent' },
      payment_pending: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Payment Pending' },
      paid: { bg: 'bg-green-100', text: 'text-green-800', label: 'Paid' },
      overdue: { bg: 'bg-red-100', text: 'text-red-800', label: 'Overdue' }
    };

    const badge = badges[status as keyof typeof badges] || badges.ready_for_billing;

    return (
      <span className={`px-2 py-1 ${badge.bg} ${badge.text} text-xs font-medium rounded`}>
        {badge.label}
      </span>
    );
  }

  function getWorkOrderTypeBadge(type: string) {
    const typeBadges = {
      project: { bg: 'bg-indigo-100', text: 'text-indigo-800', label: 'Project' },
      service: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Service' },
      site_survey: { bg: 'bg-teal-100', text: 'text-teal-800', label: 'Survey' },
      warranty: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Warranty' },
      punchlist: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Punchlist' },
      vip_program: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'VIP' }
    };

    const badge = typeBadges[type as keyof typeof typeBadges] || { bg: 'bg-gray-100', text: 'text-gray-800', label: type };

    return (
      <span className={`px-2 py-1 ${badge.bg} ${badge.text} text-xs font-medium rounded`}>
        {badge.label}
      </span>
    );
  }

  const queueStats = {
    ready: items.filter(i => i.status === 'ready_for_billing').length,
    assigned: items.filter(i => ['assigned', 'in_progress'].includes(i.status)).length,
    unpaid: items.filter(i => ['invoice_sent', 'payment_pending', 'overdue'].includes(i.status)).length
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading billing queue...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
          Service Billing Queue
        </h2>
        <p className="text-gray-300">
          Manage service billing tasks and invoices
        </p>
      </div>

      {/* Queue Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveQueue('ready')}
            className={`px-4 py-3 border-b-2 font-medium transition-colors relative ${
              activeQueue === 'ready'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Ready for Billing
            {queueStats.ready > 0 && (
              <span className="absolute -top-1 -right-1 px-2 py-0.5 bg-blue-500 text-white text-xs font-bold rounded-full min-w-[1.25rem] text-center">
                {queueStats.ready}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveQueue('assigned')}
            className={`px-4 py-3 border-b-2 font-medium transition-colors relative ${
              activeQueue === 'assigned'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Assigned to Me
            {queueStats.assigned > 0 && (
              <span className="absolute -top-1 -right-1 px-2 py-0.5 bg-purple-500 text-white text-xs font-bold rounded-full min-w-[1.25rem] text-center">
                {queueStats.assigned}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveQueue('unpaid')}
            className={`px-4 py-3 border-b-2 font-medium transition-colors relative ${
              activeQueue === 'unpaid'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            Unpaid Invoices
            {queueStats.unpaid > 0 && (
              <span className="absolute -top-1 -right-1 px-2 py-0.5 bg-orange-500 text-white text-xs font-bold rounded-full min-w-[1.25rem] text-center">
                {queueStats.unpaid}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Filters */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>
          <label className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <Archive className="w-4 h-4" />
            <span className="text-sm">Show Archived</span>
          </label>
        </div>
        <div className="text-sm text-gray-600">
          {items.length} item{items.length !== 1 ? 's' : ''}
        </div>
      </div>

      {showFilters && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Billable By:
              </label>
              <select
                value={filterBillableBy}
                onChange={(e) => setFilterBillableBy(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All</option>
                <option value="admin">Admin</option>
                <option value="dispatch">Dispatch</option>
                <option value="assigned_sales_rep">Sales Rep</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Work Order Type:
              </label>
              <select
                value={filterWorkOrderType}
                onChange={(e) => setFilterWorkOrderType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Types</option>
                <option value="project">Project Related</option>
                <option value="service">Service Call</option>
                <option value="site_survey">Site Survey</option>
                <option value="warranty">Warranty</option>
                <option value="punchlist">Punchlist</option>
                <option value="vip_program">VIP Program</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Queue Items */}
      <div className="space-y-3">
        {groupedItems.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <CheckCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Queue is Empty
            </h3>
            <p className="text-gray-300">
              {activeQueue === 'ready' && 'No jobs waiting for billing'}
              {activeQueue === 'assigned' && 'No billing tasks assigned to you'}
              {activeQueue === 'unpaid' && 'No unpaid invoices'}
            </p>
          </div>
        ) : (
          groupedItems.map(group => {
            const item = group.primaryItem;
            const daysOverdue = item.billing_deadline ? getDaysOverdue(item.billing_deadline) : 0;
            const isOverdue = daysOverdue > 0;
            const isArchived = item.work_order?.is_archived || false;

            return (
              <div
                key={item.id}
                className={`bg-white rounded-lg shadow-sm border-2 p-4 hover:shadow-md transition-all cursor-pointer ${
                  isOverdue ? 'border-red-300 bg-red-50' : isArchived ? 'border-gray-300 bg-gray-50' : 'border-gray-200'
                }`}
                onClick={() => onSelectItem && onSelectItem(item)}
              >
                {group.isGroup && (
                  <div className="mb-3 pb-3 border-b border-blue-200 bg-blue-50 -m-4 p-4 rounded-t-lg">
                    <div className="flex items-center gap-2 text-blue-700">
                      <Link className="w-5 h-5" />
                      <span className="font-semibold">
                        Linked Job Group - {group.items.length} Work Orders
                      </span>
                    </div>
                    <p className="text-sm text-blue-600 mt-1">
                      These work orders are linked together for a multi-tech or multi-day job. Bill them together.
                    </p>
                  </div>
                )}

                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900">
                        {group.isGroup ? (
                          <>
                            {group.items.map((i, idx) => (
                              <span key={i.id}>
                                WO #{i.work_order?.work_order_number || 'N/A'}
                                {idx < group.items.length - 1 && ', '}
                              </span>
                            ))}
                          </>
                        ) : (
                          `WO #${item.work_order?.work_order_number || 'N/A'}`
                        )}
                      </h3>
                      {getStatusBadge(item.status)}
                      {item.work_order?.type && getWorkOrderTypeBadge(item.work_order.type)}
                      {getEscalationBadge(item)}
                      {isArchived && (
                        <span className="px-2 py-1 bg-gray-200 text-gray-700 text-xs font-medium rounded flex items-center gap-1">
                          <Archive className="w-3 h-3" />
                          Archived
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mb-2">
                      {item.contact?.full_name || item.contact?.company_name || 'Unknown Customer'}
                    </p>
                    <p className="text-sm text-gray-700">
                      {item.work_order?.description || 'No description'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Calendar className="w-4 h-4" />
                    <span>
                      Completed: {new Date(item.completed_at).toLocaleDateString()}
                    </span>
                  </div>

                  {item.assigned_to_user_id && (
                    <div className="flex items-center gap-2 text-gray-600">
                      <User className="w-4 h-4" />
                      <span>{item.assigned_user?.full_name || 'Assigned'}</span>
                    </div>
                  )}

                  {item.work_order?.billable_type && (
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4" />
                      <span className={`font-medium ${
                        item.work_order.billable_type === 'warranty'
                          ? 'text-blue-600'
                          : 'text-green-600'
                      }`}>
                        {item.work_order.billable_type === 'warranty' ? 'Warranty' : 'Billable'}
                      </span>
                    </div>
                  )}

                  {item.billing_deadline && (
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      <span className={isOverdue ? 'text-red-600 font-bold' : 'text-gray-600'}>
                        {isOverdue
                          ? `${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} overdue`
                          : `Due: ${new Date(item.billing_deadline).toLocaleDateString()}`
                        }
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    Billable by: <span className="font-medium text-gray-900">
                      {item.billable_by.replace('_', ' ')}
                    </span>
                  </div>
                  <button className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-1 text-sm">
                    <Eye className="w-4 h-4" />
                    View Details
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Summary Stats */}
      {items.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <Clock className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-sm text-gray-600">Total Items</p>
                <p className="text-2xl font-bold text-blue-600">{items.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-8 h-8 text-orange-600" />
              <div>
                <p className="text-sm text-gray-600">Overdue</p>
                <p className="text-2xl font-bold text-orange-600">
                  {items.filter(i => i.billing_deadline && getDaysOverdue(i.billing_deadline) > 0).length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-red-600" />
              <div>
                <p className="text-sm text-gray-600">Escalated</p>
                <p className="text-2xl font-bold text-red-600">
                  {items.filter(i => i.escalation_level > 0).length}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
