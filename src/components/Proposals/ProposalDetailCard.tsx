import React from 'react';
import { ProposalLineItem, Product } from '../../lib/types';
import { X, Package, DollarSign, TrendingUp, FileText } from 'lucide-react';

interface ProposalDetailCardProps {
  item: ProposalLineItem & { products?: Product };
  productClasses: Array<{ id: string; name: string; color: string; description: string }>;
  laborPhases: Array<{ id: string; name: string; description: string; default_rate: number }>;
  onClose: () => void;
  onUpdate: (itemId: string, updates: Partial<ProposalLineItem>) => void;
}

export default function ProposalDetailCard({
  item,
  productClasses,
  laborPhases,
  onClose,
  onUpdate
}: ProposalDetailCardProps) {
  const margin = item.unit_price - (item.cost || 0);
  const marginPercent = item.unit_price > 0 ? (margin / item.unit_price) * 100 : 0;
  const totalCost = (item.cost || 0) * item.quantity;
  const totalMargin = margin * item.quantity;

  const selectedClass = productClasses.find(c => c.name === (item as any).item_class);
  const selectedPhase = laborPhases.find(p => p.name === (item as any).labor_phase);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-2xl border border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="bg-gray-900 border-b border-gray-700 px-6 py-4 flex items-center justify-between sticky top-0">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-400" />
            Item Details
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Basic Info */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Description
            </label>
            <input
              type="text"
              value={item.description}
              onChange={(e) => onUpdate(item.id, { description: e.target.value })}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Product Info */}
          {item.products && (
            <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-400" />
                Product Information
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-400">SKU:</span>
                  <span className="ml-2 text-white">{item.products.sku || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-gray-400">Category:</span>
                  <span className="ml-2 text-white">{item.products.category || 'N/A'}</span>
                </div>
                {item.products.description && (
                  <div className="col-span-2">
                    <span className="text-gray-400">Description:</span>
                    <p className="mt-1 text-white">{item.products.description}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Quantity & Pricing */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Quantity
              </label>
              <input
                type="number"
                value={item.quantity}
                onChange={(e) => {
                  const qty = parseFloat(e.target.value) || 0;
                  onUpdate(item.id, {
                    quantity: qty,
                    line_total: qty * item.unit_price
                  });
                }}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500"
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Unit
              </label>
              <input
                type="text"
                value={item.unit}
                onChange={(e) => onUpdate(item.id, { unit: e.target.value })}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Cost & Price */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Unit Cost
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-gray-400">$</span>
                <input
                  type="number"
                  value={item.cost || 0}
                  onChange={(e) => onUpdate(item.id, { cost: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-7 pr-4 py-2 text-white focus:ring-2 focus:ring-blue-500"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Unit Price
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-gray-400">$</span>
                <input
                  type="number"
                  value={item.unit_price}
                  onChange={(e) => {
                    const price = parseFloat(e.target.value) || 0;
                    onUpdate(item.id, {
                      unit_price: price,
                      line_total: item.quantity * price
                    });
                  }}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-7 pr-4 py-2 text-white focus:ring-2 focus:ring-blue-500"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>
          </div>

          {/* Margin Analysis */}
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-400" />
              Margin Analysis
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-400">Unit Margin:</span>
                <div className={`text-lg font-semibold ${margin >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ${margin.toFixed(2)}
                </div>
              </div>
              <div>
                <span className="text-gray-400">Margin %:</span>
                <div className={`text-lg font-semibold ${marginPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {marginPercent.toFixed(1)}%
                </div>
              </div>
              <div>
                <span className="text-gray-400">Total Cost:</span>
                <div className="text-lg font-semibold text-white">
                  ${totalCost.toFixed(2)}
                </div>
              </div>
              <div>
                <span className="text-gray-400">Total Margin:</span>
                <div className={`text-lg font-semibold ${totalMargin >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ${totalMargin.toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {/* Classification */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Item Class
              </label>
              <select
                value={(item as any).item_class || ''}
                onChange={(e) => onUpdate(item.id, { item_class: e.target.value } as any)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="">None</option>
                {productClasses.map((pc) => (
                  <option key={pc.id} value={pc.name}>
                    {pc.name}
                  </option>
                ))}
              </select>
              {selectedClass && (
                <p className="mt-1 text-xs text-gray-400">{selectedClass.description}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Labor Phase
              </label>
              <select
                value={(item as any).labor_phase || ''}
                onChange={(e) => onUpdate(item.id, { labor_phase: e.target.value } as any)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="">None</option>
                {laborPhases.map((lp) => (
                  <option key={lp.id} value={lp.name}>
                    {lp.name}
                  </option>
                ))}
              </select>
              {selectedPhase && (
                <p className="mt-1 text-xs text-gray-400">
                  {selectedPhase.description} (${selectedPhase.default_rate}/hr)
                </p>
              )}
            </div>
          </div>

          {/* Task Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Task Notes
            </label>
            <textarea
              value={(item as any).task_notes || ''}
              onChange={(e) => onUpdate(item.id, { task_notes: e.target.value } as any)}
              placeholder="Add installation notes, special instructions, or task details..."
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 min-h-[100px]"
            />
          </div>

          {/* Visibility Toggle */}
          <div className="flex items-center justify-between p-4 bg-gray-900 border border-gray-700 rounded-lg">
            <div>
              <div className="text-sm font-medium text-white">Hide from Customer</div>
              <div className="text-xs text-gray-400 mt-1">
                Hide this item from customer-facing proposal views
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={(item as any).is_hidden || false}
                onChange={(e) => onUpdate(item.id, { is_hidden: e.target.checked } as any)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Total */}
          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-300">Line Total:</span>
              <span className="text-2xl font-bold text-white">
                ${item.line_total.toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
