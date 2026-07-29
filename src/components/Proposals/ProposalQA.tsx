import { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, X, Loader, ArrowLeft, ImagePlus, Link as LinkIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

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

interface ProposalQAProps {
  proposalId: string;
  isPortal?: boolean;
  customerName?: string;
  onClose?: () => void;
  embedded?: boolean;
  contextRoomId?: string | null;
  contextLineItemId?: string | null;
  contextLabel?: string | null;
  onMessagesChanged?: () => void;
  autoThreadId?: string | null;
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
        <img
          src={msg.attachment_url}
          alt="Attachment"
          className="w-full h-auto max-h-[200px] object-cover"
          loading="lazy"
        />
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
          isOwnMessage
            ? 'bg-blue-500/30 text-blue-50 hover:bg-blue-500/40'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
        }`}
      >
        <LinkIcon className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate">{msg.attachment_url}</span>
      </a>
    );
  }

  return null;
}

export function ProposalQA({
  proposalId,
  isPortal = false,
  customerName,
  onClose,
  embedded = false,
  contextRoomId = null,
  contextLineItemId = null,
  contextLabel = null,
  onMessagesChanged,
  autoThreadId = null,
}: ProposalQAProps) {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isInternal, setIsInternal] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [activeContextRoomId, setActiveContextRoomId] = useState<string | null>(contextRoomId);
  const [activeContextLineItemId, setActiveContextLineItemId] = useState<string | null>(contextLineItemId);
  const [activeContextLabel, setActiveContextLabel] = useState<string | null>(contextLabel);
  const [uploading, setUploading] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<{ url: string; type: 'image' | 'link' } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    setActiveContextRoomId(contextRoomId);
    setActiveContextLineItemId(contextLineItemId);
    setActiveContextLabel(contextLabel);
  }, [contextRoomId, contextLineItemId, contextLabel]);

  useEffect(() => {
    initializeThread();
  }, [proposalId]);

  useEffect(() => {
    if (threadId) {
      loadMessages();

      const channel = supabase
        .channel(`proposal_qa_${threadId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'messages',
            filter: `thread_id=eq.${threadId}`,
          },
          () => {
            loadMessages();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [threadId]);

  useEffect(() => {
    scrollToBottom();
    markMessagesAsRead();
  }, [messages]);

  async function initializeThread() {
    try {
      if (autoThreadId) {
        setThreadId(autoThreadId);
        return;
      }

      let { data: existingThread, error: threadError } = await supabase
        .from('message_threads')
        .select('id')
        .eq('proposal_id', proposalId)
        .eq('context_type', 'proposal')
        .maybeSingle();

      if (threadError) throw threadError;

      if (existingThread) {
        setThreadId(existingThread.id);
      } else {
        const { data: proposal } = await supabase
          .from('proposals')
          .select('proposal_number, created_by, contact_id')
          .eq('id', proposalId)
          .single();

        if (!proposal) return;

        const { data: newThread, error: createError } = await supabase
          .from('message_threads')
          .insert({
            subject: `Q&A: Proposal ${proposal.proposal_number}`,
            context_type: 'proposal',
            context_id: proposalId,
            proposal_id: proposalId,
            contact_id: proposal.contact_id,
            assigned_sales_rep_id: proposal.created_by,
            visibility: 'public',
            created_by: isPortal ? proposal.contact_id : (profile?.id || proposal.created_by)
          })
          .select('id')
          .single();

        if (createError) throw createError;
        if (newThread) setThreadId(newThread.id);
      }
    } catch (error) {
      console.error('Error initializing thread:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages() {
    if (!threadId) return;

    try {
      let query = supabase
        .from('messages')
        .select('*')
        .eq('thread_id', threadId);

      if (isPortal) {
        query = query.eq('is_internal', false);
      }

      const { data, error } = await query.order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  }

  async function markMessagesAsRead() {
    if (!threadId) return;

    const authorType = isPortal ? 'customer' : 'staff';
    const unreadMessages = messages.filter(m => m.author_type !== authorType && !m.is_read);

    if (unreadMessages.length > 0) {
      await supabase
        .from('messages')
        .update({ is_read: true })
        .in('id', unreadMessages.map(m => m.id));
      onMessagesChanged?.();
    }
  }

  async function handleImageUpload(file: File) {
    if (!file || !threadId) return;

    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const fileName = `${Date.now()}.${ext}`;
      const path = `${profile?.organization_id || 'unknown'}/${threadId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('message-attachments')
        .upload(path, file, { contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('message-attachments')
        .getPublicUrl(path);

      setPendingAttachment({ url: urlData.publicUrl, type: 'image' });
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Failed to upload image. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if ((!newMessage.trim() && !pendingAttachment) || sending || !threadId) return;

    setSending(true);
    try {
      const authorName = isPortal
        ? customerName || 'Customer'
        : profile?.full_name || 'Sales Rep';

      const body = newMessage.trim();
      const urlInBody = extractUrl(body);

      let attachmentUrl: string | null = pendingAttachment?.url || null;
      let attachmentType: 'image' | 'link' | null = pendingAttachment?.type || null;

      if (!pendingAttachment && urlInBody) {
        attachmentUrl = urlInBody;
        attachmentType = 'link';
      }

      const { error } = await supabase
        .from('messages')
        .insert({
          thread_id: threadId,
          author_id: profile?.id || null,
          author_name: authorName,
          author_type: isPortal ? 'customer' : 'staff',
          body,
          is_internal: isPortal ? false : isInternal,
          is_read: false,
          context_room_id: activeContextRoomId,
          context_line_item_id: activeContextLineItemId,
          context_label: activeContextLabel,
          attachment_url: attachmentUrl,
          attachment_type: attachmentType,
        });

      if (error) throw error;

      setNewMessage('');
      setIsInternal(false);
      setPendingAttachment(null);
      await loadMessages();
      onMessagesChanged?.();
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message. Please try again.');
    } finally {
      setSending(false);
    }
  }

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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

  const unreadCount = messages.filter(m => {
    const authorType = isPortal ? 'customer' : 'staff';
    return m.author_type !== authorType && !m.is_read;
  }).length;

  const composeArea = (
    <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200 bg-white">
      {pendingAttachment && (
        <div className="mb-2 flex items-center gap-2 bg-blue-50 rounded-lg px-3 py-2">
          {pendingAttachment.type === 'image' ? (
            <img src={pendingAttachment.url} alt="Pending" className="w-10 h-10 rounded object-cover" />
          ) : (
            <LinkIcon className="w-4 h-4 text-blue-600" />
          )}
          <span className="text-xs text-blue-700 flex-1 truncate">Attachment ready</span>
          <button
            type="button"
            onClick={() => setPendingAttachment(null)}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {!isPortal && (
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
      )}
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
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || sending}
          className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors flex items-center"
          title="Attach image"
        >
          {uploading ? (
            <Loader className="w-4 h-4 animate-spin text-gray-500" />
          ) : (
            <ImagePlus className="w-4 h-4 text-gray-500" />
          )}
        </button>
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder={isPortal ? "Ask a question or leave a comment..." : "Reply or add a comment..."}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={(!newMessage.trim() && !pendingAttachment) || sending}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {sending ? (
            <Loader className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </button>
      </div>
    </form>
  );

  const contextBadge = (activeContextLabel || activeContextRoomId || activeContextLineItemId) && (
    <div className="px-4 pt-3 pb-1 flex items-center gap-2">
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 bg-blue-50 text-blue-700 rounded-full border border-blue-200">
        <MessageSquare className="w-3 h-3" />
        Re: {activeContextLabel || 'this item'}
      </span>
      <button
        type="button"
        onClick={() => { setActiveContextRoomId(null); setActiveContextLineItemId(null); setActiveContextLabel(null); }}
        className="text-xs text-gray-400 hover:text-gray-600"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );

  if (embedded) {
    return (
      <div className="flex flex-col h-full bg-white rounded-lg border border-gray-200">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Questions & Comments</h3>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-medium rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          {onClose && (
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded transition-colors">
              <X className="w-4 h-4 text-gray-600" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No messages yet</p>
              <p className="text-xs text-gray-400 mt-1">
                {isPortal
                  ? 'Ask questions or leave comments about this proposal'
                  : 'The customer can ask questions or leave comments here'}
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isOwnMessage = isPortal ? msg.author_type === 'customer' : msg.author_type === 'staff';

              return (
                <div
                  key={msg.id}
                  className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[75%] ${isOwnMessage ? 'items-end' : 'items-start'} space-y-1`}>
                    <div className="flex items-center gap-2 px-1">
                      <span className="text-xs font-medium text-gray-600">
                        {msg.author_name}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatTime(msg.created_at)}
                      </span>
                      {!isPortal && msg.is_internal && (
                        <span className="text-xs font-medium text-orange-600">Internal</span>
                      )}
                    </div>
                    {msg.context_label && (
                      <div className={`flex items-center gap-1 px-1 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${isOwnMessage ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'}`}>
                          <MessageSquare className="w-2.5 h-2.5" />
                          Re: {msg.context_label}
                        </span>
                      </div>
                    )}
                    <div
                      className={`px-4 py-2 rounded-lg ${
                        isOwnMessage
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-900'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                      {renderAttachment(msg, isOwnMessage)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {contextBadge}
        {composeArea}
      </div>
    );
  }

  return (
    <div className={`${isMobile ? 'fixed inset-0 w-full h-full' : 'fixed bottom-4 right-4 w-96 h-[500px]'} bg-white ${isMobile ? '' : 'rounded-lg shadow-2xl border border-gray-200'} flex flex-col z-50`}>
      <div className={`flex items-center justify-between p-4 border-b border-gray-200 bg-blue-600 text-white ${isMobile ? '' : 'rounded-t-lg'}`}>
        <div className="flex items-center gap-2">
          {isMobile && onClose && (
            <button onClick={onClose} className="p-1 hover:bg-blue-700 rounded transition-colors -ml-1">
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <MessageSquare className="w-5 h-5" />
          <h3 className="font-semibold">Questions & Comments</h3>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-medium rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 hover:bg-blue-700 rounded transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No messages yet</p>
            <p className="text-xs text-gray-400 mt-1">
              {isPortal
                ? 'Ask questions or leave comments about this proposal'
                : 'The customer can ask questions or leave comments here'}
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isOwnMessage = isPortal ? msg.author_type === 'customer' : msg.author_type === 'staff';

            return (
              <div
                key={msg.id}
                className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[75%] ${isOwnMessage ? 'items-end' : 'items-start'} space-y-1`}>
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-xs font-medium text-gray-600">
                      {msg.author_name}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatTime(msg.created_at)}
                    </span>
                  </div>
                  {msg.context_label && (
                    <div className={`flex items-center gap-1 px-1 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${isOwnMessage ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-600'}`}>
                        <MessageSquare className="w-2.5 h-2.5" />
                        Re: {msg.context_label}
                      </span>
                    </div>
                  )}
                  <div
                    className={`px-4 py-2 rounded-lg ${
                      isOwnMessage
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-900 border border-gray-200'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                    {renderAttachment(msg, isOwnMessage)}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {contextBadge}
      {composeArea}
    </div>
  );
}
