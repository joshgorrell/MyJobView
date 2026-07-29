import { useEffect, useState } from 'react';
import { Bell, MessageCircle, CheckSquare, AlertCircle, Info, FileText, X, ChevronDown, ChevronUp, Trash2, MessageSquareWarning } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Notification } from '../../lib/types';
import { useAuth } from '../../contexts/AuthContext';
import { formatDistanceToNow } from '../../lib/utils';

interface NotificationBellProps {
  onLeadClick: (leadId: string) => void;
  onTaskClick?: (taskId: string) => void;
  onMessageClick?: (threadId: string) => void;
  onProposalClick?: (proposalId: string) => void;
  onTabChange?: (tab: string) => void;
}

interface UnifiedNotification {
  id: string;
  type: 'notification' | 'message' | 'task' | 'proposal';
  notification_type?: string; // Specific type like 'work_order_assignment', 'service_request', etc.
  title: string;
  body?: string;
  created_at: string;
  is_read: boolean;
  lead_id?: string;
  task_id?: string;
  thread_id?: string;
  proposal_id?: string;
  related_id?: string;
  priority?: string;
}

export function NotificationBell({ onLeadClick, onTaskClick, onMessageClick, onProposalClick, onTabChange }: NotificationBellProps) {
  const { profile } = useAuth();
  const [unifiedNotifications, setUnifiedNotifications] = useState<UnifiedNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeFilter, setActiveFilter] = useState<'all' | 'messages' | 'tasks' | 'notifications'>('all');
  const [expandedNotification, setExpandedNotification] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;

    loadAllNotifications();

    const notificationsChannel = supabase
      .channel(`notifications:${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        () => {
          loadAllNotifications();
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `author_id=neq.${profile.id}` },
        () => {
          loadAllNotifications();
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'tasks', filter: `user_id=eq.${profile.id}` },
        () => {
          loadAllNotifications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notificationsChannel);
    };
  }, [profile]);

  async function loadAllNotifications() {
    if (!profile) return;

    try {
      const unified: UnifiedNotification[] = [];

      // Load system notifications
      const { data: notifs } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (notifs) {
        notifs.forEach(n => {
          // Determine if this is a proposal notification
          const isProposalNotif = n.type === 'proposal_message';
          unified.push({
            id: n.id,
            type: isProposalNotif ? 'proposal' : 'notification',
            notification_type: n.type, // Store the actual notification type
            title: n.title,
            body: n.body,
            created_at: n.created_at,
            is_read: n.is_read,
            lead_id: n.lead_id,
            proposal_id: isProposalNotif ? n.related_id : undefined,
            related_id: n.related_id // Store related_id for work orders, service requests, etc.
          });
        });
      }

      // Load unread customer messages from threads where user is involved
      const { data: threads } = await supabase
        .from('message_threads')
        .select(`
          id,
          subject,
          last_message_at,
          messages!inner (
            id,
            author_id,
            author_type,
            is_internal,
            body,
            created_at
          )
        `)
        .neq('messages.author_id', profile.id)
        .eq('messages.author_type', 'customer')
        .eq('messages.is_internal', false)
        .order('last_message_at', { ascending: false })
        .limit(10);

      if (threads) {
        threads.forEach((thread: any) => {
          const latestMessage = thread.messages[0];
          if (latestMessage) {
            unified.push({
              id: `msg-${latestMessage.id}`,
              type: 'message',
              title: `New message: ${thread.subject}`,
              body: latestMessage.body.substring(0, 100),
              created_at: latestMessage.created_at,
              is_read: false,
              thread_id: thread.id
            });
          }
        });
      }

      // Sort all notifications by date
      unified.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setUnifiedNotifications(unified.slice(0, 20));
      setUnreadCount(unified.filter(n => !n.is_read).length);
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  }

  async function markAsRead(notification: UnifiedNotification) {
    try {
      if (notification.type === 'notification' || notification.type === 'proposal') {
        await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('id', notification.id);
      }
      setUnifiedNotifications(prev =>
        prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }

  async function handleNotificationClick(notification: UnifiedNotification) {
    if (!notification.is_read && (notification.type === 'notification' || notification.type === 'proposal')) {
      await markAsRead(notification);
    }

    // Handle different notification types
    const notifType = notification.notification_type;

    // Proposal-related notifications
    if (notification.type === 'proposal' && notification.proposal_id && onProposalClick) {
      onProposalClick(notification.proposal_id);
      setIsOpen(false);
      return;
    }

    // Message notifications
    if (notification.type === 'message' && notification.thread_id && onMessageClick) {
      onMessageClick(notification.thread_id);
      setIsOpen(false);
      return;
    }

    // Task notifications (synthetic task entries)
    if (notification.type === 'task' && notification.task_id && onTaskClick) {
      onTaskClick(notification.task_id);
      setIsOpen(false);
      return;
    }

    // Task assigned notifications (from notifications table with related_id = task id)
    if ((notifType === 'task_assigned' || notifType === 'task') && notification.related_id && onTaskClick) {
      await markAsRead(notification);
      onTaskClick(notification.related_id);
      setIsOpen(false);
      return;
    }

    // Lead notifications
    if (notification.lead_id) {
      onLeadClick(notification.lead_id);
      setIsOpen(false);
      return;
    }

    // Work order notifications - navigate to work orders tab
    if (notifType === 'work_order_assignment' && notification.related_id && onTabChange) {
      onTabChange('work_orders');
      setIsOpen(false);
      return;
    }

    // Service request notifications - navigate to service requests queue
    if ((notifType === 'service_request' || notifType === 'service_request_created' || notifType === 'punchlist_service_request') && onTabChange) {
      onTabChange('service_requests');
      setIsOpen(false);
      return;
    }

    // Service request kicked back - navigate to sales service requests tab
    if (notifType === 'service_request_kicked_back' && onTabChange) {
      onTabChange('sales_service_requests');
      setIsOpen(false);
      return;
    }

    // Service request resubmitted - navigate to service requests queue
    if (notifType === 'service_request_resubmitted' && onTabChange) {
      onTabChange('service_requests');
      setIsOpen(false);
      return;
    }

    // Punchlist notifications - navigate to punchlist
    if (notifType === 'punchlist_task' && onTabChange) {
      onTabChange('punchlist');
      setIsOpen(false);
      return;
    }

    // Proposal status notifications - navigate to proposals
    if (notifType === 'proposal_status' && notification.related_id && onProposalClick) {
      onProposalClick(notification.related_id);
      setIsOpen(false);
      return;
    }

    // Deposit reminder notifications - navigate to proposals
    if (notifType === 'deposit_reminder' && notification.related_id && onProposalClick) {
      onProposalClick(notification.related_id);
      setIsOpen(false);
      return;
    }

    // Proposal reactivation notifications - navigate to proposals
    if (notifType === 'proposal_reactivation' && notification.related_id && onProposalClick) {
      onProposalClick(notification.related_id);
      setIsOpen(false);
      return;
    }

    // Time request submitted (approver) - navigate directly to Internal Sessions tab
    if (notifType === 'internal_time_request_submitted' && onTabChange) {
      onTabChange('daily_clock_sessions');
      setIsOpen(false);
      return;
    }

    // Time request outcome (tech) - informational, just close
    if (notifType === 'internal_time_request_approved' || notifType === 'internal_time_request_denied') {
      setIsOpen(false);
      return;
    }

    // Time clock notifications - navigate to time clock
    if ((notifType === 'home_clock' || notifType === 'late_clock_in' || notifType === 'auto_clock_out') && onTabChange) {
      onTabChange('daily_clock');
      setIsOpen(false);
      return;
    }

    // VIP signup notifications - navigate to VIP plans
    if (notifType === 'vip_signup' && onTabChange) {
      onTabChange('vip-plans');
      setIsOpen(false);
      return;
    }

    // Task watcher notifications - navigate to tasks
    if (notifType === 'task_watcher' && notification.task_id && onTaskClick) {
      onTaskClick(notification.task_id);
      setIsOpen(false);
      return;
    }

    // Product request notifications - navigate to products catalog
    if (notifType === 'product_request' && onTabChange) {
      onTabChange('products_catalog');
      setIsOpen(false);
      return;
    }

    // Default: just close the notification panel
    setIsOpen(false);
  }

  async function handleDeleteNotification(e: React.MouseEvent, notificationId: string) {
    e.stopPropagation();
    try {
      await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      setUnifiedNotifications(prev => {
        const removed = prev.find(n => n.id === notificationId);
        const updated = prev.filter(n => n.id !== notificationId);
        if (removed && !removed.is_read) {
          setUnreadCount(c => Math.max(0, c - 1));
        }
        return updated;
      });
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  }

  async function handleClearAll() {
    try {
      if (!profile) return;

      await supabase
        .from('notifications')
        .delete()
        .eq('user_id', profile.id);

      setUnifiedNotifications([]);
      setUnreadCount(0);
    } catch (error) {
      console.error('Error clearing all notifications:', error);
    }
  }

  async function handleMarkAllAsRead() {
    try {
      if (!profile) return;

      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', profile.id)
        .eq('is_read', false);

      setUnifiedNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  }

  function toggleExpand(e: React.MouseEvent, notificationId: string) {
    e.stopPropagation();
    setExpandedNotification(expandedNotification === notificationId ? null : notificationId);
  }

  const getNotificationIcon = (notif: UnifiedNotification) => {
    const { type, notification_type, priority } = notif;
    if (notification_type === 'service_request_kicked_back') {
      return <MessageSquareWarning className="w-4 h-4 text-amber-500" />;
    }
    switch (type) {
      case 'proposal':
        return <FileText className="w-4 h-4 text-green-500" />;
      case 'message':
        return <MessageCircle className="w-4 h-4 text-blue-500" />;
      case 'task':
        const color = priority === 'urgent' ? 'text-red-500' : priority === 'high' ? 'text-orange-500' : 'text-green-500';
        return <CheckSquare className={`w-4 h-4 ${color}`} />;
      case 'notification':
        return <Bell className="w-4 h-4 text-blue-500" />;
      default:
        return <Info className="w-4 h-4 text-gray-500" />;
    }
  };

  const filteredNotifications = activeFilter === 'all'
    ? unifiedNotifications
    : unifiedNotifications.filter(n =>
        activeFilter === 'messages' ? n.type === 'message' :
        activeFilter === 'tasks' ? n.type === 'task' :
        n.type === 'notification'
      );

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 w-5 h-5 bg-red-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="fixed sm:absolute top-16 sm:top-auto right-0 sm:right-0 left-0 sm:left-auto sm:mt-2 w-full sm:w-96 sm:max-w-md bg-white sm:rounded-lg shadow-2xl border-t sm:border border-gray-200 z-50 max-h-[calc(100vh-4rem)] sm:max-h-[500px] flex flex-col">
            <div className="p-3 sm:p-4 border-b border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-900">Notifications</h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="sm:hidden p-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {unreadCount > 0 && (
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={handleMarkAllAsRead}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Mark all read
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={handleClearAll}
                    className="text-xs text-red-600 hover:text-red-800 font-medium"
                  >
                    Clear all
                  </button>
                </div>
              )}
            </div>
            <div className="px-3 sm:px-4 py-2 border-b border-gray-200">
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setActiveFilter('all')}
                  className={`px-3 py-1 text-xs rounded-full transition-colors ${
                    activeFilter === 'all'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setActiveFilter('messages')}
                  className={`px-3 py-1 text-xs rounded-full transition-colors flex items-center gap-1 ${
                    activeFilter === 'messages'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <MessageCircle className="w-3 h-3" />
                  Messages
                </button>
                <button
                  onClick={() => setActiveFilter('tasks')}
                  className={`px-3 py-1 text-xs rounded-full transition-colors flex items-center gap-1 ${
                    activeFilter === 'tasks'
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <CheckSquare className="w-3 h-3" />
                  Tasks
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {filteredNotifications.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <Bell className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm">No {activeFilter === 'all' ? '' : activeFilter} yet</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredNotifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`transition-colors ${
                        !notification.is_read ? 'bg-blue-50' : ''
                      }`}
                    >
                      <div
                        className="p-3 sm:p-4 hover:bg-gray-50 cursor-pointer"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 mt-1">
                            {getNotificationIcon(notification)}
                          </div>
                          <div className="flex-1 min-w-0" onClick={() => handleNotificationClick(notification)}>
                            <p className="font-semibold text-gray-900 text-sm mb-1">
                              {notification.title}
                            </p>
                            {notification.body && (
                              <p className={`text-gray-600 text-sm break-words ${expandedNotification === notification.id ? '' : 'line-clamp-2'}`}>
                                {notification.body}
                              </p>
                            )}
                            <p className="text-xs text-gray-500 mt-1">
                              {formatDistanceToNow(notification.created_at)}
                            </p>
                          </div>
                          <div className="flex-shrink-0 flex items-center gap-2">
                            {!notification.is_read && (
                              <div className="w-2 h-2 bg-blue-600 rounded-full" />
                            )}
                            {notification.body && notification.body.length > 100 && (
                              <button
                                onClick={(e) => toggleExpand(e, notification.id)}
                                className="p-1 text-gray-400 hover:text-gray-600"
                              >
                                {expandedNotification === notification.id ? (
                                  <ChevronUp className="w-4 h-4" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                              </button>
                            )}
                            {notification.type === 'notification' && (
                              <button
                                onClick={(e) => handleDeleteNotification(e, notification.id)}
                                className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
