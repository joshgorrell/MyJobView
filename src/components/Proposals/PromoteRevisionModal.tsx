import React, { useState } from 'react';
import { CheckCircle2, Eye, Mail, X, AlertTriangle } from 'lucide-react';

interface PromoteRevisionModalProps {
  revisionName: string;
  revisionNumber: string;
  onConfirm: (sendNotification: boolean, notificationMessage: string) => Promise<void>;
  onClose: () => void;
}

export function PromoteRevisionModal({
  revisionName,
  revisionNumber,
  onConfirm,
  onClose,
}: PromoteRevisionModalProps) {
  const [sendNotification, setSendNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState(
    'Your proposal has been updated with new information. Please review the changes at your convenience.'
  );
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm(sendNotification, notificationMessage);
      onClose();
    } catch (error) {
      console.error('Error promoting revision:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-green-500" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Promote Revision to Live</h2>
              <p className="text-sm text-gray-400">{revisionName} (#{revisionNumber})</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Eye className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-blue-200 mb-1">What happens when you promote?</h3>
                <ul className="space-y-1 text-xs text-blue-300">
                  <li className="flex items-center gap-2">
                    <div className="w-1 h-1 bg-blue-400 rounded-full"></div>
                    <span>This revision becomes the Live version visible to customers</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-1 h-1 bg-blue-400 rounded-full"></div>
                    <span>Previous Live version is hidden from portal and unlocked</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-1 h-1 bg-blue-400 rounded-full"></div>
                    <span>New Live version is automatically locked to prevent accidental changes</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="w-1 h-1 bg-blue-400 rounded-full"></div>
                    <span>Customer can view changes immediately on next portal visit</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="sendNotification"
                checked={sendNotification}
                onChange={(e) => setSendNotification(e.target.checked)}
                className="mt-1 w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
              />
              <div className="flex-1">
                <label htmlFor="sendNotification" className="text-sm font-medium text-white cursor-pointer">
                  Send notification to customer
                </label>
                <p className="text-xs text-gray-400 mt-1">
                  Email the customer about the updated proposal. Leave unchecked if you're discussing changes directly with them.
                </p>
              </div>
            </div>

            {sendNotification && (
              <div className="pl-7 space-y-3 animate-in fade-in duration-200">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Notification Message
                  </label>
                  <textarea
                    value={notificationMessage}
                    onChange={(e) => setNotificationMessage(e.target.value)}
                    rows={4}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter a message for the customer..."
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    This message will be included in the notification email to the customer.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-yellow-200 mb-1">Important</h3>
                <p className="text-xs text-yellow-300">
                  Once promoted, this revision becomes the official proposal. If you're actively discussing changes with the customer, you may not need to send a notification right now.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-gray-800 border-t border-gray-700 px-6 py-4 flex items-center justify-between">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-gray-300 hover:text-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Promoting...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Promote to Live</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
