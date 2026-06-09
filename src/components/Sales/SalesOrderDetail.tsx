import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { ArrowLeft, DollarSign, GitBranch, FolderOpen, BarChart3, Activity, Percent, Clock, CheckCircle, AlertCircle, User, Calendar, Layers, RotateCcw, X, Award, CheckCircle2, AlignLeft, Package } from 'lucide-react';
import { SalesOrderBillingTab } from './SalesOrderBillingTab';
import { SalesOrderChangeOrdersTab } from './SalesOrderChangeOrdersTab';
import { SalesOrderProjectTab } from './SalesOrderProjectTab';
import { SalesOrderReportsTab } from './SalesOrderReportsTab';
import { SalesOrderStatsTab } from './SalesOrderStatsTab';
import { SalesOrderCommissionsTab } from './SalesOrderCommissionsTab';
import { SalesOrderScopeTab } from './SalesOrderScopeTab';
import { SalesOrderPrimaryScopeTab } from './SalesOrderPrimaryScopeTab';
import { SalesOrderProductsTab } from './SalesOrderProductsTab';
import { TestTuneStatusPanel } from './TestTuneStatusPanel';
import { CompleteSalesOrderModal } from './CompleteSalesOrderModal';
import { ErrorBoundary } from '../Shared/ErrorBoundary';

export interface SalesOrderFull {
  id: string;
  order_number: string;
  status: 'pending_deposit' | 'pending_po' | 'planning' | 'active' | 'complete' | 'closed';
  contract_total: number;
  original_contract_total: number;
  payment_terms: string;
  notes: string;
  created_at: string;
  updated_at: string;
  contact_id: string;
  proposal_id: string;
  company_id: string;
  organization_id: string;
  contact: {
    id: string;
    full_name: string;
    company_name: string;
    email: string;
    phone: string;
    tax_rate?: number;
    default_payment_terms?: string;
  };
  proposal: {
    id: string;
    proposal_number: string;
    title: string;
    tax_environment?: string;
    tax_project_type?: string;
  };
  project?: {
    id: string;
    project_number: string;
    name: string;
    status: string;
    assigned_pm: string | null;
    start_date: string | null;
    target_completion_date: string | null;
    substantial_completion_date: string | null;
    notes: string | null;
    internal_notes: string | null;
    job_site_address: any;
    pm?: { id: string; full_name: string } | null;
  } | null;
  created_by_name: string;
  test_tune_status?: string | null;
}

export interface ChangeOrderSummary {
  id: string;
  change_order_number: string;
  title: string;
  description?: string;
  type: string;
  status: string;
  is_active: boolean;
  is_locked: boolean;
  is_billable: boolean;
  show_on_report: boolean;
  change_amount: number;
  tax_amount: number;
  new_contract_total: number;
  original_contract_amount: number;
  billing_status: string;
  amount_billed: number;
  created_at: string;
  approval_date: string | null;
  approval_notes?: string | null;
  approved_by_name?: string | null;
  notes?: string | null;
  requester?: { full_name: string };
  approver?: { full_name: string };
}

type TabType = 'scope' | 'primary_scope' | 'products' | 'billing' | 'change_orders' | 'project' | 'reports' | 'stats' | 'commissions';

interface SalesOrderDetailProps {
  orderId: string;
  onBack: () => void;
  onRevertToProposal?: (proposalId: string) => void;
  isStandalone?: boolean;
  initialTab?: TabType;
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending_deposit: { label: 'Pending Deposit', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: DollarSign },
  pending_po: { label: 'Pending PO', color: 'bg-orange-500/20 text-orange-400 border-orange-500/30', icon: Clock },
  planning: { label: 'Planning', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: Clock },
  active: { label: 'Active', color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: CheckCircle },
  complete: { label: 'Complete', color: 'bg-teal-500/20 text-teal-400 border-teal-500/30', icon: CheckCircle },
  closed: { label: 'Closed', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30', icon: AlertCircle }
};

export function SalesOrderDetail({ orderId, onBack, onRevertToProposal, isStandalone = false, initialTab }: SalesOrderDetailProps) {
  const { profile } = useAuth();
  const [order, setOrder] = useState<SalesOrderFull | null>(null);
  const [changeOrders, setChangeOrders] = useState<ChangeOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>(initialTab ?? 'scope');
  const [showCommissions, setShowCommissions] = useState(false);
  const [showRevertModal, setShowRevertModal] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [revertError, setRevertError] = useState<string | null>(null);
  const [showCompleteModal, setShowCompleteModal] = useState(false);

  const isAdmin = profile?.role === 'admin' || profile?.role === 'manager' || profile?.role === 'finance';

  useEffect(() => {
    loadOrder();
    loadChangeOrders();
    loadCommissionEligibility();

    const channel = supabase
      .channel(`so-detail-${orderId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'change_orders', filter: `sales_order_id=eq.${orderId}` }, () => {
        loadChangeOrders();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices', filter: `sales_order_id=eq.${orderId}` }, () => {
        loadChangeOrders();
      })
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [orderId]);

  async function loadCommissionEligibility() {
    if (isAdmin) {
      setShowCommissions(true);
      return;
    }
    if (!profile?.id) return;
    try {
      const { data } = await supabase
        .from('employee_commission_config')
        .select('eligible_for_commissions')
        .eq('employee_id', profile.id)
        .maybeSingle();
      setShowCommissions(data?.eligible_for_commissions === true);
    } catch {
      setShowCommissions(false);
    }
  }

  async function loadOrder() {
    try {
      const { data, error } = await supabase
        .from('sales_orders')
        .select(`
          *,
          contact:contacts(id, full_name, company_name, email, phone, tax_rate, default_payment_terms),
          proposal:proposals!sales_orders_proposal_id_fkey(id, proposal_number, title, tax_environment, tax_project_type),
          project:projects!projects_sales_order_id_fkey(
            id, project_number, name, status, assigned_pm,
            start_date, target_completion_date, substantial_completion_date,
            notes, internal_notes, job_site_address
          )
        `)
        .eq('id', orderId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        // projects!projects_sales_order_id_fkey returns an array (one-to-many),
        // normalise to a single object or null
        if (Array.isArray(data.project)) {
          data.project = data.project[0] ?? null;
        }

        if (data?.project?.assigned_pm) {
          const { data: pmData } = await supabase
            .from('profiles')
            .select('id, full_name')
            .eq('id', data.project.assigned_pm)
            .maybeSingle();
          if (pmData) {
            data.project.pm = pmData;
          }
        }
      }

      setOrder(data);
    } catch (error) {
      console.error('Error loading sales order:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadChangeOrders() {
    try {
      const { data, error } = await supabase
        .from('change_orders')
        .select(`
          id, change_order_number, title, description, type, status, is_active, is_locked, is_billable, show_on_report,
          change_amount, tax_amount, new_contract_total, original_contract_amount, billing_status, amount_billed, created_at, approval_date, approval_notes, approved_by_name, notes,
          requester:profiles!change_orders_requested_by_fkey(full_name),
          approver:profiles!change_orders_approved_by_fkey(full_name)
        `)
        .eq('sales_order_id', orderId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setChangeOrders(data || []);
    } catch (error) {
      console.error('Error loading change orders:', error);
    }
  }

  async function revertToProposal() {
    if (!order) return;
    try {
      setReverting(true);
      setRevertError(null);

      const hasChangeOrders = changeOrders.length > 0;
      if (hasChangeOrders) {
        setRevertError('This sales order has change orders and cannot be reverted. Delete all change orders first.');
        setReverting(false);
        return;
      }

      const proposalId = order.proposal_id;

      const { error: proposalError } = await supabase
        .from('proposals')
        .update({ status: 'designing', sales_order_id: null })
        .eq('id', proposalId);

      if (proposalError) throw proposalError;

      await supabase
        .from('invoices')
        .delete()
        .eq('sales_order_id', order.id);

      const { error: deleteError } = await supabase
        .from('sales_orders')
        .delete()
        .eq('id', order.id);

      if (deleteError) throw deleteError;

      if (onRevertToProposal && proposalId) {
        onRevertToProposal(proposalId);
      } else {
        onBack();
      }
    } catch (err: any) {
      setRevertError(err.message || 'Failed to revert sales order');
      setReverting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400">Sales order not found.</p>
        <button onClick={onBack} className="mt-4 text-blue-400 hover:text-blue-300">Go back</button>
      </div>
    );
  }

  const approvedCOs = changeOrders.filter(co => co.status === 'approved');
  const totalChangeAmount = approvedCOs.reduce((sum, co) => sum + (co.change_amount || 0), 0);
  const adjustedTotal = (order.contract_total || 0) + totalChangeAmount;
  const coCount = changeOrders.length;
  const cfg = statusConfig[order.status] || statusConfig.planning;
  const StatusIcon = cfg.icon;

  const tabs: { id: TabType; label: string; icon: typeof DollarSign; badge?: string }[] = [
    { id: 'scope', label: 'Sales Order', icon: Layers },
    { id: 'primary_scope', label: 'Scope', icon: AlignLeft },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'billing', label: 'Billing', icon: DollarSign },
    { id: 'change_orders', label: 'Change Orders', icon: GitBranch, badge: coCount > 0 ? String(coCount) : undefined },
    { id: 'project', label: 'Project', icon: FolderOpen },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'stats', label: 'Stats', icon: Activity },
    ...(showCommissions ? [{ id: 'commissions' as TabType, label: 'Commissions', icon: Percent }] : []),
  ];

  return (
    <div className="space-y-0">
      <div className="bg-gray-800 rounded-t-lg border border-gray-700 border-b-0 px-4 sm:px-5 pt-3 pb-3">
        {/* Single compact row: back | title + status + meta | total + actions */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Back / close */}
          <button
            onClick={isStandalone ? () => window.close() : onBack}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors flex-shrink-0"
          >
            {isStandalone ? <X className="w-3.5 h-3.5" /> : <ArrowLeft className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isStandalone ? 'Close' : 'Back'}</span>
          </button>

          <div className="w-px h-4 bg-gray-700 flex-shrink-0" />

          {/* Title + status + meta stacked */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-lg font-bold text-white leading-tight">
                {order.proposal?.title || `SO #${order.order_number}`}
              </h1>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border flex-shrink-0 ${cfg.color}`}>
                <StatusIcon className="w-3 h-3" />
                <span>{cfg.label}</span>
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5 flex-wrap">
              <span className="font-medium">SO #{order.order_number}</span>
              {order.proposal?.proposal_number && <span>Prop #{order.proposal.proposal_number}</span>}
              {order.contact?.full_name && (
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {order.contact.full_name}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {new Date(order.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>

          {/* Total */}
          <div className="flex-shrink-0 text-right">
            <div className="text-[10px] text-gray-500 leading-none mb-0.5">
              {totalChangeAmount !== 0 ? 'Adjusted Total' : 'Contract Total'}
            </div>
            <div className="text-base sm:text-xl font-bold text-white tabular-nums leading-none">
              ${adjustedTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            {totalChangeAmount !== 0 && (
              <div className={`text-[10px] mt-0.5 leading-none ${totalChangeAmount > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {totalChangeAmount > 0 ? '+' : ''}${totalChangeAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} COs
              </div>
            )}
          </div>

          {/* Action badges + buttons */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {order.test_tune_status === 'active' && (
              <span className="hidden sm:flex items-center gap-1 px-2 py-1 text-xs text-cyan-400 bg-cyan-500/10 border border-cyan-700/40 rounded-lg">
                <Award className="w-3 h-3" />T&amp;T
              </span>
            )}
            {order.test_tune_status === 'paused' && (
              <span className="hidden sm:flex items-center gap-1 px-2 py-1 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-700/40 rounded-lg">
                <Award className="w-3 h-3" />T&amp;T
              </span>
            )}
            {(order.status === 'active' || order.status === 'planning') && isAdmin && (
              <button
                onClick={() => setShowCompleteModal(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-green-400 hover:text-green-300 bg-green-500/10 hover:bg-green-500/20 border border-green-700/50 hover:border-green-600 rounded-lg transition-colors font-medium"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Complete</span>
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => setShowRevertModal(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-500 hover:text-orange-400 hover:border-orange-700/50 border border-gray-700 rounded-lg transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                <span className="hidden sm:inline">Revert</span>
              </button>
            )}
          </div>
        </div>

      </div>

      {['active', 'paused', 'completed'].includes(order.test_tune_status ?? '') && (
        <div className="bg-gray-800 border-x border-gray-700 px-4 sm:px-6 py-3 sm:py-4">
          <TestTuneStatusPanel
            salesOrderId={orderId}
            salesOrderStatus={order.status}
            onUpdate={loadOrder}
          />
        </div>
      )}

      <div className="bg-gray-800/50 border-x border-gray-700 px-1 relative">
        <div className="flex gap-0.5 overflow-x-auto scrollbar-hide pb-px">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                title={tab.label}
                className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-3 text-xs sm:text-sm font-medium whitespace-nowrap border-b-2 transition-colors flex-shrink-0 min-h-[44px] ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-600'
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="hidden sm:inline">{tab.label}</span>
                {tab.badge && (
                  <span className="ml-0.5 px-1.5 py-0.5 bg-gray-700 text-gray-300 rounded-full text-xs leading-none">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-gray-800 rounded-b-lg border border-gray-700 border-t-0 p-3 sm:p-6">
        <ErrorBoundary
          key={activeTab}
          fallback={(error) => (
            <div className="py-12 text-center">
              <p className="text-gray-400 mb-2">Something went wrong loading the <span className="font-semibold text-white">{activeTab}</span> tab.</p>
              {error?.message && (
                <p className="text-red-400 text-xs font-mono mt-2 max-w-lg mx-auto break-all bg-gray-800/60 border border-red-700/30 rounded-lg px-3 py-2">
                  {error.message}
                </p>
              )}
              <button
                onClick={() => setActiveTab('scope')}
                className="mt-4 text-blue-400 hover:text-blue-300 transition-colors text-sm"
              >
                Go to Sales Order tab
              </button>
            </div>
          )}
        >
        {activeTab === 'scope' && (
          <SalesOrderScopeTab order={order} onRefresh={loadChangeOrders} />
        )}
        {activeTab === 'primary_scope' && (
          <SalesOrderPrimaryScopeTab order={order} />
        )}
        {activeTab === 'products' && (
          <SalesOrderProductsTab order={order} />
        )}
        {activeTab === 'billing' && (
          <SalesOrderBillingTab
            order={order}
            changeOrders={changeOrders}
            onRefresh={() => { loadChangeOrders(); loadOrder(); }}
          />
        )}
        {activeTab === 'change_orders' && (
          <SalesOrderChangeOrdersTab
            order={order}
            changeOrders={changeOrders}
            onRefresh={loadChangeOrders}
          />
        )}
        {activeTab === 'project' && (
          <SalesOrderProjectTab order={order} onRefresh={loadOrder} />
        )}
        {activeTab === 'reports' && (
          <SalesOrderReportsTab order={order} changeOrders={changeOrders} />
        )}
        {activeTab === 'stats' && (
          <SalesOrderStatsTab order={order} changeOrders={changeOrders} />
        )}
        {activeTab === 'commissions' && showCommissions && (
          <SalesOrderCommissionsTab order={order} changeOrders={changeOrders} />
        )}
        </ErrorBoundary>
      </div>

      {showCompleteModal && (
        <CompleteSalesOrderModal
          salesOrder={{
            id: order.id,
            order_number: order.order_number,
            contact_id: order.contact_id,
            project_id: order.project?.id
          }}
          onClose={() => setShowCompleteModal(false)}
          onComplete={() => { setShowCompleteModal(false); loadOrder(); }}
        />
      )}

      {showRevertModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl w-full max-w-full sm:max-w-md shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-700">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-orange-500/20 rounded-lg flex items-center justify-center">
                  <RotateCcw className="w-5 h-5 text-orange-400" />
                </div>
                <h2 className="text-lg font-semibold text-white">Revert to Proposal</h2>
              </div>
              <button onClick={() => { setShowRevertModal(false); setRevertError(null); }} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-gray-300 text-sm">
                This will permanently delete Sales Order <span className="font-semibold text-white">SO #{order.order_number}</span> and restore the linked proposal back to <span className="font-semibold text-white">Sent</span> status.
              </p>
              <div className="bg-orange-900/20 border border-orange-700/40 rounded-lg p-3 text-sm text-orange-300">
                Any deposit invoices linked to this sales order will also be removed. This action cannot be undone.
              </div>
              {changeOrders.length > 0 && (
                <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-3 text-sm text-red-300">
                  This sales order has {changeOrders.length} change order(s). You must delete all change orders before reverting.
                </div>
              )}
              {revertError && (
                <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-3 text-sm text-red-300">
                  {revertError}
                </div>
              )}
              <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end pt-1">
                <button
                  onClick={() => { setShowRevertModal(false); setRevertError(null); }}
                  className="px-4 py-2 text-sm text-gray-300 hover:text-white border border-gray-600 rounded-lg transition-colors min-h-[44px] sm:min-h-0"
                >
                  Cancel
                </button>
                <button
                  onClick={revertToProposal}
                  disabled={reverting || changeOrders.length > 0}
                  className="px-4 py-2 text-sm bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center gap-2 min-h-[44px] sm:min-h-0"
                >
                  {reverting && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                  {reverting ? 'Reverting...' : 'Revert to Proposal'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
