import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  Send,
  MessageSquare,
  Phone,
  Mail,
  User,
  Clock,
  CheckCircle,
  Truck,
  Search,
  Filter
} from 'lucide-react';

interface WorkOrder {
  id: string;
  work_order_number: string;
  title: string;
  status: string;
  current_location_status: string | null;
  estimated_arrival: string | null;
  assigned_to: string;
  projects: {
    contact_id: string;
    contacts: {
      id: string;
      full_name: string;
      phone: string | null;
      email: string | null;
    };
  };
  profiles: {
    full_name: string;
  };
}

interface Message {
  id: string;
  created_at: string;
  content: string;
  sender_type: string;
  profiles: {
    full_name: string;
  } | null;
}

export function DispatchCustomerComms() {
  const { profile } = useAuth();
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [selectedWO, setSelectedWO] = useState<WorkOrder | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [messageType, setMessageType] = useState<'sms' | 'email' | 'portal'>('portal');
  const [messageContent, setMessageContent] = useState('');

  const quickMessages = [
    {
      label: 'Tech on the way',
      template: 'Your technician {tech_name} is on the way to your location. Expected arrival: {eta}.'
    },
    {
      label: 'Arrived on site',
      template: 'Your technician {tech_name} has arrived and is starting work on your service request.'
    },
    {
      label: 'Running late',
      template: 'Your technician {tech_name} is running slightly behind schedule. Updated ETA: {eta}.'
    },
    {
      label: 'Job complete',
      template: 'Your service has been completed. {tech_name} has finished the work. Thank you for choosing us!'
    },
    {
      label: 'Need to reschedule',
      template: 'We need to reschedule your appointment. Please call us at your earliest convenience to arrange a new time.'
    }
  ];

  useEffect(() => {
    loadWorkOrders();
  }, [searchQuery]);

  useEffect(() => {
    if (selectedWO) {
      loadMessages(selectedWO.projects.contact_id);

      const channel = supabase
        .channel(`messages-${selectedWO.projects.contact_id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `contact_id=eq.${selectedWO.projects.contact_id}`
        }, () => {
          loadMessages(selectedWO.projects.contact_id);
        })
        .subscribe();

      return () => {
        channel.unsubscribe();
      };
    }
  }, [selectedWO]);

  async function loadWorkOrders() {
    try {
      let query = supabase
        .from('work_orders')
        .select(`
          *,
          profiles!work_orders_assigned_to_fkey (
            full_name
          ),
          projects (
            contact_id,
            contacts (
              id,
              full_name,
              phone,
              email
            )
          )
        `)
        .not('assigned_to', 'is', null)
        .in('status', ['assigned', 'in_progress'])
        .order('created_at', { ascending: false });

      if (searchQuery) {
        query = query.or(`work_order_number.ilike.%${searchQuery}%,title.ilike.%${searchQuery}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      setWorkOrders(data || []);
    } catch (error) {
      console.error('Error loading work orders:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(contactId: string) {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          profiles (
            full_name
          )
        `)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: true })
        .limit(50);

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  }

  async function sendMessage() {
    if (!selectedWO || !messageContent.trim()) return;

    setSendingMessage(true);
    try {
      let finalContent = messageContent;

      if (selectedWO.profiles?.full_name) {
        finalContent = finalContent.replace(/{tech_name}/g, selectedWO.profiles.full_name);
      }

      if (selectedWO.estimated_arrival) {
        const eta = new Date(selectedWO.estimated_arrival).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit'
        });
        finalContent = finalContent.replace(/{eta}/g, eta);
      }

      const { error: messageError } = await supabase
        .from('messages')
        .insert({
          contact_id: selectedWO.projects.contact_id,
          work_order_id: selectedWO.id,
          sender_id: profile?.id,
          sender_type: 'internal',
          content: finalContent,
          message_type: messageType
        });

      if (messageError) throw messageError;

      if (messageType === 'sms' && selectedWO.projects.contacts.phone) {
        await supabase.functions.invoke('send-sms-reminder', {
          body: {
            to: selectedWO.projects.contacts.phone,
            message: finalContent
          }
        });
      } else if (messageType === 'email' && selectedWO.projects.contacts.email) {
        console.log('Email would be sent to:', selectedWO.projects.contacts.email);
      }

      setMessageContent('');
      await loadMessages(selectedWO.projects.contact_id);
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message');
    } finally {
      setSendingMessage(false);
    }
  }

  function useQuickMessage(template: string) {
    setMessageContent(template);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading communications...</div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-16rem)] flex gap-4">
      <div className="w-80 flex flex-col bg-gray-800 rounded-lg border border-gray-700">
        <div className="p-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-3">Active Jobs</h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search jobs..."
              className="w-full pl-9 pr-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {workOrders.length === 0 ? (
            <div className="p-4 text-center text-gray-400 text-sm">
              No active jobs
            </div>
          ) : (
            <div className="divide-y divide-gray-700">
              {workOrders.map((wo) => (
                <button
                  key={wo.id}
                  onClick={() => setSelectedWO(wo)}
                  className={`w-full text-left p-4 hover:bg-gray-700 transition-colors ${
                    selectedWO?.id === wo.id ? 'bg-gray-700' : ''
                  }`}
                >
                  <div className="text-xs font-mono text-gray-500 mb-1">
                    {wo.work_order_number}
                  </div>
                  <div className="font-medium text-white text-sm mb-1 line-clamp-1">
                    {wo.title}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <User className="w-3 h-3" />
                    {wo.projects.contacts.full_name}
                  </div>
                  {wo.current_location_status && (
                    <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded text-xs">
                      <Truck className="w-3 h-3" />
                      {wo.current_location_status.replace('_', ' ')}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col bg-gray-800 rounded-lg border border-gray-700">
        {!selectedWO ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 mx-auto mb-4 text-gray-600" />
              <p>Select a job to communicate with the customer</p>
            </div>
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-gray-700">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-mono text-gray-500">
                    {selectedWO.work_order_number}
                  </div>
                  <div className="font-semibold text-white mt-1">
                    {selectedWO.projects.contacts.full_name}
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
                    {selectedWO.projects.contacts.phone && (
                      <div className="flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5" />
                        {selectedWO.projects.contacts.phone}
                      </div>
                    )}
                    {selectedWO.projects.contacts.email && (
                      <div className="flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5" />
                        {selectedWO.projects.contacts.email}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400">Technician</div>
                  <div className="text-sm text-white font-medium">
                    {selectedWO.profiles.full_name}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-8">
                  No messages yet. Start the conversation!
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.sender_type === 'internal' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-md px-4 py-2 rounded-lg ${
                        msg.sender_type === 'internal'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-100'
                      }`}
                    >
                      <div className="text-sm">{msg.content}</div>
                      <div className={`text-xs mt-1 ${
                        msg.sender_type === 'internal' ? 'text-blue-200' : 'text-gray-400'
                      }`}>
                        {msg.profiles?.full_name || 'Customer'} • {' '}
                        {new Date(msg.created_at).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 border-t border-gray-700 space-y-3">
              <div className="flex gap-2 overflow-x-auto pb-2">
                {quickMessages.map((quick, idx) => (
                  <button
                    key={idx}
                    onClick={() => useQuickMessage(quick.template)}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-xs whitespace-nowrap transition-colors"
                  >
                    {quick.label}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <select
                  value={messageType}
                  onChange={(e) => setMessageType(e.target.value as 'sms' | 'email' | 'portal')}
                  className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="portal">Portal</option>
                  <option value="sms">SMS</option>
                  <option value="email">Email</option>
                </select>

                <textarea
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  placeholder="Type your message... (use {tech_name} and {eta} as placeholders)"
                  rows={2}
                  className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 resize-none"
                />

                <button
                  onClick={sendMessage}
                  disabled={sendingMessage || !messageContent.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  {sendingMessage ? 'Sending...' : 'Send'}
                </button>
              </div>

              <div className="text-xs text-gray-500">
                Variables: {'{tech_name}'} = {selectedWO.profiles.full_name}, {'{eta}'} = Estimated arrival time
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
