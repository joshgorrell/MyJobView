import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Package, MapPin, Hash, Calendar, Search, Filter } from 'lucide-react';

interface StockItem {
  product_id: string;
  product_name: string;
  product_sku: string;
  warehouse_name: string;
  bin_code: string | null;
  quantity_on_hand: number;
  quantity_available: number;
  quantity_reserved: number;
  reorder_point: number;
  last_received_at: string | null;
}

interface SerialLotItem {
  id: string;
  product_name: string;
  serial_number: string | null;
  lot_number: string | null;
  warehouse_name: string;
  bin_code: string | null;
  status: string;
  quantity: number | null;
  expiration_date: string | null;
}

export function StockLevels() {
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [serialLotItems, setSerialLotItems] = useState<SerialLotItem[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showLowStock, setShowLowStock] = useState(false);
  const [activeTab, setActiveTab] = useState<'stock' | 'serial'>('stock');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWarehouses();
  }, []);

  useEffect(() => {
    loadStockLevels();
    if (activeTab === 'serial') {
      loadSerialLot();
    }
  }, [selectedWarehouse, activeTab]);

  async function loadWarehouses() {
    const { data } = await supabase
      .from('warehouses')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (data) {
      setWarehouses(data);
    }
  }

  async function loadStockLevels() {
    setLoading(true);
    try {
      let query = supabase
        .from('product_inventory')
        .select(`
          product_id,
          quantity_on_hand,
          quantity_available,
          quantity_reserved,
          reorder_point,
          last_received_at,
          products (
            name,
            sku
          ),
          warehouses (
            name
          ),
          warehouse_bins (
            bin_code
          )
        `)
        .order('products(name)');

      if (selectedWarehouse !== 'all') {
        query = query.eq('warehouse_id', selectedWarehouse);
      }

      const { data, error } = await query;

      if (data && !error) {
        const items: StockItem[] = data.map((inv: any) => ({
          product_id: inv.product_id,
          product_name: inv.products?.name || 'Unknown Product',
          product_sku: inv.products?.sku || '',
          warehouse_name: inv.warehouses?.name || 'Unknown',
          bin_code: inv.warehouse_bins?.bin_code || null,
          quantity_on_hand: inv.quantity_on_hand,
          quantity_available: inv.quantity_available,
          quantity_reserved: inv.quantity_reserved,
          reorder_point: inv.reorder_point,
          last_received_at: inv.last_received_at
        }));
        setStockItems(items);
      }
    } catch (error) {
      console.error('Error loading stock levels:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadSerialLot() {
    setLoading(true);
    try {
      let query = supabase
        .from('serial_lot_tracking')
        .select(`
          id,
          serial_number,
          lot_number,
          status,
          quantity,
          expiration_date,
          products (
            name
          ),
          warehouses (
            name
          ),
          warehouse_bins (
            bin_code
          )
        `)
        .order('created_at', { ascending: false });

      if (selectedWarehouse !== 'all') {
        query = query.eq('warehouse_id', selectedWarehouse);
      }

      const { data, error } = await query;

      if (data && !error) {
        const items: SerialLotItem[] = data.map((item: any) => ({
          id: item.id,
          product_name: item.products?.name || 'Unknown Product',
          serial_number: item.serial_number,
          lot_number: item.lot_number,
          warehouse_name: item.warehouses?.name || 'Unknown',
          bin_code: item.warehouse_bins?.bin_code || null,
          status: item.status,
          quantity: item.quantity,
          expiration_date: item.expiration_date
        }));
        setSerialLotItems(items);
      }
    } catch (error) {
      console.error('Error loading serial/lot tracking:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredStockItems = stockItems.filter(item => {
    const matchesSearch = !searchTerm ||
      item.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.product_sku.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesLowStock = !showLowStock ||
      item.quantity_available <= item.reorder_point;

    return matchesSearch && matchesLowStock;
  });

  const filteredSerialLotItems = serialLotItems.filter(item =>
    !searchTerm ||
    item.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.serial_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.lot_number?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Stock Levels</h2>
          <p className="text-sm text-gray-400">View detailed inventory with bin locations and serial/lot tracking</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by product name, SKU, serial, or lot number..."
            className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <select
          value={selectedWarehouse}
          onChange={(e) => setSelectedWarehouse(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
        >
          <option value="all">All Warehouses</option>
          {warehouses.map(wh => (
            <option key={wh.id} value={wh.id}>{wh.name}</option>
          ))}
        </select>

        {activeTab === 'stock' && (
          <label className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white cursor-pointer hover:bg-gray-750">
            <input
              type="checkbox"
              checked={showLowStock}
              onChange={(e) => setShowLowStock(e.target.checked)}
              className="rounded bg-gray-700 border-gray-600"
            />
            <Filter className="w-4 h-4 text-gray-400" />
            Low Stock Only
          </label>
        )}
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-lg">
        <div className="border-b border-gray-700 flex">
          <button
            onClick={() => setActiveTab('stock')}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'stock'
                ? 'text-blue-400 border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Package className="w-4 h-4 inline mr-2" />
            Stock Levels
          </button>
          <button
            onClick={() => setActiveTab('serial')}
            className={`px-6 py-3 text-sm font-medium transition-colors ${
              activeTab === 'serial'
                ? 'text-blue-400 border-b-2 border-blue-500'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Hash className="w-4 h-4 inline mr-2" />
            Serial / Lot Tracking
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-400">Loading data...</div>
        ) : (
          <div className="overflow-x-auto">
            {activeTab === 'stock' ? (
              <table className="w-full">
                <thead className="bg-gray-900 border-b border-gray-700">
                  <tr className="text-left text-sm text-gray-400">
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Warehouse</th>
                    <th className="px-4 py-3">Bin</th>
                    <th className="px-4 py-3 text-right">On Hand</th>
                    <th className="px-4 py-3 text-right">Available</th>
                    <th className="px-4 py-3 text-right">Reserved</th>
                    <th className="px-4 py-3 text-right">Reorder Point</th>
                    <th className="px-4 py-3">Last Received</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {filteredStockItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-gray-500">
                        No stock items found
                      </td>
                    </tr>
                  ) : (
                    filteredStockItems.map((item, index) => (
                      <tr
                        key={`${item.product_id}-${item.warehouse_name}-${index}`}
                        className={`border-b border-gray-700 ${
                          item.quantity_available <= item.reorder_point ? 'bg-yellow-900/10' : ''
                        }`}
                      >
                        <td className="px-4 py-3 text-white">{item.product_name}</td>
                        <td className="px-4 py-3 text-gray-400">{item.product_sku}</td>
                        <td className="px-4 py-3 text-gray-400">{item.warehouse_name}</td>
                        <td className="px-4 py-3 text-gray-400">
                          {item.bin_code ? (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {item.bin_code}
                            </span>
                          ) : (
                            <span className="text-gray-600">No bin</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-white">{item.quantity_on_hand}</td>
                        <td className={`px-4 py-3 text-right ${
                          item.quantity_available <= item.reorder_point ? 'text-yellow-400' : 'text-green-400'
                        }`}>
                          {item.quantity_available}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400">{item.quantity_reserved}</td>
                        <td className="px-4 py-3 text-right text-gray-400">{item.reorder_point}</td>
                        <td className="px-4 py-3 text-gray-400">
                          {item.last_received_at ? (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(item.last_received_at).toLocaleDateString()}
                            </span>
                          ) : (
                            <span className="text-gray-600">Never</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-900 border-b border-gray-700">
                  <tr className="text-left text-sm text-gray-400">
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">Serial #</th>
                    <th className="px-4 py-3">Lot #</th>
                    <th className="px-4 py-3">Warehouse</th>
                    <th className="px-4 py-3">Bin</th>
                    <th className="px-4 py-3 text-right">Quantity</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Expiration</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {filteredSerialLotItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                        No serial/lot tracked items found
                      </td>
                    </tr>
                  ) : (
                    filteredSerialLotItems.map((item) => (
                      <tr key={item.id} className="border-b border-gray-700">
                        <td className="px-4 py-3 text-white">{item.product_name}</td>
                        <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                          {item.serial_number || '-'}
                        </td>
                        <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                          {item.lot_number || '-'}
                        </td>
                        <td className="px-4 py-3 text-gray-400">{item.warehouse_name}</td>
                        <td className="px-4 py-3 text-gray-400">
                          {item.bin_code ? (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {item.bin_code}
                            </span>
                          ) : (
                            <span className="text-gray-600">No bin</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-white">
                          {item.quantity || 1}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-1 rounded ${
                            item.status === 'in_stock' ? 'bg-green-900/30 text-green-400' :
                            item.status === 'reserved' ? 'bg-blue-900/30 text-blue-400' :
                            item.status === 'sold' ? 'bg-gray-900/30 text-gray-400' :
                            'bg-red-900/30 text-red-400'
                          }`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-400">
                          {item.expiration_date ? (
                            <span className={
                              new Date(item.expiration_date) < new Date()
                                ? 'text-red-400'
                                : ''
                            }>
                              {new Date(item.expiration_date).toLocaleDateString()}
                            </span>
                          ) : (
                            <span className="text-gray-600">-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
