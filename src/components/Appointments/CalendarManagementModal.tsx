import { useState, useEffect } from 'react';
import { X, Plus, Users, Edit2, Trash2, Star, Calendar as CalendarIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmModal from '../ui/ConfirmModal';

interface Calendar {
  id: string;
  name: string;
  description: string | null;
  color: string;
  created_by: string;
  is_default?: boolean;
  member_count?: number;
}

interface CalendarMember {
  id: string;
  user_id: string;
  is_default: boolean;
  profiles: {
    id: string;
    full_name: string;
    role: string;
  };
}

interface User {
  id: string;
  full_name: string;
  role: string;
}

interface CalendarManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCalendarChange: (calendarId: string | null) => void;
  currentCalendarId: string | null;
}

export function CalendarManagementModal({
  isOpen,
  onClose,
  onCalendarChange,
  currentCalendarId
}: CalendarManagementModalProps) {
  const { profile } = useAuth();
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [selectedCalendar, setSelectedCalendar] = useState<Calendar | null>(null);
  const [members, setMembers] = useState<CalendarMember[]>([]);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [view, setView] = useState<'list' | 'create' | 'edit' | 'members'>('list');
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: '#3B82F6'
  });
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  const colors = [
    { name: 'Blue', value: '#3B82F6' },
    { name: 'Green', value: '#10B981' },
    { name: 'Red', value: '#EF4444' },
    { name: 'Yellow', value: '#F59E0B' },
    { name: 'Purple', value: '#8B5CF6' },
    { name: 'Pink', value: '#EC4899' },
    { name: 'Indigo', value: '#6366F1' },
    { name: 'Teal', value: '#14B8A6' }
  ];

  useEffect(() => {
    if (isOpen) {
      loadCalendars();
      loadAvailableUsers();
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedCalendar) {
      loadMembers();
    }
  }, [selectedCalendar]);

  async function loadCalendars() {
    try {
      const { data, error } = await supabase
        .rpc('get_user_calendars', { user_id_param: profile?.id });

      if (error) throw error;

      const calendarsData = data?.map((cal: any) => ({
        id: cal.calendar_id,
        name: cal.calendar_name,
        color: cal.calendar_color,
        is_default: cal.is_default,
        member_count: parseInt(cal.member_count)
      })) || [];

      setCalendars(calendarsData);
    } catch (error) {
      console.error('Error loading calendars:', error);
    }
  }

  async function loadMembers() {
    if (!selectedCalendar) return;

    try {
      const { data, error } = await supabase
        .from('calendar_members')
        .select(`
          id,
          user_id,
          is_default,
          profiles:user_id (
            id,
            full_name,
            role
          )
        `)
        .eq('calendar_id', selectedCalendar.id);

      if (error) throw error;
      setMembers(data || []);
    } catch (error) {
      console.error('Error loading members:', error);
    }
  }

  async function loadAvailableUsers() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('is_active', true)
        .order('full_name');

      if (error) throw error;
      setAvailableUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  }

  async function handleCreateCalendar() {
    if (!formData.name.trim()) {
      alert('Please enter a calendar name');
      return;
    }

    try {
      const { data: calendar, error } = await supabase
        .from('calendars')
        .insert([{
          name: formData.name,
          description: formData.description || null,
          color: formData.color,
          created_by: profile?.id
        }])
        .select()
        .single();

      if (error) throw error;

      // Add creator as a member
      await supabase
        .from('calendar_members')
        .insert([{
          calendar_id: calendar.id,
          user_id: profile?.id,
          is_default: calendars.length === 0, // Make default if it's the first calendar
          added_by: profile?.id
        }]);

      await loadCalendars();
      setFormData({ name: '', description: '', color: '#3B82F6' });
      setView('list');
    } catch (error) {
      console.error('Error creating calendar:', error);
      alert('Failed to create calendar');
    }
  }

  async function handleUpdateCalendar() {
    if (!selectedCalendar || !formData.name.trim()) return;

    try {
      const { error } = await supabase
        .from('calendars')
        .update({
          name: formData.name,
          description: formData.description || null,
          color: formData.color,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedCalendar.id);

      if (error) throw error;

      await loadCalendars();
      setView('list');
      setSelectedCalendar(null);
    } catch (error) {
      console.error('Error updating calendar:', error);
      alert('Failed to update calendar');
    }
  }

  async function handleDeleteCalendar(calendarId: string) {
    try {
      const { error } = await supabase
        .from('calendars')
        .delete()
        .eq('id', calendarId);

      if (error) throw error;

      if (currentCalendarId === calendarId) {
        onCalendarChange(null);
      }

      await loadCalendars();
    } catch (error) {
      console.error('Error deleting calendar:', error);
      alert('Failed to delete calendar');
    }
  }

  async function handleAddMember(userId: string) {
    if (!selectedCalendar) return;

    try {
      const { error } = await supabase
        .from('calendar_members')
        .insert([{
          calendar_id: selectedCalendar.id,
          user_id: userId,
          added_by: profile?.id
        }]);

      if (error) throw error;
      await loadMembers();
    } catch (error) {
      console.error('Error adding member:', error);
      alert('Failed to add member');
    }
  }

  async function handleRemoveMember(memberId: string) {
    try {
      const { error } = await supabase
        .from('calendar_members')
        .delete()
        .eq('id', memberId);

      if (error) throw error;
      await loadMembers();
    } catch (error) {
      console.error('Error removing member:', error);
      alert('Failed to remove member');
    }
  }

  async function handleSetDefault(calendarId: string) {
    try {
      const member = calendars.find(c => c.id === calendarId);
      if (!member) return;

      const { error } = await supabase
        .from('calendar_members')
        .update({ is_default: true })
        .eq('calendar_id', calendarId)
        .eq('user_id', profile?.id);

      if (error) throw error;
      await loadCalendars();
    } catch (error) {
      console.error('Error setting default:', error);
      alert('Failed to set default calendar');
    }
  }

  if (!isOpen) return null;

  const nonMembers = availableUsers.filter(
    user => !members.some(m => m.user_id === user.id)
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <CalendarIcon className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-bold text-gray-900">
              {view === 'list' ? 'Manage Calendars' : view === 'create' ? 'Create Calendar' : view === 'edit' ? 'Edit Calendar' : 'Manage Members'}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {view === 'list' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <p className="text-sm text-gray-600">
                  Create and manage calendars for different teams, locations, or purposes.
                </p>
                {profile && ['admin', 'manager', 'field_supervisor'].includes(profile.role) && (
                  <button
                    onClick={() => setView('create')}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    New Calendar
                  </button>
                )}
              </div>

              {calendars.length === 0 ? (
                <div className="text-center py-12">
                  <CalendarIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">No calendars yet. Create your first calendar to get started!</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {calendars.map(calendar => (
                    <div
                      key={calendar.id}
                      className={`border-2 rounded-lg p-4 transition-all ${
                        currentCalendarId === calendar.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1">
                          <div
                            className="w-4 h-4 rounded-full mt-1 flex-shrink-0"
                            style={{ backgroundColor: calendar.color }}
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-gray-900">{calendar.name}</h3>
                              {calendar.is_default && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                                  <Star className="w-3 h-3" />
                                  Default
                                </span>
                              )}
                              {currentCalendarId === calendar.id && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                                  Active
                                </span>
                              )}
                            </div>
                            {calendar.description && (
                              <p className="text-sm text-gray-600 mb-2">{calendar.description}</p>
                            )}
                            <div className="flex items-center gap-4 text-xs text-gray-500">
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {calendar.member_count} {calendar.member_count === 1 ? 'member' : 'members'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 ml-4">
                          <button
                            onClick={() => {
                              onCalendarChange(calendar.id === currentCalendarId ? null : calendar.id);
                            }}
                            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                              currentCalendarId === calendar.id
                                ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                : 'bg-blue-600 text-white hover:bg-blue-700'
                            }`}
                          >
                            {currentCalendarId === calendar.id ? 'Viewing' : 'View'}
                          </button>
                          {!calendar.is_default && (
                            <button
                              onClick={() => handleSetDefault(calendar.id)}
                              className="p-2 text-gray-400 hover:text-amber-500 transition-colors"
                              title="Set as default"
                            >
                              <Star className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setSelectedCalendar(calendar);
                              setView('members');
                            }}
                            className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                            title="Manage members"
                          >
                            <Users className="w-4 h-4" />
                          </button>
                          {(calendar.created_by === profile?.id || profile?.role === 'admin') && (
                            <>
                              <button
                                onClick={() => {
                                  setSelectedCalendar(calendar);
                                  setFormData({
                                    name: calendar.name,
                                    description: calendar.description || '',
                                    color: calendar.color
                                  });
                                  setView('edit');
                                }}
                                className="p-2 text-gray-400 hover:text-blue-600 transition-colors"
                                title="Edit calendar"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setConfirmModal({ title: 'Delete Calendar', message: 'Are you sure you want to delete this calendar? All members will be removed.', onConfirm: () => handleDeleteCalendar(calendar.id) })}
                                className="p-2 text-gray-400 hover:text-red-600 transition-colors"
                                title="Delete calendar"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {(view === 'create' || view === 'edit') && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Calendar Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Topeka Office, Manhattan Team"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Optional description for this calendar"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Color
                </label>
                <div className="grid grid-cols-8 gap-2">
                  {colors.map(color => (
                    <button
                      key={color.value}
                      onClick={() => setFormData({ ...formData, color: color.value })}
                      className={`w-10 h-10 rounded-lg transition-all ${
                        formData.color === color.value
                          ? 'ring-2 ring-offset-2 ring-blue-500 scale-110'
                          : 'hover:scale-105'
                      }`}
                      style={{ backgroundColor: color.value }}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setView('list');
                    setSelectedCalendar(null);
                    setFormData({ name: '', description: '', color: '#3B82F6' });
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={view === 'create' ? handleCreateCalendar : handleUpdateCalendar}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {view === 'create' ? 'Create Calendar' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}

          {view === 'members' && selectedCalendar && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  {selectedCalendar.name} - Members
                </h3>

                {members.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No members yet. Add members to this calendar.
                  </div>
                ) : (
                  <div className="space-y-2 mb-6">
                    {members.map(member => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div>
                          <div className="font-medium text-gray-900">{member.profiles.full_name}</div>
                          <div className="text-sm text-gray-600 capitalize">{member.profiles.role}</div>
                        </div>
                        {(selectedCalendar.created_by === profile?.id || profile?.role === 'admin') && (
                          <button
                            onClick={() => setConfirmModal({ title: 'Remove Member', message: 'Remove this member from the calendar?', onConfirm: () => handleRemoveMember(member.id) })}
                            className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {(selectedCalendar.created_by === profile?.id || profile?.role === 'admin') && nonMembers.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Add Members</h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {nonMembers.map(user => (
                      <div
                        key={user.id}
                        className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors"
                      >
                        <div>
                          <div className="font-medium text-gray-900">{user.full_name}</div>
                          <div className="text-sm text-gray-600 capitalize">{user.role}</div>
                        </div>
                        <button
                          onClick={() => handleAddMember(user.id)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-4">
                <button
                  onClick={() => {
                    setView('list');
                    setSelectedCalendar(null);
                  }}
                  className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Back to Calendars
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmModal !== null}
        title={confirmModal?.title ?? ''}
        message={confirmModal?.message ?? ''}
        onConfirm={() => { confirmModal?.onConfirm(); setConfirmModal(null); }}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}
