import { useState, useEffect } from 'react';
import { MessageSquare, Send, Paperclip, ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { FileUploadZone } from '../FileUpload/FileUploadZone';
import { FileAttachmentsList } from '../FileUpload/FileAttachmentsList';

interface Thread {
  id: string;
  subject: string;
  last_message_at: string;
  unread_count: number;
}

interface Message {
  id: string;
  author_name: string;
  author_type: string;
  body: string;
  created_at: string;
}

export default function PortalMessages() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [hasVipAccess, setHasVipAccess] = useState(false);
  const [checkingVip, setCheckingVip] = useState(true);

  useEffect(() => {
    checkVipStatus();
  }, []);

  useEffect(() => {
    if (hasVipAccess) {
      loadThreads();
    }
  }, [hasVipAccess]);

  useEffect(() => {
    if (selectedThread) {
      loadMessages(selectedThread.id);
      markThreadAsRead(selectedThread.id);
    }
  }, [selectedThread]);

  async function checkVipStatus() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setCheckingVip(false);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('contact_id')
        .eq('id', user.id)
        .maybeSingle();

      if (!profile?.contact_id) {
        setCheckingVip(false);
        return;
      }

      const { data, error } = await supabase.rpc('contact_has_active_vip_subscription', {
        p_contact_id: profile.contact_id
      });

      if (error) throw error;
      setHasVipAccess(data === true);
    } catch (error) {
      console.error('Error checking VIP status:', error);
      setHasVipAccess(false);
    } finally {
      setCheckingVip(false);
    }
  }

  async function loadThreads() {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('contact_id')
        .eq('id', user.id)
        .maybeSingle();

      if (!profile?.contact_id) return;

      const { data: projects } = await supabase
        .from('projects')
        .select('id')
        .eq('contact_id', profile.contact_id);

      const projectIds = projects?.map(p => p.id) || [];

      if (projectIds.length === 0) {
        setThreads([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('message_threads')
        .select('*')
        .eq('context_type', 'project')
        .in('context_id', projectIds)
        .in('visibility', ['customer', 'public'])
        .order('last_message_at', { ascending: false });

      if (error) throw error;

      setThreads(data || []);

      if (data && data.length > 0 && !selectedThread) {
        setSelectedThread(data[0]);
      }
    } catch (error) {
      console.error('Error loading threads:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(threadId: string) {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      setMessages(data || []);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  }

  async function markThreadAsRead(threadId: string) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from('message_threads')
        .update({ unread_count: 0 })
        .eq('id', threadId);

      setThreads(threads.map(t =>
        t.id === threadId ? { ...t, unread_count: 0 } : t
      ));
    } catch (error) {
      console.error('Error marking thread as read:', error);
    }
  }

  async function sendMessage() {
    if (!newMessage.trim() || !selectedThread || sending) return;

    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user.id)
        .maybeSingle();

      const { data, error } = await supabase
        .from('messages')
        .insert({
          thread_id: selectedThread.id,
          author_id: user.id,
          author_name: profile?.full_name || profile?.email || 'Customer',
          author_type: 'customer',
          body: newMessage.trim(),
        })
        .select()
        .single();

      if (error) throw error;

      await supabase
        .from('message_threads')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', selectedThread.id);

      setMessages([...messages, data]);
      setNewMessage('');
      loadThreads();
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message');
    } finally {
      setSending(false);
    }
  }

  if (checkingVip || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">{checkingVip ? 'Checking access...' : 'Loading messages...'}</p>
        </div>
      </div>
    );
  }

  if (!hasVipAccess) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <MessageSquare className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-2xl font-bold text-gray-900 mb-3">VIP Feature</h3>
          <p className="text-gray-600 mb-6">
            Direct messaging with your project team is available exclusively to VIP members.
          </p>
          <p className="text-gray-500">
            Upgrade to a VIP plan to unlock this feature and enjoy priority support, enhanced communication, and more.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">Messages</h1>
        <p className="text-gray-500 text-sm">Communicate with your project team</p>
      </div>

      {threads.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
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
                          <div className="text-xs opacity-75 mt-2">
                            {new Date(message.created_at).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))}

                    {selectedThread && (
                      <div className="mt-4">
                        <FileAttachmentsList
                          contextType="message"
                          contextId={selectedThread.id}
                        />
                      </div>
                    )}
                  </div>

                  <div className="p-3 border-t border-gray-200 bg-gray-50 flex-shrink-0 sticky bottom-0">
                    {showAttachments && (
                      <div className="mb-3 bg-white rounded-lg p-3 border border-gray-200">
                        <h4 className="text-sm font-medium mb-2 text-gray-900">Attach Files</h4>
                        <FileUploadZone
                          contextType="message"
                          contextId={selectedThread.id}
                          onUploadComplete={() => setShowAttachments(false)}
                        />
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowAttachments(!showAttachments)}
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
                        disabled={sending}
                      />
                      <button
                        onClick={sendMessage}
                        disabled={!newMessage.trim() || sending}
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
