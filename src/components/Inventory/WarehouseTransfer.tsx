import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ArrowRightLeft, Plus, Check, X, MapPin, Trash2 } from 'lucide-react';

interface Warehouse {
  id: string;
  name: string;
  address: string;
}

interface TransferItem {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  quantity: number;
  from_bin_id: string | null;
  to_bin_id: string | null;
  available_qty: number;
}

export function WarehouseTransfer() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [fromWarehouse, setFromWarehouse] = useState<string>('');
  const [toWarehouse, setToWarehouse] = useState<string>('');
  const [fromBins, setFromBins] = useState<any[]>([]);
  const [toBins, setToBins] = useState<any[]>([]);
  const [transferItems, setTransferItems] = useState<TransferItem[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [transferring, setTransferring] = useState(false);

  useEffect(() => {
    loadWarehouses();
    loadProducts();
  }, []);

  useEffect(() => {
    if (fromWarehouse) {
      loadBins(fromWarehouse, 'from');
    }
  }, [fromWarehouse]);

  useEffect(() => {
    if (toWarehouse) {
      loadBins(toWarehouse, 'to');
    }
  }, [toWarehouse]);

  async function loadWarehouses() {
    const { data } = await supabase
      .from('warehouses')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (data) {
      setWarehouses(data);
      if (data.length >= 2) {
        setFromWarehouse(data[0].id);
        setToWarehouse(data[1].id);
      }
    }
  }

  async function loadProducts() {
    const { data } = await supabase
      .from('products')
      .select('id, name, sku')
      .eq('is_active', true)
      .order('name');

    if (data) {
      setProducts(data);
    }
  }

  async function loadBins(warehouseId: string, type: 'from' | 'to') {
    const { data } = await supabase
      .from('warehouse_bins')
      .select('*')
      .eq('warehouse_id', warehouseId)
      .eq('is_active', true)
      .order('bin_code');

    if (data) {
      if (type === 'from') {
        setFromBins(data);
      } else {
        setToBins(data);
      }
    }
  }

  async function addTransferItem() {
    if (!selectedProduct || !fromWarehouse) return;

    const product = products.find(p => p.id === selectedProduct);
    if (!product) return;

    const { data: inventory } = await supabase
      .from('product_inventory')
      .select('quantity_available, bin_id')
      .eq('product_id', selectedProduct)
      .eq('warehouse_id', fromWarehouse)
      .maybeSingle();

    if (!inventory || inventory.quantity_available <= 0) {
      alert('Product not available in source warehouse');
      return;
    }

    const existing = transferItems.find(item => item.product_id === selectedProduct);
    if (existing) {
      alert('Product already in transfer list');
      return;
    }

    const newItem: TransferItem = {
      id: crypto.randomUUID(),
      product_id: product.id,
      product_name: product.name,
      product_sku: product.sku,
      quantity: 1,
      from_bin_id: inventory.bin_id,
      to_bin_id: null,
      available_qty: inventory.quantity_available
    };

    setTransferItems([...transferItems, newItem]);
    setSelectedProduct('');
  }

  function updateQuantity(itemId: string, quantity: number) {
    setTransferItems(items =>
      items.map(item =>
        item.id === itemId
          ? { ...item, quantity: Math.max(1, Math.min(quantity, item.available_qty)) }
          : item
      )
    );
  }

  function updateToBin(itemId: string, binId: string) {
    setTransferItems(items =>
      items.map(item =>
        item.id === itemId ? { ...item, to_bin_id: binId } : item
      )
    );
  }

  function removeItem(itemId: string) {
    setTransferItems(items => items.filter(item => item.id !== itemId));
  }

  async function handleTransfer() {
    if (!fromWarehouse || !toWarehouse) {
      alert('Please select source and destination warehouses');
      return;
    }

    if (fromWarehouse === toWarehouse) {
      alert('Source and destination warehouses must be different');
      return;
    }

    if (transferItems.length === 0) {
      alert('Please add items to transfer');
      return;
    }

    setTransferring(true);
    try {
      for (const item of transferItems) {
        const { data: fromInventory } = await supabase
          .from('product_inventory')
          .select('*')
          .eq('product_id', item.product_id)
          .eq('warehouse_id', fromWarehouse)
          .single();

        if (fromInventory) {
          await supabase
            .from('product_inventory')
            .update({
              quantity_on_hand: fromInventory.quantity_on_hand - item.quantity,
              quantity_available: fromInventory.quantity_available - item.quantity
            })
            .eq('id', fromInventory.id);
        }

        const { data: toInventory } = await supabase
          .from('product_inventory')
          .select('*')
          .eq('product_id', item.product_id)
          .eq('warehouse_id', toWarehouse)
          .maybeSingle();

        if (toInventory) {
          await supabase
            .from('product_inventory')
            .update({
              quantity_on_hand: toInventory.quantity_on_hand + item.quantity,
              quantity_available: toInventory.quantity_available + item.quantity,
              bin_id: item.to_bin_id || toInventory.bin_id
            })
            .eq('id', toInventory.id);
        } else {
          await supabase
            .from('product_inventory')
            .insert({
              product_id: item.product_id,
              warehouse_id: toWarehouse,
              quantity_on_hand: item.quantity,
              quantity_available: item.quantity,
              quantity_reserved: 0,
              reorder_point: 0,
              bin_id: item.to_bin_id
            });
        }

        const { data: transfer } = await supabase
          .from('stock_transfers')
          .insert({
            product_id: item.product_id,
            from_warehouse_id: fromWarehouse,
            to_warehouse_id: toWarehouse,
            quantity: item.quantity,
            status: 'completed',
            completed_at: new Date().toISOString()
          })
          .select()
          .single();

        await supabase
          .from('stock_movements')
          .insert([
            {
              product_id: item.product_id,
              warehouse_id: fromWarehouse,
              movement_type: 'transfer_out',
              quantity: -item.quantity,
              reference_type: 'stock_transfer',
              reference_id: transfer.id,
              notes: `Transferred to ${warehouses.find(w => w.id === toWarehouse)?.name}`
            },
            {
              product_id: item.product_id,
              warehouse_id: toWarehouse,
              movement_type: 'transfer_in',
              quantity: item.quantity,
              reference_type: 'stock_transfer',
              reference_id: transfer.id,
              notes: `Transferred from ${warehouses.find(w => w.id === fromWarehouse)?.name}`
            }
          ]);
      }

      alert('Transfer completed successfully!');
      setTransferItems([]);
    } catch (error) {
      console.error('Error processing transfer:', error);
      alert('Error processing transfer. Please try again.');
    } finally {
      setTransferring(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white">Warehouse Transfer</h2>
        <p className="text-sm text-gray-400">Move inventory between warehouses</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <label className="block text-sm font-medium text-gray-400 mb-2">
            From Warehouse
          </label>
          <select
            value={fromWarehouse}
            onChange={(e) => setFromWarehouse(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white"
          >
            {warehouses.map(wh => (
              <option key={wh.id} value={wh.id}>{wh.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-center">
          <ArrowRightLeft className="w-8 h-8 text-gray-600" />
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <label className="block text-sm font-medium text-gray-400 mb-2">
            To Warehouse
          </label>
          <select
            value={toWarehouse}
            onChange={(e) => setToWarehouse(e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white"
          >
            {warehouses.map(wh => (
              <option key={wh.id} value={wh.id}>{wh.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <label className="block text-sm font-medium text-gray-400 mb-2">
          Add Product to Transfer
        </label>
        <div className="flex gap-2">
          <select
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white"
          >
            <option value="">Select a product...</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.sku})
              </option>
            ))}
          </select>
          <button
            onClick={addTransferItem}
            disabled={!selectedProduct}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>
      </div>

      {transferItems.length > 0 && (
        <>
          <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-900 border-b border-gray-700">
                  <tr className="text-left text-sm text-gray-400">
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">From Bin</th>
                    <th className="px-4 py-3 text-center">Available</th>
                    <th className="px-4 py-3 text-center">Quantity</th>
                    <th className="px-4 py-3">To Bin</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {transferItems.map((item) => (
                    <tr key={item.id} className="border-b border-gray-700">
                      <td className="px-4 py-3 text-white">{item.product_name}</td>
                      <td className="px-4 py-3 text-gray-400">{item.product_sku}</td>
                      <td className="px-4 py-3 text-gray-400">
                        {item.from_bin_id ? (
                          fromBins.find(b => b.id === item.from_bin_id)?.bin_code || 'Unknown'
                        ) : (
                          <span className="text-gray-600">No bin</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-400">{item.available_qty}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="w-8 h-8 bg-gray-700 hover:bg-gray-600 text-white rounded flex items-center justify-center"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 1)}
                            className="w-16 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-center text-white"
                            min="1"
                            max={item.available_qty}
                          />
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="w-8 h-8 bg-gray-700 hover:bg-gray-600 text-white rounded flex items-center justify-center"
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={item.to_bin_id || ''}
                          onChange={(e) => updateToBin(item.id, e.target.value)}
                          className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-sm"
                        >
                          <option value="">Select Bin</option>
                          {toBins.map(bin => (
                            <option key={bin.id} value={bin.id}>
                              {bin.bin_code} - {bin.description}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => removeItem(item.id)}
                          className="text-red-400 hover:text-red-300"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={() => setTransferItems([])}
              className="px-6 py-2 border border-gray-600 hover:bg-gray-700 text-white rounded-lg"
            >
              Clear All
            </button>
            <button
              onClick={handleTransfer}
              disabled={transferring || transferItems.length === 0}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              {transferring ? 'Transferring...' : 'Complete Transfer'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
