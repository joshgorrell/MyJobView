import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageSquare, Send, Paperclip, ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { resolveMessageAttachments } from '../../lib/messageAttachments';
import { QuickActionModal } from '../Shared/QuickActionModal';
import { useAuth } from '../../contexts/AuthContext';

interface Thread {
  id: string;
  subject: string;
  context_type: string;
  organization_id: string;
  last_message_at: string;
  unread_count: number;
}
interface Message {
  id: string;
  author_name: string;
  author_type: string;
  body: string;
  is_read: boolean;
  created_at: string;
  attachment_url: string | null;
  attachment_type: string | null;
}

export default function PortalMessages() {
  const { profile } = useAuth();
  const contactId = profile?.contact_id || localStorage.getItem('admin_impersonating_contact');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const activeThread = useRef<string | null>(null);
  activeThread.current = selectedThread?.id || null;
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [canStart, setCanStart] = useState(false);
  const [composing, setComposing] = useState(false);
  const [subject, setSubject] = useState('');
  const [firstMessage, setFirstMessage] = useState('');
  const [canSend, setCanSend] = useState(false);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    if (!contactId) { setLoading(false); return; }
    try {
      // RLS includes all of this customer's public record conversations.
      const { data, error } = await supabase.from('message_threads').select('*')
        .eq('contact_id', contactId).in('visibility', ['public', 'customer']).order('last_message_at', { ascending: false });
      if (error) throw error;
      const enriched = await Promise.all((data || []).map(async thread => {
        const { count, error } = await supabase.from('messages').select('id', {count: 'exact', head: true})
          .eq('thread_id', thread.id).eq('author_type', 'staff').eq('is_internal', false).eq('is_read', false);
        if (error) throw error;
        return { ...thread, unread_count: count || 0 } as Thread;
      }));
      setThreads(enriched);
      const { data: access } = await supabase.rpc('get_punchlist_access_info', { p_contact_id: contactId });
      setCanStart(!!profile?.contact_id && !!access?.some((a: {has_access: boolean}) => a.has_access));
      const requested = new URLSearchParams(window.location.search).get('threadId');
      if (requested && !activeThread.current) setSelectedThread(enriched.find(t => t.id === requested) || null);
      setError('');
    } catch { setError('Unable to load conversations. Please try again.'); }
    finally { setLoading(false); }
  }, [profile?.id, profile?.contact_id, contactId]);

  useEffect(() => {
    void loadThreads();
    const channel = supabase.channel(`portal-inbox-${profile?.id}`)
      .on('postgres_changes', {event: '*', schema: 'public', table: 'messages'}, () => void loadThreads())
      .on('postgres_changes', {event: '*', schema: 'public', table: 'message_threads'}, () => void loadThreads()).subscribe();
    const timer = window.setInterval(() => void loadThreads(), 30000);
    return () => { window.clearInterval(timer); void supabase.removeChannel(channel); };
  }, [loadThreads, profile?.id]);

  useEffect(() => {
    setMessages([]); setNewMessage(''); setAttachment(null); setAttachmentPreview(null); setCanSend(false);
    if (!selectedThread) return;
    let cancelled = false;
    const reload = async () => {
      const { data, error } = await supabase.from('messages').select('*').eq('thread_id', selectedThread.id)
        .eq('is_internal', false).order('created_at', {ascending: true});
      if (cancelled) return;
      if (error) { setError('Unable to load messages. Please try again.'); return; }
      const resolved = await resolveMessageAttachments(data || []);
      if (cancelled) return;
      setMessages(resolved);
      const unread = (data || []).filter(m => m.author_type === 'staff' && !m.is_read);
      if (unread.length) {
        const {error: readError} = await supabase.rpc('mark_customer_conversation_read', {p_thread: selectedThread.id});
        if (!cancelled && !readError) void loadThreads();
      }
      const {data: access, error: accessError} = await supabase.rpc('can_reply_customer_conversation', {p_thread: selectedThread.id});
      if (!cancelled) setCanSend(!accessError && access === true);
    };
    void reload();
    const channel = supabase.channel(`portal-thread-${selectedThread.id}`)
      .on('postgres_changes', {event: '*', schema: 'public', table: 'messages', filter: `thread_id=eq.${selectedThread.id}`}, () => void reload()).subscribe();
    const timer = window.setInterval(() => void reload(), 30000);
    return () => { cancelled = true; window.clearInterval(timer); void supabase.removeChannel(channel); };
  }, [selectedThread?.id, loadThreads]);
  useEffect(() => () => { if (attachmentPreview) URL.revokeObjectURL(attachmentPreview); }, [attachmentPreview]);
  useEffect(() => { bottom.current?.scrollIntoView({behavior: 'smooth'}); }, [messages]);

  async function uploadImage(file: File) {
    if (!selectedThread || !canSend || sending || !file.type.startsWith('image/')) return;
    const thread = selectedThread;
    setSending(true);
    try {
      const path = `${thread.organization_id}/${thread.id}/${crypto.randomUUID()}`;
      const {error} = await supabase.storage.from('message-attachments').upload(path, file, {contentType: file.type});
      if (error) throw error;
      if (activeThread.current === thread.id) { setAttachmentPreview(URL.createObjectURL(file)); setAttachment(supabase.storage.from('message-attachments').getPublicUrl(path).data.publicUrl); }
    } catch { setError('Unable to upload image. Please try again.'); }
    finally { setSending(false); if (fileInput.current) fileInput.current.value = ''; }
  }

  async function sendMessage() {
    if ((!newMessage.trim() && !attachment) || !selectedThread || sending || !canSend || !profile) return;
    const thread = selectedThread;
    setSending(true); setError('');
    try {
      const { data, error } = await supabase.from('messages').insert({
        thread_id: thread.id, organization_id: thread.organization_id,
        author_id: profile.id, author_name: profile.full_name || 'Customer', author_type: 'customer',
        body: newMessage.trim(), is_internal: false, is_read: false,
        attachment_url: attachment, attachment_type: attachment ? 'image' : null,
      }).select().single();
      if (error) throw error;
      if (activeThread.current === thread.id) {
        const [resolved] = await resolveMessageAttachments([data]);
        if (activeThread.current !== thread.id) return;
        setMessages(old => old.some(m => m.id === data.id) ? old : [...old, resolved]);
        setNewMessage(''); setAttachment(null); setAttachmentPreview(null);
      }
      await loadThreads();
    } catch { setError('Unable to send your message. Your draft has been kept. Please try again.'); }
    finally { setSending(false); }
  }

  async function startConversation() {
    if (sending || !subject.trim() || !firstMessage.trim()) return;
    setSending(true); setError('');
    try {
      const {data: id, error} = await supabase.rpc('start_customer_conversation', {p_subject: subject, p_body: firstMessage});
      if (error) throw error;
      setSelectedThread({id, subject: subject.trim(), context_type: 'contact', organization_id: profile?.organization_id || '', last_message_at: new Date().toISOString(), unread_count: 0});
      setComposing(false); setSubject(''); setFirstMessage('');
      await loadThreads();
    } catch { setError('Unable to start your conversation. Please try again.'); }
    finally { setSending(false); }
  }

  if (loading) return <div className="p-6 text-gray-600">Loading messages…</div>;
  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">Messages</h1>
        <p className="text-gray-500 text-sm">Conversations with your team · Reply here in the portal</p>
        {error && <div role="alert" className="mt-2 text-red-700">{error} <button onClick={() => void loadThreads()}>Retry</button></div>}
      </div>

      {canStart && <button onClick={() => setComposing(true)} className="mb-4 px-4 py-2 rounded-lg bg-blue-600 text-white">New message</button>}
      {composing && <QuickActionModal icon={<MessageSquare size={20} />} title="New customer conversation" onClose={() => setComposing(false)}>
        <div className="p-4 space-y-3">
          <label className="block">Subject<input className="block w-full border rounded p-2" maxLength={200} value={subject} onChange={e => setSubject(e.target.value)} /></label>
          <label className="block">Message<textarea className="block w-full border rounded p-2" rows={4} maxLength={10000} value={firstMessage} onChange={e => setFirstMessage(e.target.value)} /></label>
          {error && <p role="alert">{error}</p>}
          <button onClick={() => void startConversation()} disabled={sending || !subject.trim() || !firstMessage.trim()} className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50">{sending ? 'Sending…' : 'Send'}</button>
        </div>
      </QuickActionModal>}
      {threads.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 sm:p-12 text-center">
          <MessageSquare className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No messages yet</h3>
          <p className="text-gray-500">
            Your project team will start conversations here
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {/* Mobile: show thread list OR message panel */}
          {/* Desktop: show both side by side */}
          <div className="flex flex-col sm:flex-row sm:h-[calc(100vh-16rem)] min-h-[400px]">
            {/* Thread list - full width on mobile when no thread selected, sidebar on desktop */}
            <div className={`sm:w-72 lg:w-80 border-b sm:border-b-0 sm:border-r border-gray-200 flex-shrink-0 overflow-y-auto ${selectedThread ? 'hidden sm:flex sm:flex-col' : 'flex flex-col'}`}>
              <div className="p-3 border-b border-gray-200 bg-gray-50 sticky top-0">
                <h3 className="font-semibold text-gray-900 text-sm">Conversations</h3>
              </div>
              <div className="flex-1 overflow-y-auto">
                {threads.map((thread) => (
                  <button
                    key={thread.id}
                    onClick={() => setSelectedThread(thread)}
                    className={`w-full text-left p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                      selectedThread?.id === thread.id ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <h4 className="font-medium text-gray-900 text-sm truncate pr-2">
                        {thread.subject}
                      </h4>
                      {thread.unread_count > 0 && (
                        <span className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 text-xs font-medium text-white bg-blue-600 rounded-full">
                          {thread.unread_count}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      {new Date(thread.last_message_at).toLocaleDateString()}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Message panel */}
            <div className={`flex-1 flex flex-col min-h-0 ${!selectedThread ? 'hidden sm:flex' : 'flex'}`}>
              {selectedThread ? (
                <>
                  <div className="p-3 border-b border-gray-200 bg-gray-50 flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => setSelectedThread(null)}
                      className="sm:hidden flex items-center justify-center w-8 h-8 hover:bg-gray-200 rounded-lg transition-colors flex-shrink-0"
                      aria-label="Back to conversations"
                    >
                      <ArrowLeft size={16} className="text-gray-600" />
                    </button>
                    <h3 className="font-semibold text-gray-900 text-sm truncate">{selectedThread.subject}</h3>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${
                          message.author_type === 'customer' ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        <div
                          className={`max-w-[85%] sm:max-w-lg rounded-lg p-3 ${
                            message.author_type === 'customer'
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 text-gray-900'
                          }`}
                        >
                          <div className="text-xs opacity-75 mb-1">{message.author_name}</div>
                          <div className="whitespace-pre-wrap text-sm">{message.body}</div>
                          {message.attachment_type === 'image' && message.attachment_url && <img src={message.attachment_url} alt="Message attachment" className="mt-2 max-h-56 rounded" />}
                          {message.attachment_type === 'link' && message.attachment_url && /^https?:\/\//i.test(message.attachment_url) && <a href={message.attachment_url} target="_blank" rel="noopener noreferrer" className="underline break-all">{message.attachment_url}</a>}
                          <div className="text-xs opacity-75 mt-2">
                            {new Date(message.created_at).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))}

                    <div ref={bottom} />
                  </div>

                  <div className="p-3 border-t border-gray-200 bg-gray-50 flex-shrink-0 sticky bottom-0">
                    {!canSend && <p className="text-sm text-gray-600 mb-2">Messaging for this conversation requires active Test &amp; Tune or VIP access. Questions on active proposals remain available.</p>}
                    {attachment && <div className="mb-2"><img src={attachmentPreview || undefined} alt="Pending attachment" className="max-h-24" /><button onClick={() => { setAttachment(null); setAttachmentPreview(null); }}>Remove image</button></div>}
                    <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files?.[0]) void uploadImage(e.target.files[0]); }} />
                    <div className="flex gap-2">
                      <button
                        onClick={() => fileInput.current?.click()}
                        disabled={sending || !canSend}
                        className="flex items-center justify-center w-10 h-10 bg-white hover:bg-gray-100 text-gray-700 rounded-lg border border-gray-300 transition-colors flex-shrink-0"
                        aria-label="Attach file"
                      >
                        <Paperclip size={18} />
                      </button>
                      <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                        placeholder="Type a message..."
                        className="flex-1 bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm min-w-0"
                        disabled={sending || !canSend}
                      />
                      <button
                        onClick={sendMessage}
                        disabled={(!newMessage.trim() && !attachment) || sending || !canSend}
                        className="flex items-center justify-center w-10 h-10 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex-shrink-0"
                        aria-label="Send message"
                      >
                        <Send size={18} />
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                  Select a conversation to view messages
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
