import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { MessageSquare, Send, Plus, Lock, Unlock, Paperclip } from 'lucide-react';
import { FileUploadZone } from '../FileUpload/FileUploadZone';
import { FileAttachmentsList } from '../FileUpload/FileAttachmentsList';

interface ProjectCommunicationProps {
  projectId: string;
}

export default function ProjectCommunication({ projectId }: ProjectCommunicationProps) {
  const { profile } = useAuth();
  const [threads, setThreads] = useState<any[]>([]);
  const [selectedThread, setSelectedThread] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAttachments, setShowAttachments] = useState(false);

  useEffect(() => {
    loadThreads();
  }, [projectId]);

  useEffect(() => {
    if (selectedThread) {
      loadMessages(selectedThread.id);
    }
  }, [selectedThread]);

  async function loadThreads() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('message_threads')
        .select('*')
        .eq('context_type', 'project')
        .eq('context_id', projectId)
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

  async function sendMessage() {
    if (!newMessage.trim() || !selectedThread || !profile) return;

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          thread_id: selectedThread.id,
          author_id: profile.id,
          author_name: profile.full_name || profile.email,
          author_type: 'staff',
          body: newMessage.trim(),
        })
        .select()
        .single();

      if (error) throw error;

      setMessages([...messages, data]);
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Loading messages...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* Threads Sidebar */}
      <div className="w-80 border-r border-gray-700 bg-gray-900 overflow-y-auto">
        <div className="p-4 border-b border-gray-700">
          <button className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm">
            <Plus size={16} />
            New Thread
          </button>
        </div>

        {threads.length === 0 ? (
          <div className="p-4 text-center text-gray-400 text-sm">
            No message threads yet
          </div>
        ) : (
          <div className="divide-y divide-gray-700">
            {threads.map((thread) => (
              <button
                key={thread.id}
                onClick={() => setSelectedThread(thread)}
                className={`w-full text-left p-4 hover:bg-gray-800 transition-colors ${
                  selectedThread?.id === thread.id ? 'bg-gray-800' : ''
                }`}
              >
                <div className="flex items-start gap-2 mb-1">
                  <MessageSquare
                    size={16}
                    className={
                      thread.visibility === 'internal' ? 'text-orange-400' : 'text-blue-400'
                    }
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-white text-sm truncate">
                      {thread.subject}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {new Date(thread.last_message_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  {thread.visibility === 'internal' ? (
                    <>
                      <Lock size={12} />
                      <span>Internal</span>
                    </>
                  ) : (
                    <>
                      <Unlock size={12} />
                      <span>Visible to Customer</span>
                    </>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Messages Area */}
      <div className="flex-1 flex flex-col">
        {selectedThread ? (
          <>
            {/* Thread Header */}
            <div className="p-4 border-b border-gray-700 bg-gray-900">
              <h3 className="font-semibold text-white mb-1">{selectedThread.subject}</h3>
              <div className="flex items-center gap-2 text-xs">
                {selectedThread.visibility === 'internal' ? (
                  <span className="text-orange-400 flex items-center gap-1">
                    <Lock size={12} />
                    Internal Only
                  </span>
                ) : (
                  <span className="text-blue-400 flex items-center gap-1">
                    <Unlock size={12} />
                    Visible to Customer
                  </span>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.author_id === profile?.id ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-lg rounded-lg p-3 ${
                      message.author_id === profile?.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-white'
                    }`}
                  >
                    <div className="text-xs opacity-75 mb-1">{message.author_name}</div>
                    <div className="whitespace-pre-wrap">{message.body}</div>
                    <div className="text-xs opacity-75 mt-2">
                      {new Date(message.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Message Input */}
            <div className="p-4 border-t border-gray-700 bg-gray-900">
              {showAttachments && (
                <div className="mb-4 bg-gray-800 rounded-lg p-4">
                  <h4 className="text-white text-sm font-medium mb-3">Attach Files</h4>
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
                  className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg border border-gray-700"
                >
                  <Paperclip size={18} />
                </button>
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={sendMessage}
                  disabled={!newMessage.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg flex items-center gap-2"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            Select a thread to view messages
          </div>
        )}
      </div>
    </div>
  );
}
