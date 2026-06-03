import { X } from 'lucide-react';

interface ReceivePOModalProps {
  poId: string;
  poNumber: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function ReceivePOModal({ poId, poNumber, onClose, onSuccess }: ReceivePOModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Receive Purchase Order</h2>
            <p className="text-gray-300">{poNumber}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <p className="text-gray-300">
            PO receiving interface will be implemented here.
          </p>
        </div>
      </div>
    </div>
  );
}
