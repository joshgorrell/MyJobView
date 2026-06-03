import React from 'react';
import { X, DollarSign, Package, Layers } from 'lucide-react';

interface BulkUpdateConfirmationModalProps {
  itemDescription: string;
  fieldName: 'unit_price' | 'cost';
  oldValue: number;
  newValue: number;
  instanceCount: number;
  onUpdateSingle: () => void;
  onUpdateAll: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export default function BulkUpdateConfirmationModal({
  itemDescription,
  fieldName,
  oldValue,
  newValue,
  instanceCount,
  onUpdateSingle,
  onUpdateAll,
  onCancel,
  isLoading = false
}: BulkUpdateConfirmationModalProps) {
  const fieldLabel = fieldName === 'unit_price' ? 'Price' : 'Cost';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-700 flex-shrink-0">
          <h2 className="text-lg sm:text-xl font-bold text-white">Update {fieldLabel}?</h2>
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="text-gray-400 hover:text-white flex-shrink-0 disabled:opacity-50"
          >
            <X size={20} className="sm:hidden" />
            <X size={24} className="hidden sm:block" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
          {/* Item Description */}
          <div className="bg-gray-900 rounded-lg p-3 border border-gray-700">
            <div className="flex items-start gap-2">
              <Package size={18} className="text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs sm:text-sm text-gray-400 mb-1">Product</p>
                <p className="text-sm sm:text-base text-white font-medium truncate" title={itemDescription}>
                  {itemDescription}
                </p>
              </div>
            </div>
          </div>

          {/* Instance Count Alert */}
          <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-amber-400">
              <Layers size={18} className="flex-shrink-0" />
              <p className="text-sm sm:text-base font-semibold">
                This product appears {instanceCount} times in this proposal
              </p>
            </div>
          </div>

          {/* Price Comparison */}
          <div className="space-y-3">
            <p className="text-xs sm:text-sm text-gray-400">
              Would you like to update all instances or just this one?
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Old Value */}
              <div className="bg-gray-900 rounded-lg p-3 border border-gray-700">
                <p className="text-xs text-gray-400 mb-1">Current {fieldLabel}</p>
                <div className="flex items-center gap-1 text-red-400">
                  <DollarSign size={16} />
                  <span className="text-lg font-bold">{oldValue.toFixed(2)}</span>
                </div>
              </div>

              {/* New Value */}
              <div className="bg-gray-900 rounded-lg p-3 border border-green-700">
                <p className="text-xs text-gray-400 mb-1">New {fieldLabel}</p>
                <div className="flex items-center gap-1 text-green-400">
                  <DollarSign size={16} />
                  <span className="text-lg font-bold">{newValue.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Change Indicator */}
            <div className="text-center">
              <p className="text-xs sm:text-sm text-gray-400">
                Change: <span className={newValue > oldValue ? 'text-green-400' : 'text-red-400'}>
                  {newValue > oldValue ? '+' : ''}${(newValue - oldValue).toFixed(2)}
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-3 sm:p-4 border-t border-gray-700 space-y-2 flex-shrink-0">
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            {/* Update Single */}
            <button
              onClick={onUpdateSingle}
              disabled={isLoading}
              className="flex-1 min-h-[48px] px-4 py-3 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white rounded-lg font-medium text-sm sm:text-base flex items-center justify-center gap-2 transition-colors"
            >
              <Package size={18} />
              <span>Update Only This Item</span>
            </button>

            {/* Update All */}
            <button
              onClick={onUpdateAll}
              disabled={isLoading}
              className="flex-1 min-h-[48px] px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-800 disabled:cursor-not-allowed text-white rounded-lg font-medium text-sm sm:text-base flex items-center justify-center gap-2 transition-colors"
            >
              <Layers size={18} />
              <span>Update All {instanceCount} Instances</span>
            </button>
          </div>

          {/* Cancel */}
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="w-full min-h-[44px] px-4 py-2 text-gray-400 hover:text-white disabled:opacity-50 text-sm sm:text-base transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
