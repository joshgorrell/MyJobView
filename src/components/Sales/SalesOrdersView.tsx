import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { FileText, DollarSign, Calendar, User, Search, CheckCircle, Clock, AlertCircle, ChevronRight, Building2, X } from 'lucide-react';
import { SalesOrderDetail } from './SalesOrderDetail';
import { ErrorBoundary } from '../Shared/ErrorBoundary';
import { ContactQuickViewModal } from '../Shared/ContactQuickViewModal';

interface InvoiceSummary {
  amount_due: number;
}

interface SalesOrder {
  id: string;
  order_number: string;
  status: 'pending_deposit' | 'pending_po' | 'planning' | 'active' | 'complete' | 'closed';
  contract_total: number;
  payment_terms: string;
  notes: string;
  created_at: string;
  updated_at: string;
  sales_rep_id: string | null;
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
  sales_rep?: { id?: string; full_name: string } | null;
  invoices?: InvoiceSummary[];
}

interface SalesOrdersViewProps {
  openOrderId?: string | null;
  onOrderOpened?: () => void;
  onRevertToProposal?: (proposalId: string) => void;
  officeIdFilter?: string | null;
  onClearOfficeFilter?: () => void;
  officeNameFilter?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string; icon: typeof Clock }> = {
  pending_deposit: { label: 'Pending Deposit', color: 'bg-yellow-900/40 text-yellow-400 border border-yellow-700/40', dot: 'bg-yellow-400', icon: DollarSign },
  pending_po:      { label: 'Pending PO',      color: 'bg-orange-900/40 text-orange-400 border border-orange-700/40', dot: 'bg-orange-400', icon: Clock },
  planning:        { label: 'Planning',         color: 'bg-blue-900/40 text-blue-400 border border-blue-700/40', dot: 'bg-blue-400', icon: Clock },
  active:          { label: 'Active',           color: 'bg-green-900/40 text-green-400 border border-green-700/40', dot: 'bg-green-400', icon: CheckCircle },
  complete:        { label: 'Complete',         color: 'bg-gray-700/60 text-gray-300 border border-gray-600/40', dot: 'bg-gray-400', icon: CheckCircle },
  closed:          { label: 'Closed',           color: 'bg-gray-700/40 text-gray-500 border border-gray-600/30', dot: 'bg-gray-600', icon: AlertCircle },
};
const DEFAULT_STATUS = { label: 'Unknown', color: 'bg-gray-700 text-gray-400 border border-gray-600/40', dot: 'bg-gray-500', icon: AlertCircle };

function getBalanceDue(order: SalesOrder): number {
  if (!order.invoices || order.invoices.length === 0) {
    return order.contract_total || 0;
  }
  return order.invoices.reduce((sum, inv) => sum + (inv.amount_due || 0), 0);
}

export function SalesOrdersView({ openOrderId, onOrderOpened, onRevertToProposal, officeIdFilter, onClearOfficeFilter, officeNameFilter }: SalesOrdersViewProps = {}) {
  const { profile } = useAuth();
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedRepId, setSelectedRepId] = useState<string | null>(null);
  const [quickViewContactId, setQuickViewContactId] = useState<string | null>(null);

  const isAdminOrManager = ['admin', 'manager', 'sales_manager'].includes(profile?.role || '');

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

      let query = supabase
        .from('sales_orders')
        .select(`
          *,
          contact:contacts(id, full_name, email, phone),
          proposal:proposals!sales_orders_proposal_id_fkey(id, proposal_number, title, approved_at),
          sales_rep:profiles!sales_orders_sales_rep_id_fkey(id, full_name),
          invoices!invoices_sales_order_id_fkey(amount_due)
        `)
        .order('created_at', { ascending: false });

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

  // Unique reps from loaded orders for the rep selector
  const salesReps = (() => {
    const seen = new Set<string>();
    const reps: { id: string; full_name: string }[] = [];
    for (const o of orders) {
      if (o.sales_rep && o.sales_rep_id && !seen.has(o.sales_rep_id)) {
        seen.add(o.sales_rep_id);
        reps.push({ id: o.sales_rep_id, full_name: o.sales_rep.full_name });
      }
    }
    return reps.sort((a, b) => a.full_name.localeCompare(b.full_name));
  })();

  const filteredOrders = orders.filter(order => {
    const matchesSearch =
      order.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.contact?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.proposal?.title?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    const matchesRep = !selectedRepId || order.sales_rep_id === selectedRepId;
    const matchesOffice = !officeIdFilter || (order as any).office_id === officeIdFilter;
    return matchesSearch && matchesStatus && matchesRep && matchesOffice;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400 text-sm">Loading sales orders...</div>
      </div>
    );
  }

  if (selectedOrderId) {
    return (
      <ErrorBoundary
        key={selectedOrderId}
        fallback={(error) => (
          <div className="text-center py-16 px-4">
            <p className="text-gray-400 mb-2">Something went wrong loading this sales order.</p>
            {error?.message && (
              <p className="text-red-400 text-xs font-mono mb-4 max-w-lg mx-auto break-all bg-gray-800/60 rounded-lg px-3 py-2">
                {error.message}
              </p>
            )}
            <button
              onClick={() => setSelectedOrderId(null)}
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              &larr; Back to Sales Orders
            </button>
          </div>
        )}
      >
        <SalesOrderDetail
          orderId={selectedOrderId}
          onBack={() => setSelectedOrderId(null)}
          onRevertToProposal={onRevertToProposal}
        />
      </ErrorBoundary>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white mb-0.5">Sales Orders</h1>
          <p className="text-gray-400 text-sm hidden sm:block">Approved proposals converted to active sales orders</p>
          {filteredOrders.length > 0 && (
            <p className="text-gray-500 text-xs sm:hidden">{filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''}</p>
          )}
        </div>
      </div>

      {/* Office filter banner */}
      {officeIdFilter && (
        <div className="flex items-center gap-3 px-4 py-3 bg-blue-900/30 border border-blue-700/40 rounded-lg text-sm">
          <Building2 className="w-4 h-4 text-blue-400 flex-shrink-0" />
          <span className="text-blue-300 flex-1">
            Showing orders for <span className="font-semibold text-blue-200">{officeNameFilter || 'selected office'}</span>
          </span>
          {onClearOfficeFilter && (
            <button
              onClick={onClearOfficeFilter}
              className="flex items-center gap-1.5 text-blue-400 hover:text-blue-200 transition-colors text-xs font-medium"
            >
              <X className="w-3.5 h-3.5" />
              Clear filter
            </button>
          )}
        </div>
      )}

      {/* Search + Status filter */}
      <div className="flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search orders, customers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm min-h-[44px]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm min-h-[44px] max-w-[140px] sm:max-w-none"
        >
          <option value="all">All Statuses</option>
          <option value="pending_deposit">Pend. Deposit</option>
          <option value="pending_po">Pending PO</option>
          <option value="planning">Planning</option>
          <option value="active">Active</option>
          <option value="complete">Complete</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {/* Rep selector — admin / manager / sales_manager only */}
      {isAdminOrManager && salesReps.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSelectedRepId(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              selectedRepId === null
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            All Reps
          </button>
          {salesReps.map(rep => (
            <button
              key={rep.id}
              onClick={() => setSelectedRepId(rep.id === selectedRepId ? null : rep.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                selectedRepId === rep.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {rep.full_name.split(' ')[0]}
            </button>
          ))}
        </div>
      )}

      {/* Orders list */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700/60 overflow-hidden">
        {filteredOrders.length === 0 ? (
          <div className="p-8 sm:p-12 text-center">
            <FileText className="w-10 h-10 text-gray-600 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-white mb-1">No Sales Orders Found</h3>
            <p className="text-gray-400 text-sm">
              {searchTerm || statusFilter !== 'all' || selectedRepId
                ? 'No sales orders match your current filters'
                : 'Sales orders will appear here when proposals are approved'}
            </p>
          </div>
        ) : (
          <>
            {/* Mobile card view */}
            <div className="sm:hidden divide-y divide-gray-700/40">
              {filteredOrders.map((order) => {
                const cfg = STATUS_CONFIG[order.status] || DEFAULT_STATUS;
                const StatusIcon = cfg.icon;
                const approvedAt = order.proposal?.approved_at
                  ? new Date(order.proposal.approved_at).toLocaleDateString()
                  : null;
                const displayDate = approvedAt || new Date(order.created_at).toLocaleDateString();
                const dateLabel = approvedAt ? 'Approved' : 'Created';
                const repName = order.sales_rep?.full_name || order.created_by_name;
                const balanceDue = getBalanceDue(order);

                return (
                  <div
                    key={order.id}
                    onClick={() => setSelectedOrderId(order.id)}
                    className="p-4 hover:bg-gray-700/30 active:bg-gray-700/60 cursor-pointer transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-1.5">
                        <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex-1 min-w-0">
                            {order.contact?.id ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); setQuickViewContactId(order.contact.id); }}
                                className="font-semibold text-blue-400 hover:text-blue-300 text-sm leading-tight truncate block text-left max-w-full transition-colors"
                              >
                                {order.contact.full_name}
                              </button>
                            ) : (
                              <div className="font-semibold text-white text-sm leading-tight truncate">{order.contact?.full_name || 'Unknown'}</div>
                            )}
                            {order.proposal?.title && (
                              <div className="text-gray-400 text-xs truncate mt-0.5">{order.proposal.title}</div>
                            )}
                            <div className="text-gray-600 text-xs font-mono mt-0.5">SO-{order.order_number}</div>
                          </div>
                          <div className="flex-shrink-0 text-right">
                            <div className="font-bold text-white text-sm">${(order.contract_total ?? 0).toLocaleString()}</div>
                            {balanceDue > 0 && (
                              <div className="text-amber-400 text-xs mt-0.5">Due: ${balanceDue.toLocaleString()}</div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-1.5">
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            {repName && (
                              <span className="flex items-center gap-1">
                                <User className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate max-w-[110px]">{repName}</span>
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 flex-shrink-0" />
                              <span>{displayDate}</span>
                            </span>
                          </div>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
                            <StatusIcon className="w-3 h-3" />
                            {cfg.label}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table view */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="border-b border-gray-700/60 text-xs text-gray-500 uppercase tracking-wider">
                    <th className="text-left px-4 py-3 font-medium">Customer / Proposal</th>
                    <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Rep</th>
                    <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Date</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-right px-4 py-3 font-medium">Total</th>
                    <th className="text-right px-4 py-3 font-medium hidden md:table-cell whitespace-nowrap">Balance Due</th>
                    <th className="px-3 py-3 w-6" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/30">
                  {filteredOrders.map((order) => {
                    const cfg = STATUS_CONFIG[order.status] || DEFAULT_STATUS;
                    const StatusIcon = cfg.icon;
                    const approvedAt = order.proposal?.approved_at
                      ? new Date(order.proposal.approved_at).toLocaleDateString()
                      : null;
                    const displayDate = approvedAt || new Date(order.created_at).toLocaleDateString();
                    const dateLabel = approvedAt ? 'Approved' : 'Created';
                    const repName = order.sales_rep?.full_name || order.created_by_name;
                    const balanceDue = getBalanceDue(order);

                    return (
                      <tr
                        key={order.id}
                        onClick={() => setSelectedOrderId(order.id)}
                        className="hover:bg-gray-700/30 cursor-pointer transition-colors group"
                      >
                        {/* Customer / Proposal cell with left status bar */}
                        <td className="px-0 py-0">
                          <div className="flex items-stretch min-h-[60px]">
                            <div className={`w-1 flex-shrink-0 ${cfg.dot}`} />
                            <div className="px-4 py-3 min-w-0 flex-1">
                              {order.contact?.id ? (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setQuickViewContactId(order.contact.id); }}
                                  className="font-semibold text-blue-400 hover:text-blue-300 text-sm leading-tight truncate block text-left max-w-[200px] md:max-w-[280px] lg:max-w-xs transition-colors"
                                >
                                  {order.contact.full_name}
                                </button>
                              ) : (
                                <div className="font-semibold text-white text-sm leading-tight truncate max-w-[200px] md:max-w-[280px] lg:max-w-xs">
                                  {order.contact?.full_name || 'Unknown'}
                                </div>
                              )}
                              {order.proposal?.title && (
                                <div className="text-gray-400 text-xs truncate max-w-[200px] md:max-w-[280px] lg:max-w-xs mt-0.5">
                                  {order.proposal.title}
                                </div>
                              )}
                              <div className="text-gray-600 text-xs font-mono mt-0.5">SO-{order.order_number}</div>
                            </div>
                          </div>
                        </td>

                        {/* Rep */}
                        <td className="px-4 py-3 hidden lg:table-cell whitespace-nowrap">
                          {repName
                            ? <span className="text-gray-300 text-sm">{repName}</span>
                            : <span className="text-gray-600 text-xs">—</span>
                          }
                        </td>

                        {/* Date */}
                        <td className="px-4 py-3 hidden md:table-cell whitespace-nowrap">
                          <div className="text-gray-300 text-sm">{displayDate}</div>
                          <div className="text-gray-600 text-xs mt-0.5">{dateLabel}</div>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
                            <StatusIcon className="w-3 h-3 flex-shrink-0" />
                            <span className="hidden md:inline">{cfg.label}</span>
                            <span className="md:hidden">{cfg.label.split(' ')[0]}</span>
                          </span>
                        </td>

                        {/* Total */}
                        <td className="px-4 py-3 text-right font-semibold text-white whitespace-nowrap">
                          ${(order.contract_total ?? 0).toLocaleString()}
                        </td>

                        {/* Balance Due */}
                        <td className="px-4 py-3 text-right hidden md:table-cell whitespace-nowrap">
                          {balanceDue > 0
                            ? <span className="text-amber-400 font-medium">${balanceDue.toLocaleString()}</span>
                            : <span className="text-gray-600">—</span>
                          }
                        </td>

                        {/* Chevron */}
                        <td className="px-3 py-3 text-gray-600 group-hover:text-gray-400 transition-colors">
                          <ChevronRight className="w-4 h-4" />
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

      {/* Count footer */}
      {filteredOrders.length > 0 && (
        <p className="text-gray-600 text-xs text-right">
          {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''}
          {orders.length !== filteredOrders.length && ` (filtered from ${orders.length})`}
        </p>
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
