import React, { useState, useEffect } from 'react';
import { Bug, CheckCircle2, Circle, Filter, Calendar, User, Bell, Mail, Settings, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import BugReportModal from '../Shared/BugReportModal';
import { useToast } from '../Shared/Toast';

interface BugReport {
  id: string;
  user_id: string | null;
  description: string;
  is_fixed: boolean;
  created_at: string;
  profiles?: {
    first_name: string | null;
    last_name: string | null;
    full_name: string | null;
    email: string;
  };
}

interface Profile {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string;
}

interface NotificationSetting {
  id: string;
  user_id: string;
  send_email: boolean;
  send_site_notification: boolean;
  profiles?: Profile;
}

export default function BugManagement() {
  const toast = useToast();
  const [bugs, setBugs] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFixed, setShowFixed] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState<NotificationSetting[]>([]);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [showNewBugModal, setShowNewBugModal] = useState(false);
  const pageSize = 50;

  useEffect(() => {
    fetchBugs();

    // Subscribe to real-time updates for bug reports
    const subscription = supabase
      .channel('bug_reports_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bug_reports'
        },
        () => {
          // Refetch bugs when any change occurs
          fetchBugs();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [showFixed, page]);

  const fetchNotificationSettings = async () => {
    try {
      // Optimized: Fetch settings without join, then fetch profiles separately
      const { data, error } = await supabase
        .from('bug_notification_settings')
        .select('*');

      if (error) throw error;

      if (data && data.length > 0) {
        const userIds = [...new Set(data.map(s => s.user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, first_name, last_name, email')
          .in('id', userIds);

        const settingsWithProfiles = data.map(setting => ({
          ...setting,
          profiles: profiles?.find(p => p.id === setting.user_id)
        }));

        setNotificationSettings(settingsWithProfiles);
      } else {
        setNotificationSettings([]);
      }
    } catch (error) {
      console.error('Error fetching notification settings:', error);
    }
  };

  const fetchAllUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, first_name, last_name, email')
        .order('full_name');

      if (error) throw error;
      setAllUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchBugs = async () => {
    try {
      setLoading(true);
      const from = page * pageSize;
      const to = from + pageSize - 1;

      // Optimized: Fetch bugs without join first (much faster)
      const { data, error, count } = await supabase
        .from('bug_reports')
        .select('*', { count: 'exact' })
        .eq('is_fixed', showFixed)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      // Then fetch user details separately only for bugs we have
      if (data && data.length > 0) {
        const userIds = [...new Set(data.map(bug => bug.user_id).filter(Boolean))];

        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, email, first_name, last_name')
            .in('id', userIds);

          // Attach profile data to bugs
          const bugsWithProfiles = data.map(bug => ({
            ...bug,
            profiles: profiles?.find(p => p.id === bug.user_id)
          }));

          setBugs(bugsWithProfiles);
        } else {
          setBugs(data);
        }
      } else {
        setBugs([]);
      }

      setHasMore((count || 0) > to + 1);
    } catch (error) {
      console.error('Error fetching bug reports:', error);
      setBugs([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleBugFixed = async (bugId: string, currentlyFixed: boolean) => {
    try {
      setUpdating(bugId);
      const { error } = await supabase
        .from('bug_reports')
        .update({ is_fixed: !currentlyFixed })
        .eq('id', bugId);

      if (error) throw error;

      setBugs(bugs.map(bug =>
        bug.id === bugId ? { ...bug, is_fixed: !currentlyFixed } : bug
      ));
    } catch (error) {
      console.error('Error updating bug report:', error);
    } finally {
      setUpdating(null);
    }
  };

  const deleteBugReport = async (bugId: string) => {
    toast.confirm('Are you sure you want to delete this bug report? This action cannot be undone.', async () => {
      try {
        setUpdating(bugId);
        const { error } = await supabase
          .from('bug_reports')
          .delete()
          .eq('id', bugId);

        if (error) throw error;

        setBugs(bugs.filter(bug => bug.id !== bugId));
      } catch (error) {
        console.error('Error deleting bug report:', error);
      } finally {
        setUpdating(null);
      }
    }, 'Delete Bug Report?');
  };

  const addNotificationRecipient = async () => {
    if (!selectedUserId) return;

    try {
      setSettingsLoading(true);

      // Insert without join
      const { data, error } = await supabase
        .from('bug_notification_settings')
        .insert({
          user_id: selectedUserId,
          send_email: false,
          send_site_notification: true
        })
        .select()
        .single();

      if (error) throw error;

      // Fetch profile separately
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, first_name, last_name, email')
        .eq('id', selectedUserId)
        .single();

      setNotificationSettings([
        ...notificationSettings,
        { ...data, profiles: profile }
      ]);
      setSelectedUserId('');
    } catch (error) {
      console.error('Error adding notification recipient:', error);
    } finally {
      setSettingsLoading(false);
    }
  };

  const updateNotificationSetting = async (
    settingId: string,
    field: 'send_email' | 'send_site_notification',
    value: boolean
  ) => {
    try {
      const { error } = await supabase
        .from('bug_notification_settings')
        .update({ [field]: value })
        .eq('id', settingId);

      if (error) throw error;

      setNotificationSettings(notificationSettings.map(setting =>
        setting.id === settingId ? { ...setting, [field]: value } : setting
      ));
    } catch (error) {
      console.error('Error updating notification setting:', error);
    }
  };

  const removeNotificationRecipient = async (settingId: string) => {
    try {
      setSettingsLoading(true);
      const { error } = await supabase
        .from('bug_notification_settings')
        .delete()
        .eq('id', settingId);

      if (error) throw error;

      setNotificationSettings(notificationSettings.filter(s => s.id !== settingId));
    } catch (error) {
      console.error('Error removing notification recipient:', error);
    } finally {
      setSettingsLoading(false);
    }
  };

  // Lazy load settings only when panel is opened
  useEffect(() => {
    if (showSettings && notificationSettings.length === 0) {
      fetchNotificationSettings();
      fetchAllUsers();
    }
  }, [showSettings]);

  const toggleShowFixed = () => {
    setShowFixed(!showFixed);
    setPage(0);
    setBugs([]);
  };

  const getUserName = (bug: BugReport) => {
    if (!bug.profiles) return 'Unknown User';
    return bug.profiles.full_name ||
           `${bug.profiles.first_name || ''} ${bug.profiles.last_name || ''}`.trim() ||
           bug.profiles.email ||
           'Unknown User';
  };

  const getProfileName = (profile: Profile | undefined) => {
    if (!profile) return 'Unknown User';
    return profile.full_name ||
           `${profile.first_name || ''} ${profile.last_name || ''}`.trim() ||
           profile.email ||
           'Unknown User';
  };

  const availableUsers = allUsers.filter(
    user => !notificationSettings.some(setting => setting.user_id === user.id)
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Loading bug reports...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2 md:gap-3">
            <button
              onClick={() => setShowNewBugModal(true)}
              className="text-green-500 hover:text-green-400 hover:scale-110 transition-all"
              title="Report a new bug"
            >
              <Bug className="h-6 w-6 md:h-8 md:w-8" />
            </button>
            Bug Reports
          </h1>
          <p className="text-sm md:text-base text-gray-400 mt-1">
            Review and manage bug reports from users
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 md:gap-3">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">Notification Settings</span>
            <span className="sm:hidden">Settings</span>
          </button>
          <button
            onClick={toggleShowFixed}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-700 transition-colors"
          >
            <Filter className="w-4 h-4" />
            {showFixed ? 'Show Active' : 'Show Fixed'}
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 md:p-6">
          <div className="flex items-center gap-3 mb-4 md:mb-6">
            <Bell className="w-5 h-5 text-blue-400" />
            <h2 className="text-base md:text-lg font-semibold text-white">Bug Report Notifications</h2>
          </div>
          <p className="text-gray-400 text-xs md:text-sm mb-4 md:mb-6">
            Configure who receives notifications when a new bug is reported. You can enable email and/or site notifications for each recipient.
          </p>

          <div className="space-y-4">
            {notificationSettings.length > 0 && (
              <div className="space-y-3">
                {notificationSettings.map((setting) => (
                  <div
                    key={setting.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-gray-900/50 rounded-lg border border-gray-700"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <User className="w-5 h-5 text-gray-500 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-white font-medium truncate">
                          {getProfileName(setting.profiles)}
                        </p>
                        <p className="text-gray-400 text-xs md:text-sm truncate">
                          {setting.profiles?.email}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4">
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={setting.send_site_notification}
                            onChange={(e) =>
                              updateNotificationSetting(
                                setting.id,
                                'send_site_notification',
                                e.target.checked
                              )
                            }
                            className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
                          />
                          <Bell className="w-4 h-4 text-gray-400" />
                          <span className="text-xs md:text-sm text-gray-300">Site</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={setting.send_email}
                            onChange={(e) =>
                              updateNotificationSetting(
                                setting.id,
                                'send_email',
                                e.target.checked
                              )
                            }
                            className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
                          />
                          <Mail className="w-4 h-4 text-gray-400" />
                          <span className="text-xs md:text-sm text-gray-300">Email</span>
                        </label>
                      </div>

                      <button
                        onClick={() => removeNotificationRecipient(setting.id)}
                        disabled={settingsLoading}
                        className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-4 border-t border-gray-700">
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="flex-1 bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500"
              >
                <option value="">Select a user to add...</option>
                {availableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {getProfileName(user)} - {user.email}
                  </option>
                ))}
              </select>

              <button
                onClick={addNotificationRecipient}
                disabled={!selectedUserId || settingsLoading}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                Add Recipient
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {bugs.length === 0 ? (
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-8 text-center">
            <Bug className="h-12 w-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">
              {showFixed ? 'No fixed bugs' : 'No active bug reports'}
            </p>
          </div>
        ) : (
          bugs.map((bug) => (
            <div
              key={bug.id}
              className="bg-gray-800 rounded-lg border border-gray-700 p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  onClick={() => toggleBugFixed(bug.id, bug.is_fixed)}
                  disabled={updating === bug.id}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors text-xs font-medium ${
                    bug.is_fixed
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-orange-500/20 text-orange-400'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {updating === bug.id ? (
                    <div className="animate-spin rounded-full h-3 w-3 border-2 border-current border-t-transparent" />
                  ) : bug.is_fixed ? (
                    <CheckCircle2 className="w-3 h-3" />
                  ) : (
                    <Circle className="w-3 h-3" />
                  )}
                  {bug.is_fixed ? 'Fixed' : 'Active'}
                </button>
                <button
                  onClick={() => deleteBugReport(bug.id)}
                  disabled={updating === bug.id}
                  className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                  title="Delete bug report"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div>
                <p className="text-white text-sm whitespace-pre-wrap">
                  {bug.description}
                </p>
              </div>

              <div className="flex flex-col gap-2 pt-2 border-t border-gray-700">
                <div className="flex items-center gap-2 text-gray-300">
                  <User className="w-4 h-4 text-gray-500" />
                  <span className="text-xs">{getUserName(bug)}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-300">
                  <Calendar className="w-4 h-4 text-gray-500" />
                  <span className="text-xs">
                    {new Date(bug.created_at).toLocaleDateString()} at{' '}
                    {new Date(bug.created_at).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-900/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Reported By
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Submitted
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {bugs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <Bug className="h-12 w-12 text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-400">
                      {showFixed ? 'No fixed bugs' : 'No active bug reports'}
                    </p>
                  </td>
                </tr>
              ) : (
                bugs.map((bug) => (
                  <tr key={bug.id} className="hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => toggleBugFixed(bug.id, bug.is_fixed)}
                        disabled={updating === bug.id}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
                          bug.is_fixed
                            ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                            : 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {updating === bug.id ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
                        ) : bug.is_fixed ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : (
                          <Circle className="w-4 h-4" />
                        )}
                        <span className="text-sm font-medium">
                          {bug.is_fixed ? 'Fixed' : 'Active'}
                        </span>
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-white whitespace-pre-wrap max-w-2xl">
                        {bug.description}
                      </p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-gray-300">
                        <User className="w-4 h-4 text-gray-500" />
                        <span className="text-sm">{getUserName(bug)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-gray-300">
                          <Calendar className="w-4 h-4 text-gray-500" />
                          <span className="text-sm">
                            {new Date(bug.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 pl-6">
                          {new Date(bug.created_at).toLocaleTimeString()}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => deleteBugReport(bug.id)}
                        disabled={updating === bug.id}
                        className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Delete bug report"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <BugReportModal
        isOpen={showNewBugModal}
        onClose={() => setShowNewBugModal(false)}
      />

      {/* Pagination Controls */}
      {(page > 0 || hasMore) && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-3 md:p-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <button
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0}
              className="w-full sm:w-auto px-4 py-2 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-gray-400 text-xs md:text-sm text-center">
              Page {page + 1} • Showing {bugs.length} {showFixed ? 'fixed' : 'active'} bugs
            </span>
            <button
              onClick={() => setPage(page + 1)}
              disabled={!hasMore}
              className="w-full sm:w-auto px-4 py-2 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
