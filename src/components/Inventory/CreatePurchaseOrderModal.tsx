import { useState, useEffect, useCallback } from 'react';
import { X, Plus, Trash2, Search, Package, Mail, AlertCircle, Building2, User, MapPin } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';

interface CreatePurchaseOrderModalProps {
  onClose: () => void;
  onSuccess: () => void;
  presetShipToOfficeId?: string;
  presetShipToContactId?: string;
  sourceNote?: string;
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

interface Office {
  id: string;
  office_name: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  is_headquarters: boolean;
}

interface Contact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
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

function formatAddressLines(
  name: string | null,
  addr1: string | null,
  addr2: string | null,
  city: string | null,
  state: string | null,
  zip: string | null
): { name: string; address: string; city: string; state: string; zip: string } {
  const fullAddress = [addr1, addr2].filter(Boolean).join(', ');
  return {
    name: name || '',
    address: fullAddress || '',
    city: city || '',
    state: state || '',
    zip: zip || '',
  };
}

export function CreatePurchaseOrderModal({ onClose, onSuccess, presetShipToOfficeId, presetShipToContactId, sourceNote }: CreatePurchaseOrderModalProps) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [selectedVendor, setSelectedVendor] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedDate, setExpectedDate] = useState('');
  const [internalNote, setInternalNote] = useState('');
  const [externalNote, setExternalNote] = useState('');
  const [shippingCost, setShippingCost] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);
  const [lineItems, setLineItems] = useState<POLineItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showCostPrompt, setShowCostPrompt] = useState<string | null>(null);

  // Bill To
  const [billToOfficeId, setBillToOfficeId] = useState('');
  const [billToSnapshot, setBillToSnapshot] = useState<{ name: string; address: string; city: string; state: string; zip: string }>({ name: '', address: '', city: '', state: '', zip: '' });

  // Ship To
  const [shipToMode, setShipToMode] = useState<'office' | 'customer'>('office');
  const [shipToOfficeId, setShipToOfficeId] = useState('');
  const [shipToContactId, setShipToContactId] = useState('');
  const [shipToSnapshot, setShipToSnapshot] = useState<{ name: string; address: string; city: string; state: string; zip: string }>({ name: '', address: '', city: '', state: '', zip: '' });

  // Contact search
  const [contactSearchTerm, setContactSearchTerm] = useState('');
  const [contactSearchResults, setContactSearchResults] = useState<Contact[]>([]);
  const [showContactSearch, setShowContactSearch] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (sourceNote) setInternalNote(sourceNote);
  }, [sourceNote]);

  const loadInitialData = async () => {
    const [vendorsRes, warehousesRes, officesRes] = await Promise.all([
      supabase.from('vendors').select('id, vendor_name, email').eq('is_active', true).order('vendor_name'),
      supabase.from('warehouses').select('id, name').order('name'),
      supabase.from('company_offices').select('id, office_name, address_line1, address_line2, city, state, zip, is_headquarters').order('office_name'),
    ]);
    if (vendorsRes.data) setVendors(vendorsRes.data);
    if (warehousesRes.data) {
      setWarehouses(warehousesRes.data);
      if (warehousesRes.data.length > 0 && !selectedWarehouse) {
        setSelectedWarehouse(warehousesRes.data[0].id);
      }
    }
    if (officesRes.data) {
      setOffices(officesRes.data);
      // Default Bill To to headquarters
      const hq = officesRes.data.find((o: Office) => o.is_headquarters);
      const defaultBillTo = hq || officesRes.data[0];
      if (defaultBillTo) {
        setBillToOfficeId(defaultBillTo.id);
        setBillToSnapshot(formatAddressLines(
          defaultBillTo.office_name,
          defaultBillTo.address_line1,
          defaultBillTo.address_line2,
          defaultBillTo.city,
          defaultBillTo.state,
          defaultBillTo.zip
        ));
      }
      // Default Ship To
      if (presetShipToOfficeId) {
        setShipToMode('office');
        setShipToOfficeId(presetShipToOfficeId);
        const office = officesRes.data.find((o: Office) => o.id === presetShipToOfficeId);
        if (office) {
          setShipToSnapshot(formatAddressLines(
            office.office_name,
            office.address_line1,
            office.address_line2,
            office.city,
            office.state,
            office.zip
          ));
        }
      } else if (presetShipToContactId) {
        setShipToMode('customer');
        setShipToContactId(presetShipToContactId);
        loadContactDetails(presetShipToContactId);
      } else if (defaultBillTo) {
        // Default ship to the same as bill-to (headquarters)
        setShipToOfficeId(defaultBillTo.id);
        setShipToSnapshot(formatAddressLines(
          defaultBillTo.office_name,
          defaultBillTo.address_line1,
          defaultBillTo.address_line2,
          defaultBillTo.city,
          defaultBillTo.state,
          defaultBillTo.zip
        ));
      }
    }
  };

  const loadContactDetails = async (contactId: string) => {
    const { data } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, company_name, address, city, state, zip')
      .eq('id', contactId)
      .maybeSingle();
    if (data) {
      const name = data.company_name || `${data.first_name || ''} ${data.last_name || ''}`.trim();
      setShipToSnapshot(formatAddressLines(name, data.address, null, data.city, data.state, data.zip));
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

  const searchContacts = useCallback(async (term: string) => {
    if (term.trim().length < 2) {
      setContactSearchResults([]);
      return;
    }
    const { data } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, company_name, address, city, state, zip')
      .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,company_name.ilike.%${term}%`)
      .limit(10);
    setContactSearchResults(data || []);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchContacts(contactSearchTerm), 300);
    return () => clearTimeout(timer);
  }, [contactSearchTerm, searchContacts]);

  const handleBillToChange = (officeId: string) => {
    setBillToOfficeId(officeId);
    const office = offices.find(o => o.id === officeId);
    if (office) {
      setBillToSnapshot(formatAddressLines(
        office.office_name,
        office.address_line1,
        office.address_line2,
        office.city,
        office.state,
        office.zip
      ));
    }
  };

  const handleShipToOfficeChange = (officeId: string) => {
    setShipToOfficeId(officeId);
    setShipToContactId('');
    const office = offices.find(o => o.id === officeId);
    if (office) {
      setShipToSnapshot(formatAddressLines(
        office.office_name,
        office.address_line1,
        office.address_line2,
        office.city,
        office.state,
        office.zip
      ));
    }
  };

  const handleShipToContactSelect = (contact: Contact) => {
    setShipToContactId(contact.id);
    setShipToOfficeId('');
    setContactSearchTerm('');
    setContactSearchResults([]);
    setShowContactSearch(false);
    const name = contact.company_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
    setShipToSnapshot(formatAddressLines(name, contact.address, null, contact.city, contact.state, contact.zip));
  };

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
    if (!billToOfficeId) { setError('Please select a Bill To office'); return; }
    if (shipToMode === 'office' && !shipToOfficeId) { setError('Please select a Ship To office'); return; }
    if (shipToMode === 'customer' && !shipToContactId) { setError('Please select a customer to ship to'); return; }
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
          internal_note: internalNote || null,
          external_note: externalNote || null,
          bill_to_office_id: billToOfficeId,
          bill_to_name: billToSnapshot.name || null,
          bill_to_address: billToSnapshot.address || null,
          bill_to_city: billToSnapshot.city || null,
          bill_to_state: billToSnapshot.state || null,
          bill_to_zip: billToSnapshot.zip || null,
          ship_to_office_id: shipToMode === 'office' ? shipToOfficeId : null,
          ship_to_contact_id: shipToMode === 'customer' ? shipToContactId : null,
          ship_to_name: shipToSnapshot.name || null,
          ship_to_address: shipToSnapshot.address || null,
          ship_to_city: shipToSnapshot.city || null,
          ship_to_state: shipToSnapshot.state || null,
          ship_to_zip: shipToSnapshot.zip || null,
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

          {/* Bill To */}
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-semibold text-gray-900">Bill To</h3>
              <span className="text-xs text-gray-500">(defaults to headquarters)</span>
            </div>
            <select
              value={billToOfficeId}
              onChange={e => handleBillToChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-2"
            >
              <option value="">Select an office...</option>
              {offices.map(o => (
                <option key={o.id} value={o.id}>
                  {o.office_name}{o.is_headquarters ? ' (HQ)' : ''}
                </option>
              ))}
            </select>
            {billToSnapshot.address && (
              <div className="text-sm text-gray-600 flex items-start gap-2 mt-2">
                <MapPin className="w-3 h-3 text-gray-400 mt-1 flex-shrink-0" />
                <div>
                  {billToSnapshot.name && <div className="font-medium text-gray-700">{billToSnapshot.name}</div>}
                  <div>{billToSnapshot.address}</div>
                  <div>{[billToSnapshot.city, billToSnapshot.state, billToSnapshot.zip].filter(Boolean).join(', ')}</div>
                </div>
              </div>
            )}
          </div>

          {/* Ship To */}
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-4 h-4 text-green-600" />
              <h3 className="text-sm font-semibold text-gray-900">Ship To</h3>
            </div>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setShipToMode('office')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  shipToMode === 'office' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                Ship to Office
              </button>
              <button
                onClick={() => setShipToMode('customer')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  shipToMode === 'customer' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                Ship to Customer
              </button>
            </div>

            {shipToMode === 'office' ? (
              <select
                value={shipToOfficeId}
                onChange={e => handleShipToOfficeChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select an office...</option>
                {offices.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.office_name}{o.is_headquarters ? ' (HQ)' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={contactSearchTerm}
                  onChange={e => { setContactSearchTerm(e.target.value); setShowContactSearch(true); }}
                  onFocus={() => setShowContactSearch(true)}
                  placeholder="Search customer by name or company..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {showContactSearch && contactSearchResults.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {contactSearchResults.map(c => (
                      <button
                        key={c.id}
                        onClick={() => handleShipToContactSelect(c)}
                        className="w-full flex items-center justify-between px-4 py-2 hover:bg-gray-50 transition-colors text-left"
                      >
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {c.company_name || `${c.first_name || ''} ${c.last_name || ''}`.trim()}
                          </div>
                          {c.address && <div className="text-xs text-gray-500">{c.address}, {c.city}, {c.state}</div>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {shipToSnapshot.address && (
              <div className="text-sm text-gray-600 flex items-start gap-2 mt-2">
                <MapPin className="w-3 h-3 text-gray-400 mt-1 flex-shrink-0" />
                <div>
                  {shipToSnapshot.name && <div className="font-medium text-gray-700">{shipToSnapshot.name}</div>}
                  <div>{shipToSnapshot.address}</div>
                  <div>{[shipToSnapshot.city, shipToSnapshot.state, shipToSnapshot.zip].filter(Boolean).join(', ')}</div>
                </div>
              </div>
            )}
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

          {/* Internal Note */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Internal Note <span className="text-gray-400 font-normal">(visible only to your team)</span>
            </label>
            <textarea
              value={internalNote}
              onChange={e => setInternalNote(e.target.value)}
              rows={2}
              placeholder="e.g. Don't order this yet, waiting to verify product colors"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* External Note */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              External Note <span className="text-gray-400 font-normal">(printed on the PO, sent to vendor)</span>
            </label>
            <textarea
              value={externalNote}
              onChange={e => setExternalNote(e.target.value)}
              rows={2}
              placeholder="e.g. Please ship ASAP!"
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
