import { useState, useEffect } from 'react';
import { Search, Filter, Package, AlertTriangle, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface InventoryItem {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  product_category: string;
  warehouse_id: string;
  warehouse_name: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  quantity_available: number;
  reorder_point: number;
  reorder_quantity: number;
  unit_price: number;
  cost: number;
  stock_value: number;
}

interface InventoryListProps {
  onUpdate?: () => void;
}

export function InventoryList({ onUpdate }: InventoryListProps) {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [filteredInventory, setFilteredInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'low' | 'out'>('all');
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all');
  const [warehouses, setWarehouses] = useState<any[]>([]);

  useEffect(() => {
    loadWarehouses();
    loadInventory();
  }, []);

  useEffect(() => {
    filterInventoryList();
  }, [inventory, searchTerm, filterStatus, selectedWarehouse]);

  async function loadWarehouses() {
    try {
      const { data, error } = await supabase
        .from('warehouses')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setWarehouses(data || []);
    } catch (error) {
      console.error('Error loading warehouses:', error);
    }
  }

  async function loadInventory() {
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
            cost
          ),
          warehouses!inner (
            id,
            name
          )
        `)
        .order('products(name)');

      if (error) throw error;

      const formattedData = (data || []).map((item: any) => ({
        id: item.id,
        product_id: item.products.id,
        product_name: item.products.name,
        product_sku: item.products.sku || 'N/A',
        product_category: item.products.category || 'Uncategorized',
        warehouse_id: item.warehouses.id,
        warehouse_name: item.warehouses.name,
        quantity_on_hand: item.quantity_on_hand,
        quantity_reserved: item.quantity_reserved,
        quantity_available: item.quantity_available,
        reorder_point: item.reorder_point,
        reorder_quantity: item.reorder_quantity,
        unit_price: item.products.unit_price || 0,
        cost: item.products.cost || 0,
        stock_value: item.quantity_on_hand * (item.products.cost || 0),
      }));

      setInventory(formattedData);
    } catch (error) {
      console.error('Error loading inventory:', error);
    } finally {
      setLoading(false);
    }
  }

  function filterInventoryList() {
    let filtered = [...inventory];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.product_name.toLowerCase().includes(term) ||
          item.product_sku.toLowerCase().includes(term) ||
          item.product_category.toLowerCase().includes(term)
      );
    }

    if (filterStatus === 'low') {
      filtered = filtered.filter(
        (item) => item.quantity_available > 0 && item.quantity_available <= item.reorder_point
      );
    } else if (filterStatus === 'out') {
      filtered = filtered.filter((item) => item.quantity_available <= 0);
    }

    if (selectedWarehouse !== 'all') {
      filtered = filtered.filter((item) => item.warehouse_id === selectedWarehouse);
    }

    setFilteredInventory(filtered);
  }

  function getStockStatus(item: InventoryItem): 'good' | 'low' | 'out' {
    if (item.quantity_available <= 0) return 'out';
    if (item.quantity_available <= item.reorder_point) return 'low';
    return 'good';
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-sm text-gray-600">Loading inventory...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by product name, SKU, or category..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <select
          value={selectedWarehouse}
          onChange={(e) => setSelectedWarehouse(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="all">All Warehouses</option>
          {warehouses.map((wh) => (
            <option key={wh.id} value={wh.id}>
              {wh.name}
            </option>
          ))}
        </select>

        <div className="flex gap-2">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filterStatus === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterStatus('low')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filterStatus === 'low'
                ? 'bg-yellow-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Low Stock
          </button>
          <button
            onClick={() => setFilterStatus('out')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filterStatus === 'out'
                ? 'bg-red-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Out of Stock
          </button>
        </div>
      </div>

      <div className="text-sm text-gray-600">
        Showing {filteredInventory.length} of {inventory.length} items
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Product</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">SKU</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Warehouse</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">On Hand</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Reserved</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Available</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Reorder Point</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Stock Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredInventory.map((item) => {
              const status = getStockStatus(item);
              return (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <StockStatusBadge status={status} />
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-gray-900">{item.product_name}</p>
                      <p className="text-xs text-gray-500">{item.product_category}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{item.product_sku}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{item.warehouse_name}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-900">{item.quantity_on_hand}</td>
                  <td className="px-4 py-3 text-right text-sm text-gray-600">{item.quantity_reserved}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`text-sm font-medium ${
                      status === 'out' ? 'text-red-600' :
                      status === 'low' ? 'text-yellow-600' :
                      'text-green-600'
                    }`}>
                      {item.quantity_available}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-600">{item.reorder_point}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                    ${item.stock_value.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredInventory.length === 0 && (
          <div className="text-center py-12">
            <Package className="w-12 h-12 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-300">No inventory items found</p>
          </div>
        )}
      </div>
    </div>
  );
}

function StockStatusBadge({ status }: { status: 'good' | 'low' | 'out' }) {
  if (status === 'out') {
    return (
      <div className="flex items-center gap-1 text-red-600">
        <AlertTriangle className="w-4 h-4" />
      </div>
    );
  }
  if (status === 'low') {
    return (
      <div className="flex items-center gap-1 text-yellow-600">
        <AlertTriangle className="w-4 h-4" />
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 text-green-600">
      <CheckCircle className="w-4 h-4" />
    </div>
  );
}
