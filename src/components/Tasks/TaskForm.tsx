import { useState, useEffect } from 'react';
import { X, Calendar, Flag, Users, Plus, UserPlus, ListTodo } from 'lucide-react';
import { QuickActionModal } from '../Shared/QuickActionModal';
import { supabase } from '../../lib/supabase';
import { Task, Contact, Profile } from '../../lib/types';
import { useAuth } from '../../contexts/AuthContext';
import { useAutoSave } from '../../hooks/useAutoSave';
import { offlineSupabaseInsert, offlineSupabaseUpdate } from '../../lib/offlineSupport';
import { generateUsername } from '../../lib/username';
import { ContactSearchSelect } from '../Shared/ContactSearchSelect';
import ConfirmModal from '../ui/ConfirmModal';

interface AIPrefill {
  contactId?: string;
  contactName?: string;
  title?: string;
  description?: string;
  priority?: string;
  dueDate?: string;
}

interface TaskFormProps {
  leadId?: string;
  contactId?: string;
  task?: Task;
  onClose: () => void;
  onSuccess: () => void;
  aiPrefill?: AIPrefill | null;
}

export function TaskForm({ leadId, contactId, task, onClose, onSuccess, aiPrefill }: TaskFormProps) {
  const { profile } = useAuth();
  const [formData, setFormData] = useState({
    title: task?.title || '',
    description: task?.description || '',
    priority: task?.priority || 'medium',
    due_date: task?.due_date ? task.due_date.split('T')[0] : '',
    status: task?.status || 'pending',
    contact_id: (task as any)?.contact_id || contactId || '',
    reminder_date: task?.reminder_date ? new Date(task.reminder_date).toISOString().slice(0, 16) : '',
    assigned_to: task?.assigned_to || '',
  });
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [priorities, setPriorities] = useState<Array<{ id: string; name: string; slug: string; color: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewContactForm, setShowNewContactForm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showDraftModal, setShowDraftModal] = useState(false);

  const autoSaveKey = task ? `task_edit_${task.id}` : 'task_new';
  const { restoreSavedData, clearSavedData } = useAutoSave({
    key: autoSaveKey,
    data: formData,
    enabled: !task
  });

  const [newContactData, setNewContactData] = useState({
    contact_name: '',
    first_name: '',
    last_name: '',
    company_name: '',
    email: '',
    phone: '',
    title: '',
  });

  useEffect(() => {
    loadContacts();
    loadUsers();
    loadPriorities();

    if (!task) {
      if (aiPrefill) {
        setFormData(prev => ({
          ...prev,
          title: aiPrefill.title || prev.title,
          description: aiPrefill.description || prev.description,
          priority: aiPrefill.priority || prev.priority,
          due_date: aiPrefill.dueDate || prev.due_date,
          contact_id: aiPrefill.contactId || prev.contact_id,
        }));
      } else {
        const savedData = restoreSavedData();
        if (savedData) {
          setFormData(savedData);
        }
      }
    }
  }, []);

  async function loadContacts() {
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, contact_name, company_name, email, phone')
        .order('contact_name');

      if (error) throw error;
      setContacts(data || []);
    } catch (error) {
      console.error('Error loading contacts:', error);
    }
  }

  async function loadUsers() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('is_active', true)
        .order('full_name');

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  }

  async function loadPriorities() {
    try {
      const { data, error } = await supabase
        .from('priority_levels')
        .select('id, name, slug, color')
        .eq('is_active', true)
        .order('sort_order');

      if (error) throw error;
      setPriorities(data || []);
    } catch (error) {
      console.error('Error loading priorities:', error);
    }
  }

  async function handleCreateContact() {
    if (!newContactData.contact_name.trim()) {
      alert('Contact name is required');
      return;
    }

    try {
      const username = await generateUsername(
        newContactData.contact_name,
        'contacts',
        supabase
      );

      const { data: newContact, error } = await supabase
        .from('contacts')
        .insert([{
          contact_name: newContactData.contact_name,
          first_name: newContactData.first_name || null,
          last_name: newContactData.last_name || null,
          company_name: newContactData.company_name || null,
          email: newContactData.email || null,
          phone: newContactData.phone || null,
          title: newContactData.title || null,
          username,
          created_by: profile?.id,
        }])
        .select()
        .single();

      if (error) throw error;

      setFormData({ ...formData, contact_id: newContact.id });
      setShowNewContactForm(false);
      setNewContactData({ contact_name: '', first_name: '', last_name: '', company_name: '', email: '', phone: '', title: '' });
      loadContacts();
    } catch (err: any) {
      console.error('Error creating contact:', err);
      alert('Failed to create contact: ' + err.message);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;

    setLoading(true);
    setError(null);

    try {
      const { data: pointsConfig } = await supabase
        .from('points_configuration')
        .select('task_completion_points')
        .single();

      const taskPoints = pointsConfig?.task_completion_points || 10;

      const taskData = {
        title: formData.title,
        description: formData.description,
        priority: formData.priority,
        status: formData.status,
        due_date: formData.due_date ? new Date(formData.due_date).toISOString() : null,
        completed_at: formData.status === 'completed' && !task?.completed_at ? new Date().toISOString() : task?.completed_at || null,
        reminder_date: formData.reminder_date ? new Date(formData.reminder_date).toISOString() : null,
        assigned_to: formData.assigned_to || null,
        points: taskPoints,
      };

      let taskId = task?.id;

      if (task) {
        const updateResult = await offlineSupabaseUpdate('tasks', {
          ...taskData,
          contact_id: formData.contact_id || null,
        }, task.id);

        if (updateResult.error) throw updateResult.error;

        if (formData.contact_id) {
          await offlineSupabaseInsert('feed_events', {
            event_type: 'task_updated',
            task_id: task.id,
            contact_id: formData.contact_id,
            user_id: profile.id,
            metadata: { task_title: formData.title },
          });
        }
      } else {
        const insertResult = await offlineSupabaseInsert('tasks', {
          ...taskData,
          lead_id: leadId || null,
          contact_id: formData.contact_id || null,
          user_id: profile.id,
        });

        if (insertResult.error) throw insertResult.error;
        const newTask = Array.isArray(insertResult.data) ? insertResult.data[0] : insertResult.data;
        taskId = newTask?.id;

        if (newTask) {
          await offlineSupabaseInsert('feed_events', {
            event_type: 'task_created',
            task_id: newTask.id,
            lead_id: leadId || null,
            contact_id: formData.contact_id || null,
            user_id: profile.id,
            metadata: { task_title: formData.title },
          });
        }
      }

      if (formData.reminder_date && taskId) {
        const { data: calendarProfile } = await supabase
          .from('profiles')
          .select('google_calendar_connected')
          .eq('id', profile.id)
          .single();

        if (calendarProfile?.google_calendar_connected) {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            const action = task?.google_calendar_event_id ? 'update' : 'create';

            await fetch(
              `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-event`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${session?.access_token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  action,
                  entityType: 'task',
                  entityId: taskId,
                  reminderDate: taskData.reminder_date,
                  title: `Task: ${formData.title}`,
                  description: `Task reminder\n\n${formData.description || ''}`,
                  eventId: task?.google_calendar_event_id,
                }),
              }
            );
          } catch (calError) {
            console.error('Failed to create calendar event:', calError);
          }
        }
      }

      clearSavedData();
      setShowSuccess(true);
      await new Promise(resolve => setTimeout(resolve, 900));
      onSuccess();

      if (!task && taskId) {
        onClose();
        window.location.hash = `#tasks`;
      }
    } catch (err: any) {
      console.error('Error saving task:', err);
      setError(err.message || 'Failed to save task');
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    if (!task && !false) {
      const hasData = formData.title || formData.description;
      if (hasData) {
        setShowDraftModal(true);
        return;
      }
    }
    onClose();
  }

  const otherUsers = users.filter(u => u.id !== profile?.id);

  return (
    <>
    <QuickActionModal
      title={task ? 'Edit Task' : 'New Task'}
      subtitle={task ? 'Update task details' : 'Assign and track a new task'}
      icon={<ListTodo className="w-5 h-5 text-white" />}
      accentColor="from-sky-600 to-blue-700"
      onClose={handleClose}
      showSuccess={showSuccess}
      successMessage={task ? 'Task Updated!' : 'Task Created!'}
      maxWidth="sm:max-w-lg"
    >
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="overflow-y-auto flex-1 px-4 sm:px-6 py-4 space-y-4">
            {error && (
              <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-sm">
                {error}
              </div>
            )}

            {/* Task Title */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Task Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="Follow up with customer"
                autoFocus
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none"
                placeholder="Add any additional details..."
              />
            </div>

            {/* Assign To */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-gray-400" />
                Assign To
              </label>
              <select
                value={formData.assigned_to}
                onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              >
                <option value="">Anyone (claimable by team)</option>
                {profile && (
                  <option value={profile.id}>Me ({profile.full_name})</option>
                )}
                {otherUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority + Due Date side by side */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5 flex items-center gap-1.5">
                  <Flag className="w-4 h-4 text-gray-400" />
                  Priority
                </label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                >
                  {priorities.length === 0 ? (
                    <option value="medium">Medium</option>
                  ) : (
                    priorities.map((priority) => (
                      <option key={priority.id} value={priority.slug}>
                        {priority.name}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  Due Date
                </label>
                <input
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                  className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Reminder */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-gray-400" />
                Reminder
              </label>
              <input
                type="datetime-local"
                value={formData.reminder_date}
                onChange={(e) => setFormData({ ...formData, reminder_date: e.target.value })}
                className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                Creates a Google Calendar reminder if connected
              </p>
            </div>

            {/* Contact */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Contact <span className="text-gray-500 font-normal">(optional)</span>
              </label>
              <div className="flex gap-2">
                <ContactSearchSelect
                  contacts={contacts.map(c => ({
                    id: c.id,
                    label: c.contact_name,
                    sublabel: c.company_name || undefined,
                  }))}
                  value={formData.contact_id}
                  onChange={(id) => setFormData({ ...formData, contact_id: id })}
                  placeholder="Search or select contact..."
                  darkMode={true}
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => setShowNewContactForm(!showNewContactForm)}
                  className="px-3 py-2.5 bg-gray-700 text-gray-300 hover:text-white hover:bg-gray-600 rounded-lg transition-colors flex items-center gap-1.5 flex-shrink-0 text-sm"
                  title="Create new contact"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            {showNewContactForm && (
              <div className="p-4 bg-gray-800 border border-gray-700 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <UserPlus className="w-4 h-4" />
                    Create New Contact
                  </h3>
                  <button type="button" onClick={() => setShowNewContactForm(false)} className="text-gray-400 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Name *</label>
                  <input
                    type="text"
                    value={newContactData.contact_name}
                    onChange={(e) => setNewContactData({ ...newContactData, contact_name: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 text-white rounded-lg text-sm"
                    placeholder="John Doe"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Email</label>
                    <input
                      type="email"
                      value={newContactData.email}
                      onChange={(e) => setNewContactData({ ...newContactData, email: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-600 text-white rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={newContactData.phone}
                      onChange={(e) => setNewContactData({ ...newContactData, phone: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-600 text-white rounded-lg text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Company</label>
                  <input
                    type="text"
                    value={newContactData.company_name}
                    onChange={(e) => setNewContactData({ ...newContactData, company_name: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-600 text-white rounded-lg text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCreateContact}
                  className="w-full px-3 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors text-sm font-medium"
                >
                  Create Contact
                </button>
              </div>
            )}

            {/* Status (edit only) */}
            {task && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as Task['status'] })}
                  className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                >
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            )}
          </div>

          {/* Footer buttons */}
          <div className="flex gap-3 px-4 sm:px-6 py-4 border-t border-gray-700/60 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-700 text-gray-300 rounded-xl hover:bg-gray-800 transition-colors font-medium text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-sky-600 to-blue-700 text-white rounded-xl hover:shadow-lg hover:shadow-blue-500/30 transition-all font-medium text-sm disabled:opacity-50"
            >
              {loading ? 'Saving...' : task ? 'Update Task' : 'Create Task'}
            </button>
          </div>
        </form>
    </QuickActionModal>

    <ConfirmModal
      isOpen={showDraftModal}
      title="Discard Draft?"
      message="Keep draft? Your progress will be saved and you can restore it when you return."
      variant="danger"
      confirmLabel="Discard"
      cancelLabel="Keep Draft"
      onConfirm={() => { clearSavedData(); setShowDraftModal(false); onClose(); }}
      onCancel={() => { setShowDraftModal(false); onClose(); }}
    />
    </>
  );
}
