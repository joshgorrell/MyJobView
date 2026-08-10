import { useState, useEffect } from 'react';
import { Package, Warehouse, AlertTriangle, TrendingUp, TrendingDown, BarChart3, Inbox, PackageSearch, ArrowRightLeft, List, ClipboardList } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { InventoryList } from './InventoryList';
import { LowStockAlerts } from './LowStockAlerts';
import { WarehouseReceive } from './WarehouseReceive';
import { WarehousePick } from './WarehousePick';
import { WarehouseTransfer } from './WarehouseTransfer';
import { StockLevels } from './StockLevels';
import { PurchaseOrders } from './PurchaseOrders';

interface DashboardStats {
  total_products: number;
  total_value: number;
  low_stock_items: number;
  out_of_stock_items: number;
  total_warehouses: number;
}

type TabType = 'overview' | 'inventory' | 'alerts' | 'receive' | 'pick' | 'transfer' | 'stock_levels' | 'purchase_orders';

export function InventoryDashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    total_products: 0,
    total_value: 0,
    low_stock_items: 0,
    out_of_stock_items: 0,
    total_warehouses: 0,
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  useEffect(() => {
    void loadStats();
  }, [profile?.id]);

  async function loadStats() {
    const companyId = (profile as typeof profile & { company_id?: string | null })?.company_id;
    if (!companyId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const timeout = new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error('Inventory loading timed out')), 10000);
      });

      const [productsRes, inventoryRes, warehousesRes] = await Promise.race([Promise.all([
        supabase
          .from('products')
          .select('id, cost', { count: 'exact' })
          .eq('company_id', companyId)
          .eq('is_active', true),
        supabase
          .from('product_inventory')
          .select(`
            quantity_on_hand,
            quantity_available,
            reorder_point,
            products!inner(cost, company_id)
          `)
          .eq('products.company_id', companyId),
        supabase
          .from('warehouses')
          .select('id', { count: 'exact' })
          .eq('company_id', companyId)
          .eq('is_active', true),
      ]), timeout]);

      const totalProducts = productsRes.count || 0;
      const totalWarehouses = warehousesRes.count || 0;

      let totalValue = 0;
      let lowStockCount = 0;
      let outOfStockCount = 0;

      if (inventoryRes.data) {
        inventoryRes.data.forEach((inv: any) => {
          const cost = inv.products?.cost || 0;
          totalValue += inv.quantity_on_hand * cost;

          if (inv.quantity_available <= 0) {
            outOfStockCount++;
          } else if (inv.quantity_available <= inv.reorder_point) {
            lowStockCount++;
          }
        });
      }

      setStats({
        total_products: totalProducts,
        total_value: totalValue,
        low_stock_items: lowStockCount,
        out_of_stock_items: outOfStockCount,
        total_warehouses: totalWarehouses,
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-300">Loading inventory...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Inventory Management</h1>
        <p className="text-gray-300">Track stock levels, manage warehouses, and process orders</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Total Products"
          value={stats.total_products.toLocaleString()}
          icon={Package}
          color="blue"
        />
        <StatCard
          title="Inventory Value"
          value={`$${stats.total_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          icon={TrendingUp}
          color="green"
        />
        <StatCard
          title="Low Stock Items"
          value={stats.low_stock_items.toLocaleString()}
          icon={AlertTriangle}
          color="yellow"
          alert={stats.low_stock_items > 0}
        />
        <StatCard
          title="Out of Stock"
          value={stats.out_of_stock_items.toLocaleString()}
          icon={TrendingDown}
          color="red"
          alert={stats.out_of_stock_items > 0}
        />
        <StatCard
          title="Warehouses"
          value={stats.total_warehouses.toLocaleString()}
          icon={Warehouse}
          color="purple"
        />
      </div>

      <div className="bg-gray-800 rounded-lg shadow-sm border border-gray-700">
        <div className="border-b border-gray-700">
          <div className="flex overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 ${
                activeTab === 'overview'
                  ? 'text-blue-400 border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Overview
            </button>
            <button
              onClick={() => setActiveTab('inventory')}
              className={`px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 ${
                activeTab === 'inventory'
                  ? 'text-blue-400 border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Package className="w-4 h-4" />
              Inventory List
            </button>
            <button
              onClick={() => setActiveTab('purchase_orders')}
              className={`px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 ${
                activeTab === 'purchase_orders'
                  ? 'text-blue-400 border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <ClipboardList className="w-4 h-4" />
              Purchase Orders
            </button>
            <button
              onClick={() => setActiveTab('stock_levels')}
              className={`px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 ${
                activeTab === 'stock_levels'
                  ? 'text-blue-400 border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <List className="w-4 h-4" />
              Stock Levels
            </button>
            <button
              onClick={() => setActiveTab('receive')}
              className={`px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 ${
                activeTab === 'receive'
                  ? 'text-blue-400 border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Inbox className="w-4 h-4" />
              Receive
            </button>
            <button
              onClick={() => setActiveTab('pick')}
              className={`px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 ${
                activeTab === 'pick'
                  ? 'text-blue-400 border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <PackageSearch className="w-4 h-4" />
              Pick
            </button>
            <button
              onClick={() => setActiveTab('transfer')}
              className={`px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 ${
                activeTab === 'transfer'
                  ? 'text-blue-400 border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <ArrowRightLeft className="w-4 h-4" />
              Transfer
            </button>
            <button
              onClick={() => setActiveTab('alerts')}
              className={`px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 relative ${
                activeTab === 'alerts'
                  ? 'text-blue-400 border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
              Alerts
              {(stats.low_stock_items + stats.out_of_stock_items) > 0 && (
                <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full"></span>
              )}
            </button>
          </div>
        </div>

        <div className="p-6">
          {activeTab === 'overview' && (
            <OverviewTab stats={stats} />
          )}
          {activeTab === 'inventory' && (
            <InventoryList onUpdate={loadStats} />
          )}
          {activeTab === 'stock_levels' && (
            <StockLevels />
          )}
          {activeTab === 'purchase_orders' && (
            <PurchaseOrders />
          )}
          {activeTab === 'receive' && (
            <WarehouseReceive />
          )}
          {activeTab === 'pick' && (
            <WarehousePick />
          )}
          {activeTab === 'transfer' && (
            <WarehouseTransfer />
          )}
          {activeTab === 'alerts' && (
            <LowStockAlerts />
          )}
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color: 'blue' | 'green' | 'yellow' | 'red' | 'purple';
  alert?: boolean;
}

function StatCard({ title, value, icon: Icon, color, alert }: StatCardProps) {
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    yellow: 'bg-yellow-100 text-yellow-600',
    red: 'bg-red-100 text-red-600',
    purple: 'bg-purple-100 text-purple-600',
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-4 ${alert ? 'ring-2 ring-yellow-400' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-600">{title}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorClasses[color]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </div>
  );
}

function OverviewTab({ stats }: { stats: DashboardStats }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            Inventory Summary
          </h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-600">Active Products</span>
              <span className="font-semibold text-gray-900">{stats.total_products}</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-600">Total Inventory Value</span>
              <span className="font-semibold text-gray-900">
                ${stats.total_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-600">Active Warehouses</span>
              <span className="font-semibold text-gray-900">{stats.total_warehouses}</span>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-600" />
            Stock Alerts
          </h3>
          <div className="space-y-3">
            {stats.out_of_stock_items > 0 && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                    <TrendingDown className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-red-900">{stats.out_of_stock_items} Out of Stock</p>
                    <p className="text-sm text-red-700">Items need immediate restocking</p>
                  </div>
                </div>
              </div>
            )}
            {stats.low_stock_items > 0 && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-yellow-900">{stats.low_stock_items} Low Stock</p>
                    <p className="text-sm text-yellow-700">Items below reorder point</p>
                  </div>
                </div>
              </div>
            )}
            {stats.low_stock_items === 0 && stats.out_of_stock_items === 0 && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-green-900">All Stock Levels Good</p>
                    <p className="text-sm text-green-700">No items require attention</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="pt-6 border-t border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left">
            <Package className="w-6 h-6 text-gray-400 mb-2" />
            <p className="font-medium text-gray-900">Add New Product</p>
            <p className="text-sm text-gray-600">Create a new product entry</p>
          </button>
          <button className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left">
            <Warehouse className="w-6 h-6 text-gray-400 mb-2" />
            <p className="font-medium text-gray-900">Receive Stock</p>
            <p className="text-sm text-gray-600">Process incoming inventory</p>
          </button>
          <button className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left">
            <BarChart3 className="w-6 h-6 text-gray-400 mb-2" />
            <p className="font-medium text-gray-900">Stock Adjustment</p>
            <p className="text-sm text-gray-600">Adjust inventory counts</p>
          </button>
        </div>
      </div>
    </div>
  );
}
