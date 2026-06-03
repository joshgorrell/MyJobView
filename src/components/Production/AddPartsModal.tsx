import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { X, Plus, Search, Package, DollarSign, Hash } from 'lucide-react';

interface AddPartsModalProps {
  workOrderId: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  unit_cost: number;
  list_price: number;
}

interface PartEntry {
  product_id: string | null;
  part_name: string;
  part_sku: string;
  quantity: number;
  unit_cost: number;
  unit_price: number;
  warranty_item: boolean;
}

export function AddPartsModal({ workOrderId, onClose, onSuccess }: AddPartsModalProps) {
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [showCustomPart, setShowCustomPart] = useState(false);

  const [parts, setParts] = useState<PartEntry[]>([]);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchQuery.length >= 2) {
        searchProducts();
      } else {
        setSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  async function searchProducts() {
    setSearching(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, sku, unit_cost, list_price')
        .or(`name.ilike.%${searchQuery}%,sku.ilike.%${searchQuery}%`)
        .limit(20);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      console.error('Error searching products:', error);
    } finally {
      setSearching(false);
    }
  }

  function addProductPart(product: Product) {
    const newPart: PartEntry = {
      product_id: product.id,
      part_name: product.name,
      part_sku: product.sku,
      quantity: 1,
      unit_cost: product.unit_cost || 0,
      unit_price: product.list_price || 0,
      warranty_item: false
    };

    setParts(prev => [...prev, newPart]);
    setSearchQuery('');
    setSearchResults([]);
  }

  function addCustomPart() {
    const newPart: PartEntry = {
      product_id: null,
      part_name: '',
      part_sku: '',
      quantity: 1,
      unit_cost: 0,
      unit_price: 0,
      warranty_item: false
    };

    setParts(prev => [...prev, newPart]);
    setShowCustomPart(false);
  }

  function updatePart(index: number, field: keyof PartEntry, value: any) {
    setParts(prev => prev.map((part, i) =>
      i === index ? { ...part, [field]: value } : part
    ));
  }

  function removePart(index: number) {
    setParts(prev => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (parts.length === 0) {
      alert('Please add at least one part');
      return;
    }

    const invalidParts = parts.filter(p => !p.part_name || p.quantity <= 0);
    if (invalidParts.length > 0) {
      alert('Please fill in all required fields for each part');
      return;
    }

    setLoading(true);

    try {
      const partsToInsert = parts.map(part => ({
        work_order_id: workOrderId,
        product_id: part.product_id,
        part_name: part.part_name,
        part_sku: part.part_sku || null,
        quantity: part.quantity,
        unit_cost: part.unit_cost,
        unit_price: part.unit_price,
        warranty_item: part.warranty_item
      }));

      const { error } = await supabase
        .from('service_parts_used')
        .insert(partsToInsert);

      if (error) throw error;

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error adding parts:', error);
      alert(`Failed to add parts: ${error?.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-none sm:rounded-xl shadow-xl max-w-4xl w-full flex flex-col h-screen sm:h-auto sm:max-h-[90vh]">
        <div className="bg-white border-b border-gray-200 px-5 sm:px-6 py-4 flex items-center justify-between shrink-0">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
            Add Parts Used
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form id="add-parts-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {/* Product Search */}
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Search className="w-5 h-5" />
              Search Product Catalog
            </h3>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by product name or SKU..."
                className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {searching && (
              <div className="text-center py-4 text-gray-500">
                <div className="animate-spin inline-block w-6 h-6 border-3 border-blue-500 border-t-transparent rounded-full"></div>
                <p className="mt-2 text-sm">Searching...</p>
              </div>
            )}

            {!searching && searchResults.length > 0 && (
              <div className="border-2 border-blue-200 rounded-lg max-h-64 overflow-y-auto bg-blue-50">
                {searchResults.map(product => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addProductPart(product)}
                    className="w-full text-left p-3 hover:bg-blue-100 border-b border-blue-100 last:border-b-0 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{product.name}</p>
                        {product.sku && (
                          <p className="text-sm text-gray-600">SKU: {product.sku}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-600">Cost: ${product.unit_cost?.toFixed(2) || '0.00'}</p>
                        <p className="text-sm font-medium text-green-700">Price: ${product.list_price?.toFixed(2) || '0.00'}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={addCustomPart}
              className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-500 hover:text-blue-600 transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Add Custom Part (Not in Catalog)
            </button>
          </div>

          {/* Parts List */}
          {parts.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Package className="w-5 h-5" />
                Parts to Add ({parts.length})
              </h3>

              {parts.map((part, index) => (
                <div key={index} className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-3">
                      {/* Part Name */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Part Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={part.part_name}
                          onChange={(e) => updatePart(index, 'part_name', e.target.value)}
                          placeholder="Enter part name"
                          disabled={!!part.product_id}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                        />
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {/* SKU */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            <Hash className="w-3 h-3 inline mr-1" />
                            SKU
                          </label>
                          <input
                            type="text"
                            value={part.part_sku}
                            onChange={(e) => updatePart(index, 'part_sku', e.target.value)}
                            placeholder="SKU"
                            disabled={!!part.product_id}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                          />
                        </div>

                        {/* Quantity */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Qty *
                          </label>
                          <input
                            type="number"
                            required
                            min="0.01"
                            step="0.01"
                            value={part.quantity}
                            onChange={(e) => updatePart(index, 'quantity', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>

                        {/* Unit Cost */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            <DollarSign className="w-3 h-3 inline mr-1" />
                            Cost
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={part.unit_cost}
                            onChange={(e) => updatePart(index, 'unit_cost', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>

                        {/* Unit Price */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            <DollarSign className="w-3 h-3 inline mr-1" />
                            Price
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={part.unit_price}
                            onChange={(e) => updatePart(index, 'unit_price', parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                      </div>

                      {/* Total and Warranty */}
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={part.warranty_item}
                            onChange={(e) => updatePart(index, 'warranty_item', e.target.checked)}
                            className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">Warranty Item (No Charge)</span>
                        </label>
                        <div className="text-right">
                          <p className="text-sm text-gray-600">Total:</p>
                          <p className="text-lg font-bold text-green-700">
                            ${(part.quantity * part.unit_price).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => removePart(index)}
                      className="ml-3 p-2 text-red-500 hover:bg-red-50 rounded-lg"
                      title="Remove part"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}

              {/* Summary */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">Total Parts Value</p>
                    <p className="text-sm text-gray-600">{parts.length} part{parts.length !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Total Cost:</p>
                    <p className="text-lg font-bold text-gray-900">
                      ${parts.reduce((sum, p) => sum + (p.quantity * p.unit_cost), 0).toFixed(2)}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">Total Price:</p>
                    <p className="text-xl font-bold text-green-700">
                      ${parts.reduce((sum, p) => sum + (p.quantity * p.unit_price), 0).toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {parts.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <Package className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p>No parts added yet</p>
              <p className="text-sm mt-1">Search for products or add custom parts above</p>
            </div>
          )}

        </form>

        <div className="flex gap-3 px-5 sm:px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-none sm:rounded-b-xl shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="add-parts-form"
            disabled={loading || parts.length === 0}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Adding Parts...' : `Add ${parts.length} Part${parts.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
