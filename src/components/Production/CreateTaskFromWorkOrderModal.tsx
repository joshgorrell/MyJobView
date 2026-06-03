import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { X, CheckSquare, User, Calendar, AlertCircle, Tag, MessageSquare } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface CreateTaskFromWorkOrderModalProps {
  workOrderId: string;
  workOrderNumber: string;
  workOrderTitle: string;
  contactId: string;
  contactName: string;
  customerSalesRepId?: string | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface Profile {
  id: string;
  full_name: string;
  role: string;
}

export function CreateTaskFromWorkOrderModal({
  workOrderId,
  workOrderNumber,
  workOrderTitle,
  contactId,
  contactName,
  customerSalesRepId,
  onClose,
  onSuccess
}: CreateTaskFromWorkOrderModalProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<Profile[]>([]);
  const [salesReps, setSalesReps] = useState<Profile[]>([]);

  const [formData, setFormData] = useState({
    title: '',
    description: `Related to Work Order #${workOrderNumber} - ${workOrderTitle}\n\nCustomer: ${contactName}\n\n`,
    assigned_to: customerSalesRepId || '',
    due_date: '',
    priority: 'normal',
    tags: [] as string[],
    watchers: [] as string[]
  });

  const [customTag, setCustomTag] = useState('');
  const [showCustomTag, setShowCustomTag] = useState(false);

  const taskTemplates = [
    {
      title: 'Customer wants additional quote',
      description: `Customer would like a quote for additional work.\n\nWork Order: #${workOrderNumber} - ${workOrderTitle}\nCustomer: ${contactName}\n\n`,
      tags: ['quote_request', 'customer_request']
    },
    {
      title: 'Follow-up needed with customer',
      description: `Follow-up needed with customer regarding work order.\n\nWork Order: #${workOrderNumber} - ${workOrderTitle}\nCustomer: ${contactName}\n\n`,
      tags: ['follow_up', 'customer_contact']
    },
    {
      title: 'Schedule additional work',
      description: `Customer needs additional work scheduled.\n\nWork Order: #${workOrderNumber} - ${workOrderTitle}\nCustomer: ${contactName}\n\n`,
      tags: ['scheduling', 'additional_work']
    }
  ];

  const commonTags = [
    'quote_request',
    'follow_up',
    'customer_request',
    'additional_work',
    'scheduling',
    'customer_contact',
    'urgent',
    'warranty_issue'
  ];

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('is_active', true)
        .order('full_name');

      if (error) throw error;
      setUsers(data || []);

      const salesUsers = (data || []).filter(u =>
        ['sales', 'admin'].includes(u.role)
      );
      setSalesReps(salesUsers);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  }

  function applyTemplate(template: typeof taskTemplates[0]) {
    setFormData(prev => ({
      ...prev,
      title: template.title,
      description: template.description,
      tags: template.tags,
      assigned_to: customerSalesRepId || prev.assigned_to
    }));
  }

  function toggleTag(tag: string) {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.includes(tag)
        ? prev.tags.filter(t => t !== tag)
        : [...prev.tags, tag]
    }));
  }

  function addCustomTag() {
    if (customTag.trim() && !formData.tags.includes(customTag.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, customTag.trim()]
      }));
      setCustomTag('');
      setShowCustomTag(false);
    }
  }

  function toggleWatcher(userId: string) {
    setFormData(prev => ({
      ...prev,
      watchers: prev.watchers.includes(userId)
        ? prev.watchers.filter(id => id !== userId)
        : [...prev.watchers, userId]
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;

    if (!formData.assigned_to) {
      alert('Please assign this task to someone');
      return;
    }

    setLoading(true);

    try {
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .insert({
          title: formData.title,
          description: formData.description,
          assigned_to: formData.assigned_to,
          contact_id: contactId,
          due_date: formData.due_date || null,
          priority: formData.priority,
          status: 'pending',
          created_by: profile.id
        })
        .select()
        .single();

      if (taskError) throw taskError;

      if (formData.watchers.length > 0) {
        const watchersToInsert = formData.watchers.map(userId => ({
          task_id: task.id,
          user_id: userId
        }));

        const { error: watchersError } = await supabase
          .from('task_watchers')
          .insert(watchersToInsert);

        if (watchersError) console.error('Error adding watchers:', watchersError);
      }

      const commentText = `Task created from Work Order #${workOrderNumber}\n\nContext: ${workOrderTitle}`;
      const { error: commentError } = await supabase
        .from('task_comments')
        .insert({
          task_id: task.id,
          user_id: profile.id,
          comment: commentText
        });

      if (commentError) console.error('Error adding comment:', commentError);

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error creating task:', error);
      alert(`Failed to create task: ${error?.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <CheckSquare className="w-6 h-6 text-blue-600" />
            Create Task from Work Order
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Quick Templates */}
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <CheckSquare className="w-5 h-5" />
              Quick Templates
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {taskTemplates.map((template, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => applyTemplate(template)}
                  className="text-left p-3 border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
                >
                  <p className="font-medium text-gray-900">{template.title}</p>
                  <div className="flex gap-1 mt-1">
                    {template.tags.map(tag => (
                      <span key={tag} className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Assign To */}
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <User className="w-5 h-5" />
              Assign To *
            </h3>

            {customerSalesRepId && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <AlertCircle className="w-4 h-4 inline mr-1" />
                  This customer's assigned sales rep is pre-selected
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sales Team {customerSalesRepId && '(Recommended)'}
                </label>
                <select
                  required
                  value={formData.assigned_to}
                  onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select sales rep...</option>
                  {salesReps.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.full_name} {user.id === customerSalesRepId ? '⭐' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Or Any Team Member
                </label>
                <select
                  value={formData.assigned_to}
                  onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select user...</option>
                  {users.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.full_name} - {user.role}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Task Details */}
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900">Task Details</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title *
              </label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Brief task description"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <MessageSquare className="w-4 h-4 inline mr-1" />
                Description / Notes
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={6}
                placeholder="Detailed task description, customer notes, what they want quoted, etc."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  Due Date
                </label>
                <input
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Priority
                </label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Tag className="w-5 h-5" />
              Tags (Optional)
            </h3>

            <div className="flex flex-wrap gap-2">
              {commonTags.map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-1 rounded-full text-sm transition-colors ${
                    formData.tags.includes(tag)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {tag.replace(/_/g, ' ')}
                </button>
              ))}
            </div>

            {!showCustomTag && (
              <button
                type="button"
                onClick={() => setShowCustomTag(true)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                + Add custom tag
              </button>
            )}

            {showCustomTag && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customTag}
                  onChange={(e) => setCustomTag(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomTag())}
                  placeholder="Enter custom tag"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={addCustomTag}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCustomTag(false);
                    setCustomTag('');
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Watchers */}
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <User className="w-5 h-5" />
              CC / Watchers (Optional)
            </h3>
            <p className="text-sm text-gray-600">Select users who should be notified about task updates</p>

            <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3">
              {users.filter(u => u.id !== formData.assigned_to && u.id !== profile?.id).map(user => (
                <label
                  key={user.id}
                  className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                    formData.watchers.includes(user.id)
                      ? 'bg-blue-50 border border-blue-300'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={formData.watchers.includes(user.id)}
                    onChange={() => toggleWatcher(user.id)}
                    className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm">{user.full_name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !formData.assigned_to}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Creating Task...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
