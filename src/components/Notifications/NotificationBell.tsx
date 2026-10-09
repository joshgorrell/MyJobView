import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { proposalFeedbackUrl } from '../../lib/proposalFeedbackLinks';
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
  const bellRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    if (window.matchMedia('(max-width: 767px)').matches) document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setIsOpen(false); }
      if (event.key !== 'Tab') return;
      const controls = panelRef.current?.querySelectorAll<HTMLElement>('button, [href], [tabindex="0"]');
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panelRef.current)) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKey);
      if (previousFocus?.isConnected) previousFocus.focus();
      else bellRef.current?.focus();
    };
  }, [isOpen]);
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
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        () => {
          loadAllNotifications();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `author_id=neq.${profile.id}` },
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
        .eq('messages.is_read', false)
        .order('last_message_at', { ascending: false })
        .limit(10);

      if (threads) {
        threads.forEach((thread: any) => {
          const latestMessage = thread.messages[0];
          if (latestMessage && !notifs?.some(n => n.type === 'message' && n.related_id === thread.id)) {
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

    // A mention opens the whole thread, including the messages around it.
    if ((notifType === 'message_mention' || notifType === 'message') && notification.related_id && onMessageClick) {
      await markAsRead(notification);
      onMessageClick(notification.related_id);
      setIsOpen(false);
      return;
    }
    if (notifType === 'flow_update_mention' && notification.related_id) {
      await markAsRead(notification);
      window.location.assign(`?tab=feed&flowUpdateId=${notification.related_id}`);
      return;
    }
    if (notifType === 'discussion_post_mention' && notification.related_id) {
      await markAsRead(notification);
      window.location.assign(`?tab=feed&postId=${notification.related_id}`);
      return;
    }

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

    if (notifType === 'review_request' && notification.title === 'Proposal check feedback received') {
      const url = notification.related_id
        ? proposalFeedbackUrl({ emailId: notification.related_id, receivedAt: notification.created_at })
        : '/?tab=reviews&reviewType=proposal';
      window.history.pushState(window.history.state, '', url);
      onTabChange?.('reviews');
      window.dispatchEvent(new PopStateEvent('popstate'));
      setIsOpen(false);
      return;
    }

    if (notifType === 'review_request' && notification.title === 'Lost opportunity feedback received') {
      window.location.assign('/?tab=reviews&reviewType=lost');
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
        ref={bellRef}
        aria-label="Notifications"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className="relative w-11 h-11 md:w-10 md:h-10 flex items-center justify-center text-secondary hover:bg-elevated rounded-lg transition-colors"
      >
        <Bell className="w-6 h-6" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 w-5 h-5 bg-red-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && createPortal(
        <>
          <div
            className="fixed inset-0 z-[80] bg-black/30"
            aria-hidden="true"
            onClick={() => setIsOpen(false)}
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Notifications"
            tabIndex={-1}
            className="notification-panel fixed bg-canvas text-primary rounded-xl shadow-2xl border border-subtle z-[90] flex flex-col overflow-hidden outline-none"
          >
            <div className="p-3 shrink-0 border-b border-subtle">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold text-primary">Notifications</h3>
                <button
                  onClick={() => setIsOpen(false)}
                  aria-label="Close notifications"
                  className="w-11 h-11 flex items-center justify-center text-muted hover:text-primary rounded-lg hover:bg-elevated"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {unreadCount > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleMarkAllAsRead}
                    className="min-h-9 text-xs text-brand font-medium"
                  >
                    Mark all read
                  </button>
                  <span className="text-muted">|</span>
                  <button
                    onClick={handleClearAll}
                    className="min-h-9 text-xs text-danger font-medium"
                  >
                    Clear all
                  </button>
                </div>
              )}
            </div>
            <div className="px-3 py-2 shrink-0 border-b border-subtle">
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setActiveFilter('all')}
                  className={`px-3 py-1 text-xs rounded-full transition-colors ${
                    activeFilter === 'all'
                      ? 'bg-blue-500 text-white'
                      : 'bg-elevated text-secondary hover:bg-surface'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setActiveFilter('messages')}
                  className={`px-3 py-1 text-xs rounded-full transition-colors flex items-center gap-1 ${
                    activeFilter === 'messages'
                      ? 'bg-blue-500 text-white'
                      : 'bg-elevated text-secondary hover:bg-surface'
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
                      : 'bg-elevated text-secondary hover:bg-surface'
                  }`}
                >
                  <CheckSquare className="w-3 h-3" />
                  Tasks
                </button>
              </div>
            </div>

            <div className="notification-list min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {filteredNotifications.length === 0 ? (
                <div className="p-8 text-center text-muted">
                  <Bell className="w-8 h-8 mx-auto mb-2 text-muted" />
                  <p className="text-sm">No {activeFilter === 'all' ? '' : activeFilter} yet</p>
                </div>
              ) : (
                <div className="divide-y divide-subtle">
                  {filteredNotifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`transition-colors ${
                        !notification.is_read ? 'bg-infoSoft' : 'bg-canvas'
                      }`}
                    >
                      <div
                        className="p-3 hover:bg-elevated"
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-shrink-0 mt-1">
                            {getNotificationIcon(notification)}
                          </div>
                          <button type="button" className="flex-1 min-w-0 text-left" onClick={() => handleNotificationClick(notification)}>
                            <p className="font-semibold text-primary text-sm mb-1 break-words">
                              {notification.title}
                            </p>
                            {notification.body && (
                              <p className={`text-secondary text-sm break-words ${expandedNotification === notification.id ? '' : 'line-clamp-2'}`}>
                                {notification.body}
                              </p>
                            )}
                            <p className="text-xs text-muted mt-1">
                              {formatDistanceToNow(notification.created_at)}
                            </p>
                          </button>
                          <div className="flex-shrink-0 flex flex-col items-center gap-1">
                            {!notification.is_read && (
                              <div className="w-2 h-2 bg-blue-600 rounded-full" />
                            )}
                            {notification.body && (
                              <button
                                aria-label={expandedNotification === notification.id ? "Collapse notification" : "Expand notification"}
                                aria-expanded={expandedNotification === notification.id}
                                onClick={(e) => toggleExpand(e, notification.id)}
                                className="w-9 h-9 flex items-center justify-center text-muted hover:text-primary"
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
                                aria-label="Delete notification"
                                onClick={(e) => handleDeleteNotification(e, notification.id)}
                                className="w-9 h-9 flex items-center justify-center text-muted hover:text-danger transition-colors"
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
        </>, document.body
      )}
    </div>
  );
}
