import { X, Trash2, Unlink, AlertTriangle, Package } from 'lucide-react';

interface AccessoryItem {
  product_name: string;
  new_quantity: number;
  new_unit_price: number;
  new_total: number;
  change_amount: number;
}

interface RemoveLineItemDialogProps {
  isOpen: boolean;
  onClose: () => void;
  parentItemName: string;
  accessories: AccessoryItem[];
  onRemoveAll: () => void;
  onRemovePrimaryOnly: () => void;
}

export function RemoveLineItemDialog({
  isOpen,
  onClose,
  parentItemName,
  accessories,
  onRemoveAll,
  onRemovePrimaryOnly,
}: RemoveLineItemDialogProps) {
  if (!isOpen) return null;

  const accessoryTotal = accessories.reduce((sum, a) => sum + (a.change_amount || 0), 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
        <div className="p-5 border-b border-gray-200 bg-red-50">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900">Remove Item with Accessories</h3>
              <p className="text-sm text-gray-600 mt-1">
                <span className="font-medium text-gray-900">{parentItemName}</span> has{' '}
                {accessories.length} nested accessor{accessories.length === 1 ? 'y' : 'ies'}.
                How would you like to proceed?
              </p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 -mt-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5">
          <div className="mb-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
              Nested Accessories
            </p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {accessories.map((acc, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg text-sm"
                >
                  <div className="flex items-center gap-2">
                    <Package className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-gray-800">{acc.product_name}</span>
                    <span className="text-gray-500">x{acc.new_quantity}</span>
                  </div>
                  <span className="font-medium text-gray-700">
                    ${(acc.new_total || 0).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
            {accessoryTotal !== 0 && (
              <div className="flex justify-between px-3 pt-2 mt-2 border-t border-gray-200 text-sm">
                <span className="text-gray-600">Accessories Total</span>
                <span className="font-semibold text-gray-900">${accessoryTotal.toFixed(2)}</span>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <button
              onClick={() => {
                onRemoveAll();
                onClose();
              }}
              className="w-full flex items-center gap-3 p-4 border-2 border-red-200 rounded-xl hover:bg-red-50 hover:border-red-300 transition-colors group text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0 group-hover:bg-red-200 transition-colors">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Remove All</p>
                <p className="text-sm text-gray-500">
                  Remove the primary item and all {accessories.length} accessor{accessories.length === 1 ? 'y' : 'ies'}
                </p>
              </div>
            </button>

            <button
              onClick={() => {
                onRemovePrimaryOnly();
                onClose();
              }}
              className="w-full flex items-center gap-3 p-4 border-2 border-blue-200 rounded-xl hover:bg-blue-50 hover:border-blue-300 transition-colors group text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-200 transition-colors">
                <Unlink className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Remove Primary Only</p>
                <p className="text-sm text-gray-500">
                  Keep accessories as standalone items in place
                </p>
              </div>
            </button>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
