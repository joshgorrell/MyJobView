import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  DollarSign, Receipt, AlertCircle, Clock, CheckCircle,
  ChevronRight, RefreshCw, ArrowUpRight,
  Building2, Calendar, CreditCard, Banknote, Target,
  BarChart3, Send, Layers, Wrench, ExternalLink, Bell,
  FileWarning, Hourglass, ChevronDown, UserCheck
} from 'lucide-react';
import { RecordPaymentModal } from '../Invoices/RecordPaymentModal';
import { SelectCustomerModal } from '../Invoices/SelectCustomerModal';
import { ApplyBulkPaymentModal } from '../Invoices/ApplyBulkPaymentModal';
import { InvoiceDetailModal } from '../Invoices/InvoiceDetailModal';

interface AgingCustomer {
  contact_id: string;
  customer_name: string;
  current: number;
  days_1_30: number;
  days_31_60: number;
  days_61_90: number;
  days_90_plus: number;
  total: number;
}

interface OpenInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  status: string;
  total: number;
  amount_paid: number;
  amount_due: number;
  contact_id: string;
  customer_name: string;
  days_overdue: number;
}

interface PipelineSalesOrder {
  id: string;
  order_number: string;
  status: string;
  contract_total: number;
  total_invoiced: number;
  total_paid: number;
  outstanding: number;
  remaining_to_invoice: number;
  billing_pct: number;
  customer_name: string;
  contact_id: string;
  proposal_id: string | null;
}

interface WorkOrderToBill {
  id: string;
  work_order_id: string;
  work_order_number: string;
  description: string;
  work_order_type: string;
  billable_by: string;
  status: string;
  completed_at: string | null;
  billing_deadline: string | null;
  customer_name: string;
  contact_id: string;
  assigned_at: string | null;
}

interface PendingDepositOrder {
  id: string;
  order_number: string;
  customer_name: string;
  contact_id: string;
  contract_total: number;
  deposit_amount: number | null;
  deposit_percent: number | null;
  created_at: string;
  days_waiting: number;
  proposal_id: string | null;
}

export function SalesBillingDashboard() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [agingData, setAgingData] = useState<AgingCustomer[]>([]);
  const [openInvoices, setOpenInvoices] = useState<OpenInvoice[]>([]);
  const [pipelineOrders, setPipelineOrders] = useState<PipelineSalesOrder[]>([]);
  const [completedUnbilled, setCompletedUnbilled] = useState<PipelineSalesOrder[]>([]);
  const [workOrdersToBill, setWorkOrdersToBill] = useState<WorkOrderToBill[]>([]);
  const [pendingDeposits, setPendingDeposits] = useState<PendingDepositOrder[]>([]);

  const [kpis, setKpis] = useState({
    totalReceivables: 0,
    overdueAmount: 0,
    approvedPipelineRemaining: 0,
    overdueCount: 0,
    workOrdersToBillCount: 0,
  });

  const [paymentInvoice, setPaymentInvoice] = useState<OpenInvoice | null>(null);
  const [showSelectCustomer, setShowSelectCustomer] = useState(false);
  const [bulkPaymentContact, setBulkPaymentContact] = useState<{ id: string; name: string } | null>(null);
  const [viewingDepositInvoiceId, setViewingDepositInvoiceId] = useState<string | null>(null);
  const [loadingDepositInvoiceId, setLoadingDepositInvoiceId] = useState<string | null>(null);
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());

  const needsAttentionRef = useRef<HTMLDivElement>(null);
  const receivablesRef = useRef<HTMLDivElement>(null);
  const pipelineRef = useRef<HTMLDivElement>(null);
  const completedRef = useRef<HTMLDivElement>(null);
  const workOrdersRef = useRef<HTMLDivElement>(null);

  function toggleCustomer(contactId: string) {
    setExpandedCustomers(prev => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  }

  useEffect(() => {
    loadAll();
  }, [profile?.id]);

  async function loadAll() {
    setRefreshing(true);
    try {
      await Promise.all([
        loadOpenInvoices(),
        loadPipelineOrders(),
        loadWorkOrdersToBill(),
        loadPendingDeposits(),
      ]);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }

  async function loadOpenInvoices() {
    if (!profile?.id) return;

    const isManager = profile.role === 'sales_manager' || profile.role === 'admin';

    let query = supabase
      .from('invoices')
      .select(`
        id, invoice_number, invoice_date, due_date, status,
        total, amount_paid, amount_due, contact_id,
        contacts:contact_id (
          id, first_name, last_name, contact_name, company_name
        )
      `)
      .not('status', 'in', '("paid","void")')
      .order('due_date', { ascending: true });

    if (!isManager) {
      query = query.eq('created_by', profile.id);
    }

    const { data, error } = await query;
    if (error) { console.error('Error loading invoices:', error); return; }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const formatted: OpenInvoice[] = (data || []).map((inv: any) => {
      const contact = inv.contacts;
      const customerName = contact?.company_name || contact?.contact_name ||
        `${contact?.first_name || ''} ${contact?.last_name || ''}`.trim() || 'Unknown';
      const dueDate = inv.due_date ? new Date(inv.due_date) : null;
      const daysOverdue = dueDate
        ? Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)))
        : 0;
      return {
        id: inv.id,
        invoice_number: inv.invoice_number,
        invoice_date: inv.invoice_date,
        due_date: inv.due_date,
        status: inv.status,
        total: inv.total || 0,
        amount_paid: inv.amount_paid || 0,
        amount_due: inv.amount_due || 0,
        contact_id: inv.contact_id,
        customer_name: customerName,
        days_overdue: daysOverdue,
      };
    });

    setOpenInvoices(formatted);

    const agingMap = new Map<string, AgingCustomer>();
    for (const inv of formatted) {
      if (!agingMap.has(inv.contact_id)) {
        agingMap.set(inv.contact_id, {
          contact_id: inv.contact_id,
          customer_name: inv.customer_name,
          current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_90_plus: 0, total: 0,
        });
      }
      const entry = agingMap.get(inv.contact_id)!;
      const amt = inv.amount_due;
      entry.total += amt;
      if (inv.days_overdue === 0) entry.current += amt;
      else if (inv.days_overdue <= 30) entry.days_1_30 += amt;
      else if (inv.days_overdue <= 60) entry.days_31_60 += amt;
      else if (inv.days_overdue <= 90) entry.days_61_90 += amt;
      else entry.days_90_plus += amt;
    }

    const aging = Array.from(agingMap.values()).sort((a, b) => b.total - a.total);
    setAgingData(aging);

    const totalReceivables = formatted.reduce((s, i) => s + i.amount_due, 0);
    const overdueInvoices = formatted.filter(i => i.days_overdue > 0);
    const overdueAmount = overdueInvoices.reduce((s, i) => s + i.amount_due, 0);

    setKpis(prev => ({
      ...prev,
      totalReceivables,
      overdueAmount,
      overdueCount: overdueInvoices.length,
    }));
  }

  async function loadPipelineOrders() {
    if (!profile?.id) return;

    const isManager = profile.role === 'sales_manager' || profile.role === 'admin';

    let query = supabase
      .from('sales_orders')
      .select(`
        id, order_number, status, contract_total, proposal_id, contact_id,
        contacts:contact_id (
          id, first_name, last_name, contact_name, company_name
        )
      `)
      .in('status', ['planning', 'active', 'complete'])
      .order('contract_total', { ascending: false });

    if (!isManager) {
      query = query.eq('created_by', profile.id);
    }

    const { data: orders, error } = await query;
    if (error) { console.error('Error loading sales orders:', error); return; }
    if (!orders || orders.length === 0) return;

    const orderIds = orders.map((o: any) => o.id);

    const { data: invoiceData } = await supabase
      .from('invoices')
      .select('sales_order_id, total, amount_paid, amount_due')
      .in('sales_order_id', orderIds)
      .not('status', 'eq', 'void');

    const invoicesByOrder = new Map<string, { invoiced: number; paid: number; outstanding: number }>();
    for (const inv of (invoiceData || [])) {
      if (!inv.sales_order_id) continue;
      const existing = invoicesByOrder.get(inv.sales_order_id) || { invoiced: 0, paid: 0, outstanding: 0 };
      existing.invoiced += inv.total || 0;
      existing.paid += inv.amount_paid || 0;
      existing.outstanding += inv.amount_due || 0;
      invoicesByOrder.set(inv.sales_order_id, existing);
    }

    const { data: coData } = await supabase
      .from('change_orders')
      .select('sales_order_id, change_amount, status')
      .in('sales_order_id', orderIds)
      .eq('status', 'approved');

    const coByOrder = new Map<string, number>();
    for (const co of (coData || [])) {
      if (!co.sales_order_id) continue;
      coByOrder.set(co.sales_order_id, (coByOrder.get(co.sales_order_id) || 0) + (co.change_amount || 0));
    }

    const formatted: PipelineSalesOrder[] = (orders as any[]).map(o => {
      const contact = o.contacts;
      const customerName = contact?.company_name || contact?.contact_name ||
        `${contact?.first_name || ''} ${contact?.last_name || ''}`.trim() || 'Unknown';
      const approvedChanges = coByOrder.get(o.id) || 0;
      const contractTotal = (o.contract_total || 0) + approvedChanges;
      const billing = invoicesByOrder.get(o.id) || { invoiced: 0, paid: 0, outstanding: 0 };
      const remainingToInvoice = Math.max(0, contractTotal - billing.invoiced);
      const billingPct = contractTotal > 0 ? Math.min(100, (billing.invoiced / contractTotal) * 100) : 0;

      return {
        id: o.id,
        order_number: o.order_number,
        status: o.status,
        contract_total: contractTotal,
        total_invoiced: billing.invoiced,
        total_paid: billing.paid,
        outstanding: billing.outstanding,
        remaining_to_invoice: remainingToInvoice,
        billing_pct: billingPct,
        customer_name: customerName,
        contact_id: o.contact_id,
        proposal_id: o.proposal_id,
      };
    });

    const active = formatted.filter(o => o.status !== 'complete' && o.remaining_to_invoice > 0)
      .sort((a, b) => b.remaining_to_invoice - a.remaining_to_invoice);
    const completed = formatted.filter(o => o.status === 'complete' && o.remaining_to_invoice > 0)
      .sort((a, b) => b.remaining_to_invoice - a.remaining_to_invoice);

    setPipelineOrders(active);
    setCompletedUnbilled(completed);

    const totalRemaining = formatted.reduce((s, o) => s + o.remaining_to_invoice, 0);
    setKpis(prev => ({ ...prev, approvedPipelineRemaining: totalRemaining }));
  }

  async function loadWorkOrdersToBill() {
    if (!profile?.id) return;

    const isManager = profile.role === 'sales_manager' || profile.role === 'admin';

    let query = supabase
      .from('service_billing_queue')
      .select(`
        id,
        work_order_id,
        billable_by,
        status,
        completed_at,
        billing_deadline,
        assigned_at,
        contact_id,
        work_order:work_orders(work_order_number, description, type),
        contact:contacts(full_name, company_name)
      `)
      .not('status', 'in', '("invoice_created","invoice_sent","payment_pending","paid","closed")')
      .order('billing_deadline', { ascending: true, nullsFirst: false });

    if (!isManager) {
      query = query.or(`assigned_to_user_id.eq.${profile.id},and(billable_by.in.(assigned_sales_rep,other_sales_rep),billable_by_user_id.eq.${profile.id})`);
    } else {
      query = query.in('billable_by', ['assigned_sales_rep', 'other_sales_rep']);
    }

    const { data, error } = await query;
    if (error) { console.error('Error loading work orders to bill:', error); return; }

    const formatted: WorkOrderToBill[] = (data || []).map((item: any) => {
      const contact = item.contact;
      const customerName = contact?.company_name || contact?.full_name || 'Unknown';
      const wo = item.work_order;
      return {
        id: item.id,
        work_order_id: item.work_order_id,
        work_order_number: wo?.work_order_number || '',
        description: wo?.description || '',
        work_order_type: wo?.type || '',
        billable_by: item.billable_by,
        status: item.status,
        completed_at: item.completed_at,
        billing_deadline: item.billing_deadline,
        customer_name: customerName,
        contact_id: item.contact_id,
        assigned_at: item.assigned_at,
      };
    });

    setWorkOrdersToBill(formatted);
    setKpis(prev => ({ ...prev, workOrdersToBillCount: formatted.length }));
  }

  async function loadPendingDeposits() {
    if (!profile?.id) return;

    const isManager = profile.role === 'sales_manager' || profile.role === 'admin';

    let query = supabase
      .from('sales_orders')
      .select(`
        id, order_number, status, contract_total, created_at, contact_id, proposal_id,
        proposal:proposals(deposit_amount, deposit_percent),
        contacts:contact_id(first_name, last_name, contact_name, company_name)
      `)
      .eq('status', 'pending_deposit')
      .order('created_at', { ascending: true });

    if (!isManager) {
      query = query.eq('created_by', profile.id);
    }

    const { data, error } = await query;
    if (error) { console.error('Error loading pending deposits:', error); return; }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const formatted: PendingDepositOrder[] = (data || []).map((o: any) => {
      const contact = o.contacts;
      const customerName = contact?.company_name || contact?.contact_name ||
        `${contact?.first_name || ''} ${contact?.last_name || ''}`.trim() || 'Unknown';
      const proposal = Array.isArray(o.proposal) ? o.proposal[0] : o.proposal;
      const createdAt = new Date(o.created_at);
      createdAt.setHours(0, 0, 0, 0);
      const daysWaiting = Math.floor((today.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
      return {
        id: o.id,
        order_number: o.order_number,
        customer_name: customerName,
        contact_id: o.contact_id,
        contract_total: o.contract_total || 0,
        deposit_amount: proposal?.deposit_amount ?? null,
        deposit_percent: proposal?.deposit_percent ?? null,
        created_at: o.created_at,
        days_waiting: daysWaiting,
        proposal_id: o.proposal_id ?? null,
      };
    });

    setPendingDeposits(formatted);
  }

  function scrollTo(ref: React.RefObject<HTMLDivElement | null>) {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function handleOpenDepositInvoice(order: PendingDepositOrder) {
    if (!order.proposal_id) return;
    setLoadingDepositInvoiceId(order.id);
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('id')
        .eq('proposal_id', order.proposal_id)
        .eq('invoice_type', 'deposit')
        .neq('status', 'paid')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setViewingDepositInvoiceId(data.id);
      } else {
        alert('No unpaid deposit invoice found. It may have already been paid or not yet created.');
      }
    } catch (err) {
      console.error('Error fetching deposit invoice:', err);
      alert('Failed to load deposit invoice. Please try again.');
    } finally {
      setLoadingDepositInvoiceId(null);
    }
  }

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
  const fmtFull = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Loading billing data...</p>
        </div>
      </div>
    );
  }

  const agingTotals = agingData.reduce(
    (acc, r) => ({
      current: acc.current + r.current,
      days_1_30: acc.days_1_30 + r.days_1_30,
      days_31_60: acc.days_31_60 + r.days_31_60,
      days_61_90: acc.days_61_90 + r.days_61_90,
      days_90_plus: acc.days_90_plus + r.days_90_plus,
      total: acc.total + r.total,
    }),
    { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_90_plus: 0, total: 0 }
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcomingFriday = (() => {
    const d = new Date(today);
    const day = d.getDay();
    const daysUntilFriday = day <= 5 ? 5 - day : 6;
    d.setDate(d.getDate() + daysUntilFriday);
    return d;
  })();

  const overdueInvoices30Plus = openInvoices.filter(i => i.days_overdue > 30);
  const staleWorkOrders = workOrdersToBill.filter(wo => {
    const anchor = wo.completed_at || wo.assigned_at;
    if (!anchor) return false;
    const anchorDate = new Date(anchor);
    anchorDate.setHours(0, 0, 0, 0);
    return Math.floor((today.getTime() - anchorDate.getTime()) / (1000 * 60 * 60 * 24)) > 7;
  });

  const repBillingWorkOrders = workOrdersToBill.filter(
    wo => wo.billable_by === 'assigned_sales_rep' || wo.billable_by === 'other_sales_rep'
  );

  const totalNeedsAttention = overdueInvoices30Plus.length + pendingDeposits.length + staleWorkOrders.length + repBillingWorkOrders.length;

  const maxBar = Math.max(...pipelineOrders.map(o => o.contract_total), 1);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Billing Command Center</h2>
          <p className="text-sm text-gray-500 mt-1">Your receivables, aging, and approved pipeline in one view</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSelectCustomer(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 active:bg-green-800 transition-colors shadow-sm"
          >
            <DollarSign className="w-4 h-4" />
            Apply Payment
          </button>
          <button
            onClick={loadAll}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KPICard
          label="Needs Attention"
          value={String(totalNeedsAttention)}
          icon={Bell}
          color={totalNeedsAttention > 0 ? 'red' : 'green'}
          subtitle={totalNeedsAttention > 0 ? `${overdueInvoices30Plus.length} overdue · ${pendingDeposits.length} deposits · ${staleWorkOrders.length} stale WOs · ${repBillingWorkOrders.length} rep billing` : 'Nothing needs immediate action'}
          onClick={() => scrollTo(needsAttentionRef)}
        />
        <KPICard
          label="Total Receivables"
          value={fmt(kpis.totalReceivables)}
          icon={Receipt}
          color="blue"
          subtitle={`${openInvoices.length} open invoice${openInvoices.length !== 1 ? 's' : ''}`}
          onClick={() => scrollTo(receivablesRef)}
        />
        <KPICard
          label="Overdue Balance"
          value={fmt(kpis.overdueAmount)}
          icon={AlertCircle}
          color={kpis.overdueAmount > 0 ? 'red' : 'green'}
          subtitle={`${kpis.overdueCount} overdue invoice${kpis.overdueCount !== 1 ? 's' : ''}`}
          onClick={() => scrollTo(receivablesRef)}
        />
        <KPICard
          label="Revenue in Pipeline"
          value={fmt(kpis.approvedPipelineRemaining)}
          icon={Target}
          color="emerald"
          subtitle={`${pipelineOrders.length + completedUnbilled.length} sales order${(pipelineOrders.length + completedUnbilled.length) !== 1 ? 's' : ''}`}
          onClick={() => scrollTo(pipelineRef)}
        />
        <KPICard
          label="Complete — Not Billed"
          value={fmt(completedUnbilled.reduce((s, o) => s + o.remaining_to_invoice, 0))}
          icon={Banknote}
          color={completedUnbilled.length > 0 ? 'amber' : 'green'}
          subtitle={`${completedUnbilled.length} project${completedUnbilled.length !== 1 ? 's' : ''} need final billing`}
          onClick={() => scrollTo(completedRef)}
        />
        <KPICard
          label="Work Orders to Bill"
          value={String(kpis.workOrdersToBillCount)}
          icon={Wrench}
          color={kpis.workOrdersToBillCount > 0 ? 'orange' : 'green'}
          subtitle={kpis.workOrdersToBillCount > 0 ? 'assigned to you, not yet invoiced' : 'No pending work orders'}
          onClick={() => scrollTo(workOrdersRef)}
        />
      </div>

      {/* Needs Attention */}
      <div ref={needsAttentionRef} className={`rounded-xl border shadow-sm overflow-hidden ${totalNeedsAttention > 0 ? 'border-red-200 bg-red-50/40' : 'border-green-200 bg-green-50/30'}`}>
        <div className={`px-6 py-4 border-b flex items-center justify-between ${totalNeedsAttention > 0 ? 'border-red-100 bg-red-50' : 'border-green-100 bg-green-50'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${totalNeedsAttention > 0 ? 'bg-red-100' : 'bg-green-100'}`}>
              <Bell className={`w-4 h-4 ${totalNeedsAttention > 0 ? 'text-red-600' : 'text-green-600'}`} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">Needs Attention</h3>
              <p className="text-xs text-gray-500">Overdue invoices, pending deposits, stale work orders, and sales rep billing due by Friday</p>
            </div>
          </div>
          {totalNeedsAttention > 0 ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold">
              {totalNeedsAttention} item{totalNeedsAttention !== 1 ? 's' : ''}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
              <CheckCircle className="w-3.5 h-3.5" />
              All clear
            </span>
          )}
        </div>

        {totalNeedsAttention === 0 ? (
          <div className="px-6 py-10 text-center">
            <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No items need immediate attention</p>
            <p className="text-gray-400 text-sm mt-1">Invoices are current, deposits are on track, work orders are fresh, and all rep billing is handled</p>
          </div>
        ) : (
          <div className="divide-y divide-red-100">

            {/* Sub-group: Invoices overdue > 30 days */}
            {overdueInvoices30Plus.length > 0 && (
              <div>
                <div className="px-6 py-2.5 bg-red-50/60 flex items-center gap-2">
                  <FileWarning className="w-4 h-4 text-red-500" />
                  <span className="text-xs font-semibold text-red-700 uppercase tracking-wide">
                    Invoices Past 30 Days — {overdueInvoices30Plus.length} invoice{overdueInvoices30Plus.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="divide-y divide-red-50">
                  {overdueInvoices30Plus.map(inv => (
                    <div key={inv.id} className="px-6 py-3.5 hover:bg-red-50/40 transition-colors flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900 text-sm">#{inv.invoice_number}</span>
                          <span className="text-xs font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">
                            {inv.days_overdue}d overdue
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {inv.customer_name}
                          </span>
                          {inv.due_date && (
                            <span className="flex items-center gap-1 text-red-500 font-medium">
                              <Clock className="w-3 h-3" />
                              Due {new Date(inv.due_date).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <div className="text-sm font-bold text-gray-900">{fmtFull(inv.amount_due)}</div>
                          <div className="text-xs text-gray-400">outstanding</div>
                        </div>
                        <button
                          onClick={() => setPaymentInvoice(inv)}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-green-50 hover:bg-green-100 border border-green-200 text-green-700 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
                        >
                          <CreditCard className="w-3 h-3" />
                          Record Payment
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sub-group: Pending deposits */}
            {pendingDeposits.length > 0 && (
              <div>
                <div className="px-6 py-2.5 bg-amber-50/60 flex items-center gap-2">
                  <Banknote className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                    Sales Orders Awaiting Deposit — {pendingDeposits.length} order{pendingDeposits.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="divide-y divide-amber-50">
                  {pendingDeposits.map(order => {
                    const depositAmt = order.deposit_amount ?? (
                      order.deposit_percent != null
                        ? (order.contract_total * order.deposit_percent) / 100
                        : null
                    );
                    return (
                      <div key={order.id} className="px-6 py-3.5 hover:bg-amber-50/40 transition-colors flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-900 text-sm">{order.customer_name}</span>
                            <span className="text-xs text-gray-400">#{order.order_number}</span>
                            <span className="text-xs font-medium bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                              {order.days_waiting === 0 ? 'Created today' : `${order.days_waiting}d waiting`}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                            <span>Contract: <span className="font-medium text-gray-700">{fmt(order.contract_total)}</span></span>
                            {depositAmt != null && (
                              <span className="flex items-center gap-1 text-amber-600 font-medium">
                                <Banknote className="w-3 h-3" />
                                Deposit due: {fmtFull(depositAmt)}
                                {order.deposit_percent != null && ` (${order.deposit_percent}%)`}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0">
                          {order.proposal_id ? (
                            <button
                              onClick={() => handleOpenDepositInvoice(order)}
                              disabled={loadingDepositInvoiceId === order.id}
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 hover:bg-amber-200 active:bg-amber-300 text-amber-700 rounded-full text-xs font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                              title="View deposit invoice"
                            >
                              {loadingDepositInvoiceId === order.id ? (
                                <div className="w-3 h-3 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <Clock className="w-3 h-3" />
                              )}
                              Pending Deposit
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">
                              <Clock className="w-3 h-3" />
                              Pending Deposit
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Sub-group: Work orders stale > 7 days */}
            {staleWorkOrders.length > 0 && (
              <div>
                <div className="px-6 py-2.5 bg-orange-50/60 flex items-center gap-2">
                  <Hourglass className="w-4 h-4 text-orange-500" />
                  <span className="text-xs font-semibold text-orange-700 uppercase tracking-wide">
                    Work Orders Not Billed ({'>'}7 days) — {staleWorkOrders.length} order{staleWorkOrders.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="divide-y divide-orange-50">
                  {staleWorkOrders.map(wo => {
                    const anchor = wo.completed_at || wo.assigned_at;
                    const anchorDate = anchor ? new Date(anchor) : null;
                    anchorDate?.setHours(0, 0, 0, 0);
                    const daysOld = anchorDate
                      ? Math.floor((today.getTime() - anchorDate.getTime()) / (1000 * 60 * 60 * 24))
                      : 0;

                    return (
                      <div key={wo.id} className="px-6 py-3.5 hover:bg-orange-50/40 transition-colors flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-900 text-sm">{wo.customer_name}</span>
                            {wo.work_order_number && (
                              <span className="text-xs text-gray-400 font-mono">#{wo.work_order_number}</span>
                            )}
                            <span className="text-xs font-bold bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">
                              {daysOld}d old
                            </span>
                          </div>
                          {wo.description && (
                            <p className="mt-0.5 text-xs text-gray-500 line-clamp-1">{wo.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                            {wo.completed_at && (
                              <span className="flex items-center gap-1 text-green-600">
                                <CheckCircle className="w-3 h-3" />
                                Completed {new Date(wo.completed_at).toLocaleDateString()}
                              </span>
                            )}
                            {!wo.completed_at && wo.assigned_at && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                Assigned {new Date(wo.assigned_at).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0">
                          <a
                            href="#service_billing"
                            onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'service_billing' })); }}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Bill Now
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Sub-group: Sales rep billing due by Friday */}
            {repBillingWorkOrders.length > 0 && (
              <div>
                <div className="px-6 py-2.5 bg-sky-50/60 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-sky-600" />
                  <span className="text-xs font-semibold text-sky-700 uppercase tracking-wide">
                    Rep-Billed Work Orders — Due by Friday ({upcomingFriday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}) — {repBillingWorkOrders.length} order{repBillingWorkOrders.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="divide-y divide-sky-50">
                  {repBillingWorkOrders.map(wo => {
                    const anchor = wo.completed_at || wo.assigned_at;
                    const anchorDate = anchor ? new Date(anchor) : null;
                    anchorDate?.setHours(0, 0, 0, 0);
                    const daysOld = anchorDate
                      ? Math.floor((today.getTime() - anchorDate.getTime()) / (1000 * 60 * 60 * 24))
                      : 0;
                    const isPastDue = today > upcomingFriday;

                    return (
                      <div key={wo.id} className="px-6 py-3.5 hover:bg-sky-50/40 transition-colors flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-gray-900 text-sm">{wo.customer_name}</span>
                            {wo.work_order_number && (
                              <span className="text-xs text-gray-400 font-mono">#{wo.work_order_number}</span>
                            )}
                            {daysOld > 0 && (
                              <span className="text-xs font-bold bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded">
                                {daysOld}d old
                              </span>
                            )}
                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${isPastDue ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                              <Clock className="w-3 h-3" />
                              {isPastDue ? 'Past Friday deadline' : `Due by Fri ${upcomingFriday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                            </span>
                          </div>
                          {wo.description && (
                            <p className="mt-0.5 text-xs text-gray-500 line-clamp-1">{wo.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <UserCheck className="w-3 h-3 text-sky-500" />
                              Sales rep billing
                            </span>
                            {wo.completed_at && (
                              <span className="flex items-center gap-1 text-green-600">
                                <CheckCircle className="w-3 h-3" />
                                Completed {new Date(wo.completed_at).toLocaleDateString()}
                              </span>
                            )}
                            {!wo.completed_at && wo.assigned_at && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                Assigned {new Date(wo.assigned_at).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0">
                          <a
                            href="#service_billing"
                            onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'service_billing' })); }}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-700 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Bill Now
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      {/* Section A: Accounts Receivable — merged aging + invoices */}
      <div ref={receivablesRef} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                <Receipt className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">Accounts Receivable</h3>
                <p className="text-xs text-gray-500">Outstanding balances by customer — click a row to view individual invoices</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-base font-bold text-gray-900">{fmtFull(agingTotals.total)}</div>
              <div className="text-xs text-gray-400">{openInvoices.length} open invoice{openInvoices.length !== 1 ? 's' : ''}</div>
            </div>
          </div>

          {/* Aging bucket summary bar */}
          {agingData.length > 0 && (
            <div className="mt-4 flex gap-2 flex-wrap">
              {agingTotals.current > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium border border-green-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  Current: {fmtFull(agingTotals.current)}
                </span>
              )}
              {agingTotals.days_1_30 > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-yellow-50 text-yellow-700 rounded-full text-xs font-medium border border-yellow-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                  1–30 days: {fmtFull(agingTotals.days_1_30)}
                </span>
              )}
              {agingTotals.days_31_60 > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-orange-50 text-orange-700 rounded-full text-xs font-medium border border-orange-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                  31–60 days: {fmtFull(agingTotals.days_31_60)}
                </span>
              )}
              {agingTotals.days_61_90 > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-50 text-red-600 rounded-full text-xs font-medium border border-red-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  61–90 days: {fmtFull(agingTotals.days_61_90)}
                </span>
              )}
              {agingTotals.days_90_plus > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-red-100 text-red-800 rounded-full text-xs font-bold border border-red-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-700" />
                  90+ days: {fmtFull(agingTotals.days_90_plus)}
                </span>
              )}
            </div>
          )}
        </div>

        {agingData.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">All invoices are paid</p>
            <p className="text-gray-400 text-sm mt-1">No outstanding balances</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {agingData.map(row => {
              const isExpanded = expandedCustomers.has(row.contact_id);
              const customerInvoices = openInvoices.filter(i => i.contact_id === row.contact_id);
              const worstBucket = row.days_90_plus > 0 ? '90+'
                : row.days_61_90 > 0 ? '61-90'
                : row.days_31_60 > 0 ? '31-60'
                : row.days_1_30 > 0 ? '1-30'
                : 'current';
              const rowAccentClass = worstBucket === '90+' ? 'border-l-4 border-red-600'
                : worstBucket === '61-90' ? 'border-l-4 border-red-400'
                : worstBucket === '31-60' ? 'border-l-4 border-orange-400'
                : worstBucket === '1-30' ? 'border-l-4 border-yellow-400'
                : 'border-l-4 border-green-300';

              return (
                <div key={row.contact_id}>
                  {/* Customer summary row — clickable to expand */}
                  <button
                    onClick={() => toggleCustomer(row.contact_id)}
                    className={`w-full text-left px-6 py-4 hover:bg-gray-50 transition-colors ${rowAccentClass}`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`transition-transform duration-200 ${isExpanded ? 'rotate-0' : '-rotate-90'}`}>
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        </div>
                        <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                          <Building2 className="w-4 h-4 text-blue-500" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-gray-900 text-sm">{row.customer_name}</div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {customerInvoices.length} invoice{customerInvoices.length !== 1 ? 's' : ''}
                            {' · '}click to {isExpanded ? 'collapse' : 'expand'}
                          </div>
                        </div>
                      </div>

                      {/* Aging buckets inline */}
                      <div className="hidden md:flex items-center gap-3 text-xs">
                        {row.current > 0 && (
                          <span className="text-green-700 font-medium">{fmtFull(row.current)} <span className="text-gray-400 font-normal">current</span></span>
                        )}
                        {row.days_1_30 > 0 && (
                          <span className="text-yellow-700 font-medium">{fmtFull(row.days_1_30)} <span className="text-gray-400 font-normal">1–30d</span></span>
                        )}
                        {row.days_31_60 > 0 && (
                          <span className="text-orange-600 font-semibold">{fmtFull(row.days_31_60)} <span className="text-gray-400 font-normal">31–60d</span></span>
                        )}
                        {row.days_61_90 > 0 && (
                          <span className="text-red-600 font-semibold">{fmtFull(row.days_61_90)} <span className="text-gray-400 font-normal">61–90d</span></span>
                        )}
                        {row.days_90_plus > 0 && (
                          <span className="text-red-800 font-bold">{fmtFull(row.days_90_plus)} <span className="text-gray-400 font-normal">90+d</span></span>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-base font-bold text-gray-900">{fmtFull(row.total)}</div>
                        <div className="text-xs text-gray-400">total owed</div>
                      </div>
                    </div>
                  </button>

                  {/* Expanded invoices for this customer */}
                  {isExpanded && (
                    <div className="bg-gray-50/60 border-t border-gray-100 divide-y divide-gray-100">
                      {customerInvoices.length === 0 ? (
                        <div className="px-12 py-4 text-xs text-gray-400">No invoice details available.</div>
                      ) : (
                        customerInvoices.map(inv => {
                          const agingStyle = getInvoiceAgingStyle(inv.days_overdue, inv.status);
                          return (
                            <div key={inv.id} className="px-6 pl-14 py-3.5 hover:bg-gray-100/50 transition-colors">
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-gray-800 text-sm">#{inv.invoice_number}</span>
                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${agingStyle.badge}`}>
                                      <agingStyle.icon className="w-3 h-3" />
                                      {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                                    </span>
                                    {inv.days_overdue > 0 && (
                                      <span className="text-xs text-red-600 font-semibold">{inv.days_overdue}d overdue</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                                    <span className="flex items-center gap-1">
                                      <Calendar className="w-3 h-3" />
                                      Issued {new Date(inv.invoice_date).toLocaleDateString()}
                                    </span>
                                    {inv.due_date && (
                                      <span className={`flex items-center gap-1 ${inv.days_overdue > 0 ? 'text-red-500 font-medium' : ''}`}>
                                        <Clock className="w-3 h-3" />
                                        Due {new Date(inv.due_date).toLocaleDateString()}
                                      </span>
                                    )}
                                  </div>
                                  {inv.amount_paid > 0 && inv.amount_paid < inv.total && (
                                    <div className="mt-2 max-w-xs">
                                      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-blue-400 rounded-full"
                                          style={{ width: `${(inv.amount_paid / inv.total) * 100}%` }}
                                        />
                                      </div>
                                      <div className="flex justify-between mt-0.5 text-xs text-gray-400">
                                        <span>{fmtFull(inv.amount_paid)} paid</span>
                                        <span>{fmtFull(inv.amount_due)} remaining</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                  <div className="text-right">
                                    <div className="text-sm font-bold text-gray-900">{fmtFull(inv.amount_due)}</div>
                                    {inv.amount_paid > 0 && (
                                      <div className="text-xs text-gray-400">of {fmtFull(inv.total)}</div>
                                    )}
                                  </div>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setPaymentInvoice(inv); }}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-green-50 hover:bg-green-100 border border-green-200 text-green-700 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
                                  >
                                    <CreditCard className="w-3 h-3" />
                                    Record Payment
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section C: Approved Pipeline — The Showcase Visual */}
      <div ref={pipelineRef} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">Approved Revenue Pipeline</h3>
                <p className="text-xs text-gray-500">Contracted revenue locked in — bill progressively as work advances</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-emerald-600">{fmt(kpis.approvedPipelineRemaining)}</div>
              <div className="text-xs text-gray-500">contracted revenue in flight</div>
            </div>
          </div>
        </div>

        {pipelineOrders.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Pipeline fully billed</p>
            <p className="text-gray-400 text-sm mt-1">All active projects have been invoiced</p>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-5">
            {/* Legend */}
            <div className="flex items-center gap-5 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-green-500 inline-block" /> Paid
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-amber-400 inline-block" /> Invoiced (outstanding)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-300 border-dashed inline-block" /> Future Billing (on track)
              </span>
            </div>

            {pipelineOrders.map(order => {
              const paidPct = order.contract_total > 0 ? (order.total_paid / order.contract_total) * 100 : 0;
              const outstandingPct = order.contract_total > 0 ? (order.outstanding / order.contract_total) * 100 : 0;
              const remainingPct = order.contract_total > 0 ? (order.remaining_to_invoice / order.contract_total) * 100 : 0;
              const statusColor = order.status === 'active' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600';

              return (
                <div key={order.id} className="group">
                  <div className="flex items-start justify-between mb-2 gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900 text-sm">{order.customer_name}</span>
                        <span className="text-xs text-gray-400">#{order.order_number}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${statusColor}`}>
                          {order.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                        <span>Contract: <span className="font-medium text-gray-700">{fmt(order.contract_total)}</span></span>
                        <span>Invoiced: <span className="font-medium text-gray-700">{fmt(order.total_invoiced)}</span></span>
                        {order.outstanding > 0 && (
                          <span>Outstanding: <span className="font-medium text-amber-600">{fmt(order.outstanding)}</span></span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-base font-bold text-emerald-600">{fmt(order.remaining_to_invoice)}</div>
                      <div className="text-xs text-gray-400">remaining on contract</div>
                    </div>
                  </div>

                  {/* Stacked bar */}
                  <div className="relative h-8 bg-gray-100 rounded-lg overflow-hidden">
                    {/* Paid segment */}
                    {paidPct > 0 && (
                      <div
                        className="absolute top-0 left-0 h-full bg-green-500 transition-all duration-700"
                        style={{ width: `${Math.min(100, paidPct)}%` }}
                        title={`Paid: ${fmt(order.total_paid)}`}
                      />
                    )}
                    {/* Outstanding invoiced segment */}
                    {outstandingPct > 0 && (
                      <div
                        className="absolute top-0 h-full bg-amber-400 transition-all duration-700"
                        style={{ left: `${Math.min(100, paidPct)}%`, width: `${Math.min(100 - paidPct, outstandingPct)}%` }}
                        title={`Invoiced (outstanding): ${fmt(order.outstanding)}`}
                      />
                    )}
                    {/* Remaining to invoice — dashed pattern */}
                    {remainingPct > 0 && (
                      <div
                        className="absolute top-0 h-full transition-all duration-700"
                        style={{
                          left: `${Math.min(100, paidPct + outstandingPct)}%`,
                          width: `${Math.min(100 - paidPct - outstandingPct, remainingPct)}%`,
                          background: 'repeating-linear-gradient(45deg, #d1fae5, #d1fae5 4px, #ecfdf5 4px, #ecfdf5 8px)',
                          borderRight: '2px dashed #10b981',
                        }}
                        title={`Future Billing (on track): ${fmt(order.remaining_to_invoice)}`}
                      />
                    )}
                    {/* Pct label inside bar */}
                    <div className="absolute inset-0 flex items-center justify-end pr-3 pointer-events-none">
                      <span className="text-xs font-semibold text-gray-600 drop-shadow-sm">
                        {Math.round(order.billing_pct)}% billed
                      </span>
                    </div>
                  </div>

                  {/* Mini sparkline: billing velocity hint */}
                  <div className="flex justify-between mt-1.5 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      {fmt(order.total_paid)} collected
                    </span>
                    <span className="flex items-center gap-1 text-emerald-600 font-medium">
                      <ArrowUpRight className="w-3 h-3" />
                      {fmt(order.remaining_to_invoice)} future contract revenue
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Section D: Complete but Not Fully Billed */}
      {completedUnbilled.length > 0 && (
        <div ref={completedRef} className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-amber-100 bg-amber-50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                <Banknote className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">Projects Complete — Unbilled Balance</h3>
                <p className="text-xs text-gray-600">These projects are done. Collect the remaining balance now.</p>
              </div>
              <div className="ml-auto text-right">
                <div className="text-lg font-bold text-amber-600">
                  {fmt(completedUnbilled.reduce((s, o) => s + o.remaining_to_invoice, 0))}
                </div>
                <div className="text-xs text-amber-500">uncollected</div>
              </div>
            </div>
          </div>

          <div className="divide-y divide-amber-50">
            {completedUnbilled.map(order => (
              <div key={order.id} className="px-6 py-4 hover:bg-amber-50/50 transition-colors">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{order.customer_name}</span>
                      <span className="text-xs text-gray-400">#{order.order_number}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">complete</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span>Contract: <span className="font-medium">{fmt(order.contract_total)}</span></span>
                      <span>Invoiced: <span className="font-medium">{fmt(order.total_invoiced)}</span></span>
                      <span>Paid: <span className="font-medium text-green-600">{fmt(order.total_paid)}</span></span>
                    </div>
                    <div className="mt-2">
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex">
                        {order.total_paid > 0 && (
                          <div
                            className="h-full bg-green-500"
                            style={{ width: `${Math.min(100, (order.total_paid / order.contract_total) * 100)}%` }}
                          />
                        )}
                        {order.outstanding > 0 && (
                          <div
                            className="h-full bg-amber-400"
                            style={{ width: `${Math.min(100 - (order.total_paid / order.contract_total) * 100, (order.outstanding / order.contract_total) * 100)}%` }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-bold text-amber-600">{fmt(order.remaining_to_invoice)}</div>
                    <div className="text-xs text-amber-500">remaining to invoice</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section E: Work Orders Assigned to Me for Billing */}
      <div ref={workOrdersRef} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center">
              <Wrench className="w-4 h-4 text-orange-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">Work Orders Assigned to Me for Billing</h3>
              <p className="text-xs text-gray-500">Service jobs where you are the billing rep — create an invoice to close them out</p>
            </div>
          </div>
          {workOrdersToBill.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-semibold">
              {workOrdersToBill.length} pending
            </span>
          )}
        </div>

        {workOrdersToBill.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No work orders waiting for billing</p>
            <p className="text-gray-400 text-sm mt-1">All service jobs assigned to you have been invoiced</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {workOrdersToBill.map(item => {
              const isOverdue = item.billing_deadline && new Date(item.billing_deadline) < new Date();
              const deadlineDays = item.billing_deadline
                ? Math.round((new Date(item.billing_deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                : null;

              const statusStyles: Record<string, string> = {
                ready_for_billing: 'bg-blue-50 text-blue-700',
                assigned: 'bg-yellow-50 text-yellow-700',
                in_progress: 'bg-orange-50 text-orange-700',
                overdue: 'bg-red-50 text-red-700',
              };
              const statusLabel: Record<string, string> = {
                ready_for_billing: 'Ready to Bill',
                assigned: 'Assigned',
                in_progress: 'In Progress',
                overdue: 'Overdue',
              };

              const typeLabel: Record<string, string> = {
                service: 'Service',
                warranty: 'Warranty',
                callback: 'Callback',
                installation: 'Installation',
                inspection: 'Inspection',
                project: 'Project',
              };

              return (
                <div key={item.id} className={`px-6 py-4 hover:bg-gray-50 transition-colors ${isOverdue ? 'border-l-4 border-red-400' : ''}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">{item.customer_name}</span>
                        {item.work_order_number && (
                          <span className="text-xs text-gray-400 font-mono">#{item.work_order_number}</span>
                        )}
                        {item.work_order_type && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">
                            {typeLabel[item.work_order_type] || item.work_order_type}
                          </span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusStyles[item.status] || 'bg-gray-100 text-gray-600'}`}>
                          {statusLabel[item.status] || item.status}
                        </span>
                      </div>
                      {item.description && (
                        <p className="mt-1 text-sm text-gray-500 line-clamp-1">{item.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-400 flex-wrap">
                        {item.completed_at && (
                          <span className="flex items-center gap-1">
                            <CheckCircle className="w-3 h-3 text-green-500" />
                            Completed {new Date(item.completed_at).toLocaleDateString()}
                          </span>
                        )}
                        {item.assigned_at && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Assigned {new Date(item.assigned_at).toLocaleDateString()}
                          </span>
                        )}
                        {item.billing_deadline && (
                          <span className={`flex items-center gap-1 font-medium ${isOverdue ? 'text-red-600' : deadlineDays !== null && deadlineDays <= 3 ? 'text-orange-500' : 'text-gray-400'}`}>
                            <Clock className="w-3 h-3" />
                            {isOverdue
                              ? `Billing deadline passed ${Math.abs(deadlineDays ?? 0)}d ago`
                              : `Bill by ${new Date(item.billing_deadline).toLocaleDateString()}`}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0">
                      <a
                        href="#service_billing"
                        onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('navigate-tab', { detail: 'service_billing' })); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Go to Billing Queue
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Summary Footer */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-xl p-6 text-white">
        <div className="flex items-center gap-3 mb-4">
          <Layers className="w-5 h-5 text-blue-400" />
          <h3 className="font-semibold text-lg">Billing Summary</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <SummaryFooterItem label="Open Receivables" value={fmt(kpis.totalReceivables)} color="text-blue-300" />
          <SummaryFooterItem label="Overdue Balance" value={fmt(kpis.overdueAmount)} color={kpis.overdueAmount > 0 ? "text-red-300" : "text-green-300"} />
          <SummaryFooterItem label="Revenue in Pipeline" value={fmt(kpis.approvedPipelineRemaining)} color="text-emerald-300" />
          <SummaryFooterItem label="Work Orders Pending Billing" value={String(kpis.workOrdersToBillCount)} color={kpis.workOrdersToBillCount > 0 ? "text-orange-300" : "text-green-300"} />
          <SummaryFooterItem
            label="Total Cash Opportunity"
            value={fmt(kpis.totalReceivables + kpis.approvedPipelineRemaining)}
            color="text-yellow-300"
          />
        </div>
      </div>

      {/* Payment Modal */}
      {paymentInvoice && (
        <RecordPaymentModal
          invoice={{
            id: paymentInvoice.id,
            invoice_number: paymentInvoice.invoice_number,
            contact_id: paymentInvoice.contact_id,
            total: paymentInvoice.total,
            amount_paid: paymentInvoice.amount_paid,
            amount_due: paymentInvoice.amount_due,
          }}
          onClose={() => setPaymentInvoice(null)}
          onSuccess={() => {
            setPaymentInvoice(null);
            loadAll();
          }}
        />
      )}

      {showSelectCustomer && (
        <SelectCustomerModal
          onClose={() => setShowSelectCustomer(false)}
          onSelect={(contactId, contactName) => {
            setShowSelectCustomer(false);
            setBulkPaymentContact({ id: contactId, name: contactName });
          }}
        />
      )}

      {bulkPaymentContact && (
        <ApplyBulkPaymentModal
          contactId={bulkPaymentContact.id}
          contactName={bulkPaymentContact.name}
          onClose={() => setBulkPaymentContact(null)}
          onSuccess={() => { setBulkPaymentContact(null); loadAll(); }}
        />
      )}

      {viewingDepositInvoiceId && (
        <InvoiceDetailModal
          invoiceId={viewingDepositInvoiceId}
          onClose={() => setViewingDepositInvoiceId(null)}
          onPaymentRecorded={() => { setViewingDepositInvoiceId(null); loadAll(); }}
        />
      )}
    </div>
  );
}

function KPICard({
  label, value, icon: Icon, color, subtitle, onClick
}: {
  label: string; value: string; icon: typeof DollarSign; color: string; subtitle: string; onClick?: () => void;
}) {
  const colorMap: Record<string, { bg: string; icon: string; border: string }> = {
    blue: { bg: 'bg-blue-50', icon: 'text-blue-600', border: 'border-blue-100' },
    red: { bg: 'bg-red-50', icon: 'text-red-600', border: 'border-red-100' },
    green: { bg: 'bg-green-50', icon: 'text-green-600', border: 'border-green-100' },
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', border: 'border-emerald-100' },
    amber: { bg: 'bg-amber-50', icon: 'text-amber-600', border: 'border-amber-100' },
    orange: { bg: 'bg-orange-50', icon: 'text-orange-600', border: 'border-orange-100' },
  };
  const c = colorMap[color] || colorMap.blue;

  return (
    <button
      onClick={onClick}
      className={`bg-white rounded-xl border ${c.border} shadow-sm p-5 text-left hover:shadow-md transition-all group w-full`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className={`w-9 h-9 ${c.bg} rounded-lg flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${c.icon}`} />
        </div>
        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
      </div>
      <div className="text-xl font-bold text-gray-900">{value}</div>
      <div className="text-sm font-medium text-gray-600 mt-0.5">{label}</div>
      <div className="text-xs text-gray-400 mt-1">{subtitle}</div>
    </button>
  );
}

function AgingCell({ value, tier, fmt }: { value: number; tier: string; fmt: (n: number) => string }) {
  if (value === 0) return <span className="text-gray-300">—</span>;

  const styles: Record<string, string> = {
    'current': 'text-green-700 font-medium',
    '1-30': 'text-yellow-700 font-medium',
    '31-60': 'text-orange-600 font-semibold',
    '61-90': 'text-red-600 font-semibold',
    '90+': 'text-red-800 font-bold',
  };

  return <span className={styles[tier] || 'text-gray-700'}>{fmt(value)}</span>;
}

function getInvoiceAgingStyle(daysOverdue: number, status: string) {
  if (status === 'partial') return { badge: 'bg-blue-50 text-blue-700', icon: CreditCard };
  if (daysOverdue === 0) return { badge: 'bg-gray-100 text-gray-600', icon: Send };
  if (daysOverdue <= 30) return { badge: 'bg-yellow-50 text-yellow-700', icon: Clock };
  if (daysOverdue <= 60) return { badge: 'bg-orange-50 text-orange-700', icon: AlertCircle };
  if (daysOverdue <= 90) return { badge: 'bg-red-50 text-red-700', icon: AlertCircle };
  return { badge: 'bg-red-100 text-red-800', icon: AlertCircle };
}

function SummaryFooterItem({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-400 mt-0.5">{label}</div>
    </div>
  );
}
