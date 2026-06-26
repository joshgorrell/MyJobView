import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import { Product } from '../../lib/types';
import { X, Save } from 'lucide-react';

interface PreAddProductModalProps {
  product: Product;
  targetRoomCount: number;
  onClose: () => void;
  onConfirm: (itemData: any) => void;
}

export default function PreAddProductModal({ product, targetRoomCount, onClose, onConfirm }: PreAddProductModalProps) {
  const [loading, setLoading] = useState(true);
  const [laborPhases, setLaborPhases] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    description: product.name,
    quantity: product.default_qty || 1,
    unit: product.unit || 'ea',
    price: product.unit_price || 0,
    cost: product.cost || 0,
    labor_hours: product.default_labor_hours || 0,
    labor_rate: 0,
    labor_phase_id: product.labor_phase_id || null,
    item_type: 'both' as 'material' | 'labor' | 'both'
  });

  useEffect(() => {
    loadLaborPhases();
  }, []);

  async function loadLaborPhases() {
    try {
      const { data } = await supabase
        .from('labor_phases')
        .select('*')
        .order('name');

      setLaborPhases(data || []);
    } catch (error) {
      console.error('Error loading labor phases:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleConfirm() {
    onConfirm(formData);
  }

  const materialTotal = formData.price * formData.quantity;
  const laborTotal = (formData.labor_hours || 0) * formData.quantity * (formData.labor_rate || 0);
  const lineTotal = materialTotal + laborTotal;
  const grandTotal = lineTotal * targetRoomCount;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Configure Item</h2>
            <p className="text-sm text-gray-600">Adding to {targetRoomCount} area{targetRoomCount !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Product Info */}
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="text-xs font-mono text-blue-600 mb-1">{product.sku}</div>
            <div className="font-semibold text-gray-900">{product.name}</div>
            {product.description && (
              <div className="text-sm text-gray-600 mt-1">{product.description}</div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Material Section */}
          <div className="border border-gray-200 rounded-lg p-4 space-y-4">
            <h3 className="font-semibold text-gray-900">Material Details</h3>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quantity
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.quantity}
                  onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Unit
                </label>
                <input
                  type="text"
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Price per {formData.unit}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="bg-blue-50 rounded p-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">Material Total:</span>
                <span className="text-lg font-bold text-blue-600">
                  ${materialTotal.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Labor Section */}
          <div className="border border-gray-200 rounded-lg p-4 space-y-4">
            <h3 className="font-semibold text-gray-900">Labor Details</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Labor Hours
                </label>
                <input
                  type="number"
                  step="0.25"
                  value={formData.labor_hours}
                  onChange={(e) => setFormData({ ...formData, labor_hours: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Hourly Rate
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.labor_rate}
                  onChange={(e) => setFormData({ ...formData, labor_rate: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Labor Phase
              </label>
              <select
                value={formData.labor_phase_id || ''}
                onChange={(e) => setFormData({ ...formData, labor_phase_id: e.target.value || null })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">None</option>
                {laborPhases.map(phase => (
                  <option key={phase.id} value={phase.id}>{phase.name}</option>
                ))}
              </select>
            </div>

            <div className="bg-green-50 rounded p-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">Labor Total:</span>
                <span className="text-lg font-bold text-green-600">
                  ${laborTotal.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Cost (Internal) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cost (Internal)
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.cost}
              onChange={(e) => setFormData({ ...formData, cost: parseFloat(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Total Summary */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Per Area:</span>
              <span className="font-semibold text-gray-900">{formatCurrency(lineTotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Number of Areas:</span>
              <span className="font-semibold text-gray-900">{targetRoomCount}</span>
            </div>
            <div className="border-t border-gray-300 pt-2 flex justify-between">
              <span className="font-semibold text-gray-900">Grand Total:</span>
              <span className="text-2xl font-bold text-blue-600">{formatCurrency(grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Save size={16} />
            Add to {targetRoomCount} Area{targetRoomCount !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
