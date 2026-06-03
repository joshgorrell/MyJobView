import { useState, useEffect } from 'react';
import { AlertTriangle, TrendingDown, ShoppingCart, Package } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface LowStockItem {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  product_category: string;
  warehouse_id: string;
  warehouse_name: string;
  quantity_available: number;
  reorder_point: number;
  reorder_quantity: number;
  days_until_stockout: number;
  vendor_name: string;
  unit_price: number;
}

export function LowStockAlerts() {
  const [alerts, setAlerts] = useState<LowStockItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAlerts();
  }, []);

  async function loadAlerts() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('product_inventory')
        .select(`
          *,
          products!inner (
            id,
            name,
            sku,
            category,
            unit_price,
            vendor_id,
            vendors (
              vendor_name
            )
          ),
          warehouses!inner (
            id,
            name
          )
        `)
        .lte('quantity_available', supabase.rpc('reorder_point'))
        .order('quantity_available', { ascending: true });

      if (error) throw error;

      const formattedAlerts = (data || [])
        .filter((item: any) => item.quantity_available <= item.reorder_point)
        .map((item: any) => {
          const daysUntilStockout = item.quantity_available <= 0 ? 0 :
            Math.floor((item.quantity_available / Math.max(item.reorder_quantity, 1)) * 30);

          return {
            id: item.id,
            product_id: item.products.id,
            product_name: item.products.name,
            product_sku: item.products.sku || 'N/A',
            product_category: item.products.category || 'Uncategorized',
            warehouse_id: item.warehouses.id,
            warehouse_name: item.warehouses.name,
            quantity_available: item.quantity_available,
            reorder_point: item.reorder_point,
            reorder_quantity: item.reorder_quantity,
            days_until_stockout: daysUntilStockout,
            vendor_name: item.products.vendors?.vendor_name || 'No Vendor',
            unit_price: item.products.unit_price || 0,
          };
        });

      setAlerts(formattedAlerts);
    } catch (error) {
      console.error('Error loading alerts:', error);
    } finally {
      setLoading(false);
    }
  }

  const outOfStockItems = alerts.filter((item) => item.quantity_available <= 0);
  const lowStockItems = alerts.filter((item) => item.quantity_available > 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-sm text-gray-600">Loading alerts...</p>
        </div>
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="text-center py-12">
        <Package className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">All Stock Levels Good</h3>
        <p className="text-gray-300">No items currently require attention</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {outOfStockItems.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown className="w-5 h-5 text-red-600" />
            <h3 className="text-lg font-semibold text-gray-900">
              Out of Stock ({outOfStockItems.length})
            </h3>
          </div>
          <div className="space-y-3">
            {outOfStockItems.map((item) => (
              <AlertCard key={item.id} item={item} severity="critical" />
            ))}
          </div>
        </div>
      )}

      {lowStockItems.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-yellow-600" />
            <h3 className="text-lg font-semibold text-gray-900">
              Low Stock ({lowStockItems.length})
            </h3>
          </div>
          <div className="space-y-3">
            {lowStockItems.map((item) => (
              <AlertCard key={item.id} item={item} severity="warning" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface AlertCardProps {
  item: LowStockItem;
  severity: 'critical' | 'warning';
}

function AlertCard({ item, severity }: AlertCardProps) {
  const isCritical = severity === 'critical';

  return (
    <div
      className={`p-4 rounded-lg border-l-4 ${
        isCritical
          ? 'bg-red-50 border-red-500'
          : 'bg-yellow-50 border-yellow-500'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                isCritical ? 'bg-red-100' : 'bg-yellow-100'
              }`}
            >
              {isCritical ? (
                <TrendingDown className="w-5 h-5 text-red-600" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-yellow-600" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h4 className={`font-semibold ${isCritical ? 'text-red-900' : 'text-yellow-900'}`}>
                {item.product_name}
              </h4>
              <div className="mt-1 space-y-1">
                <p className={`text-sm ${isCritical ? 'text-red-700' : 'text-yellow-700'}`}>
                  <span className="font-medium">SKU:</span> {item.product_sku} | <span className="font-medium">Category:</span> {item.product_category}
                </p>
                <p className={`text-sm ${isCritical ? 'text-red-700' : 'text-yellow-700'}`}>
                  <span className="font-medium">Warehouse:</span> {item.warehouse_name}
                </p>
                <p className={`text-sm ${isCritical ? 'text-red-700' : 'text-yellow-700'}`}>
                  <span className="font-medium">Vendor:</span> {item.vendor_name}
                </p>
              </div>

              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <div>
                  <span className={`${isCritical ? 'text-red-600' : 'text-yellow-600'}`}>Available:</span>
                  <span className={`ml-1 font-bold ${isCritical ? 'text-red-900' : 'text-yellow-900'}`}>
                    {item.quantity_available}
                  </span>
                </div>
                <div>
                  <span className={`${isCritical ? 'text-red-600' : 'text-yellow-600'}`}>Reorder Point:</span>
                  <span className={`ml-1 font-semibold ${isCritical ? 'text-red-900' : 'text-yellow-900'}`}>
                    {item.reorder_point}
                  </span>
                </div>
                <div>
                  <span className={`${isCritical ? 'text-red-600' : 'text-yellow-600'}`}>Suggested Order:</span>
                  <span className={`ml-1 font-semibold ${isCritical ? 'text-red-900' : 'text-yellow-900'}`}>
                    {item.reorder_quantity}
                  </span>
                </div>
                {!isCritical && item.days_until_stockout > 0 && (
                  <div>
                    <span className="text-yellow-600">Est. Days Until Out:</span>
                    <span className="ml-1 font-semibold text-yellow-900">
                      ~{item.days_until_stockout} days
                    </span>
                  </div>
                )}
              </div>

              {item.reorder_quantity > 0 && (
                <div className={`mt-3 p-3 rounded-lg ${isCritical ? 'bg-red-100' : 'bg-yellow-100'}`}>
                  <p className={`text-sm font-medium ${isCritical ? 'text-red-900' : 'text-yellow-900'}`}>
                    Recommended Order: {item.reorder_quantity} units @ ${item.unit_price.toFixed(2)} = ${(item.reorder_quantity * item.unit_price).toFixed(2)}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-shrink-0 ml-4">
          <button
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              isCritical
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-yellow-600 hover:bg-yellow-700 text-white'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            Create PO
          </button>
        </div>
      </div>
    </div>
  );
}
