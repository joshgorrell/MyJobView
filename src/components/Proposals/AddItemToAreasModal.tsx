import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Product, ProposalRoom } from '../../lib/types';
import { Search, Package, X, Check, Plus } from 'lucide-react';
import SinglePageProductForm from '../Products/SinglePageProductForm';

interface AddItemToAreasModalProps {
  proposalId: string;
  rooms: ProposalRoom[];
  activeAreaId?: string;
  onClose: () => void;
  onItemsAdded: () => void;
  onRoomsUpdate?: (rooms: ProposalRoom[]) => void;
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
  const [selectedRooms, setSelectedRooms] = useState<Set<string>>(new Set(activeAreaId ? [activeAreaId] : []));
  const [saving, setSaving] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [editedDescription, setEditedDescription] = useState('');
  const [editedPrice, setEditedPrice] = useState('0.00');
  const [editedUnit, setEditedUnit] = useState('ea');
  const [laborPhases, setLaborPhases] = useState<any[]>([]);
  const [selectedLaborPhaseId, setSelectedLaborPhaseId] = useState<string | null>(null);
  const [laborHours, setLaborHours] = useState<string>('0');
  const [laborRate, setLaborRate] = useState<string>('0');
  const [newAreaName, setNewAreaName] = useState('');
  const [creatingArea, setCreatingArea] = useState(false);
  const [localRooms, setLocalRooms] = useState<ProposalRoom[]>(initialRooms);
  const [showNewProductForm, setShowNewProductForm] = useState(false);

  useEffect(() => {
    loadProducts();
    loadLaborPhases();
  }, []);

  async function loadLaborPhases() {
    try {
      const { data, error } = await supabase
        .from('labor_phases')
        .select('*')
        .order('name');

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
    setEditedDescription(product.description || product.name);
    setEditedPrice((product.unit_price || product.our_price || 0).toFixed(2));
    setEditedUnit(product.unit || 'ea');
    setQuantity(1);

    // Pre-select product's labor phase if it has one and set the labor rate
    if (product.labor_phase_id) {
      setSelectedLaborPhaseId(product.labor_phase_id);

      // Find the phase and set its default price as the labor rate
      const selectedPhase = laborPhases.find(p => p.id === product.labor_phase_id);
      if (selectedPhase && selectedPhase.default_price) {
        setLaborRate(selectedPhase.default_price.toString());
      } else {
        setLaborRate('0');
      }
    } else {
      setSelectedLaborPhaseId(null);
      setLaborRate('0');
    }

    // Set default labor hours from product
    setLaborHours((product.default_labor_hours || 0).toString());
  }

  async function handleProductCreated(productData: any) {
    setShowNewProductForm(false);

    // Check if it's a one-off item or saved to catalog
    if (productData?.isOneOff) {
      // Create a temporary product object for one-off items
      const tempProduct: Product = {
        id: null as any, // Will be null for one-off items
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
        // Store the full one-off data for later use
        oneOffData: productData
      };
      handleProductSelect(tempProduct);
    } else {
      // Product was saved to catalog, reload products and select it
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

      // First, get the organization_id from the proposal
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

      // Add the new area to local rooms list
      const newRoom: ProposalRoom = data;
      const updatedRooms = [...localRooms, newRoom];
      setLocalRooms(updatedRooms);

      // Notify parent component of room update if callback provided
      if (onRoomsUpdate) {
        onRoomsUpdate(updatedRooms);
      }

      // Add the new area to the selected rooms
      setSelectedRooms(prev => new Set([...prev, data.id]));

      // Clear the input
      setNewAreaName('');
    } catch (error: any) {
      console.error('Error creating area:', error);
      alert('Failed to create area: ' + error.message);
    } finally {
      setCreatingArea(false);
    }
  }

  async function handleSave() {
    if (!selectedProduct) {
      alert('Please select a product');
      return;
    }

    try {
      setSaving(true);

      const price = parseFloat(editedPrice) || 0;

      const lineItems: any[] = [];
      let sortIndex = 0;

      // Check if this is a one-off item
      const isOneOff = !selectedProduct.id || selectedProduct.oneOffData;

      if (selectedRooms.size === 0) {
        // No area selected — save item with null room_id (unassigned)
        const lineItem: any = {
          proposal_id: proposalId,
          room_id: null,
          description: editedDescription,
          quantity: quantity,
          unit: editedUnit,
          unit_price: price,
          cost: selectedProduct.cost || 0,
          line_total: quantity * price,
          labor_phase_id: selectedLaborPhaseId,
          labor_hours: parseFloat(laborHours) || null,
          labor_rate: parseFloat(laborRate) || null,
          is_custom: false,
          sort_order: 9999 + sortIndex++
        };

        if (isOneOff) {
          lineItem.product_id = null;
          lineItem.item_name = selectedProduct.name || selectedProduct.manufacturer_model_number;
        } else {
          lineItem.product_id = selectedProduct.id;
        }

        lineItems.push(lineItem);
      } else {
        Array.from(selectedRooms).forEach(roomId => {
          const lineItem: any = {
            proposal_id: proposalId,
            room_id: roomId,
            description: editedDescription,
            quantity: quantity,
            unit: editedUnit,
            unit_price: price,
            cost: selectedProduct.cost || 0,
            line_total: quantity * price,
            labor_phase_id: selectedLaborPhaseId,
            labor_hours: parseFloat(laborHours) || null,
            labor_rate: parseFloat(laborRate) || null,
            is_custom: false,
            sort_order: 9999 + sortIndex++
          };

          if (isOneOff) {
            lineItem.product_id = null;
            lineItem.item_name = selectedProduct.name || selectedProduct.manufacturer_model_number;
          } else {
            lineItem.product_id = selectedProduct.id;
          }

          lineItems.push(lineItem);
        });
      }

      console.log('Inserting line items:', lineItems);

      const { data, error } = await supabase
        .from('proposal_line_items')
        .insert(lineItems)
        .select();

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      console.log('Successfully inserted:', data);

      onItemsAdded();
    } catch (error: any) {
      console.error('Error adding items:', error);
      alert('Failed to add items: ' + error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">Add Item to Proposal</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Product Selection */}
          {!selectedProduct ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Search Products
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name, SKU, or description..."
                    className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    autoFocus
                  />
                </div>
              </div>

              <button
                onClick={() => setShowNewProductForm(true)}
                className="w-full px-4 py-3 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors flex items-center justify-center gap-2 font-medium"
              >
                <Plus className="w-5 h-5" />
                Create New Product
              </button>

              <div className="border border-gray-700 rounded-lg max-h-96 overflow-y-auto">
                {loading ? (
                  <div className="p-8 text-center text-gray-400">Loading products...</div>
                ) : filteredProducts.length === 0 ? (
                  <div className="p-8 text-center text-gray-400">
                    {searchQuery ? 'No products match your search' : 'No products available'}
                  </div>
                ) : (
                  <div className="divide-y divide-gray-700">
                    {filteredProducts.map(product => (
                      <button
                        key={product.id}
                        onClick={() => handleProductSelect(product)}
                        className="w-full p-4 text-left hover:bg-gray-800 transition-colors flex items-start gap-3"
                      >
                        <Package className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-white">{product.name}</div>
                          {product.sku && (
                            <div className="text-xs text-gray-400 mt-0.5">SKU: {product.sku}</div>
                          )}
                          {product.description && (
                            <div className="text-sm text-gray-400 mt-1 line-clamp-2">
                              {product.description}
                            </div>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-white font-medium">
                            ${(product.unit_price || product.our_price || 0).toFixed(2)}
                          </div>
                          <div className="text-xs text-gray-400">per {product.unit || 'ea'}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Selected Product Info */}
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <Package className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white">{selectedProduct.name}</div>
                      {selectedProduct.sku && (
                        <div className="text-xs text-gray-400 mt-0.5">SKU: {selectedProduct.sku}</div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedProduct(null)}
                    className="text-gray-400 hover:text-white text-sm flex-shrink-0"
                  >
                    Change
                  </button>
                </div>
              </div>

              {/* Item Details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Price per {editedUnit}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editedPrice}
                      onChange={(e) => setEditedPrice(e.target.value)}
                      onBlur={(e) => {
                        const value = parseFloat(e.target.value) || 0;
                        setEditedPrice(value.toFixed(2));
                      }}
                      className="w-full pl-7 pr-3 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Description
                </label>
                <textarea
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              {/* Labor Information */}
              <div className="space-y-4 p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
                <h3 className="text-sm font-semibold text-gray-300">Labor Information</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Labor Hours
                    </label>
                    <input
                      type="number"
                      step="0.25"
                      min="0"
                      value={laborHours}
                      onChange={(e) => setLaborHours(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      placeholder="0"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Labor Rate ($/hr)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={laborRate}
                        onChange={(e) => setLaborRate(e.target.value)}
                        onBlur={(e) => {
                          const value = parseFloat(e.target.value) || 0;
                          setLaborRate(value.toFixed(2));
                        }}
                        className="w-full pl-7 pr-3 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                </div>

                {laborPhases.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Labor Phase (Optional)
                    </label>
                    <select
                      value={selectedLaborPhaseId || ''}
                      onChange={(e) => {
                        const phaseId = e.target.value || null;
                        setSelectedLaborPhaseId(phaseId);

                        // Auto-populate labor rate from selected phase
                        if (phaseId) {
                          const selectedPhase = laborPhases.find(p => p.id === phaseId);
                          if (selectedPhase && selectedPhase.default_price) {
                            setLaborRate(selectedPhase.default_price.toString());
                          }
                        }
                      }}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">No labor phase</option>
                      {laborPhases.map(phase => (
                        <option key={phase.id} value={phase.id}>
                          {phase.name} {phase.default_price ? `($${phase.default_price}/hr)` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {(parseFloat(laborHours) > 0 && parseFloat(laborRate) > 0) && (
                  <div className="pt-2 border-t border-gray-700">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-400">Labor Total:</span>
                      <span className="text-cyan-400 font-semibold">
                        ${(parseFloat(laborHours) * parseFloat(laborRate)).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Area Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-3">
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
                    className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  />
                  <button
                    onClick={handleCreateArea}
                    disabled={!newAreaName.trim() || creatingArea}
                    className="px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {creatingArea ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                  </button>
                </div>

                <div className="space-y-2 border border-gray-700 rounded-lg p-3">
                  {localRooms.map(room => {
                    const isSelected = selectedRooms.has(room.id);
                    const isActive = room.id === activeAreaId;

                    return (
                      <label
                        key={room.id}
                        className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-cyan-900/30 border border-cyan-700'
                            : 'hover:bg-gray-800 border border-transparent'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRoom(room.id)}
                          className="w-4 h-4 text-cyan-600 rounded"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className={`font-medium ${isSelected ? 'text-cyan-400' : 'text-white'}`}>
                              {room.name}
                            </span>
                            {isActive && (
                              <span className="text-xs px-2 py-0.5 bg-cyan-600 text-white rounded">
                                Active
                              </span>
                            )}
                          </div>
                        </div>
                        {isSelected && (
                          <Check className="w-5 h-5 text-cyan-400 flex-shrink-0" />
                        )}
                      </label>
                    );
                  })}
                  {localRooms.length === 0 && (
                    <div className="text-center py-4 text-gray-500 text-sm">
                      No areas yet. Create one above, or leave unselected to add the item without an area.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-700 p-4 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>

          {selectedProduct && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
