import { X } from 'lucide-react';

interface CreatePurchaseOrderModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function CreatePurchaseOrderModal({ onClose, onSuccess }: CreatePurchaseOrderModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Create Purchase Order</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <p className="text-gray-300">
            Purchase order creation interface will be implemented here.
          </p>
        </div>
      </div>
    </div>
  );
}
