import React, { useState, useEffect } from 'react';
import { Mail, MessageSquare, Clock, User, X, FileText, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ProposalNotificationHistoryProps {
  proposalId: string;
  onClose?: () => void;
  inline?: boolean;
}

export default function ProposalNotificationHistory({
  proposalId,
  onClose,
  inline = false,
}: ProposalNotificationHistoryProps) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNotification, setSelectedNotification] = useState<any>(null);

  useEffect(() => {
    loadNotifications();
  }, [proposalId]);

  const loadNotifications = async () => {
    try {
      const { data, error } = await supabase
        .from('proposal_notifications')
        .select(`
          *,
          profiles:sent_by (
            id,
            full_name
          )
        `)
        .eq('proposal_id', proposalId)
        .in('notification_type', [
          'approval_confirmation',
          'po_confirmation',
          'deposit_invoice_sent',
          'deposit_reminder',
          'manual_email',
          'proposal_sent',
          'proposal_expired',
        ])
        .order('sent_at', { ascending: false });

      if (error) throw error;
      setNotifications(data || []);
    } catch (err) {
      console.error('Error loading notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'deposit_invoice_sent':
      case 'deposit_reminder':
        return <FileText className="w-5 h-5 text-green-600" />;
      case 'po_confirmation':
        return <FileText className="w-5 h-5 text-blue-600" />;
      case 'approval_confirmation':
        return <Mail className="w-5 h-5 text-blue-600" />;
      case 'proposal_sent':
      case 'proposal_viewed':
        return <Mail className="w-5 h-5 text-gray-600" />;
      case 'manual_email':
        return <Mail className="w-5 h-5 text-purple-600" />;
      default:
        return <MessageSquare className="w-5 h-5 text-gray-600" />;
    }
  };

  const getNotificationTitle = (type: string) => {
    const titles: Record<string, string> = {
      deposit_invoice_sent: 'Deposit Invoice Sent',
      approval_confirmation: 'Approval Confirmation Sent',
      po_confirmation: 'Purchase Order Confirmation',
      deposit_reminder: 'Deposit Reminder Sent',
      proposal_sent: 'Proposal Sent to Customer',
      proposal_viewed: 'Proposal Viewed by Customer',
      proposal_expired: 'Proposal Expired Notice',
      manual_email: 'Manual Email Sent',
    };
    return titles[type] || type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const getMethodBadge = (method: string) => {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      email: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Email' },
      sms: { bg: 'bg-green-100', text: 'text-green-700', label: 'SMS' },
      portal: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Portal' },
      manual: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Manual' },
    };
    const badge = badges[method] || badges.email;
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    let relativeTime = '';
    if (diffMins < 1) {
      relativeTime = 'Just now';
    } else if (diffMins < 60) {
      relativeTime = `${diffMins}m ago`;
    } else if (diffHours < 24) {
      relativeTime = `${diffHours}h ago`;
    } else if (diffDays < 7) {
      relativeTime = `${diffDays}d ago`;
    } else {
      relativeTime = date.toLocaleDateString();
    }

    return {
      relative: relativeTime,
      absolute: date.toLocaleString(),
    };
  };

  const content = (
    <div className="space-y-4">
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse flex gap-3">
              <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
                <div className="h-3 bg-gray-100 rounded w-2/3"></div>
              </div>
            </div>
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-8">
          <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No notifications sent yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => {
            const time = formatTimestamp(notification.sent_at);
            return (
              <div
                key={notification.id}
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => setSelectedNotification(notification)}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                    {getNotificationIcon(notification.notification_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold text-gray-900 text-sm">
                        {getNotificationTitle(notification.notification_type)}
                      </h4>
                      {getMethodBadge(notification.method)}
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-gray-600">
                        To: <span className="font-medium">{notification.recipient_email}</span>
                        {notification.recipient_name && (
                          <span className="text-gray-500"> ({notification.recipient_name})</span>
                        )}
                      </p>
                      {notification.profiles && (
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                          <User className="w-3 h-3" />
                          Sent by {notification.profiles.full_name}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {time.relative}
                        <span className="text-gray-400">({time.absolute})</span>
                      </p>
                    </div>
                  </div>
                </div>
                {notification.metadata && Object.keys(notification.metadata).length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-xs font-medium text-gray-700 mb-1">Details:</p>
                    <div className="text-xs text-gray-600 space-y-0.5">
                      {notification.metadata.invoice_id && (
                        <p>Invoice ID: {notification.metadata.invoice_id}</p>
                      )}
                      {notification.metadata.sales_order_id && (
                        <p>Sales Order ID: {notification.metadata.sales_order_id}</p>
                      )}
                      {notification.metadata.amount && (
                        <p>Amount: ${notification.metadata.amount}</p>
                      )}
                      {notification.metadata.po_number && (
                        <p>PO Number: {notification.metadata.po_number}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedNotification && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Notification Details</h3>
              <button
                onClick={() => setSelectedNotification(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Type</label>
                  <p className="text-gray-900">
                    {getNotificationTitle(selectedNotification.notification_type)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Method</label>
                  <div className="mt-1">{getMethodBadge(selectedNotification.method)}</div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Recipient</label>
                  <p className="text-gray-900">{selectedNotification.recipient_email}</p>
                  {selectedNotification.recipient_name && (
                    <p className="text-sm text-gray-600">{selectedNotification.recipient_name}</p>
                  )}
                </div>
                {selectedNotification.profiles && (
                  <div>
                    <label className="text-sm font-medium text-gray-700">Sent By</label>
                    <p className="text-gray-900">{selectedNotification.profiles.full_name}</p>
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium text-gray-700">Sent At</label>
                  <p className="text-gray-900">
                    {new Date(selectedNotification.sent_at).toLocaleString()}
                  </p>
                </div>
                {selectedNotification.metadata &&
                  Object.keys(selectedNotification.metadata).length > 0 && (
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-2 block">
                        Additional Details
                      </label>
                      <div className="bg-gray-50 rounded p-3 space-y-1 text-sm">
                        {Object.entries(selectedNotification.metadata).map(([key, value]) => (
                          <div key={key} className="flex justify-between">
                            <span className="text-gray-600">
                              {key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}:
                            </span>
                            <span className="text-gray-900 font-medium">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (inline) {
    return content;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Approval & Document History</h2>
          {onClose && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-6 h-6" />
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-6">{content}</div>
      </div>
    </div>
  );
}
