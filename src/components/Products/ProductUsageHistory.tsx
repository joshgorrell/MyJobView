import { useState, useEffect, useCallback } from 'react';
import { FileText, ShoppingCart, DollarSign, Package, Calendar, User, TrendingUp, BarChart3 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ProductUsageHistoryProps {
  productId: string;
}

interface UsageItem {
  id: string;
  type: 'proposal' | 'sales_order' | 'invoice' | 'parts_request';
  reference: string;
  customerName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  date: string;
  status?: string;
  link?: string;
}

interface UsageStats {
  totalQuantitySold: number;
  totalRevenue: number;
  averagePrice: number;
  timesUsed: number;
  lastUsed: string | null;
}

export function ProductUsageHistory({ productId }: ProductUsageHistoryProps) {
  const [history, setHistory] = useState<UsageItem[]>([]);
  const [stats, setStats] = useState<UsageStats>({
    totalQuantitySold: 0,
    totalRevenue: 0,
    averagePrice: 0,
    timesUsed: 0,
    lastUsed: null
  });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  const loadUsageHistory = useCallback(async () => {
    setLoading(true);
    const items: UsageItem[] = [];

    try {
      const { data: proposals } = await supabase
        .from('proposal_line_items')
        .select(`
          id,
          quantity,
          unit_price,
          total,
          proposals!inner(
            id,
            proposal_number,
            status,
            created_at,
            contacts!inner(
              full_name,
              business_name
            )
          )
        `)
        .eq('product_id', productId)
        .order('created_at', { ascending: false });

      if (proposals) {
        proposals.forEach((item: any) => {
          const proposal = item.proposals;
          const contact = proposal.contacts;
          items.push({
            id: `proposal-${item.id}`,
            type: 'proposal',
            reference: proposal.proposal_number,
            customerName: contact.business_name || contact.full_name,
            quantity: item.quantity,
            unitPrice: item.unit_price,
            total: item.total,
            date: proposal.created_at,
            status: proposal.status,
            link: `/proposals/${proposal.id}`
          });
        });
      }

      const { data: salesOrders } = await supabase
        .from('sales_order_items')
        .select(`
          id,
          quantity,
          unit_price,
          total,
          sales_orders!inner(
            id,
            order_number,
            status,
            created_at,
            contacts!inner(
              full_name,
              business_name
            )
          )
        `)
        .eq('product_id', productId)
        .order('created_at', { ascending: false });

      if (salesOrders) {
        salesOrders.forEach((item: any) => {
          const order = item.sales_orders;
          const contact = order.contacts;
          items.push({
            id: `order-${item.id}`,
            type: 'sales_order',
            reference: order.order_number,
            customerName: contact.business_name || contact.full_name,
            quantity: item.quantity,
            unitPrice: item.unit_price,
            total: item.total,
            date: order.created_at,
            status: order.status,
            link: `/sales-orders/${order.id}`
          });
        });
      }

      const { data: invoices } = await supabase
        .from('invoice_items')
        .select(`
          id,
          quantity,
          unit_price,
          total,
          invoices!inner(
            id,
            invoice_number,
            status,
            created_at,
            contacts!inner(
              full_name,
              business_name
            )
          )
        `)
        .eq('product_id', productId)
        .order('created_at', { ascending: false });

      if (invoices) {
        invoices.forEach((item: any) => {
          const invoice = item.invoices;
          const contact = invoice.contacts;
          items.push({
            id: `invoice-${item.id}`,
            type: 'invoice',
            reference: invoice.invoice_number,
            customerName: contact.business_name || contact.full_name,
            quantity: item.quantity,
            unitPrice: item.unit_price,
            total: item.total,
            date: invoice.created_at,
            status: invoice.status,
            link: `/invoices/${invoice.id}`
          });
        });
      }

      const { data: partsRequests } = await supabase
        .from('parts_requests')
        .select(`
          id,
          quantity_needed,
          status,
          created_at,
          work_orders!inner(
            id,
            work_order_number,
            contacts(
              full_name,
              business_name
            )
          )
        `)
        .eq('product_id', productId)
        .order('created_at', { ascending: false });

      if (partsRequests) {
        partsRequests.forEach((item: any) => {
          const workOrder = item.work_orders;
          const contact = workOrder.contacts;
          items.push({
            id: `parts-${item.id}`,
            type: 'parts_request',
            reference: workOrder.work_order_number,
            customerName: contact?.business_name || contact?.full_name || 'Internal Use',
            quantity: item.quantity_needed,
            unitPrice: 0,
            total: 0,
            date: item.created_at,
            status: item.status,
            link: `/work-orders/${workOrder.id}`
          });
        });
      }

      items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setHistory(items);

      const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
      const totalRev = items
        .filter(item => item.type !== 'parts_request')
        .reduce((sum, item) => sum + item.total, 0);
      const timesUsed = items.length;
      const avgPrice = timesUsed > 0 ? totalRev / totalQty : 0;
      const lastUsedDate = items.length > 0 ? items[0].date : null;

      setStats({
        totalQuantitySold: totalQty,
        totalRevenue: totalRev,
        averagePrice: avgPrice,
        timesUsed,
        lastUsed: lastUsedDate
      });
    } catch (error) {
      console.error('Error loading product usage history:', error);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    loadUsageHistory();
  }, [loadUsageHistory]);

  const filteredHistory = filter === 'all'
    ? history
    : history.filter(item => item.type === filter);

  const typeConfig = {
    proposal: { icon: FileText, label: 'Proposal', color: 'blue' },
    sales_order: { icon: ShoppingCart, label: 'Sales Order', color: 'green' },
    invoice: { icon: DollarSign, label: 'Invoice', color: 'purple' },
    parts_request: { icon: Package, label: 'Parts Request', color: 'orange' }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <TrendingUp className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Times Used</p>
              <p className="text-2xl font-bold text-gray-900">{stats.timesUsed}</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Package className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Qty Sold</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalQuantitySold}</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <DollarSign className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Total Revenue</p>
              <p className="text-2xl font-bold text-gray-900">
                ${stats.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <BarChart3 className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Avg Price</p>
              <p className="text-2xl font-bold text-gray-900">
                ${stats.averagePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-100 rounded-lg">
              <Calendar className="h-5 w-5 text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Last Used</p>
              <p className="text-sm font-semibold text-gray-900">
                {stats.lastUsed ? new Date(stats.lastUsed).toLocaleDateString() : 'Never'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Usage History</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                  filter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All ({history.length})
              </button>
              <button
                onClick={() => setFilter('proposal')}
                className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                  filter === 'proposal'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Proposals
              </button>
              <button
                onClick={() => setFilter('sales_order')}
                className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                  filter === 'sales_order'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Orders
              </button>
              <button
                onClick={() => setFilter('invoice')}
                className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                  filter === 'invoice'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Invoices
              </button>
              <button
                onClick={() => setFilter('parts_request')}
                className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                  filter === 'parts_request'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Parts
              </button>
            </div>
          </div>
        </div>

        <div className="divide-y divide-gray-200">
          {filteredHistory.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Package className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>No usage history found</p>
              <p className="text-sm mt-1">This product hasn't been used yet</p>
            </div>
          ) : (
            filteredHistory.map((item) => {
              const config = typeConfig[item.type];
              const Icon = config.icon;

              return (
                <div key={item.id} className="p-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      <div className={`p-2 bg-${config.color}-100 rounded-lg`}>
                        <Icon className={`h-5 w-5 text-${config.color}-600`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded bg-${config.color}-100 text-${config.color}-700 font-medium`}>
                            {config.label}
                          </span>
                          <span className="font-semibold text-gray-900">{item.reference}</span>
                          {item.status && (
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              item.status === 'accepted' || item.status === 'paid' || item.status === 'completed'
                                ? 'bg-green-100 text-green-700'
                                : item.status === 'pending' || item.status === 'draft'
                                ? 'bg-yellow-100 text-yellow-700'
                                : item.status === 'declined' || item.status === 'cancelled'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-gray-100 text-gray-700'
                            }`}>
                              {item.status}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <User className="h-4 w-4" />
                          <span className="truncate">{item.customerName}</span>
                          <span className="text-gray-400">•</span>
                          <Calendar className="h-4 w-4" />
                          <span>{new Date(item.date).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <div className="font-semibold text-gray-900">
                        Qty: {item.quantity}
                      </div>
                      {item.type !== 'parts_request' && (
                        <>
                          <div className="text-sm text-gray-600">
                            @ ${item.unitPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div className="text-sm font-semibold text-gray-900">
                            ${item.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
