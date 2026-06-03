import { useState, useEffect } from 'react';
import { MessageSquare, Search, Filter, Clock, CheckCircle, AlertCircle, ExternalLink, User } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ProposalQA } from './ProposalQA';

interface MessageWithProposal {
  id: string;
  proposal_id: string;
  sender_type: 'customer' | 'rep';
  sender_name: string;
  message: string;
  is_read: boolean;
  created_at: string;
  proposal: {
    proposal_number: string;
    title: string;
    status: string;
    created_by: string;
    contact: {
      full_name: string;
      email: string;
    };
    creator: {
      full_name: string;
    };
  };
  unread_rep_count: number;
  last_response_time?: string;
}

export function ProposalMessagesAdmin() {
  const [messages, setMessages] = useState<MessageWithProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'unanswered' | 'unread'>('all');
  const [selectedProposal, setSelectedProposal] = useState<string | null>(null);

  useEffect(() => {
    loadMessages();

    const channel = supabase
      .channel('proposal_messages_admin')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'proposal_messages',
        },
        () => {
          loadMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadMessages() {
    try {
      const { data: messagesData, error } = await supabase
        .from('proposal_messages')
        .select(`
          id,
          proposal_id,
          sender_type,
          sender_name,
          message,
          is_read,
          created_at,
          proposal:proposals (
            proposal_number,
            title,
            status,
            created_by,
            contact:contacts (
              full_name,
              email
            ),
            creator:profiles!proposals_created_by_fkey (
              full_name
            )
          )
        `)
        .eq('sender_type', 'customer')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const groupedByProposal = new Map<string, MessageWithProposal[]>();
      messagesData?.forEach((msg: any) => {
        const key = msg.proposal_id;
        if (!groupedByProposal.has(key)) {
          groupedByProposal.set(key, []);
        }
        groupedByProposal.get(key)!.push(msg);
      });

      const enrichedMessages = await Promise.all(
        Array.from(groupedByProposal.entries()).map(async ([proposalId, msgs]) => {
          const { count } = await supabase
            .from('proposal_messages')
            .select('*', { count: 'exact', head: true })
            .eq('proposal_id', proposalId)
            .eq('sender_type', 'customer')
            .eq('is_read', false);

          const { data: lastRepResponse } = await supabase
            .from('proposal_messages')
            .select('created_at')
            .eq('proposal_id', proposalId)
            .eq('sender_type', 'rep')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const latestCustomerMsg = msgs[0];
          return {
            ...latestCustomerMsg,
            unread_rep_count: count || 0,
            last_response_time: lastRepResponse?.created_at,
          };
        })
      );

      setMessages(enrichedMessages as MessageWithProposal[]);
    } catch (error) {
      console.error('Error loading messages:', error);
    } finally {
      setLoading(false);
    }
  }

  function calculateResponseTime(customerMsgTime: string, repResponseTime?: string) {
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

  const filteredMessages = messages.filter((msg) => {
    const matchesSearch =
      msg.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      msg.proposal.proposal_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      msg.proposal.contact?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      msg.proposal.creator?.full_name?.toLowerCase().includes(searchTerm.toLowerCase());

    if (filterStatus === 'unanswered') {
      return matchesSearch && !msg.last_response_time;
    }
    if (filterStatus === 'unread') {
      return matchesSearch && msg.unread_rep_count > 0;
    }
    return matchesSearch;
  });

  const stats = {
    total: messages.length,
    unanswered: messages.filter(m => !m.last_response_time).length,
    unread: messages.filter(m => m.unread_rep_count > 0).length,
  };

  if (selectedProposal) {
    return (
      <div className="h-screen flex flex-col bg-gray-50">
        <div className="bg-white border-b border-gray-200 p-4">
          <button
            onClick={() => setSelectedProposal(null)}
            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
          >
            ← Back to All Messages
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          <ProposalQA proposalId={selectedProposal} embedded={true} />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Proposal Messages</h1>
        <p className="text-gray-600">Monitor all customer questions and ensure timely responses</p>
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
              <Filter className="w-5 h-5 text-gray-400" />
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
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600">Loading messages...</p>
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="p-12 text-center">
            <MessageSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 font-medium">No messages found</p>
            <p className="text-sm text-gray-500 mt-1">
              {searchTerm || filterStatus !== 'all'
                ? 'Try adjusting your filters'
                : 'Customer questions will appear here'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredMessages.map((msg) => {
              const responseTime = calculateResponseTime(msg.created_at, msg.last_response_time);
              const hasResponse = !!msg.last_response_time;
              const isUrgent = !hasResponse && new Date().getTime() - new Date(msg.created_at).getTime() > 3600000; // 1 hour

              return (
                <div
                  key={msg.id}
                  className={`p-4 hover:bg-gray-50 transition-colors cursor-pointer ${
                    msg.unread_rep_count > 0 ? 'bg-blue-50' : ''
                  }`}
                  onClick={() => setSelectedProposal(msg.proposal_id)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-semibold text-gray-900">
                          {msg.proposal.proposal_number}
                        </span>
                        {msg.proposal.title && (
                          <>
                            <span className="text-gray-400">•</span>
                            <span className="text-sm text-gray-600 truncate">
                              {msg.proposal.title}
                            </span>
                          </>
                        )}
                        {msg.unread_rep_count > 0 && (
                          <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-medium rounded-full">
                            {msg.unread_rep_count} unread
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
                          <span>{msg.proposal.contact?.full_name || 'Unknown Customer'}</span>
                        </div>
                        <span className="text-gray-400">→</span>
                        <span>Rep: {msg.proposal.creator?.full_name || 'Unassigned'}</span>
                      </div>

                      <p className="text-sm text-gray-700 line-clamp-2 mb-2">
                        <span className="font-medium">{msg.sender_name}:</span> {msg.message}
                      </p>

                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{getTimeSinceMessage(msg.created_at)}</span>
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
