import { useState, useEffect, useCallback } from 'react';
import { X, Plus, Trash2, Search, Package, Mail, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';

interface CreatePurchaseOrderModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface Vendor {
  id: string;
  vendor_name: string;
  email: string | null;
}

interface Warehouse {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  sku: string | null;
  cost: number | null;
  vendors?: { vendor_name: string } | null;
}

interface POLineItem {
  product_id: string | null;
  product_name: string;
  model_number: string | null;
  quantity: number;
  unit_cost: number;
  update_master_cost: boolean;
}

export function CreatePurchaseOrderModal({ onClose, onSuccess }: CreatePurchaseOrderModalProps) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedVendor, setSelectedVendor] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [shippingCost, setShippingCost] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);
  const [lineItems, setLineItems] = useState<POLineItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showCostPrompt, setShowCostPrompt] = useState<string | null>(null);

  useEffect(() => {
    loadVendorsAndWarehouses();
  }, []);

  const loadVendorsAndWarehouses = async () => {
    const [vendorsRes, warehousesRes] = await Promise.all([
      supabase.from('vendors').select('id, vendor_name, email').eq('is_active', true).order('vendor_name'),
      supabase.from('warehouses').select('id, name').order('name'),
    ]);
    if (vendorsRes.data) setVendors(vendorsRes.data);
    if (warehousesRes.data) setWarehouses(warehousesRes.data);
    if (warehousesRes.data && warehousesRes.data.length > 0 && !selectedWarehouse) {
      setSelectedWarehouse(warehousesRes.data[0].id);
    }
  };

  const searchProducts = useCallback(async (term: string) => {
    if (term.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const { data } = await supabase
      .from('products')
      .select('id, name, sku, cost, vendors:default_vendor_id(vendor_name)')
      .ilike('name', `%${term}%`)
      .limit(10);
    setSearchResults(data || []);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchProducts(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm, searchProducts]);

  const addProduct = (product: Product) => {
    const existing = lineItems.find(li => li.product_id === product.id);
    if (existing) {
      setLineItems(items => items.map(li =>
        li.product_id === product.id ? { ...li, quantity: li.quantity + 1 } : li
      ));
    } else {
      setLineItems(items => [...items, {
        product_id: product.id,
        product_name: product.name,
        model_number: product.sku,
        quantity: 1,
        unit_cost: product.cost || 0,
        update_master_cost: false,
      }]);
    }
    setSearchTerm('');
    setSearchResults([]);
    setShowSearch(false);
  };

  const addCustomLine = () => {
    setLineItems(items => [...items, {
      product_id: null,
      product_name: '',
      model_number: null,
      quantity: 1,
      unit_cost: 0,
      update_master_cost: false,
    }]);
  };

  const updateLineItem = (index: number, field: keyof POLineItem, value: any) => {
    setLineItems(items => items.map((li, i) => i === index ? { ...li, [field]: value } : li));
  };

  const removeLineItem = (index: number) => {
    setLineItems(items => items.filter((_, i) => i !== index));
  };

  const subtotal = lineItems.reduce((sum, li) => sum + li.quantity * li.unit_cost, 0);
  const total = subtotal + (shippingCost || 0) + (taxAmount || 0);

  const handleSave = async () => {
    setError('');
    if (!selectedVendor) { setError('Please select a vendor'); return; }
    if (!selectedWarehouse) { setError('Please select a warehouse'); return; }
    if (lineItems.length === 0) { setError('Please add at least one line item'); return; }
    if (lineItems.some(li => !li.product_name.trim())) { setError('All line items need a product name'); return; }

    setSaving(true);
    try {
      const { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .insert({
          vendor_id: selectedVendor,
          warehouse_id: selectedWarehouse,
          status: 'draft',
          order_date: orderDate,
          expected_date: expectedDate || null,
          subtotal,
          tax_amount: taxAmount || 0,
          shipping_cost: shippingCost || 0,
          total,
          notes,
        })
        .select()
        .single();

      if (poError) throw poError;

      const poItemsData = lineItems.map(li => ({
        po_id: po.id,
        product_id: li.product_id,
        product_name: li.product_name,
        model_number: li.model_number,
        quantity: li.quantity,
        unit_price: li.unit_cost,
        total_price: li.quantity * li.unit_cost,
      }));

      const { error: itemsError } = await supabase.from('po_items').insert(poItemsData);
      if (itemsError) throw itemsError;

      // Update master product costs where requested
      for (const li of lineItems) {
        if (li.update_master_cost && li.product_id) {
          await supabase.from('products').update({ cost: li.unit_cost }).eq('id', li.product_id);
        }
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to create purchase order');
    } finally {
      setSaving(false);
    }
  };

  const handleEmailPO = async () => {
    setError('');
    if (!selectedVendor) { setError('Please select a vendor first'); return; }
    const vendor = vendors.find(v => v.id === selectedVendor);
    if (!vendor?.email) { setError('This vendor does not have an email address on file'); return; }
    if (lineItems.length === 0) { setError('Please add at least one line item'); return; }

    setSaving(true);
    try {
      // Save the PO first, then email it
      await handleSave();
    } catch {
      // handleSave already sets error
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h2 className="text-xl font-bold text-gray-900">Create Purchase Order</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Vendor and Warehouse */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Vendor *</label>
              <select
                value={selectedVendor}
                onChange={e => setSelectedVendor(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select a vendor...</option>
                {vendors.map(v => (
                  <option key={v.id} value={v.id}>{v.vendor_name}</option>
                ))}
              </select>
              {selectedVendor && vendors.find(v => v.id === selectedVendor)?.email && (
                <p className="text-xs text-gray-500 mt-1">
                  Email: {vendors.find(v => v.id === selectedVendor)?.email}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Warehouse *</label>
              <select
                value={selectedWarehouse}
                onChange={e => setSelectedWarehouse(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select a warehouse...</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Order Date</label>
              <input
                type="date"
                value={orderDate}
                onChange={e => setOrderDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Expected Date</label>
              <input
                type="date"
                value={expectedDate}
                onChange={e => setExpectedDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-700">Line Items</label>
              <button
                onClick={addCustomLine}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Custom Line
              </button>
            </div>

            {/* Product Search */}
            <div className="relative mb-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => { setSearchTerm(e.target.value); setShowSearch(true); }}
                  onFocus={() => setShowSearch(true)}
                  placeholder="Search products to add..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              {showSearch && searchResults.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {searchResults.map(product => (
                    <button
                      key={product.id}
                      onClick={() => addProduct(product)}
                      className="w-full flex items-center justify-between px-4 py-2 hover:bg-gray-50 transition-colors text-left"
                    >
                      <div>
                        <div className="text-sm font-medium text-gray-900">{product.name}</div>
                        {product.sku && <div className="text-xs text-gray-500">SKU: {product.sku}</div>}
                      </div>
                      {product.cost != null && (
                        <div className="text-sm text-gray-600">{formatCurrency(product.cost)}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Line Items Table */}
            {lineItems.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
                <Package className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No items added yet. Search for products above or add a custom line.</p>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Product</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">SKU/Model</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">Qty</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">Unit Cost</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">Total</th>
                      <th className="px-3 py-2 text-center font-medium text-gray-600">Update Master?</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {lineItems.map((li, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={li.product_name}
                            onChange={e => updateLineItem(index, 'product_name', e.target.value)}
                            placeholder="Product name"
                            className="w-full px-2 py-1 border border-gray-200 rounded text-sm focus:ring-1 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={li.model_number || ''}
                            onChange={e => updateLineItem(index, 'model_number', e.target.value)}
                            placeholder="SKU"
                            className="w-24 px-2 py-1 border border-gray-200 rounded text-sm focus:ring-1 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            value={li.quantity}
                            onChange={e => updateLineItem(index, 'quantity', parseInt(e.target.value) || 0)}
                            min="1"
                            className="w-16 px-2 py-1 border border-gray-200 rounded text-sm text-right focus:ring-1 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            value={li.unit_cost}
                            onChange={e => {
                              const newCost = parseFloat(e.target.value) || 0;
                              updateLineItem(index, 'unit_cost', newCost);
                              if (li.product_id && newCost !== li.unit_cost) {
                                setShowCostPrompt(`line-${index}`);
                              }
                            }}
                            step="0.01"
                            min="0"
                            className="w-20 px-2 py-1 border border-gray-200 rounded text-sm text-right focus:ring-1 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900">
                          {formatCurrency(li.quantity * li.unit_cost)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {li.product_id && (
                            <input
                              type="checkbox"
                              checked={li.update_master_cost}
                              onChange={e => updateLineItem(index, 'update_master_cost', e.target.checked)}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                              title="Update the master product cost to match this PO cost"
                            />
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => removeLineItem(index)}
                            className="text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Costs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Shipping Cost</label>
              <input
                type="number"
                value={shippingCost}
                onChange={e => setShippingCost(parseFloat(e.target.value) || 0)}
                step="0.01"
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Tax Amount</label>
              <input
                type="number"
                value={taxAmount}
                onChange={e => setTaxAmount(parseFloat(e.target.value) || 0)}
                step="0.01"
                min="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Total</label>
              <div className="px-3 py-2 bg-gray-100 rounded-lg text-lg font-bold text-gray-900">
                {formatCurrency(total)}
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Internal notes for this PO..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 sticky bottom-0 bg-white">
          <div className="text-sm text-gray-600">
            Subtotal: <span className="font-medium">{formatCurrency(subtotal)}</span>
            <span className="mx-2">|</span>
            Total: <span className="font-bold text-gray-900">{formatCurrency(total)}</span>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save as Draft'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
