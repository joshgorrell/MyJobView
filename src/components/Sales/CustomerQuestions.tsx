import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Search, Clock, CheckCircle, AlertCircle, ExternalLink, User, HelpCircle, Loader } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface ThreadWithProposal {
  thread_id: string;
  proposal_id: string;
  proposal_number: string;
  proposal_title: string;
  proposal_status: string;
  contact_name: string;
  rep_name: string;
  rep_id: string;
  latest_customer_message: string;
  latest_customer_message_at: string;
  context_label: string | null;
  unread_count: number;
  last_rep_response_at: string | null;
  attachment_url: string | null;
  attachment_type: string | null;
}

interface CustomerQuestionsProps {
  onOpenProposal?: (proposalId: string, threadId?: string) => void;
}

export function CustomerQuestions({ onOpenProposal }: CustomerQuestionsProps) {
  const { profile } = useAuth();
  const [threads, setThreads] = useState<ThreadWithProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'unanswered' | 'unread'>('all');

  const isPrivileged = profile?.role === 'admin' || profile?.role === 'manager';

  const loadThreads = useCallback(async () => {
    if (!profile?.organization_id) return;
    try {
      let query = supabase
        .from('message_threads')
        .select(`
          id,
          subject,
          proposal_id,
          assigned_sales_rep_id,
          last_message_at,
          proposal:proposals (
            id,
            proposal_number,
            title,
            status,
            created_by,
            contact:contacts (
              full_name
            ),
            creator:profiles!proposals_created_by_fkey (
              full_name
            )
          )
        `)
        .eq('organization_id', profile.organization_id)
        .not('proposal_id', 'is', null);

      if (!isPrivileged && profile?.id) {
        query = query.eq('assigned_sales_rep_id', profile.id);
      }

      const { data: threadsData, error } = await query.order('last_message_at', { ascending: false });

      if (error) throw error;

      const enriched: ThreadWithProposal[] = [];

      for (const thread of threadsData || []) {
        const proposal = Array.isArray(thread.proposal) ? thread.proposal[0] : thread.proposal;
        if (!proposal) continue;

        const { data: customerMsgs } = await supabase
          .from('messages')
          .select('id, body, created_at, context_label, is_read, attachment_url, attachment_type')
          .eq('thread_id', thread.id)
          .eq('author_type', 'customer')
          .eq('is_internal', false)
          .order('created_at', { ascending: false })
          .limit(20);

        if (!customerMsgs || customerMsgs.length === 0) continue;

        const unreadCount = customerMsgs.filter(m => !m.is_read).length;
        const latest = customerMsgs[0];

        const { data: lastRepResponse } = await supabase
          .from('messages')
          .select('created_at')
          .eq('thread_id', thread.id)
          .eq('author_type', 'staff')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        enriched.push({
          thread_id: thread.id,
          proposal_id: proposal.id,
          proposal_number: proposal.proposal_number,
          proposal_title: proposal.title || '',
          proposal_status: proposal.status,
          contact_name: proposal.contact?.full_name || 'Unknown Customer',
          rep_name: proposal.creator?.full_name || 'Unassigned',
          rep_id: thread.assigned_sales_rep_id || proposal.created_by,
          latest_customer_message: latest.body,
          latest_customer_message_at: latest.created_at,
          context_label: latest.context_label,
          unread_count: unreadCount,
          last_rep_response_at: lastRepResponse?.created_at || null,
          attachment_url: latest.attachment_url,
          attachment_type: latest.attachment_type,
        });
      }

      setThreads(enriched);
    } catch (error) {
      console.error('Error loading threads:', error);
    } finally {
      setLoading(false);
    }
  }, [profile?.id, profile?.role, profile?.organization_id, isPrivileged]);

  useEffect(() => {
    loadThreads();

    const channel = supabase
      .channel('customer_questions')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: 'author_type=eq.customer',
        },
        () => {
          loadThreads();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadThreads]);

  function getTimeSinceMessage(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  }

  function calculateResponseTime(customerMsgTime: string, repResponseTime?: string | null) {
    if (!repResponseTime) return null;
    const custTime = new Date(customerMsgTime).getTime();
    const repTime = new Date(repResponseTime).getTime();
    const diffMs = repTime - custTime;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    return `${Math.floor(diffHours / 24)}d`;
  }

  const filteredThreads = threads.filter((t) => {
    const matchesSearch =
      t.proposal_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.proposal_title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.contact_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.rep_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.latest_customer_message.toLowerCase().includes(searchTerm.toLowerCase());

    if (filterStatus === 'unanswered') {
      return matchesSearch && !t.last_rep_response_at;
    }
    if (filterStatus === 'unread') {
      return matchesSearch && t.unread_count > 0;
    }
    return matchesSearch;
  });

  const stats = {
    total: threads.length,
    unanswered: threads.filter(t => !t.last_rep_response_at).length,
    unread: threads.filter(t => t.unread_count > 0).length,
  };

  function handleRowClick(proposalId: string, threadId: string) {
    if (onOpenProposal) {
      onOpenProposal(proposalId, threadId);
    } else {
      window.location.href = `/proposals-fullscreen?id=${proposalId}&openQA=true&threadId=${threadId}`;
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Customer Questions</h1>
        <p className="text-gray-600">
          {isPrivileged
            ? 'Monitor all customer questions across your team and ensure timely responses'
            : 'Customer questions on your proposals — click any thread to reply directly'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Conversations</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <MessageSquare className="w-8 h-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Unanswered</p>
              <p className="text-2xl font-bold text-orange-600">{stats.unanswered}</p>
            </div>
            <AlertCircle className="w-8 h-8 text-orange-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Unread Messages</p>
              <p className="text-2xl font-bold text-red-600">{stats.unread}</p>
            </div>
            <Clock className="w-8 h-8 text-red-600" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 mb-6">
        <div className="p-4 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search messages, proposals, customers, or reps..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Messages</option>
                <option value="unanswered">Unanswered</option>
                <option value="unread">Unread</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <Loader className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
            <p className="mt-4 text-gray-600">Loading questions...</p>
          </div>
        ) : filteredThreads.length === 0 ? (
          <div className="p-12 text-center">
            <MessageSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 font-medium">No questions found</p>
            <p className="text-sm text-gray-500 mt-1">
              {searchTerm || filterStatus !== 'all'
                ? 'Try adjusting your filters'
                : 'Customer questions will appear here'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredThreads.map((t) => {
              const responseTime = calculateResponseTime(t.latest_customer_message_at, t.last_rep_response_at);
              const hasResponse = !!t.last_rep_response_at;
              const isUrgent = !hasResponse && new Date().getTime() - new Date(t.latest_customer_message_at).getTime() > 3600000;

              return (
                <div
                  key={t.thread_id}
                  className={`p-4 hover:bg-gray-50 transition-colors cursor-pointer ${
                    t.unread_count > 0 ? 'bg-blue-50' : ''
                  }`}
                  onClick={() => handleRowClick(t.proposal_id, t.thread_id)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="font-semibold text-gray-900">{t.proposal_number}</span>
                        {t.proposal_title && (
                          <>
                            <span className="text-gray-400">&bull;</span>
                            <span className="text-sm text-gray-600 truncate">{t.proposal_title}</span>
                          </>
                        )}
                        {t.unread_count > 0 && (
                          <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-medium rounded-full">
                            {t.unread_count} unread
                          </span>
                        )}
                        {!hasResponse && (
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                            isUrgent ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                          }`}>
                            Unanswered
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                        <div className="flex items-center gap-1">
                          <User className="w-4 h-4" />
                          <span>{t.contact_name}</span>
                        </div>
                        {isPrivileged && (
                          <>
                            <span className="text-gray-400">&rarr;</span>
                            <span>Rep: {t.rep_name}</span>
                          </>
                        )}
                      </div>

                      {t.context_label && (
                        <div className="flex items-center gap-1 mb-2">
                          <HelpCircle className="w-3.5 h-3.5 text-blue-500" />
                          <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                            Re: {t.context_label}
                          </span>
                        </div>
                      )}

                      <div className="flex items-start gap-2 mb-2">
                        {t.attachment_type === 'image' && t.attachment_url && (
                          <img src={t.attachment_url} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
                        )}
                        <p className="text-sm text-gray-700 line-clamp-2">
                          {t.latest_customer_message}
                        </p>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{getTimeSinceMessage(t.latest_customer_message_at)}</span>
                        </div>
                        {hasResponse && responseTime && (
                          <div className="flex items-center gap-1">
                            <CheckCircle className="w-3 h-3 text-green-600" />
                            <span className="text-green-600">Responded in {responseTime}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <ExternalLink className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
