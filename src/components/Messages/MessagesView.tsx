import { useState, useEffect } from 'react';
import { MessageSquare, Plus, Send, X, Search, Filter, User, ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface MessageThread {
  id: string;
  subject: string;
  context_type: 'contact' | 'proposal' | 'project';
  context_id: string;
  visibility: 'internal' | 'public';
  created_by: string;
  last_message_at: string;
  message_count?: number;
  last_message_preview?: string;
  contact_name?: string;
}

interface Message {
  id: string;
  thread_id: string;
  author_id: string;
  author_name: string;
  author_type: 'staff' | 'customer';
  body: string;
  created_at: string;
}

interface Contact {
  id: string;
  contact_name: string;
}

interface MessagesViewProps {
  openThreadId?: string | null;
  onThreadOpened?: () => void;
}

export function MessagesView({ openThreadId, onThreadOpened }: MessagesViewProps = {}) {
  const { profile, loading: authLoading } = useAuth();
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [selectedThread, setSelectedThread] = useState<MessageThread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [showNewThread, setShowNewThread] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterVisibility, setFilterVisibility] = useState<'all' | 'internal' | 'public'>('all');

  const [newThreadForm, setNewThreadForm] = useState({
    subject: '',
    context_type: 'contact' as 'contact' | 'proposal' | 'project',
    context_id: '',
    visibility: 'public' as 'internal' | 'public',
    first_message: '',
  });

  const [contacts, setContacts] = useState<Contact[]>([]);

  useEffect(() => {
    if (!authLoading && profile) {
      loadThreads();
      loadContacts();
    } else if (!authLoading && !profile) {
      setLoading(false);
    }
  }, [filterVisibility, authLoading, profile]);

  useEffect(() => {
    if (selectedThread) {
      loadMessages(selectedThread.id);
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

  async function loadContacts() {
    const { data } = await supabase
      .from('contacts')
      .select('id, contact_name')
      .order('contact_name');

    if (data) setContacts(data);
  }

  async function loadThreads() {
    try {
      setLoading(true);

      let query = supabase
        .from('message_threads')
        .select(`
          id,
          subject,
          context_type,
          context_id,
          visibility,
          created_by,
          last_message_at
        `)
        .order('last_message_at', { ascending: false });

      if (filterVisibility !== 'all') {
        query = query.eq('visibility', filterVisibility);
      }

      const { data: threadsData, error } = await query;

      if (error) {
        console.error('Error loading threads:', error);
        throw error;
      }

      if (threadsData) {
        const threadsWithDetails = await Promise.all(
          threadsData.map(async (thread) => {
            const { count } = await supabase
              .from('messages')
              .select('*', { count: 'exact', head: true })
              .eq('thread_id', thread.id);

            const { data: lastMessage } = await supabase
              .from('messages')
              .select('body')
              .eq('thread_id', thread.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            let contact_name = '';
            if (thread.context_type === 'contact') {
              const { data: contact } = await supabase
                .from('contacts')
                .select('contact_name')
                .eq('id', thread.context_id)
                .maybeSingle();
              contact_name = contact?.contact_name || '';
            }

            return {
              ...thread,
              message_count: count || 0,
              last_message_preview: lastMessage?.body || '',
              contact_name,
            };
          })
        );

        setThreads(threadsWithDetails);
      } else {
        setThreads([]);
      }
    } catch (error: any) {
      console.error('Error loading threads:', error);
      alert('Failed to load message threads: ' + (error.message || 'Unknown error'));
      setThreads([]);
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
      if (data) setMessages(data);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  }

  async function handleSendMessage() {
    if (!selectedThread || !newMessage.trim() || !profile) return;

    setSending(true);
    try {
      const { error } = await supabase.from('messages').insert({
        thread_id: selectedThread.id,
        author_id: profile.id,
        author_name: profile.full_name,
        author_type: 'staff',
        body: newMessage.trim(),
      });

      if (error) throw error;

      setNewMessage('');
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
      // Get contact_id if context is contact or proposal
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
          company_id: profile.id, // This should be the actual company ID but using profile.id for single-tenant
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
      });

      if (messageError) throw messageError;

      setShowNewThread(false);
      setNewThreadForm({
        subject: '',
        context_type: 'contact',
        context_id: '',
        visibility: 'public',
        first_message: '',
      });

      await loadThreads();

      // Select the newly created thread
      if (thread) {
        setSelectedThread(thread);
        await loadMessages(thread.id);
      }
    } catch (error) {
      console.error('Error creating thread:', error);
      alert('Failed to create thread');
    } finally {
      setSending(false);
    }
  }

  const filteredThreads = threads.filter((thread) =>
    thread.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
    thread.contact_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
    <div className="h-[calc(100vh-8rem)] flex flex-col sm:flex-row gap-2 sm:gap-4">
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
              onClick={() => setFilterVisibility('all')}
              className={`flex-1 px-3 py-2 sm:py-1.5 text-sm rounded-lg transition-colors touch-manipulation active:scale-95 ${
                filterVisibility === 'all'
                  ? 'bg-blue-100 text-blue-700 font-medium'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterVisibility('public')}
              className={`flex-1 px-3 py-2 sm:py-1.5 text-sm rounded-lg transition-colors touch-manipulation active:scale-95 ${
                filterVisibility === 'public'
                  ? 'bg-green-100 text-green-700 font-medium'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Customer
            </button>
            <button
              onClick={() => setFilterVisibility('internal')}
              className={`flex-1 px-3 py-2 sm:py-1.5 text-sm rounded-lg transition-colors touch-manipulation active:scale-95 ${
                filterVisibility === 'internal'
                  ? 'bg-orange-100 text-orange-700 font-medium'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
              {filteredThreads.map((thread) => (
                <button
                  key={thread.id}
                  onClick={() => setSelectedThread(thread)}
                  className={`w-full p-3 sm:p-4 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors touch-manipulation ${
                    selectedThread?.id === thread.id ? 'bg-blue-50 border-l-4 border-l-blue-600' : ''
                  }`}
                >
                  <div className="flex items-start justify-between mb-1 gap-2">
                    <h3 className="font-medium text-gray-900 line-clamp-1 text-sm sm:text-base">{thread.subject}</h3>
                    <span
                      className={`ml-2 px-2 py-0.5 text-xs rounded-full flex-shrink-0 ${
                        thread.visibility === 'internal'
                          ? 'bg-orange-100 text-orange-700'
                          : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {thread.visibility === 'internal' ? 'Internal' : 'Customer'}
                    </span>
                  </div>
                  {thread.contact_name && (
                    <p className="text-sm text-gray-600 mb-1">{thread.contact_name}</p>
                  )}
                  <p className="text-sm text-gray-500 line-clamp-2">{thread.last_message_preview}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-gray-400">
                      {thread.message_count} message{thread.message_count !== 1 ? 's' : ''}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(thread.last_message_at).toLocaleDateString()}
                    </span>
                  </div>
                </button>
              ))}
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
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.author_id === profile?.id ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] sm:max-w-[70%] rounded-lg p-3 ${
                      message.author_id === profile?.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
                      <User className="w-3 h-3 flex-shrink-0" />
                      <span className="text-sm font-medium">{message.author_name}</span>
                      <span
                        className={`text-xs ${
                          message.author_id === profile?.id ? 'text-blue-200' : 'text-gray-500'
                        }`}
                      >
                        {new Date(message.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm sm:text-base break-words">{message.body}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 sm:p-4 border-t border-gray-200">
              <div className="flex gap-2 items-end">
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
                  rows={3}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-base"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim() || sending}
                  className="px-3 sm:px-4 py-2.5 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 touch-manipulation min-w-[44px] justify-center"
                  title="Send message"
                >
                  <Send className="w-5 h-5 sm:w-4 sm:h-4" />
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

      {/* New Thread Modal */}
      {showNewThread && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-t-2xl sm:rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] sm:max-h-[85vh] sm:mx-4 flex flex-col animate-slide-up sm:animate-none">
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
                  onChange={(e) =>
                    setNewThreadForm({
                      ...newThreadForm,
                      context_type: e.target.value as 'contact' | 'proposal' | 'project',
                      context_id: '',
                    })
                  }
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
                      <option key={contact.id} value={contact.id}>
                        {contact.contact_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Visibility</label>
                <select
                  value={newThreadForm.visibility}
                  onChange={(e) =>
                    setNewThreadForm({ ...newThreadForm, visibility: e.target.value as 'internal' | 'public' })
                  }
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
