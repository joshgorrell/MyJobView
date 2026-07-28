import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import { Product, ProposalRoom } from '../../lib/types';
import { Search, Package, X, Plus } from 'lucide-react';
import SinglePageProductForm from '../Products/SinglePageProductForm';

interface AddItemToAreasModalProps {
  proposalId: string;
  rooms: ProposalRoom[];
  activeAreaId?: string;
  onClose: () => void;
  onItemsAdded: () => void;
  onRoomsUpdate?: (rooms: ProposalRoom[]) => void;
}

interface ProposalClass {
  id: string;
  name: string;
  color: string;
}

interface LaborPhase {
  id: string;
  name: string;
  description: string | null;
  default_price: number | null;
}

export default function AddItemToAreasModal({
  proposalId,
  rooms: initialRooms,
  activeAreaId,
  onClose,
  onItemsAdded,
  onRoomsUpdate
}: AddItemToAreasModalProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Form data matching LineItemEditModal
  const [formData, setFormData] = useState({
    description: '',
    quantity: 1,
    unit: 'ea',
    unit_price: 0,
    cost: 0,
    class_id: '',
    labor_hours: 0,
    labor_rate: 0,
    labor_phase_id: '',
    task_notes: '',
    show_task_notes: false,
    is_taxable: true,
    is_hidden: false,
    is_customer_supplied: false,
  });

  const [classes, setClasses] = useState<ProposalClass[]>([]);
  const [laborPhases, setLaborPhases] = useState<LaborPhase[]>([]);
  const [saving, setSaving] = useState(false);
  const [showNewClassForm, setShowNewClassForm] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassColor, setNewClassColor] = useState('#3B82F6');
  const [selectedRooms, setSelectedRooms] = useState<Set<string>>(new Set(activeAreaId ? [activeAreaId] : []));
  const [newAreaName, setNewAreaName] = useState('');
  const [creatingArea, setCreatingArea] = useState(false);
  const [localRooms, setLocalRooms] = useState<ProposalRoom[]>(initialRooms);
  const [showNewProductForm, setShowNewProductForm] = useState(false);

  useEffect(() => {
    loadProducts();
    loadLaborPhases();
    loadClasses();
  }, []);

  async function loadClasses() {
    try {
      const { data, error } = await supabase
        .from('proposal_classes')
        .select('id, name, color')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setClasses(data || []);
    } catch (error) {
      console.error('Error loading classes:', error);
    }
  }

  async function loadLaborPhases() {
    try {
      const { data, error } = await supabase
        .from('labor_phases')
        .select('id, name, description, default_price')
        .eq('is_active', true)
        .order('sort_order');

      if (error) throw error;
      setLaborPhases(data || []);
    } catch (error) {
      console.error('Error loading labor phases:', error);
    }
  }

  async function loadProducts() {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('sku');

      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredProducts = products.filter(product => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      product.sku?.toLowerCase().includes(query) ||
      product.name?.toLowerCase().includes(query) ||
      product.description?.toLowerCase().includes(query) ||
      product.category?.toLowerCase().includes(query)
    );
  });

  function handleProductSelect(product: Product) {
    setSelectedProduct(product);
    const basePrice = product.unit_price || product.our_price || 0;
    const phase = product.labor_phase_id
      ? laborPhases.find(p => p.id === product.labor_phase_id)
      : null;

    setFormData({
      description: product.description || product.name,
      quantity: 1,
      unit: product.unit || 'ea',
      unit_price: basePrice,
      cost: product.cost || 0,
      class_id: (product as any).class_id || '',
      labor_hours: product.default_labor_hours || 0,
      labor_rate: phase?.default_price || 0,
      labor_phase_id: product.labor_phase_id || '',
      task_notes: '',
      show_task_notes: false,
      is_taxable: product.is_taxable !== undefined ? product.is_taxable : true,
      is_hidden: false,
      is_customer_supplied: false,
    });
  }

  async function handleProductCreated(productData: any) {
    setShowNewProductForm(false);

    if (productData?.isOneOff) {
      const tempProduct: Product = {
        id: null as any,
        name: productData.manufacturer_model_number || productData.name,
        description: productData.sales_description || productData.description,
        unit_price: productData.our_price || productData.unit_price,
        our_price: productData.our_price,
        cost: productData.cost,
        unit: productData.unit,
        sku: productData.sku,
        manufacturer_model_number: productData.manufacturer_model_number,
        category: productData.category,
        item_type: productData.item_type,
        is_taxable: productData.is_taxable,
        labor_phase_id: productData.labor_phase_id,
        default_labor_hours: productData.default_labor_hours,
        oneOffData: productData
      } as any;
      handleProductSelect(tempProduct);
    } else {
      await loadProducts();
      if (productData?.id) {
        const product = products.find(p => p.id === productData.id);
        if (product) {
          handleProductSelect(product);
        }
      }
    }
  }

  function toggleRoom(roomId: string) {
    const newSelected = new Set(selectedRooms);
    if (newSelected.has(roomId)) {
      newSelected.delete(roomId);
    } else {
      newSelected.add(roomId);
    }
    setSelectedRooms(newSelected);
  }

  async function handleCreateArea() {
    if (!newAreaName.trim()) return;

    try {
      setCreatingArea(true);

      const { data: proposalData, error: proposalError } = await supabase
        .from('proposals')
        .select('organization_id')
        .eq('id', proposalId)
        .single();

      if (proposalError) throw proposalError;

      const { data, error } = await supabase
        .from('proposal_rooms')
        .insert({
          proposal_id: proposalId,
          organization_id: proposalData.organization_id,
          name: newAreaName.trim(),
          sort_order: localRooms.length
        })
        .select()
        .single();

      if (error) throw error;

      const newRoom: ProposalRoom = data;
      const updatedRooms = [...localRooms, newRoom];
      setLocalRooms(updatedRooms);

      if (onRoomsUpdate) {
        onRoomsUpdate(updatedRooms);
      }

      setSelectedRooms(prev => new Set([...prev, data.id]));
      setNewAreaName('');
    } catch (error: any) {
      console.error('Error creating area:', error);
      alert('Failed to create area: ' + error.message);
    } finally {
      setCreatingArea(false);
    }
  }

  async function createNewClass() {
    if (!newClassName.trim()) return;

    try {
      const { data, error } = await supabase
        .from('proposal_classes')
        .insert({
          name: newClassName.trim(),
          color: newClassColor,
          sort_order: classes.length,
          is_active: true
        })
        .select('id, name, color')
        .single();

      if (error) throw error;

      setClasses([...classes, data]);
      setFormData({ ...formData, class_id: data.id });
      setShowNewClassForm(false);
      setNewClassName('');
      setNewClassColor('#3B82F6');
    } catch (error) {
      console.error('Error creating class:', error);
      alert('Failed to create class');
    }
  }

  async function handleSave() {
    if (!selectedProduct) {
      alert('Please select a product');
      return;
    }

    if (!formData.is_customer_supplied && (!formData.cost || formData.cost <= 0)) {
      alert('Cost is required. Please enter a unit cost greater than $0 before saving.');
      return;
    }

    try {
      setSaving(true);

      const isOneOff = !selectedProduct.id || (selectedProduct as any).oneOffData;

      const effectiveUnitPrice = formData.is_customer_supplied ? 0 : formData.unit_price;
      const effectiveCost = formData.is_customer_supplied ? 0 : formData.cost;
      const effectiveLaborHours = formData.is_customer_supplied ? 0 : formData.labor_hours;
      const effectiveLaborRate = formData.is_customer_supplied ? 0 : formData.labor_rate;
      const laborTotal = effectiveLaborHours * formData.quantity * effectiveLaborRate;
      const effectiveLineTotal = formData.is_customer_supplied ? 0 : formData.quantity * formData.unit_price;

      const lineItems: any[] = [];
      let sortIndex = 0;

      const buildItem = (roomId: string | null) => {
        const lineItem: any = {
          proposal_id: proposalId,
          room_id: roomId,
          description: formData.description,
          quantity: formData.quantity,
          unit: formData.unit,
          unit_price: effectiveUnitPrice,
          cost: effectiveCost,
          line_total: effectiveLineTotal,
          class_id: formData.class_id || null,
          labor_phase_id: formData.labor_phase_id || null,
          labor_hours: effectiveLaborHours || null,
          labor_rate: effectiveLaborRate || null,
          labor_total: laborTotal || null,
          task_notes: formData.task_notes || null,
          show_task_notes: formData.show_task_notes,
          is_taxable: formData.is_taxable,
          is_hidden: formData.is_hidden,
          is_customer_supplied: formData.is_customer_supplied,
          is_custom: false,
          sort_order: 9999 + sortIndex++
        };

        if (isOneOff) {
          lineItem.product_id = null;
          lineItem.item_name = selectedProduct.name || (selectedProduct as any).manufacturer_model_number;
        } else {
          lineItem.product_id = selectedProduct.id;
        }

        return lineItem;
      };

      if (selectedRooms.size === 0) {
        lineItems.push(buildItem(null));
      } else {
        Array.from(selectedRooms).forEach(roomId => {
          lineItems.push(buildItem(roomId));
        });
      }

      const { data, error } = await supabase
        .from('proposal_line_items')
        .insert(lineItems)
        .select();

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      onItemsAdded();
    } catch (error: any) {
      console.error('Error adding items:', error);
      alert('Failed to add items: ' + error.message);
    } finally {
      setSaving(false);
    }
  }

  // Calculations matching LineItemEditModal
  const lineTotal = formData.is_customer_supplied ? 0 : formData.quantity * formData.unit_price;
  const laborTotal = formData.is_customer_supplied ? 0 : (formData.labor_hours || 0) * formData.quantity * (formData.labor_rate || 0);
  const totalRevenue = lineTotal + laborTotal;
  const totalCost = formData.is_customer_supplied ? 0 : (formData.cost * formData.quantity);
  const profit = totalRevenue - totalCost;
  const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-none sm:rounded-2xl shadow-2xl max-w-7xl w-full h-screen sm:h-auto sm:max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 sm:px-8 py-4 sm:py-6 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-lg sm:text-2xl font-bold text-gray-900">Add Item to Proposal</h2>
            <p className="text-gray-500 text-xs sm:text-sm mt-0.5 sm:mt-1">
              {selectedProduct ? 'Configure item details and pricing' : 'Search for a product or create a new one'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors rounded-lg p-2 hover:bg-gray-100"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 sm:px-8 py-5 sm:py-6 space-y-6">
          {/* Step 1: Product Selection */}
          {!selectedProduct ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Search Products
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name, SKU, or description..."
                    className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-300 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    autoFocus
                  />
                </div>
              </div>

              <button
                onClick={() => setShowNewProductForm(true)}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 font-medium"
              >
                <Plus className="w-5 h-5" />
                Create New Product
              </button>

              <div className="border border-gray-200 rounded-lg max-h-96 overflow-y-auto">
                {loading ? (
                  <div className="p-8 text-center text-gray-400">Loading products...</div>
                ) : filteredProducts.length === 0 ? (
                  <div className="p-8 text-center text-gray-400">
                    {searchQuery ? 'No products match your search' : 'No products available'}
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {filteredProducts.map(product => (
                      <button
                        key={product.id}
                        onClick={() => handleProductSelect(product)}
                        className="w-full p-4 text-left hover:bg-gray-50 transition-colors flex items-start gap-3"
                      >
                        <Package className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900">{product.name}</div>
                          {product.sku && (
                            <div className="text-xs text-gray-500 mt-0.5">SKU: {product.sku}</div>
                          )}
                          {product.description && (
                            <div className="text-sm text-gray-500 mt-1 line-clamp-2">
                              {product.description}
                            </div>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-gray-900 font-medium">
                            ${(product.unit_price || product.our_price || 0).toFixed(2)}
                          </div>
                          <div className="text-xs text-gray-500">per {product.unit || 'ea'}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Main Content - Two Column Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Column - Product Info */}
                <div className="lg:col-span-3">
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                    {(selectedProduct as any).image_url ? (
                      <img
                        src={(selectedProduct as any).image_url}
                        alt={selectedProduct.name}
                        className="w-full h-48 object-contain rounded-lg mb-3"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-full h-48 bg-white rounded-lg flex items-center justify-center mb-3">
                        <Package className="h-16 w-16 text-gray-300" />
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="font-medium text-gray-900 text-sm">{selectedProduct.name}</div>
                      {selectedProduct.sku && (
                        <div className="text-xs">
                          <span className="text-gray-500">SKU:</span>{' '}
                          <span className="text-gray-900 font-medium">{selectedProduct.sku}</span>
                        </div>
                      )}
                      <button
                        onClick={() => setSelectedProduct(null)}
                        className="w-full mt-2 px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs rounded-lg font-medium flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <X className="h-3.5 w-3.5" />
                        Change Product
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right Column - Form Fields */}
                <div className="lg:col-span-9">
                  <div className="space-y-5">
                    {/* Description */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Product Description
                      </label>
                      <input
                        type="text"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter product description"
                      />
                    </div>

                    {/* Pricing Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Quantity</label>
                        <input
                          type="number"
                          value={formData.quantity}
                          onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          min="0"
                          step="0.01"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Unit</label>
                        <input
                          type="text"
                          value={formData.unit}
                          onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="ea"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">
                          Cost {!formData.is_customer_supplied && <span className="text-red-500">*</span>}
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                          <input
                            type="text"
                            value={formData.is_customer_supplied ? 0 : (formData.cost || '')}
                            disabled={formData.is_customer_supplied}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '' || val === '-') {
                                setFormData({ ...formData, cost: 0 });
                              } else {
                                const parsed = parseFloat(val);
                                if (!isNaN(parsed)) {
                                  setFormData({ ...formData, cost: parsed });
                                }
                              }
                            }}
                            onBlur={(e) => {
                              const parsed = parseFloat(e.target.value);
                              setFormData({ ...formData, cost: isNaN(parsed) ? 0 : parsed });
                            }}
                            className={`w-full pl-8 pr-3 py-2 border rounded-lg text-gray-900 font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                              formData.is_customer_supplied
                                ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                                : !formData.cost || formData.cost <= 0
                                ? 'border-red-400 bg-red-50'
                                : 'border-gray-300'
                            }`}
                            placeholder="0.00"
                          />
                          {!formData.is_customer_supplied && (!formData.cost || formData.cost <= 0) && (
                            <p className="text-xs text-red-500 mt-1">Required</p>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Unit Price</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                          <input
                            type="number"
                            value={formData.is_customer_supplied ? 0 : formData.unit_price}
                            disabled={formData.is_customer_supplied}
                            onChange={(e) => setFormData({ ...formData, unit_price: parseFloat(e.target.value) || 0 })}
                            className={`w-full pl-8 pr-3 py-2 border rounded-lg text-gray-900 font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                              formData.is_customer_supplied
                                ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'border-gray-300'
                            }`}
                            min="0"
                            step="0.01"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Labor Fields */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Labor Hours</label>
                        <input
                          type="number"
                          value={formData.is_customer_supplied ? 0 : formData.labor_hours}
                          disabled={formData.is_customer_supplied}
                          onChange={(e) => setFormData({ ...formData, labor_hours: parseFloat(e.target.value) || 0 })}
                          className={`w-full px-3 py-2 border rounded-lg text-gray-900 font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                            formData.is_customer_supplied
                              ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                              : 'border-gray-300'
                          }`}
                          min="0"
                          step="0.25"
                          placeholder="0.00"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Labor Rate</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                          <input
                            type="number"
                            value={formData.is_customer_supplied ? 0 : formData.labor_rate}
                            disabled={formData.is_customer_supplied}
                            onChange={(e) => setFormData({ ...formData, labor_rate: parseFloat(e.target.value) || 0 })}
                            className={`w-full pl-8 pr-3 py-2 border rounded-lg text-gray-900 font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                              formData.is_customer_supplied
                                ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'border-gray-300'
                            }`}
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Labor Phase</label>
                        <select
                          value={formData.labor_phase_id}
                          onChange={(e) => {
                            const phaseId = e.target.value || '';
                            setFormData({ ...formData, labor_phase_id: phaseId });
                            if (phaseId) {
                              const phase = laborPhases.find(p => p.id === phaseId);
                              if (phase?.default_price) {
                                setFormData(prev => ({ ...prev, labor_phase_id: phaseId, labor_rate: phase.default_price! }));
                              }
                            }
                          }}
                          disabled={formData.is_customer_supplied}
                          className={`w-full px-3 py-2 border rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                            formData.is_customer_supplied
                              ? 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed'
                              : 'border-gray-300'
                          }`}
                        >
                          <option value="">No Phase</option>
                          {laborPhases.map(phase => (
                            <option key={phase.id} value={phase.id}>
                              {phase.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Financial Summary */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Material</p>
                        <p className="text-lg font-bold text-gray-900">{formatCurrency(lineTotal)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Labor</p>
                        <p className="text-lg font-bold text-gray-900">{formatCurrency(laborTotal)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Profit</p>
                        <p className={`text-lg font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ${profit.toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Margin</p>
                        <p className={`text-lg font-bold ${margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {margin.toFixed(1)}%
                        </p>
                      </div>
                    </div>

                    {/* Class */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Class</label>
                      {!showNewClassForm ? (
                        <div className="flex gap-2">
                          <select
                            value={formData.class_id}
                            onChange={(e) => setFormData({ ...formData, class_id: e.target.value })}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="">No Class</option>
                            {classes.map(cls => (
                              <option key={cls.id} value={cls.id}>
                                {cls.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => setShowNewClassForm(true)}
                            className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                          >
                            <Plus size={18} />
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                          <input
                            type="text"
                            value={newClassName}
                            onChange={(e) => setNewClassName(e.target.value)}
                            placeholder="Enter class name"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500"
                            autoFocus
                          />
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={newClassColor}
                              onChange={(e) => setNewClassColor(e.target.value)}
                              className="w-16 h-9 border border-gray-300 rounded cursor-pointer"
                            />
                            <button
                              type="button"
                              onClick={createNewClass}
                              disabled={!newClassName.trim()}
                              className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-lg font-medium transition-colors"
                            >
                              Create
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowNewClassForm(false);
                                setNewClassName('');
                              }}
                              className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Task Notes */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Task Notes for Technicians</label>
                      <textarea
                        value={formData.task_notes}
                        onChange={(e) => setFormData({ ...formData, task_notes: e.target.value })}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                        rows={3}
                        placeholder="Special installation instructions or notes..."
                      />
                    </div>

                    {/* Checkboxes */}
                    <div className="space-y-3">
                      {/* Customer Supplied Toggle */}
                      <div className="border-2 rounded-lg p-3 border-amber-300 bg-amber-50">
                        <label className="flex items-start gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.is_customer_supplied}
                            onChange={(e) => setFormData({ ...formData, is_customer_supplied: e.target.checked })}
                            className="w-5 h-5 rounded border-gray-300 text-amber-600 focus:ring-2 focus:ring-amber-500 mt-0.5"
                          />
                          <div className="flex-1">
                            <span className="text-sm font-semibold text-amber-800">
                              Customer Supplied Item
                            </span>
                            <div className="text-xs text-amber-700 mt-1">
                              The customer is providing this item. Price, cost, and labor are set to $0 and excluded from all proposal totals, tax, and deposit calculations. The item still appears in the scope of work.
                            </div>
                          </div>
                        </label>
                      </div>

                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={formData.is_taxable}
                          disabled
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 opacity-60 cursor-not-allowed"
                        />
                        <span className="text-sm text-gray-600">
                          Taxable item <span className="text-xs text-gray-500">(follows sales tax rules)</span>
                        </span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.show_task_notes}
                          onChange={(e) => setFormData({ ...formData, show_task_notes: e.target.checked })}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">
                          Show install task notes on customer proposal
                          <span className="ml-1 text-xs text-gray-400">(internal by default)</span>
                        </span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.is_hidden}
                          onChange={(e) => setFormData({ ...formData, is_hidden: e.target.checked })}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">Hide from customer proposal (internal item)</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Area Selection */}
              <div className="border border-gray-200 rounded-lg p-5">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Add to Area (optional — leave unselected to add without an area)
                </label>

                {/* Create New Area */}
                <div className="mb-3 flex gap-2">
                  <input
                    type="text"
                    value={newAreaName}
                    onChange={(e) => setNewAreaName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newAreaName.trim()) {
                        handleCreateArea();
                      }
                    }}
                    placeholder="Create new area..."
                    className="flex-1 px-3 py-2 bg-white border border-gray-300 text-gray-900 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    onClick={handleCreateArea}
                    disabled={!newAreaName.trim() || creatingArea}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                  >
                    {creatingArea ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                  </button>
                </div>

                <div className="space-y-2 border border-gray-200 rounded-lg p-3 bg-gray-50">
                  {localRooms.map(room => {
                    const isSelected = selectedRooms.has(room.id);
                    const isActive = room.id === activeAreaId;

                    return (
                      <label
                        key={room.id}
                        className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-blue-50 border border-blue-300'
                            : 'hover:bg-white border border-transparent'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRoom(room.id)}
                          className="w-4 h-4 text-blue-600 rounded"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`font-medium ${isSelected ? 'text-blue-700' : 'text-gray-900'}`}>
                              {room.name}
                            </span>
                            {isActive && (
                              <span className="text-xs px-2 py-0.5 bg-blue-600 text-white rounded">
                                Active
                              </span>
                            )}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                  {localRooms.length === 0 && (
                    <div className="text-center py-4 text-gray-400 text-sm">
                      No areas yet. Create one above, or leave unselected to add the item without an area.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-5 sm:px-8 py-4 flex items-center justify-between shrink-0">
          <div>
            {selectedProduct && (
              <div className="text-sm">
                <span className="text-gray-500">Line Total: </span>
                <span className="text-lg font-bold text-gray-900">
                  {formatCurrency(formData.is_customer_supplied ? 0 : lineTotal + laborTotal)}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-500 hover:text-gray-700 transition-colors"
            >
              Cancel
            </button>

            {selectedProduct && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium transition-colors"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Adding...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>
                      {selectedRooms.size === 0
                        ? 'Add (Unassigned)'
                        : `Add to ${selectedRooms.size} Area${selectedRooms.size !== 1 ? 's' : ''}`}
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {showNewProductForm && (
        <SinglePageProductForm
          allowOneOffItem={true}
          onSave={handleProductCreated}
          onClose={() => setShowNewProductForm(false)}
        />
      )}
    </div>
  );
}
