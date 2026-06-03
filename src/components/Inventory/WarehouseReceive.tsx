import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Package, Scan, Plus, Check, X, MapPin } from 'lucide-react';
import { BarcodeScanner } from './BarcodeScanner';

interface PurchaseOrder {
  id: string;
  po_number: string;
  vendor: string;
  status: string;
  expected_date: string;
  total: number;
}

interface ReceiveLineItem {
  product_id: string;
  product_name: string;
  product_sku: string;
  expected_qty: number;
  received_qty: number;
  bin_id: string | null;
  serial_number?: string;
  lot_number?: string;
}

export function WarehouseReceive() {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [receiveItems, setReceiveItems] = useState<ReceiveLineItem[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [bins, setBins] = useState<any[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
  const [showScanner, setShowScanner] = useState(false);
  const [loading, setLoading] = useState(false);
  const [receiving, setReceiving] = useState(false);

  useEffect(() => {
    loadPurchaseOrders();
    loadWarehouses();
  }, []);

  useEffect(() => {
    if (selectedWarehouse) {
      loadBins(selectedWarehouse);
    }
  }, [selectedWarehouse]);

  async function loadPurchaseOrders() {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('*')
      .in('status', ['pending', 'partial'])
      .order('expected_date', { ascending: true });

    if (data && !error) {
      setPurchaseOrders(data);
    }
  }

  async function loadWarehouses() {
    const { data } = await supabase
      .from('warehouses')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (data) {
      setWarehouses(data);
      if (data.length > 0) {
        setSelectedWarehouse(data[0].id);
      }
    }
  }

  async function loadBins(warehouseId: string) {
    const { data } = await supabase
      .from('warehouse_bins')
      .select('*')
      .eq('warehouse_id', warehouseId)
      .eq('is_active', true)
      .order('bin_code');

    if (data) {
      setBins(data);
    }
  }

  async function loadPOItems(poId: string) {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('purchase_order_items')
        .select(`
          *,
          products (
            id,
            name,
            sku
          )
        `)
        .eq('po_id', poId);

      if (data && !error) {
        const items: ReceiveLineItem[] = data.map((item: any) => ({
          product_id: item.product_id,
          product_name: item.products?.name || 'Unknown Product',
          product_sku: item.products?.sku || '',
          expected_qty: item.quantity,
          received_qty: 0,
          bin_id: null
        }));
        setReceiveItems(items);
      }
    } catch (error) {
      console.error('Error loading PO items:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleSelectPO(po: PurchaseOrder) {
    setSelectedPO(po);
    loadPOItems(po.id);
  }

  function handleBarcodeScan(barcode: string) {
    const item = receiveItems.find(
      i => i.product_sku === barcode || i.product_name.toLowerCase().includes(barcode.toLowerCase())
    );

    if (item) {
      updateReceiveQty(item.product_id, item.received_qty + 1);
      setShowScanner(false);
    } else {
      alert('Product not found in this purchase order');
    }
  }

  function updateReceiveQty(productId: string, qty: number) {
    setReceiveItems(items =>
      items.map(item =>
        item.product_id === productId
          ? { ...item, received_qty: Math.max(0, Math.min(qty, item.expected_qty)) }
          : item
      )
    );
  }

  function updateBin(productId: string, binId: string) {
    setReceiveItems(items =>
      items.map(item =>
        item.product_id === productId ? { ...item, bin_id: binId } : item
      )
    );
  }

  async function handleReceiveAll() {
    if (!selectedPO || !selectedWarehouse) return;

    const itemsToReceive = receiveItems.filter(item => item.received_qty > 0);
    if (itemsToReceive.length === 0) {
      alert('No items to receive. Please enter quantities.');
      return;
    }

    setReceiving(true);
    try {
      for (const item of itemsToReceive) {
        const { data: inventory } = await supabase
          .from('product_inventory')
          .select('*')
          .eq('product_id', item.product_id)
          .eq('warehouse_id', selectedWarehouse)
          .maybeSingle();

        if (inventory) {
          await supabase
            .from('product_inventory')
            .update({
              quantity_on_hand: inventory.quantity_on_hand + item.received_qty,
              quantity_available: inventory.quantity_available + item.received_qty,
              bin_id: item.bin_id || inventory.bin_id,
              last_received_at: new Date().toISOString()
            })
            .eq('id', inventory.id);
        } else {
          await supabase
            .from('product_inventory')
            .insert({
              product_id: item.product_id,
              warehouse_id: selectedWarehouse,
              quantity_on_hand: item.received_qty,
              quantity_available: item.received_qty,
              quantity_reserved: 0,
              reorder_point: 0,
              bin_id: item.bin_id,
              last_received_at: new Date().toISOString()
            });
        }

        await supabase
          .from('stock_movements')
          .insert({
            product_id: item.product_id,
            warehouse_id: selectedWarehouse,
            movement_type: 'receive',
            quantity: item.received_qty,
            reference_type: 'purchase_order',
            reference_id: selectedPO.id,
            notes: `Received from PO ${selectedPO.po_number}`
          });

        if (item.serial_number) {
          await supabase
            .from('serial_lot_tracking')
            .insert({
              product_id: item.product_id,
              warehouse_id: selectedWarehouse,
              serial_number: item.serial_number,
              tracking_type: 'serial',
              status: 'in_stock',
              bin_id: item.bin_id
            });
        }

        if (item.lot_number) {
          await supabase
            .from('serial_lot_tracking')
            .insert({
              product_id: item.product_id,
              warehouse_id: selectedWarehouse,
              lot_number: item.lot_number,
              tracking_type: 'lot',
              status: 'in_stock',
              quantity: item.received_qty,
              bin_id: item.bin_id
            });
        }
      }

      const allReceived = receiveItems.every(
        item => item.received_qty === item.expected_qty
      );

      await supabase
        .from('purchase_orders')
        .update({
          status: allReceived ? 'received' : 'partial',
          received_at: allReceived ? new Date().toISOString() : null
        })
        .eq('id', selectedPO.id);

      alert('Items received successfully!');
      setSelectedPO(null);
      setReceiveItems([]);
      loadPurchaseOrders();
    } catch (error) {
      console.error('Error receiving items:', error);
      alert('Error receiving items. Please try again.');
    } finally {
      setReceiving(false);
    }
  }

  if (!selectedPO) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Warehouse Receiving</h2>
            <p className="text-sm text-gray-400">Select a purchase order to receive inventory</p>
          </div>
        </div>

        {purchaseOrders.length === 0 ? (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-12 text-center">
            <Package className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">No Purchase Orders</h3>
            <p className="text-gray-400">There are no pending purchase orders to receive.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {purchaseOrders.map(po => (
              <button
                key={po.id}
                onClick={() => handleSelectPO(po)}
                className="bg-gray-800 border border-gray-700 rounded-lg p-4 text-left hover:border-blue-500 hover:bg-gray-750 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="font-semibold text-white">{po.po_number}</div>
                  <div className={`text-xs px-2 py-1 rounded ${
                    po.status === 'pending' ? 'bg-yellow-900/30 text-yellow-400' : 'bg-blue-900/30 text-blue-400'
                  }`}>
                    {po.status}
                  </div>
                </div>
                <div className="text-sm text-gray-400 space-y-1">
                  <div>Vendor: {po.vendor}</div>
                  <div>Expected: {new Date(po.expected_date).toLocaleDateString()}</div>
                  <div>Total: ${po.total.toFixed(2)}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => {
              setSelectedPO(null);
              setReceiveItems([]);
            }}
            className="text-sm text-gray-400 hover:text-white mb-2"
          >
            ← Back to Purchase Orders
          </button>
          <h2 className="text-xl font-bold text-white">Receiving: {selectedPO.po_number}</h2>
          <p className="text-sm text-gray-400">Vendor: {selectedPO.vendor}</p>
        </div>
        <button
          onClick={() => setShowScanner(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2"
        >
          <Scan className="w-4 h-4" />
          Scan Barcode
        </button>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <label className="block text-sm font-medium text-gray-400 mb-2">
          Receiving Warehouse
        </label>
        <select
          value={selectedWarehouse}
          onChange={(e) => setSelectedWarehouse(e.target.value)}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white"
        >
          {warehouses.map(wh => (
            <option key={wh.id} value={wh.id}>{wh.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading items...</div>
      ) : (
        <>
          <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-900 border-b border-gray-700">
                  <tr className="text-left text-sm text-gray-400">
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3 text-center">Expected</th>
                    <th className="px-4 py-3 text-center">Receive</th>
                    <th className="px-4 py-3">Bin Location</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {receiveItems.map((item) => (
                    <tr key={item.product_id} className="border-b border-gray-700">
                      <td className="px-4 py-3 text-white">{item.product_name}</td>
                      <td className="px-4 py-3 text-gray-400">{item.product_sku}</td>
                      <td className="px-4 py-3 text-center text-gray-400">{item.expected_qty}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => updateReceiveQty(item.product_id, item.received_qty - 1)}
                            className="w-8 h-8 bg-gray-700 hover:bg-gray-600 text-white rounded flex items-center justify-center"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            value={item.received_qty}
                            onChange={(e) => updateReceiveQty(item.product_id, parseInt(e.target.value) || 0)}
                            className="w-16 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-center text-white"
                            min="0"
                            max={item.expected_qty}
                          />
                          <button
                            onClick={() => updateReceiveQty(item.product_id, item.received_qty + 1)}
                            className="w-8 h-8 bg-gray-700 hover:bg-gray-600 text-white rounded flex items-center justify-center"
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={item.bin_id || ''}
                          onChange={(e) => updateBin(item.product_id, e.target.value)}
                          className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-sm"
                        >
                          <option value="">Select Bin</option>
                          {bins.map(bin => (
                            <option key={bin.id} value={bin.id}>
                              {bin.bin_code} - {bin.description}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {item.received_qty === item.expected_qty ? (
                          <Check className="w-5 h-5 text-green-400 mx-auto" />
                        ) : item.received_qty > 0 ? (
                          <div className="text-yellow-400">Partial</div>
                        ) : (
                          <X className="w-5 h-5 text-gray-600 mx-auto" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={() => {
                setSelectedPO(null);
                setReceiveItems([]);
              }}
              className="px-6 py-2 border border-gray-600 hover:bg-gray-700 text-white rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleReceiveAll}
              disabled={receiving || receiveItems.every(i => i.received_qty === 0)}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              {receiving ? 'Receiving...' : 'Receive Items'}
            </button>
          </div>
        </>
      )}

      {showScanner && (
        <BarcodeScanner
          onScan={handleBarcodeScan}
          onClose={() => setShowScanner(false)}
          title="Scan Product Barcode"
          placeholder="Scan or enter product SKU..."
        />
      )}
    </div>
  );
}
