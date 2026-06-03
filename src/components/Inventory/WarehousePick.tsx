import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Package, Scan, Check, X, MapPin, FileText, AlertCircle } from 'lucide-react';
import { BarcodeScanner } from './BarcodeScanner';
import ConfirmModal from '../ui/ConfirmModal';

interface PickList {
  id: string;
  type: 'proposal' | 'work_order' | 'project';
  reference_id: string;
  reference_number: string;
  customer_name: string;
  status: string;
  created_at: string;
}

interface PickItem {
  product_id: string;
  product_name: string;
  product_sku: string;
  quantity_needed: number;
  quantity_picked: number;
  warehouse_id: string;
  bin_id: string | null;
  bin_code: string | null;
  available_qty: number;
}

export function WarehousePick() {
  const [pickLists, setPickLists] = useState<PickList[]>([]);
  const [selectedList, setSelectedList] = useState<PickList | null>(null);
  const [pickItems, setPickItems] = useState<PickItem[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
  const [showScanner, setShowScanner] = useState(false);
  const [loading, setLoading] = useState(false);
  const [picking, setPicking] = useState(false);
  const [showShortageConfirm, setShowShortageConfirm] = useState(false);

  useEffect(() => {
    loadWarehouses();
    loadPickLists();
  }, []);

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

  async function loadPickLists() {
    try {
      const { data: proposals } = await supabase
        .from('proposals')
        .select(`
          id,
          proposal_number,
          contacts:contacts!proposals_contact_id_fkey (
            full_name
          )
        `)
        .eq('status', 'approved')
        .order('created_at', { ascending: false })
        .limit(20);

      if (proposals) {
        const lists: PickList[] = proposals.map((p: any) => ({
          id: p.id,
          type: 'proposal',
          reference_id: p.id,
          reference_number: p.proposal_number,
          customer_name: p.contacts?.full_name || 'Unknown',
          status: 'pending',
          created_at: p.created_at
        }));
        setPickLists(lists);
      }
    } catch (error) {
      console.error('Error loading pick lists:', error);
    }
  }

  async function loadPickItems(list: PickList) {
    setLoading(true);
    try {
      const { data: lineItems } = await supabase
        .from('proposal_line_items')
        .select(`
          product_id,
          quantity,
          description,
          products (
            id,
            name,
            sku
          )
        `)
        .eq('proposal_id', list.reference_id)
        .not('product_id', 'is', null);

      if (lineItems) {
        const items: PickItem[] = [];

        for (const item of lineItems) {
          if (!item.product_id) continue;

          const { data: inventory } = await supabase
            .from('product_inventory')
            .select(`
              quantity_available,
              warehouse_id,
              bin_id,
              warehouse_bins (
                bin_code
              )
            `)
            .eq('product_id', item.product_id)
            .eq('warehouse_id', selectedWarehouse)
            .maybeSingle();

          items.push({
            product_id: item.product_id,
            product_name: item.products?.name || item.description,
            product_sku: item.products?.sku || '',
            quantity_needed: item.quantity,
            quantity_picked: 0,
            warehouse_id: selectedWarehouse,
            bin_id: inventory?.bin_id || null,
            bin_code: (inventory?.warehouse_bins as any)?.bin_code || null,
            available_qty: inventory?.quantity_available || 0
          });
        }

        setPickItems(items);
      }
    } catch (error) {
      console.error('Error loading pick items:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleSelectList(list: PickList) {
    setSelectedList(list);
    loadPickItems(list);
  }

  function handleBarcodeScan(barcode: string) {
    const item = pickItems.find(
      i => i.product_sku === barcode || i.product_name.toLowerCase().includes(barcode.toLowerCase())
    );

    if (item) {
      updatePickQty(item.product_id, item.quantity_picked + 1);
      setShowScanner(false);
    } else {
      alert('Product not found in this pick list');
    }
  }

  function updatePickQty(productId: string, qty: number) {
    setPickItems(items =>
      items.map(item =>
        item.product_id === productId
          ? { ...item, quantity_picked: Math.max(0, Math.min(qty, item.quantity_needed)) }
          : item
      )
    );
  }

  function handleCompletePick() {
    if (!selectedList) return;

    const itemsToPick = pickItems.filter(item => item.quantity_picked > 0);
    if (itemsToPick.length === 0) {
      alert('No items picked. Please enter quantities.');
      return;
    }

    const hasShortage = itemsToPick.some(item => item.quantity_picked < item.quantity_needed);
    if (hasShortage) {
      setShowShortageConfirm(true);
      return;
    }

    executeCompletePick();
  }

  async function executeCompletePick() {
    if (!selectedList) return;

    const itemsToPick = pickItems.filter(item => item.quantity_picked > 0);

    setPicking(true);
    try {
      for (const item of itemsToPick) {
        const { data: inventory } = await supabase
          .from('product_inventory')
          .select('*')
          .eq('product_id', item.product_id)
          .eq('warehouse_id', selectedWarehouse)
          .single();

        if (inventory) {
          await supabase
            .from('product_inventory')
            .update({
              quantity_available: inventory.quantity_available - item.quantity_picked,
              quantity_reserved: inventory.quantity_reserved + item.quantity_picked
            })
            .eq('id', inventory.id);

          await supabase
            .from('stock_reservations')
            .insert({
              product_id: item.product_id,
              warehouse_id: selectedWarehouse,
              quantity: item.quantity_picked,
              reference_type: selectedList.type,
              reference_id: selectedList.reference_id,
              status: 'reserved',
              notes: `Picked for ${selectedList.reference_number}`
            });

          await supabase
            .from('stock_movements')
            .insert({
              product_id: item.product_id,
              warehouse_id: selectedWarehouse,
              movement_type: 'pick',
              quantity: -item.quantity_picked,
              reference_type: selectedList.type,
              reference_id: selectedList.reference_id,
              notes: `Picked for ${selectedList.reference_number}`
            });
        }
      }

      alert('Pick completed successfully!');
      setSelectedList(null);
      setPickItems([]);
      loadPickLists();
    } catch (error) {
      console.error('Error completing pick:', error);
      alert('Error completing pick. Please try again.');
    } finally {
      setPicking(false);
    }
  }

  if (!selectedList) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Pick Items</h2>
            <p className="text-sm text-gray-400">Select a proposal or work order to pick inventory</p>
          </div>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Pick From Warehouse
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

        {pickLists.length === 0 ? (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-12 text-center">
            <FileText className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">No Items to Pick</h3>
            <p className="text-gray-400">There are no approved proposals ready for picking.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pickLists.map(list => (
              <button
                key={list.id}
                onClick={() => handleSelectList(list)}
                className="bg-gray-800 border border-gray-700 rounded-lg p-4 text-left hover:border-blue-500 hover:bg-gray-750 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="font-semibold text-white">{list.reference_number}</div>
                  <div className="text-xs px-2 py-1 rounded bg-blue-900/30 text-blue-400">
                    {list.type}
                  </div>
                </div>
                <div className="text-sm text-gray-400 space-y-1">
                  <div>Customer: {list.customer_name}</div>
                  <div>Date: {new Date(list.created_at).toLocaleDateString()}</div>
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
              setSelectedList(null);
              setPickItems([]);
            }}
            className="text-sm text-gray-400 hover:text-white mb-2"
          >
            ← Back to Pick Lists
          </button>
          <h2 className="text-xl font-bold text-white">Picking: {selectedList.reference_number}</h2>
          <p className="text-sm text-gray-400">Customer: {selectedList.customer_name}</p>
        </div>
        <button
          onClick={() => setShowScanner(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2"
        >
          <Scan className="w-4 h-4" />
          Scan Barcode
        </button>
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
                    <th className="px-4 py-3">Bin</th>
                    <th className="px-4 py-3 text-center">Needed</th>
                    <th className="px-4 py-3 text-center">Available</th>
                    <th className="px-4 py-3 text-center">Pick</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {pickItems.map((item) => (
                    <tr
                      key={item.product_id}
                      className={`border-b border-gray-700 ${
                        item.available_qty < item.quantity_needed ? 'bg-red-900/10' : ''
                      }`}
                    >
                      <td className="px-4 py-3 text-white">{item.product_name}</td>
                      <td className="px-4 py-3 text-gray-400">{item.product_sku}</td>
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
                      <td className="px-4 py-3 text-center text-white">{item.quantity_needed}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={item.available_qty < item.quantity_needed ? 'text-red-400' : 'text-gray-400'}>
                          {item.available_qty}
                          {item.available_qty < item.quantity_needed && (
                            <AlertCircle className="w-3 h-3 inline ml-1" />
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => updatePickQty(item.product_id, item.quantity_picked - 1)}
                            className="w-8 h-8 bg-gray-700 hover:bg-gray-600 text-white rounded flex items-center justify-center"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            value={item.quantity_picked}
                            onChange={(e) => updatePickQty(item.product_id, parseInt(e.target.value) || 0)}
                            className="w-16 bg-gray-900 border border-gray-700 rounded px-2 py-1 text-center text-white"
                            min="0"
                            max={item.quantity_needed}
                          />
                          <button
                            onClick={() => updatePickQty(item.product_id, item.quantity_picked + 1)}
                            className="w-8 h-8 bg-gray-700 hover:bg-gray-600 text-white rounded flex items-center justify-center"
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {item.quantity_picked === item.quantity_needed ? (
                          <Check className="w-5 h-5 text-green-400 mx-auto" />
                        ) : item.quantity_picked > 0 ? (
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
                setSelectedList(null);
                setPickItems([]);
              }}
              className="px-6 py-2 border border-gray-600 hover:bg-gray-700 text-white rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleCompletePick}
              disabled={picking || pickItems.every(i => i.quantity_picked === 0)}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              {picking ? 'Processing...' : 'Complete Pick'}
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

      <ConfirmModal
        isOpen={showShortageConfirm}
        title="Incomplete Pick"
        message="Some items are not fully picked. Continue anyway?"
        variant="warning"
        confirmLabel="Continue"
        onConfirm={() => {
          setShowShortageConfirm(false);
          executeCompletePick();
        }}
        onCancel={() => setShowShortageConfirm(false)}
      />
    </div>
  );
}
