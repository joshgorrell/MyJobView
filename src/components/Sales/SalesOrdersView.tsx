import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { FileText, DollarSign, Calendar, User, ExternalLink, Filter, Search, Plus, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { SalesOrderDetail } from './SalesOrderDetail';

interface SalesOrder {
  id: string;
  order_number: string;
  status: 'pending_deposit' | 'pending_po' | 'planning' | 'active' | 'complete' | 'closed';
  contract_total: number;
  payment_terms: string;
  notes: string;
  created_at: string;
  updated_at: string;
  contact: {
    id: string;
    full_name: string;
    email: string;
    phone: string;
  };
  proposal: {
    id: string;
    proposal_number: string;
    title: string;
    approved_at: string | null;
  };
  created_by_name: string;
  sales_rep?: { full_name: string } | null;
}

interface SalesOrdersViewProps {
  openOrderId?: string | null;
  onOrderOpened?: () => void;
  onRevertToProposal?: (proposalId: string) => void;
}

export function SalesOrdersView({ openOrderId, onOrderOpened, onRevertToProposal }: SalesOrdersViewProps = {}) {
  const { profile } = useAuth();
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (profile) fetchSalesOrders();
  }, [profile?.id]);

  useEffect(() => {
    if (openOrderId && !selectedOrderId) {
      setSelectedOrderId(openOrderId);
      onOrderOpened?.();
    }
  }, [openOrderId, selectedOrderId, onOrderOpened]);

  async function fetchSalesOrders() {
    if (!profile) return;
    try {
      setLoading(true);
      const isAdminOrManager = profile.role === 'admin' || profile.role === 'manager';

      let query = supabase
        .from('sales_orders')
        .select(`
          *,
          contact:contacts(id, full_name, email, phone),
          proposal:proposals!sales_orders_proposal_id_fkey(id, proposal_number, title, approved_at),
          sales_rep:profiles!sales_orders_sales_rep_id_fkey(full_name)
        `)
        .order('created_at', { ascending: false });

      // Non-admin/manager users only see orders they own (as sales rep) or created
      if (!isAdminOrManager) {
        query = query.or(`sales_rep_id.eq.${profile.id},created_by.eq.${profile.id}`);
      }

      const { data, error } = await query;
      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching sales orders:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredOrders = orders.filter(order => {
    const matchesSearch =
      order.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.contact?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.proposal?.title?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
    pending_deposit: { label: 'Pending Deposit', color: 'bg-yellow-900/40 text-yellow-400', icon: DollarSign },
    pending_po: { label: 'Pending PO', color: 'bg-orange-900/40 text-orange-400', icon: Clock },
    planning: { label: 'Planning', color: 'bg-blue-900/40 text-blue-400', icon: Clock },
    active: { label: 'Active', color: 'bg-green-900/40 text-green-400', icon: CheckCircle },
    complete: { label: 'Complete', color: 'bg-gray-700 text-gray-300', icon: CheckCircle },
    closed: { label: 'Closed', color: 'bg-gray-700 text-gray-400', icon: AlertCircle }
  };

  const defaultStatusConfig = { label: 'Unknown', color: 'bg-gray-100 text-gray-700', icon: AlertCircle };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Loading sales orders...</div>
      </div>
    );
  }

  if (selectedOrderId) {
    return (
      <SalesOrderDetail
        orderId={selectedOrderId}
        onBack={() => setSelectedOrderId(null)}
        onRevertToProposal={onRevertToProposal}
      />
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white mb-0.5">Sales Orders</h1>
          <p className="text-gray-400 text-sm hidden sm:block">Approved proposals converted to active sales orders</p>
          {filteredOrders.length > 0 && (
            <p className="text-gray-500 text-xs sm:hidden">{filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search orders, customers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm min-h-[44px]"
          />
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm min-h-[44px] max-w-[140px] sm:max-w-none"
          >
            <option value="all">All</option>
            <option value="pending_deposit">Pend. Deposit</option>
            <option value="pending_po">Pending PO</option>
            <option value="planning">Planning</option>
            <option value="active">Active</option>
            <option value="complete">Complete</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        {filteredOrders.length === 0 ? (
          <div className="p-8 sm:p-12 text-center">
            <FileText className="w-10 h-10 text-gray-600 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-white mb-1">No Sales Orders Found</h3>
            <p className="text-gray-400 text-sm">
              {searchTerm || statusFilter !== 'all'
                ? 'No sales orders match your search criteria'
                : 'Sales orders will appear here when proposals are approved'}
            </p>
          </div>
        ) : (
          <>
            {/* Mobile card view */}
            <div className="sm:hidden divide-y divide-gray-700/50">
              {filteredOrders.map((order) => {
                const config = statusConfig[order.status] || defaultStatusConfig;
                const StatusIcon = config.icon;
                const approvedAt = order.proposal?.approved_at
                  ? new Date(order.proposal.approved_at).toLocaleDateString()
                  : null;
                const createdAtMobile = new Date(order.created_at).toLocaleDateString();
                const displayDateMobile = approvedAt || createdAtMobile;
                const dateLabelMobile = approvedAt ? 'Approved' : 'Created';
                return (
                  <div
                    key={order.id}
                    onClick={() => setSelectedOrderId(order.id)}
                    className="p-4 hover:bg-gray-700/40 active:bg-gray-700/70 cursor-pointer transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-white text-sm leading-snug break-words">{order.contact?.full_name || 'Unknown'}</div>
                        {order.proposal?.title && (
                          <div className="text-gray-300 text-xs truncate mt-0.5 leading-snug">{order.proposal.title}</div>
                        )}
                        <div className="text-gray-500 text-xs font-mono mt-0.5">#{order.order_number}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className="font-bold text-white text-sm whitespace-nowrap">${(order.contract_total ?? 0).toLocaleString()}</span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${config.color}`}>
                          <StatusIcon className="w-3 h-3" />
                          {config.label}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                      {(order.sales_rep?.full_name || order.created_by_name) && (
                        <span className="flex items-center gap-1 truncate">
                          <User className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate max-w-[120px]">{order.sales_rep?.full_name || order.created_by_name}</span>
                        </span>
                      )}
                      <span className="flex items-center gap-1 whitespace-nowrap">
                        <Calendar className="w-3 h-3 flex-shrink-0" />
                        {displayDateMobile}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table view */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm min-w-[400px]">
                <thead>
                  <tr className="border-b border-gray-700 text-xs text-gray-400 uppercase tracking-wide">
                    <th className="text-left px-4 py-3 font-medium">Customer / Proposal</th>
                    <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Rep</th>
                    <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Date</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-right px-4 py-3 font-medium whitespace-nowrap">Total</th>
                    <th className="px-3 py-3 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {filteredOrders.map((order) => {
                    const config = statusConfig[order.status] || defaultStatusConfig;
                    const StatusIcon = config.icon;
                    const approvedAt = order.proposal?.approved_at
                      ? new Date(order.proposal.approved_at).toLocaleDateString()
                      : null;
                    const createdAt = new Date(order.created_at).toLocaleDateString();
                    const displayDate = approvedAt || createdAt;
                    const dateLabel = approvedAt ? 'Approved' : 'Created';
                    return (
                      <tr
                        key={order.id}
                        onClick={() => setSelectedOrderId(order.id)}
                        className="hover:bg-gray-700/40 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 min-w-0">
                          <div className="font-bold text-white leading-tight truncate max-w-[200px] md:max-w-[260px] lg:max-w-xs">{order.contact?.full_name || 'Unknown'}</div>
                          {order.proposal?.title && (
                            <div className="text-gray-400 text-xs truncate max-w-[200px] md:max-w-[260px] lg:max-w-xs mt-0.5">{order.proposal.title}</div>
                          )}
                          <div className="text-gray-600 text-xs font-mono mt-0.5">SO #{order.order_number}</div>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell whitespace-nowrap">
                          {(order.sales_rep?.full_name || order.created_by_name)
                            ? <span className="text-gray-300 text-sm">{order.sales_rep?.full_name || order.created_by_name}</span>
                            : <span className="text-gray-600 text-xs">—</span>
                          }
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell whitespace-nowrap">
                          <div className="text-gray-300 text-sm">{displayDate}</div>
                          <div className="text-gray-600 text-xs mt-0.5">{dateLabel}</div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
                            <StatusIcon className="w-3 h-3 flex-shrink-0" />
                            <span className="hidden sm:inline">{config.label}</span>
                            <span className="sm:hidden">{config.label.split(' ')[0]}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-white whitespace-nowrap">
                          ${(order.contract_total ?? 0).toLocaleString()}
                        </td>
                        <td className="px-3 py-3 text-gray-500">
                          <ExternalLink className="w-4 h-4" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
