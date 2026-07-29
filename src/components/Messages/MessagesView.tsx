import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageSquare, Plus, Send, X, Search, User, ArrowLeft, Loader, ImagePlus, Link as LinkIcon, ExternalLink, Clock, CheckCircle, AlertCircle, HelpCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface EnrichedThread {
  id: string;
  subject: string;
  context_type: string;
  context_id: string | null;
  proposal_id: string | null;
  visibility: string;
  created_by: string;
  last_message_at: string;
  assigned_sales_rep_id: string | null;
  organization_id: string;
  contact_id: string | null;
  message_count: number;
  last_message_preview: string;
  last_message_author_type: string;
  contact_name: string;
  proposal_number: string;
  proposal_title: string;
  proposal_status: string;
  rep_name: string;
  unread_count: number;
  last_rep_response_at: string | null;
  context_label: string | null;
  attachment_url: string | null;
  attachment_type: string | null;
}

interface Message {
  id: string;
  thread_id: string;
  author_id: string;
  author_name: string;
  author_type: 'staff' | 'customer';
  body: string;
  is_read: boolean;
  is_internal: boolean;
  created_at: string;
  context_room_id: string | null;
  context_line_item_id: string | null;
  context_label: string | null;
  attachment_url: string | null;
  attachment_type: 'image' | 'link' | null;
}

interface Contact {
  id: string;
  contact_name: string;
}

interface MessagesViewProps {
  openThreadId?: string | null;
  onThreadOpened?: () => void;
  onOpenProposal?: (proposalId: string, threadId?: string) => void;
}

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

function extractUrl(text: string): string | null {
  const match = text.match(URL_REGEX);
  return match ? match[0] : null;
}

function renderAttachment(msg: Message, isOwnMessage: boolean) {
  if (!msg.attachment_url) return null;

  if (msg.attachment_type === 'image') {
    return (
      <div className="mt-1.5 rounded-lg overflow-hidden border border-black/10 max-w-[240px]">
        <img src={msg.attachment_url} alt="Attachment" className="w-full h-auto max-h-[200px] object-cover" loading="lazy" />
      </div>
    );
  }

  if (msg.attachment_type === 'link') {
    return (
      <a
        href={msg.attachment_url}
        target="_blank"
        rel="noopener noreferrer"
        className={`mt-1.5 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
          isOwnMessage ? 'bg-blue-500/30 text-blue-50 hover:bg-blue-500/40' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`}
      >
        <LinkIcon className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate">{msg.attachment_url}</span>
      </a>
    );
  }

  return null;
}

function formatTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function MessagesView({ openThreadId, onThreadOpened, onOpenProposal }: MessagesViewProps = {}) {
  const { profile, loading: authLoading } = useAuth();
  const [threads, setThreads] = useState<EnrichedThread[]>([]);
  const [selectedThread, setSelectedThread] = useState<EnrichedThread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [showNewThread, setShowNewThread] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<'all' | 'customer' | 'internal'>('all');
  const [isInternal, setIsInternal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<{ url: string; type: 'image' | 'link' } | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [replyContextLabel, setReplyContextLabel] = useState<string | null>(null);
  const [showQuestionSummary, setShowQuestionSummary] = useState(true);
  const [newThreadForm, setNewThreadForm] = useState({
    subject: '',
    context_type: 'contact' as 'contact' | 'proposal' | 'project',
    context_id: '',
    visibility: 'public' as 'internal' | 'public',
    first_message: '',
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isPrivileged = profile?.role === 'admin' || profile?.role === 'manager';

  const loadThreads = useCallback(async () => {
    if (!profile?.organization_id) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);

      let query = supabase
        .from('message_threads')
        .select(`
          id, subject, context_type, context_id, proposal_id, visibility,
          created_by, last_message_at, assigned_sales_rep_id, organization_id, contact_id
        `)
        .eq('organization_id', profile.organization_id)
        .order('last_message_at', { ascending: false });

      if (!isPrivileged && profile?.id) {
        query = query.or(`assigned_sales_rep_id.eq.${profile.id},created_by.eq.${profile.id}`);
      }

      const { data: threadsData, error } = await query;
      if (error) throw error;

      const enriched: EnrichedThread[] = [];

      for (const thread of threadsData || []) {
        const { count } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('thread_id', thread.id);

        const { data: lastMsg } = await supabase
          .from('messages')
          .select('body, author_type, created_at, context_label, attachment_url, attachment_type')
          .eq('thread_id', thread.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const { data: customerMsgs } = await supabase
          .from('messages')
          .select('id, is_read')
          .eq('thread_id', thread.id)
          .eq('author_type', 'customer')
          .eq('is_internal', false);

        const unreadCount = customerMsgs?.filter(m => !m.is_read).length || 0;

        const { data: lastRepResponse } = await supabase
          .from('messages')
          .select('created_at')
          .eq('thread_id', thread.id)
          .eq('author_type', 'staff')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        let contactName = '';
        let proposalNumber = '';
        let proposalTitle = '';
        let proposalStatus = '';
        let repName = '';

        if (thread.contact_id) {
          const { data: contact } = await supabase
            .from('contacts')
            .select('full_name')
            .eq('id', thread.contact_id)
            .maybeSingle();
          contactName = contact?.full_name || '';
        }

        if (thread.proposal_id) {
          const { data: proposal } = await supabase
            .from('proposals')
            .select('proposal_number, title, status, created_by, creator:profiles!proposals_created_by_fkey(full_name)')
            .eq('id', thread.proposal_id)
            .maybeSingle();
          if (proposal) {
            proposalNumber = proposal.proposal_number || '';
            proposalTitle = proposal.title || '';
            proposalStatus = proposal.status || '';
            repName = (proposal.creator as any)?.full_name || '';
          }
        }

        enriched.push({
          id: thread.id,
          subject: thread.subject || '',
          context_type: thread.context_type || '',
          context_id: thread.context_id,
          proposal_id: thread.proposal_id,
          visibility: thread.visibility || 'internal',
          created_by: thread.created_by,
          last_message_at: thread.last_message_at,
          assigned_sales_rep_id: thread.assigned_sales_rep_id,
          organization_id: thread.organization_id,
          contact_id: thread.contact_id,
          message_count: count || 0,
          last_message_preview: lastMsg?.body || '',
          last_message_author_type: lastMsg?.author_type || 'staff',
          contact_name: contactName,
          proposal_number: proposalNumber,
          proposal_title: proposalTitle,
          proposal_status: proposalStatus,
          rep_name: repName,
          unread_count: unreadCount,
          last_rep_response_at: lastRepResponse?.created_at || null,
          context_label: lastMsg?.context_label || null,
          attachment_url: lastMsg?.attachment_url || null,
          attachment_type: lastMsg?.attachment_type || null,
        });
      }

      setThreads(enriched);
    } catch (error) {
      console.error('Error loading threads:', error);
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }, [profile?.id, profile?.organization_id, isPrivileged]);

  async function loadContacts() {
    const { data } = await supabase
      .from('contacts')
      .select('id, contact_name, full_name')
      .order('full_name');
    if (data) setContacts(data.map(c => ({ id: c.id, contact_name: c.full_name || c.contact_name || '' })));
  }

  useEffect(() => {
    if (!authLoading && profile) {
      loadThreads();
      loadContacts();
    } else if (!authLoading && !profile) {
      setLoading(false);
    }
  }, [authLoading, profile, loadThreads]);

  // Real-time subscription
  useEffect(() => {
    if (!profile?.organization_id) return;

    const channel = supabase
      .channel('messages_view_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        () => { loadThreads(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_threads' },
        () => { loadThreads(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile?.organization_id, loadThreads]);

  // Load messages when a thread is selected
  useEffect(() => {
    if (selectedThread) {
      loadMessages(selectedThread.id);
    } else {
      setMessages([]);
    }
  }, [selectedThread]);

  // Auto-select thread when openThreadId is provided
  useEffect(() => {
    if (openThreadId && threads.length > 0 && !selectedThread) {
      const thread = threads.find(t => t.id === openThreadId);
      if (thread) {
        setSelectedThread(thread);
        onThreadOpened?.();
      }
    }
  }, [openThreadId, threads, selectedThread, onThreadOpened]);

  // Scroll to bottom and mark as read
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (selectedThread && messages.length > 0) {
      markMessagesAsRead();
    }
  }, [messages, selectedThread]);

  async function loadMessages(threadId: string) {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      if (data) setMessages(data as Message[]);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  }

  async function markMessagesAsRead() {
    if (!selectedThread) return;
    const unreadMessages = messages.filter(m => m.author_type !== 'staff' && !m.is_read);
    if (unreadMessages.length > 0) {
      await supabase
        .from('messages')
        .update({ is_read: true })
        .in('id', unreadMessages.map(m => m.id));
      loadThreads();
    }
  }

  async function handleImageUpload(file: File) {
    if (!file || !selectedThread) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const fileName = `${Date.now()}.${ext}`;
      const path = `${profile?.organization_id || 'unknown'}/${selectedThread.id}/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from('message-attachments')
        .upload(path, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('message-attachments').getPublicUrl(path);
      setPendingAttachment({ url: urlData.publicUrl, type: 'image' });
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Failed to upload image. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  async function handleSendMessage() {
    if (!selectedThread || (!newMessage.trim() && !pendingAttachment) || sending || !profile) return;

    setSending(true);
    try {
      const body = newMessage.trim();
      const urlInBody = extractUrl(body);
      let attachmentUrl: string | null = pendingAttachment?.url || null;
      let attachmentType: 'image' | 'link' | null = pendingAttachment?.type || null;

      if (!pendingAttachment && urlInBody) {
        attachmentUrl = urlInBody;
        attachmentType = 'link';
      }

      const { error } = await supabase.from('messages').insert({
        thread_id: selectedThread.id,
        author_id: profile.id,
        author_name: profile.full_name,
        author_type: 'staff',
        body,
        is_internal: isInternal,
        is_read: true,
        attachment_url: attachmentUrl,
        attachment_type: attachmentType,
        context_label: replyContextLabel,
      });

      if (error) throw error;

      setNewMessage('');
      setIsInternal(false);
      setPendingAttachment(null);
      setReplyContextLabel(null);
      await loadMessages(selectedThread.id);
      await loadThreads();
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message');
    } finally {
      setSending(false);
    }
  }

  async function handleCreateThread() {
    if (!newThreadForm.subject.trim() || !newThreadForm.context_id || !newThreadForm.first_message.trim() || !profile) {
      alert('Please fill in all fields');
      return;
    }

    setSending(true);
    try {
      let contactId = null;
      if (newThreadForm.context_type === 'contact') {
        contactId = newThreadForm.context_id;
      } else if (newThreadForm.context_type === 'proposal') {
        const { data: proposal } = await supabase
          .from('proposals')
          .select('contact_id')
          .eq('id', newThreadForm.context_id)
          .maybeSingle();
        contactId = proposal?.contact_id || null;
      }

      const { data: thread, error: threadError } = await supabase
        .from('message_threads')
        .insert({
          subject: newThreadForm.subject.trim(),
          context_type: newThreadForm.context_type,
          context_id: newThreadForm.context_id,
          contact_id: contactId,
          visibility: newThreadForm.visibility,
          created_by: profile.id,
          organization_id: profile.organization_id,
          assigned_sales_rep_id: profile.id,
        })
        .select()
        .single();

      if (threadError) throw threadError;

      const { error: messageError } = await supabase.from('messages').insert({
        thread_id: thread.id,
        author_id: profile.id,
        author_name: profile.full_name,
        author_type: 'staff',
        body: newThreadForm.first_message.trim(),
        is_internal: newThreadForm.visibility === 'internal',
        is_read: true,
      });

      if (messageError) throw messageError;

      setShowNewThread(false);
      setNewThreadForm({ subject: '', context_type: 'contact', context_id: '', visibility: 'public', first_message: '' });
      await loadThreads();
      if (thread) {
        const enriched = (await supabase
          .from('message_threads')
          .select(`id, subject, context_type, context_id, proposal_id, visibility, created_by, last_message_at, assigned_sales_rep_id, organization_id, contact_id`)
          .eq('id', thread.id)
          .maybeSingle()
        ).data;
        if (enriched) {
          setSelectedThread({ ...enriched, message_count: 1, last_message_preview: newThreadForm.first_message, last_message_author_type: 'staff', contact_name: '', proposal_number: '', proposal_title: '', proposal_status: '', rep_name: profile.full_name, unread_count: 0, last_rep_response_at: new Date().toISOString(), context_label: null, attachment_url: null, attachment_type: null } as EnrichedThread);
          await loadMessages(thread.id);
        }
      }
    } catch (error) {
      console.error('Error creating thread:', error);
      alert('Failed to create thread');
    } finally {
      setSending(false);
    }
  }

  const filteredThreads = threads.filter((t) => {
    const matchesSearch =
      t.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.contact_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.proposal_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.last_message_preview?.toLowerCase().includes(searchQuery.toLowerCase());

    if (filterCategory === 'customer') {
      return matchesSearch && t.visibility === 'public' && t.proposal_id !== null;
    }
    if (filterCategory === 'internal') {
      return matchesSearch && (t.visibility === 'internal' || t.proposal_id === null);
    }
    return matchesSearch;
  });

  const stats = {
    total: threads.length,
    unanswered: threads.filter(t => !t.last_rep_response_at && t.last_message_author_type === 'customer').length,
    unread: threads.filter(t => t.unread_count > 0).length,
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-300">Loading messages...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 py-4 sm:py-6">
      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4">
        <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm text-gray-600">Total</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <MessageSquare className="w-6 h-6 sm:w-8 h-8 text-blue-600" />
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm text-gray-600">Unanswered</p>
              <p className="text-xl sm:text-2xl font-bold text-orange-600">{stats.unanswered}</p>
            </div>
            <AlertCircle className="w-6 h-6 sm:w-8 h-8 text-orange-600" />
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3 sm:p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm text-gray-600">Unread</p>
              <p className="text-xl sm:text-2xl font-bold text-red-600">{stats.unread}</p>
            </div>
            <Clock className="w-6 h-6 sm:w-8 h-8 text-red-600" />
          </div>
        </div>
      </div>

      <div className="h-[calc(100vh-18rem)] flex flex-col sm:flex-row gap-2 sm:gap-4">
        {/* Threads List */}
        <div className={`${selectedThread ? 'hidden sm:flex' : 'flex'} w-full sm:w-96 bg-white rounded-lg shadow-sm border border-gray-200 flex-col`}>
          <div className="p-3 sm:p-4 border-b border-gray-200">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-blue-600" />
                Messages
              </h2>
              <button
                onClick={() => setShowNewThread(true)}
                className="p-2.5 sm:p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors active:scale-95 touch-manipulation"
                title="New Thread"
              >
                <Plus className="w-5 h-5 sm:w-4 sm:h-4" />
              </button>
            </div>

            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search threads..."
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setFilterCategory('all')}
                className={`flex-1 px-3 py-2 sm:py-1.5 text-sm rounded-lg transition-colors touch-manipulation active:scale-95 ${
                  filterCategory === 'all' ? 'bg-blue-100 text-blue-700 font-medium' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterCategory('customer')}
                className={`flex-1 px-3 py-2 sm:py-1.5 text-sm rounded-lg transition-colors touch-manipulation active:scale-95 ${
                  filterCategory === 'customer' ? 'bg-green-100 text-green-700 font-medium' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Customer Q&A
              </button>
              <button
                onClick={() => setFilterCategory('internal')}
                className={`flex-1 px-3 py-2 sm:py-1.5 text-sm rounded-lg transition-colors touch-manipulation active:scale-95 ${
                  filterCategory === 'internal' ? 'bg-orange-100 text-orange-700 font-medium' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Internal
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredThreads.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p>No message threads found</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {filteredThreads.map((thread) => {
                  const hasResponse = !!thread.last_rep_response_at;
                  const isUrgent = !hasResponse && thread.last_message_author_type === 'customer' && new Date().getTime() - new Date(thread.last_message_at).getTime() > 3600000;

                  return (
                    <button
                      key={thread.id}
                      onClick={() => { setSelectedThread(thread); setShowQuestionSummary(true); }}
                      className={`w-full p-3 sm:p-4 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors touch-manipulation ${
                        selectedThread?.id === thread.id ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
                      } ${thread.unread_count > 0 ? 'bg-blue-50/50' : ''}`}
                    >
                      <div className="flex items-start justify-between mb-1 gap-2">
                        <h3 className="font-medium text-gray-900 line-clamp-1 text-sm sm:text-base">{thread.subject}</h3>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {thread.unread_count > 0 && (
                            <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-medium rounded-full">
                              {thread.unread_count}
                            </span>
                          )}
                          <span
                            className={`px-2 py-0.5 text-xs rounded-full ${
                              thread.visibility === 'internal' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'
                            }`}
                          >
                            {thread.visibility === 'internal' ? 'Internal' : 'Customer'}
                          </span>
                        </div>
                      </div>

                      {thread.proposal_number && (
                        <p className="text-xs font-medium text-blue-600 mb-1">{thread.proposal_number}</p>
                      )}

                      {thread.contact_name && (
                        <p className="text-sm text-gray-600 mb-1 flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {thread.contact_name}
                        </p>
                      )}

                      {thread.context_label && (
                        <div className="flex items-center gap-1 mb-1">
                          <HelpCircle className="w-3 h-3 text-blue-500" />
                          <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                            Re: {thread.context_label}
                          </span>
                        </div>
                      )}

                      <div className="flex items-start gap-2 mb-1">
                        {thread.attachment_type === 'image' && thread.attachment_url && (
                          <img src={thread.attachment_url} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                        )}
                        <p className="text-sm text-gray-500 line-clamp-2">{thread.last_message_preview}</p>
                      </div>

                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-2">
                          {!hasResponse && thread.last_message_author_type === 'customer' && (
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                              isUrgent ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                            }`}>
                              Unanswered
                            </span>
                          )}
                          <span className="text-xs text-gray-400">
                            {thread.message_count} msg{thread.message_count !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400">{formatTime(thread.last_message_at)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Messages Panel */}
        <div className={`${selectedThread ? 'flex' : 'hidden sm:flex'} flex-1 bg-white rounded-lg shadow-sm border border-gray-200 flex-col`}>
          {selectedThread ? (
            <>
              <div className="p-3 sm:p-4 border-b border-gray-200">
                <div className="flex items-center gap-2 sm:gap-3">
                  <button
                    onClick={() => setSelectedThread(null)}
                    className="sm:hidden p-2 hover:bg-gray-100 active:bg-gray-200 rounded-lg touch-manipulation"
                  >
                    <ArrowLeft className="w-5 h-5 text-gray-600" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base sm:text-lg font-semibold text-gray-900 truncate">{selectedThread.subject}</h2>
                    {selectedThread.contact_name && (
                      <p className="text-sm text-gray-600 truncate">{selectedThread.contact_name}</p>
                    )}
                  </div>
                  {selectedThread.proposal_id && onOpenProposal && (
                    <button
                      onClick={() => onOpenProposal(selectedThread.proposal_id!, selectedThread.id)}
                      className="px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1.5 flex-shrink-0"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span className="hidden sm:inline">Open Proposal</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4">
                {messages.map((message) => {
                  const isOwnMessage = message.author_id === profile?.id || message.author_type === 'staff';

                  return (
                    <div key={message.id} className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] sm:max-w-[70%] space-y-1`}>
                        <div className="flex items-center gap-2 px-1">
                          <span className="text-xs font-medium text-gray-600">{message.author_name}</span>
                          <span className="text-xs text-gray-400">{formatTime(message.created_at)}</span>
                          {message.is_internal && (
                            <span className="text-xs font-medium text-orange-600">Internal</span>
                          )}
                        </div>
                        {message.context_label && (
                          <div className={`flex items-center gap-1 px-1 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                              isOwnMessage ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'
                            }`}>
                              <MessageSquare className="w-2.5 h-2.5" />
                              Re: {message.context_label}
                            </span>
                          </div>
                        )}
                        <div
                          className={`rounded-lg p-3 ${
                            isOwnMessage ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'
                          }`}
                        >
                          <p className="whitespace-pre-wrap text-sm sm:text-base break-words">{message.body}</p>
                          {renderAttachment(message, isOwnMessage)}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Unanswered questions summary for proposal threads */}
              {selectedThread.proposal_id && !isInternal && (() => {
                const customerMessages = messages.filter(m => m.author_type === 'customer' && !m.is_internal);
                const lastStaffIdx = (() => {
                  for (let i = messages.length - 1; i >= 0; i--) {
                    if (messages[i].author_type === 'staff') return i;
                  }
                  return -1;
                })();
                const unanswered = customerMessages.filter((_, idx) => {
                  const msgIdx = messages.indexOf(customerMessages[idx]);
                  return msgIdx > lastStaffIdx;
                });
                if (unanswered.length === 0 || !showQuestionSummary) return null;
                const grouped = unanswered.reduce((acc, m) => {
                  const key = m.context_label || 'General';
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(m);
                  return acc;
                }, {} as Record<string, Message[]>);

                return (
                  <div className="mx-3 sm:mx-4 mt-3 mb-1 rounded-lg border border-blue-200 bg-blue-50/60 overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 bg-blue-100/50">
                      <div className="flex items-center gap-2">
                        <HelpCircle className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-semibold text-blue-900">
                          {unanswered.length} unanswered question{unanswered.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <button
                        onClick={() => setShowQuestionSummary(false)}
                        className="text-blue-400 hover:text-blue-600 p-1"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="p-3 space-y-2 max-h-32 overflow-y-auto">
                      {Object.entries(grouped).map(([label, msgs]) => (
                        <div key={label}>
                          {label !== 'General' && (
                            <p className="text-xs font-medium text-blue-700 mb-0.5 flex items-center gap-1">
                              <MessageSquare className="w-3 h-3" />
                              {label}
                            </p>
                          )}
                          {msgs.map(m => (
                            <p key={m.id} className="text-xs text-gray-700 line-clamp-2 pl-3 border-l-2 border-blue-200">
                              {m.body}
                            </p>
                          ))}
                        </div>
                      ))}
                    </div>
                    <div className="px-3 py-2 bg-blue-100/30 border-t border-blue-200/50">
                      <p className="text-xs text-blue-600">
                        Your reply below will be sent to the customer and will address all open questions.
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* Reply context tag selector for proposal threads */}
              {selectedThread.proposal_id && !isInternal && (() => {
                const contextLabels = [...new Set(
                  messages
                    .filter(m => m.author_type === 'customer' && m.context_label)
                    .map(m => m.context_label!)
                )];
                if (contextLabels.length === 0) return null;
                return (
                  <div className="mx-3 sm:mx-4 mt-2 flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-500">Tag reply to:</span>
                    <button
                      onClick={() => setReplyContextLabel(null)}
                      className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                        !replyContextLabel ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      General
                    </button>
                    {contextLabels.map(label => (
                      <button
                        key={label}
                        onClick={() => setReplyContextLabel(label)}
                        className={`text-xs px-2.5 py-1 rounded-full transition-colors flex items-center gap-1 ${
                          replyContextLabel === label ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        <MessageSquare className="w-2.5 h-2.5" />
                        {label}
                      </button>
                    ))}
                  </div>
                );
              })()}

              {/* Composer */}
              <div className="p-3 sm:p-4 border-t border-gray-200">
                {pendingAttachment && (
                  <div className="mb-2 flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-2">
                    {pendingAttachment.type === 'image' ? (
                      <img src={pendingAttachment.url} alt="Pending" className="w-10 h-10 rounded object-cover" />
                    ) : (
                      <LinkIcon className="w-4 h-4 text-blue-600" />
                    )}
                    <span className="text-xs text-blue-700 flex-1 truncate">Attachment ready</span>
                    <button type="button" onClick={() => setPendingAttachment(null)} className="text-gray-400 hover:text-gray-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
                {replyContextLabel && (
                  <div className="mb-2 flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                    <span className="text-xs text-blue-700 font-medium">Re: {replyContextLabel}</span>
                    <button type="button" onClick={() => setReplyContextLabel(null)} className="text-blue-400 hover:text-blue-600 ml-auto">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <div className="mb-2">
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Internal note (customer won't see this)</span>
                  </label>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageUpload(file);
                    e.target.value = '';
                  }}
                />
                <div className="flex gap-2 items-end">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || sending}
                    className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors flex items-center"
                    title="Attach image"
                  >
                    {uploading ? <Loader className="w-4 h-4 animate-spin text-gray-500" /> : <ImagePlus className="w-4 h-4 text-gray-500" />}
                  </button>
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && window.innerWidth >= 640) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    placeholder="Type your message..."
                    rows={2}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-base"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={(!newMessage.trim() && !pendingAttachment) || sending}
                    className="px-3 sm:px-4 py-2.5 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 touch-manipulation min-w-[44px] justify-center"
                    title="Send message"
                  >
                    {sending ? <Loader className="w-5 h-5 sm:w-4 sm:h-4 animate-spin" /> : <Send className="w-5 h-5 sm:w-4 sm:h-4" />}
                    <span className="hidden sm:inline">Send</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <MessageSquare className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                <p>Select a thread to view messages</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New Thread Modal */}
      {showNewThread && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-2xl sm:rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] sm:max-h-[85vh] sm:mx-4 flex flex-col">
            <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 flex-shrink-0">
              <h3 className="text-lg sm:text-xl font-semibold text-gray-900">New Message Thread</h3>
              <button
                onClick={() => setShowNewThread(false)}
                className="p-2 text-gray-400 hover:text-gray-600 active:text-gray-700 rounded-lg hover:bg-gray-100 active:bg-gray-200 touch-manipulation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Subject</label>
                <input
                  type="text"
                  value={newThreadForm.subject}
                  onChange={(e) => setNewThreadForm({ ...newThreadForm, subject: e.target.value })}
                  className="w-full px-3 py-2.5 sm:py-2 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter subject..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Related To</label>
                <select
                  value={newThreadForm.context_type}
                  onChange={(e) => setNewThreadForm({ ...newThreadForm, context_type: e.target.value as 'contact' | 'proposal' | 'project', context_id: '' })}
                  className="w-full px-3 py-2.5 sm:py-2 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="contact">Contact</option>
                  <option value="proposal">Proposal</option>
                  <option value="project">Project</option>
                </select>
              </div>

              {newThreadForm.context_type === 'contact' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Contact</label>
                  <select
                    value={newThreadForm.context_id}
                    onChange={(e) => setNewThreadForm({ ...newThreadForm, context_id: e.target.value })}
                    className="w-full px-3 py-2.5 sm:py-2 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select a contact...</option>
                    {contacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>{contact.contact_name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Visibility</label>
                <select
                  value={newThreadForm.visibility}
                  onChange={(e) => setNewThreadForm({ ...newThreadForm, visibility: e.target.value as 'internal' | 'public' })}
                  className="w-full px-3 py-2.5 sm:py-2 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="public">Customer Visible</option>
                  <option value="internal">Internal Only</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">First Message</label>
                <textarea
                  value={newThreadForm.first_message}
                  onChange={(e) => setNewThreadForm({ ...newThreadForm, first_message: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2.5 sm:py-2 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  placeholder="Type your message..."
                />
              </div>
            </div>

            <div className="flex gap-3 p-4 sm:p-6 border-t border-gray-200 flex-shrink-0">
              <button
                onClick={() => setShowNewThread(false)}
                className="flex-1 px-4 py-3 sm:py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-colors touch-manipulation"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateThread}
                disabled={sending}
                className="flex-1 px-4 py-3 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
              >
                {sending ? 'Creating...' : 'Create Thread'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
