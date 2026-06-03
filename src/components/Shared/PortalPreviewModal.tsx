import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { PortalDashboard } from '../Portal/PortalDashboard';

interface PortalPreviewModalProps {
  contactId: string;
  contactName: string;
  onClose: () => void;
  defaultModule?: 'dashboard' | 'proposals' | 'projects' | 'appointments' | 'invoices' | 'messages' | 'vip' | 'punchlist';
}

export function PortalPreviewModal({ contactId, contactName, onClose, defaultModule = 'dashboard' }: PortalPreviewModalProps) {
  const prevContactId = useRef<string | null>(null);

  // Set localStorage synchronously before PortalDashboard renders so it always
  // sees the impersonation key on its first render, preventing a flash.
  if (prevContactId.current !== contactId) {
    localStorage.setItem('admin_impersonating_contact', contactId);
    prevContactId.current = contactId;
  }

  useEffect(() => {
    return () => {
      localStorage.removeItem('admin_impersonating_contact');
      prevContactId.current = null;
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl w-full max-w-6xl h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-800">
          <div>
            <h3 className="text-lg font-semibold text-white">Customer Portal Preview</h3>
            <p className="text-sm text-gray-400 mt-0.5">Viewing as: {contactName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-2 hover:bg-gray-700 rounded-lg"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-gray-950">
          <PortalDashboard defaultModule={defaultModule} />
        </div>
      </div>
    </div>
  );
}
