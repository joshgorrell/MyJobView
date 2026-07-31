import { useState, useEffect } from 'react';
import { Plus, ShoppingCart, Package, Truck, CheckCircle, XCircle, Mail } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
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
  expected_date: string;
  total: number;
  items_count: number;
  items_received: number;
}

export function PurchaseOrders() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => {
    loadOrders();
  }, []);

  async function loadOrders() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('purchase_orders')
        .select(`
          *,
          vendors!inner (
            vendor_name
          ),
          warehouses!inner (
            name
          ),
          purchase_order_items (
            id,
            quantity_ordered,
            quantity_received
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formattedOrders = (data || []).map((po: any) => {
        const items = po.purchase_order_items || [];
        const itemsCount = items.length;
        const itemsReceived = items.filter((i: any) => i.quantity_received >= i.quantity_ordered).length;

        return {
          id: po.id,
          po_number: po.po_number,
          vendor_name: po.vendors.vendor_name,
          vendor_email: po.vendors.email || null,
          warehouse_name: po.warehouses.name,
          status: po.status,
          order_date: po.order_date,
          expected_date: po.expected_date,
          total: po.total,
          items_count: itemsCount,
          items_received: itemsReceived,
        };
      });

      setOrders(formattedOrders);
    } catch (error) {
      console.error('Error loading purchase orders:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredOrders = filterStatus === 'all'
    ? orders
    : orders.filter(po => po.status === filterStatus);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-sm text-gray-600">Loading purchase orders...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white">Purchase Orders</h2>
          <p className="text-gray-300">Manage incoming inventory from vendors</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Create PO
        </button>
      </div>

      <div className="flex gap-2">
        <FilterButton
          label="All"
          count={orders.length}
          active={filterStatus === 'all'}
          onClick={() => setFilterStatus('all')}
        />
        <FilterButton
          label="Draft"
          count={orders.filter(po => po.status === 'draft').length}
          active={filterStatus === 'draft'}
          onClick={() => setFilterStatus('draft')}
        />
        <FilterButton
          label="Sent"
          count={orders.filter(po => po.status === 'sent').length}
          active={filterStatus === 'sent'}
          onClick={() => setFilterStatus('sent')}
        />
        <FilterButton
          label="Partial"
          count={orders.filter(po => po.status === 'partial').length}
          active={filterStatus === 'partial'}
          onClick={() => setFilterStatus('partial')}
        />
        <FilterButton
          label="Received"
          count={orders.filter(po => po.status === 'received').length}
          active={filterStatus === 'received'}
          onClick={() => setFilterStatus('received')}
        />
      </div>

      {filteredOrders.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm border border-gray-200">
          <ShoppingCart className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Purchase Orders</h3>
          <p className="text-gray-600 mb-4">Get started by creating your first purchase order</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create PO
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredOrders.map((po) => (
            <PurchaseOrderCard
              key={po.id}
              po={po}
              onReceive={() => setSelectedPO(po)}
              onUpdate={loadOrders}
            />
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreatePurchaseOrderModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            loadOrders();
            setShowCreateModal(false);
          }}
        />
      )}

      {selectedPO && (
        <ReceivePOModal
          poId={selectedPO.id}
          poNumber={selectedPO.po_number}
          onClose={() => setSelectedPO(null)}
          onSuccess={() => {
            loadOrders();
            setSelectedPO(null);
          }}
        />
      )}
    </div>
  );
}

function FilterButton({
  label,
  count,
  active,
  onClick
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-blue-600 text-white'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      }`}
    >
      {label} ({count})
    </button>
  );
}

function PurchaseOrderCard({
  po,
  onReceive,
  onUpdate
}: {
  po: PurchaseOrder;
  onReceive: () => void;
  onUpdate: () => void;
}) {
  const [emailing, setEmailing] = useState(false);

  const handleEmailPO = async () => {
    if (!po.vendor_email) {
      alert('This vendor does not have an email address on file');
      return;
    }
    if (!confirm(`Email PO ${po.po_number} to ${po.vendor_name} at ${po.vendor_email}?`)) return;

    setEmailing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-purchase-order-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ poId: po.id }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to send email');
      }
      alert(`PO ${po.po_number} emailed to ${po.vendor_name}`);
      onUpdate();
    } catch (err: any) {
      alert(`Error emailing PO: ${err.message}`);
    } finally {
      setEmailing(false);
    }
  };

  const StatusIcon = {
    draft: Package,
    sent: Truck,
    partial: Package,
    received: CheckCircle,
    cancelled: XCircle,
  }[po.status] || Package;

  const statusColors = {
    draft: 'bg-gray-100 text-gray-700',
    sent: 'bg-blue-100 text-blue-700',
    partial: 'bg-yellow-100 text-yellow-700',
    received: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
  };

  const statusColor = statusColors[po.status as keyof typeof statusColors] || statusColors.draft;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${statusColor}`}>
            <StatusIcon className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{po.po_number}</h3>
            <p className="text-sm text-gray-600">{po.vendor_name}</p>
            <p className="text-xs text-gray-500 mt-1">Warehouse: {po.warehouse_name}</p>
          </div>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColor}`}>
          {po.status.charAt(0).toUpperCase() + po.status.slice(1)}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-4">
        <div>
          <p className="text-xs text-gray-600">Order Date</p>
          <p className="text-sm font-medium text-gray-900">
            {new Date(po.order_date).toLocaleDateString()}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-600">Expected Date</p>
          <p className="text-sm font-medium text-gray-900">
            {po.expected_date ? new Date(po.expected_date).toLocaleDateString() : 'TBD'}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-600">Items</p>
          <p className="text-sm font-medium text-gray-900">
            {po.items_received} / {po.items_count} received
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-600">Total Amount</p>
          <p className="text-sm font-medium text-gray-900">{formatCurrency(po.total)}</p>
        </div>
      </div>

      {po.status !== 'received' && po.status !== 'cancelled' && (
        <div className="flex gap-2 pt-4 border-t border-gray-200">
          <button
            onClick={onReceive}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            Receive Items
          </button>
          {(po.status === 'draft' || po.status === 'sent') && (
            <button
              onClick={handleEmailPO}
              disabled={emailing}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium disabled:opacity-50 flex items-center gap-2"
            >
              <Mail className="w-4 h-4" />
              {emailing ? 'Sending...' : 'Email to Vendor'}
            </button>
          )}
          {po.status === 'draft' && (
            <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium">
              Edit
            </button>
          )}
        </div>
      )}
    </div>
  );
}
