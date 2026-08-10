import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Mail,
  Package,
  Plus,
  Search,
  Send,
  Trash2,
  Truck,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import { CreatePurchaseOrderModal } from './CreatePurchaseOrderModal';
import { ReceivePOModal } from './ReceivePOModal';

interface PurchaseOrder {
  id: string;
  po_number: string;
  vendor_name: string;
  vendor_email: string | null;
  warehouse_name: string;
  status: string;
  order_date: string;
  expected_date: string | null;
  submitted_at: string | null;
  total: number;
  items_count: number;
  units_ordered: number;
  units_received: number;
  internal_note: string | null;
  external_note: string | null;
}

type FilterStatus = 'all' | 'open' | 'draft' | 'submitted' | 'partial' | 'received';

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  sent: 'Submitted',
  partial: 'Partially Received',
  received: 'Received',
};

const statusClasses: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  submitted: 'bg-blue-50 text-blue-700 border-blue-200',
  sent: 'bg-blue-50 text-blue-700 border-blue-200',
  partial: 'bg-amber-50 text-amber-700 border-amber-200',
  received: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export function PurchaseOrders() {
  const { profile } = useAuth();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const canCreate = profile?.can_create_purchase_orders === true || ['admin', 'manager', 'finance'].includes(profile?.role || '');

  useEffect(() => {
    void loadOrders();
  }, [profile?.organization_id]);

  async function loadOrders() {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10000);
    try {
      setLoading(true);
      setLoadError('');
      if (!profile?.organization_id) {
        setOrders([]);
        setLoadError('Your account is not linked to an organization yet.');
        return;
      }

      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          id, po_number, status, order_date, expected_date, submitted_at, total,
          internal_note, external_note,
          vendors!inner(vendor_name, email),
          warehouses!inner(name),
          po_items(id, quantity, quantity_received)
        `)
        .eq('organization_id', profile.organization_id)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .abortSignal(controller.signal);

      if (error) throw error;

      setOrders((data || []).map((po: any) => {
        const items = Array.isArray(po.po_items) ? po.po_items : [];
        return {
          id: po.id,
          po_number: po.po_number,
          vendor_name: po.vendors?.vendor_name || 'Unknown vendor',
          vendor_email: po.vendors?.email || null,
          warehouse_name: po.warehouses?.name || 'Unknown warehouse',
          status: po.status,
          order_date: po.order_date,
          expected_date: po.expected_date,
          submitted_at: po.submitted_at,
          total: Number(po.total || 0),
          items_count: items.length,
          units_ordered: items.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0),
          units_received: items.reduce((sum: number, item: any) => sum + Number(item.quantity_received || 0), 0),
          internal_note: po.internal_note,
          external_note: po.external_note,
        };
      }));
    } catch (error) {
      console.error('Error loading purchase orders:', error);
      setLoadError('Purchase orders could not be loaded. Please try again.');
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }

  const filteredOrders = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return orders.filter((po) => {
      const matchesStatus = filterStatus === 'all'
        || (filterStatus === 'open' && ['draft', 'submitted', 'sent', 'partial'].includes(po.status))
        || (filterStatus === 'submitted' && ['submitted', 'sent'].includes(po.status))
        || po.status === filterStatus;
      const matchesSearch = !search || [po.po_number, po.vendor_name, po.warehouse_name]
        .some((value) => value.toLowerCase().includes(search));
      return matchesStatus && matchesSearch;
    });
  }, [filterStatus, orders, searchTerm]);

  const openOrders = orders.filter((po) => ['draft', 'submitted', 'sent', 'partial'].includes(po.status));
  const openValue = openOrders.reduce((sum, po) => sum + po.total, 0);
  const receivedCount = orders.filter((po) => po.status === 'received').length;

  if (loading) {
    return <div className="flex items-center justify-center py-16"><div className="text-center"><div className="w-9 h-9 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" /><p className="text-sm text-gray-500">Loading purchase orders...</p></div></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center"><ClipboardList className="w-5 h-5" /></div><div><h2 className="text-xl sm:text-2xl font-bold text-gray-900">Purchase Orders</h2><p className="text-sm text-gray-500">Track every order from draft through receiving</p></div></div>
        </div>
        {canCreate && <button onClick={() => setShowCreateModal(true)} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm font-medium"><Plus className="w-4 h-4" />New Purchase Order</button>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard label="Open orders" value={openOrders.length.toString()} detail={formatCurrency(openValue)} icon={Truck} tone="blue" />
        <SummaryCard label="Awaiting receipt" value={openOrders.filter((po) => po.units_received < po.units_ordered).length.toString()} detail="Need receiving attention" icon={Package} tone="amber" />
        <SummaryCard label="Received orders" value={receivedCount.toString()} detail="Completed purchase orders" icon={CheckCircle2} tone="green" />
      </div>

      {loadError && <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm"><AlertCircle className="w-4 h-4" />{loadError}<button onClick={() => void loadOrders()} className="ml-auto underline font-medium">Retry</button></div>}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-200 space-y-4">
          <div className="relative max-w-md"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search PO number, vendor, or warehouse" className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" /></div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(['all', 'open', 'draft', 'submitted', 'partial', 'received'] as FilterStatus[]).map((filter) => <FilterButton key={filter} label={filter === 'all' ? 'All' : filter === 'partial' ? 'Partially Received' : filter === 'open' ? 'Open' : statusLabels[filter] || filter} count={filter === 'all' ? orders.length : filter === 'open' ? openOrders.length : filter === 'submitted' ? orders.filter((po) => ['submitted', 'sent'].includes(po.status)).length : orders.filter((po) => po.status === filter).length} active={filterStatus === filter} onClick={() => setFilterStatus(filter)} />)}
          </div>
        </div>

        {filteredOrders.length === 0 ? <EmptyState canCreate={canCreate} onCreate={() => setShowCreateModal(true)} hasSearch={Boolean(searchTerm || filterStatus !== 'all')} /> : <div className="divide-y divide-gray-200">{filteredOrders.map((po) => <PurchaseOrderRow key={po.id} po={po} canCreate={canCreate} onReceive={() => setSelectedPO(po)} onUpdate={() => void loadOrders()} />)}</div>}
      </div>

      {showCreateModal && <CreatePurchaseOrderModal onClose={() => setShowCreateModal(false)} onSuccess={() => { setShowCreateModal(false); void loadOrders(); }} />}
      {selectedPO && <ReceivePOModal poId={selectedPO.id} poNumber={selectedPO.po_number} onClose={() => setSelectedPO(null)} onSuccess={() => { setSelectedPO(null); void loadOrders(); }} />}
    </div>
  );
}

function SummaryCard({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: React.ComponentType<{ className?: string }>; tone: 'blue' | 'amber' | 'green' }) {
  const tones = { blue: 'bg-blue-50 text-blue-600', amber: 'bg-amber-50 text-amber-600', green: 'bg-emerald-50 text-emerald-600' };
  return <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-sm text-gray-500">{label}</p><p className="text-2xl font-bold text-gray-900 mt-1">{value}</p><p className="text-xs text-gray-500 mt-1">{detail}</p></div><div className={`w-9 h-9 rounded-lg flex items-center justify-center ${tones[tone]}`}><Icon className="w-4 h-4" /></div></div></div>;
}

function FilterButton({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return <button onClick={onClick} className={`whitespace-nowrap px-3 py-2 rounded-lg text-sm font-medium transition-colors ${active ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{label} <span className={active ? 'text-blue-100' : 'text-gray-400'}>({count})</span></button>;
}

function EmptyState({ canCreate, onCreate, hasSearch }: { canCreate: boolean; onCreate: () => void; hasSearch: boolean }) {
  return <div className="text-center py-14 px-6"><div className="w-14 h-14 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-4"><ClipboardList className="w-7 h-7" /></div><h3 className="text-lg font-semibold text-gray-900">{hasSearch ? 'No matching purchase orders' : 'No purchase orders yet'}</h3><p className="text-sm text-gray-500 mt-1 mb-5">{hasSearch ? 'Try changing the search or filter.' : 'Create your first purchase order to start tracking incoming inventory.'}</p>{canCreate && !hasSearch && <button onClick={onCreate} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"><Plus className="w-4 h-4" />New Purchase Order</button>}</div>;
}

function PurchaseOrderRow({ po, canCreate, onReceive, onUpdate }: { po: PurchaseOrder; canCreate: boolean; onReceive: () => void; onUpdate: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const receivedPercent = po.units_ordered > 0 ? Math.min(100, Math.round((po.units_received / po.units_ordered) * 100)) : 0;
  const statusClass = statusClasses[po.status] || statusClasses.draft;

  async function submitPO() {
    if (!confirm(`Submit ${po.po_number}? It will be ready to send to the vendor.`)) return;
    setBusy(true); setMessage('');
    const { error } = await supabase.from('purchase_orders').update({ status: 'submitted', submitted_at: new Date().toISOString() }).eq('id', po.id).eq('status', 'draft');
    if (error) setMessage('Could not submit this PO.'); else onUpdate();
    setBusy(false);
  }

  async function emailPO() {
    if (!po.vendor_email) { setMessage('This vendor does not have an email address on file.'); return; }
    if (!confirm(`Email ${po.po_number} to ${po.vendor_name}?`)) return;
    setBusy(true); setMessage('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-purchase-order-email`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY }, body: JSON.stringify({ poId: po.id }) });
      if (!response.ok) throw new Error('Email could not be sent.');
      setMessage('Purchase order emailed and submitted.');
      onUpdate();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Email could not be sent.'); }
    setBusy(false);
  }

  async function deletePO() {
    if (!confirm(`Delete ${po.po_number}? This cannot be undone.`)) return;
    setBusy(true); setMessage('');
    const { error } = await supabase.from('purchase_orders').delete().eq('id', po.id);
    if (error) setMessage('Could not delete this PO.'); else onUpdate();
    setBusy(false);
  }

  return <div className="p-4 sm:p-5 hover:bg-gray-50/70 transition-colors"><div className="flex flex-col lg:flex-row lg:items-center gap-4"><div className="flex items-start gap-3 min-w-0 flex-1"><button onClick={() => setExpanded(!expanded)} className="mt-1 text-gray-400 hover:text-gray-700">{expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}</button><div className={`w-10 h-10 rounded-lg border flex items-center justify-center shrink-0 ${statusClass}`}><Package className="w-5 h-5" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-gray-900">{po.po_number}</span><span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${statusClass}`}>{statusLabels[po.status] || po.status}</span></div><p className="text-sm text-gray-700 mt-1 truncate">{po.vendor_name}</p><p className="text-xs text-gray-500 mt-0.5">{po.warehouse_name} · Ordered {new Date(po.order_date).toLocaleDateString()}</p></div></div><div className="grid grid-cols-3 gap-4 lg:w-[430px] lg:shrink-0"><div><p className="text-xs text-gray-500">Expected</p><p className="text-sm font-medium text-gray-800">{po.expected_date ? new Date(po.expected_date).toLocaleDateString() : 'Not set'}</p></div><div><p className="text-xs text-gray-500">Receiving</p><p className="text-sm font-medium text-gray-800">{po.units_received} / {po.units_ordered} units</p><div className="h-1.5 bg-gray-200 rounded-full mt-1 overflow-hidden"><div className={`h-full ${receivedPercent === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${receivedPercent}%` }} /></div></div><div><p className="text-xs text-gray-500">Total</p><p className="text-sm font-semibold text-gray-900">{formatCurrency(po.total)}</p></div></div></div>{message && <div className="mt-3 ml-8 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{message}</div>}{expanded && <div className="mt-4 ml-8 pt-4 border-t border-gray-100"><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mb-4"><div><span className="text-gray-500">Items:</span> <span className="font-medium text-gray-800">{po.items_count}</span></div><div><span className="text-gray-500">Vendor email:</span> <span className="font-medium text-gray-800">{po.vendor_email || 'Not available'}</span></div>{po.internal_note && <div className="sm:col-span-2"><span className="text-gray-500">Internal note:</span> <span className="text-gray-800">{po.internal_note}</span></div>}{po.external_note && <div className="sm:col-span-2"><span className="text-gray-500">Vendor note:</span> <span className="text-gray-800">{po.external_note}</span></div>}</div><div className="flex flex-wrap gap-2"><button onClick={onReceive} disabled={po.status === 'received' || busy} className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"><Package className="w-4 h-4" />Receive Items</button>{po.status === 'draft' && canCreate && <button onClick={() => void submitPO()} disabled={busy} className="inline-flex items-center gap-2 px-3 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 disabled:opacity-50 text-sm font-medium"><Send className="w-4 h-4" />Submit PO</button>}{['draft', 'submitted', 'sent'].includes(po.status) && canCreate && <button onClick={() => void emailPO()} disabled={busy} className="inline-flex items-center gap-2 px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium"><Mail className="w-4 h-4" />Email Vendor</button>}{po.status === 'draft' && canCreate && <button onClick={() => void deletePO()} disabled={busy} className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 text-sm font-medium"><Trash2 className="w-4 h-4" />Delete Draft</button>}</div></div>}</div>;
}
