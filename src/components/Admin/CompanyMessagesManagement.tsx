import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, AlertCircle, Info, Megaphone, Newspaper, Calendar, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmModal from '../ui/ConfirmModal';

interface CompanyMessage {
  id: string;
  message: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  type: 'news' | 'alert' | 'announcement' | 'info';
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  created_by?: string;
  profiles?: {
    full_name: string;
  };
}

export function CompanyMessagesManagement() {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<CompanyMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingMessage, setEditingMessage] = useState<CompanyMessage | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    message: '',
    priority: 'normal' as const,
    type: 'info' as const,
    is_active: true,
    start_date: '',
    end_date: ''
  });

  useEffect(() => {
    if (profile?.role === 'admin') {
      loadMessages();
    }
  }, [profile]);

  const loadMessages = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('company_messages')
      .select(`
        *,
        profiles:created_by(full_name)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading messages:', error);
    } else {
      setMessages(data || []);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const messageData = {
      message: formData.message,
      priority: formData.priority,
      type: formData.type,
      is_active: formData.is_active,
      start_date: formData.start_date || null,
      end_date: formData.end_date || null,
      created_by: profile?.id
    };

    if (editingMessage) {
      const { error } = await supabase
        .from('company_messages')
        .update(messageData)
        .eq('id', editingMessage.id);

      if (error) {
        console.error('Error updating message:', error);
        alert('Failed to update message');
      } else {
        setShowForm(false);
        setEditingMessage(null);
        resetForm();
        loadMessages();
      }
    } else {
      const { error } = await supabase
        .from('company_messages')
        .insert([messageData]);

      if (error) {
        console.error('Error creating message:', error);
        alert('Failed to create message');
      } else {
        setShowForm(false);
        resetForm();
        loadMessages();
      }
    }
  };

  const handleEdit = (message: CompanyMessage) => {
    setEditingMessage(message);
    setFormData({
      message: message.message,
      priority: message.priority,
      type: message.type,
      is_active: message.is_active,
      start_date: message.start_date ? message.start_date.split('T')[0] : '',
      end_date: message.end_date ? message.end_date.split('T')[0] : ''
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('company_messages')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting message:', error);
      alert('Failed to delete message');
    } else {
      loadMessages();
    }
  };

  const resetForm = () => {
    setFormData({
      message: '',
      priority: 'normal',
      type: 'info',
      is_active: true,
      start_date: '',
      end_date: ''
    });
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'alert':
        return <AlertCircle className="w-4 h-4" />;
      case 'announcement':
        return <Megaphone className="w-4 h-4" />;
      case 'news':
        return <Newspaper className="w-4 h-4" />;
      default:
        return <Info className="w-4 h-4" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'text-red-400 bg-red-500/10';
      case 'high':
        return 'text-orange-400 bg-orange-500/10';
      case 'normal':
        return 'text-blue-400 bg-blue-500/10';
      default:
        return 'text-gray-400 bg-gray-500/10';
    }
  };

  if (profile?.role !== 'admin') {
    return (
      <div className="text-center py-8">
        <p className="text-gray-400">You don't have permission to manage company messages.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Company Messages</h2>
          <p className="text-gray-400 mt-1">Manage messages displayed in the header ticker</p>
        </div>
        <button
          onClick={() => {
            setEditingMessage(null);
            resetForm();
            setShowForm(true);
          }}
          className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:shadow-lg transition-all flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Message
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-700 flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">
                {editingMessage ? 'Edit Message' : 'New Message'}
              </h3>
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingMessage(null);
                  resetForm();
                }}
                className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Message Text
                </label>
                <input
                  type="text"
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  placeholder="Enter your message..."
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Type
                  </label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  >
                    <option value="info">Info</option>
                    <option value="news">News</option>
                    <option value="announcement">Announcement</option>
                    <option value="alert">Alert</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Priority
                  </label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Start Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    End Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 text-cyan-600 bg-gray-900 border-gray-700 rounded focus:ring-cyan-500"
                />
                <label htmlFor="is_active" className="text-sm text-gray-300">
                  Active (Display on ticker)
                </label>
              </div>

              <div className="flex items-center gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:shadow-lg transition-all"
                >
                  {editingMessage ? 'Update Message' : 'Create Message'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingMessage(null);
                    resetForm();
                  }}
                  className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8">
          <p className="text-gray-400">Loading messages...</p>
        </div>
      ) : messages.length === 0 ? (
        <div className="text-center py-8 bg-gray-800/50 rounded-lg border border-gray-700">
          <p className="text-gray-400">No messages yet. Create your first company message!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className="bg-gray-800 rounded-lg border border-gray-700 p-4 hover:border-gray-600 transition-colors"
            >
              <div className="flex items-start gap-4">
                <div className={`p-2 rounded-lg ${getPriorityColor(message.priority)}`}>
                  {getIcon(message.type)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <p className="text-white font-medium">{message.message}</p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleEdit(message)}
                        className="p-2 text-gray-400 hover:text-cyan-400 hover:bg-gray-700 rounded-lg transition-colors"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(message.id)}
                        className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400">
                    <span className={`px-2 py-1 rounded ${getPriorityColor(message.priority)}`}>
                      {message.priority}
                    </span>
                    <span className="px-2 py-1 bg-gray-700 rounded">
                      {message.type}
                    </span>
                    <span className={`px-2 py-1 rounded ${message.is_active ? 'bg-green-500/10 text-green-400' : 'bg-gray-700'}`}>
                      {message.is_active ? 'Active' : 'Inactive'}
                    </span>
                    {(message.start_date || message.end_date) && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {message.start_date && new Date(message.start_date).toLocaleDateString()}
                        {message.start_date && message.end_date && ' - '}
                        {message.end_date && new Date(message.end_date).toLocaleDateString()}
                      </span>
                    )}
                    {message.profiles?.full_name && (
                      <span>By {message.profiles.full_name}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={confirmDeleteId !== null}
        title="Delete Message"
        message="Are you sure you want to delete this message?"
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => {
          if (confirmDeleteId) handleDelete(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
