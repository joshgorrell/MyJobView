import { useState, useEffect } from 'react';
import { Bell, Save, Calendar, CheckCircle, XCircle, Smartphone, Building2, Eye, CreditCard, Award, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { subscribeToPushNotifications, unsubscribeFromPushNotifications, checkPushSubscription } from '../../lib/pushNotifications';
import { UserBusinessCardEditor } from '../BusinessCard/UserBusinessCardEditor';
import { RewardsDashboard } from '../Rewards/RewardsDashboard';
import ConfirmModal from '../ui/ConfirmModal';

export function UserPreferences() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'notifications' | 'business-card' | 'rewards' | 'proposals'>('notifications');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [calendarEmail, setCalendarEmail] = useState('');
  const [pushEnabled, setPushEnabled] = useState(false);
  const [enablingPush, setEnablingPush] = useState(false);
  const [offices, setOffices] = useState<any[]>([]);
  const [userOffices, setUserOffices] = useState<string[]>([]);
  const [visibilityScope, setVisibilityScope] = useState<string>('all_offices');
  const [primaryOfficeId, setPrimaryOfficeId] = useState<string>('');
  const [preferences, setPreferences] = useState({
    notify_on_mention: true,
    notify_on_lead_assigned: true,
    notify_on_fishbowl: true,
    notify_on_escalated: true,
    notify_on_lead_status: true,
  });
  const [proposalTemplates, setProposalTemplates] = useState<any[]>([]);
  const [defaultTemplateId, setDefaultTemplateId] = useState<string>('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  useEffect(() => {
    loadPreferences();
    loadOffices();
    loadVisibilitySettings();
    checkPushStatus();
    loadProposalTemplates();
  }, [profile?.id]);

  async function checkPushStatus() {
    const isSubscribed = await checkPushSubscription();
    setPushEnabled(isSubscribed);
  }

  async function loadPreferences() {
    if (!profile?.id) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('notify_on_mention, notify_on_lead_assigned, notify_on_fishbowl, notify_on_escalated, notify_on_lead_status, google_calendar_connected, google_calendar_email')
        .eq('id', profile.id)
        .single();

      if (error) throw error;
      if (data) {
        setPreferences({
          notify_on_mention: data.notify_on_mention ?? true,
          notify_on_lead_assigned: data.notify_on_lead_assigned ?? true,
          notify_on_fishbowl: data.notify_on_fishbowl ?? true,
          notify_on_escalated: data.notify_on_escalated ?? true,
          notify_on_lead_status: data.notify_on_lead_status ?? true,
        });
        setCalendarConnected(data.google_calendar_connected ?? false);
        setCalendarEmail(data.google_calendar_email || '');
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadOffices() {
    try {
      const { data, error } = await supabase
        .from('company_offices')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setOffices(data || []);
    } catch (error) {
      console.error('Error loading offices:', error);
    }
  }

  async function loadVisibilitySettings() {
    if (!profile?.id) return;

    try {
      const [visibilityRes, profileRes, officesRes] = await Promise.all([
        supabase
          .from('user_visibility_settings')
          .select('visibility_scope')
          .eq('user_id', profile.id)
          .maybeSingle(),
        supabase
          .from('profiles')
          .select('primary_office_id')
          .eq('id', profile.id)
          .maybeSingle(),
        supabase
          .from('user_offices')
          .select('office_id')
          .eq('user_id', profile.id),
      ]);

      if (visibilityRes.data) {
        setVisibilityScope(visibilityRes.data.visibility_scope);
      }

      if (profileRes.data?.primary_office_id) {
        setPrimaryOfficeId(profileRes.data.primary_office_id);
      }

      if (officesRes.data) {
        setUserOffices(officesRes.data.map(o => o.office_id));
      }
    } catch (error) {
      console.error('Error loading visibility settings:', error);
    }
  }

  async function loadProposalTemplates() {
    if (!profile?.id) return;

    try {
      const { data, error } = await supabase
        .from('proposal_report_templates')
        .select('*')
        .or(`is_personal.eq.false,created_by.eq.${profile.id}`)
        .order('is_default', { ascending: false })
        .order('name');

      if (error) throw error;
      setProposalTemplates(data || []);

      // Load user's default template preference
      if (profile.default_proposal_report_template_id) {
        setDefaultTemplateId(profile.default_proposal_report_template_id);
      }
    } catch (error) {
      console.error('Error loading proposal templates:', error);
    }
  }

  async function saveDefaultTemplate() {
    if (!profile?.id) return;

    setSavingTemplate(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ default_proposal_report_template_id: defaultTemplateId || null })
        .eq('id', profile.id);

      if (error) throw error;
      alert('Default proposal template saved!');
    } catch (error) {
      console.error('Error saving template preference:', error);
      alert('Failed to save template preference');
    } finally {
      setSavingTemplate(false);
    }
  }

  async function handleSaveVisibility() {
    if (!profile?.id) return;

    setSaving(true);
    try {
      await supabase
        .from('user_visibility_settings')
        .upsert({
          user_id: profile.id,
          visibility_scope: visibilityScope,
        });

      await supabase
        .from('profiles')
        .update({ primary_office_id: primaryOfficeId || null })
        .eq('id', profile.id);

      if (visibilityScope === 'selected_offices') {
        await supabase
          .from('user_offices')
          .delete()
          .eq('user_id', profile.id);

        if (userOffices.length > 0) {
          await supabase
            .from('user_offices')
            .insert(userOffices.map(officeId => ({
              user_id: profile.id,
              office_id: officeId,
            })));
        }
      }

      alert('Office visibility settings saved!');
    } catch (error) {
      console.error('Error saving visibility settings:', error);
      alert('Failed to save visibility settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (!profile?.id) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          notify_on_mention: preferences.notify_on_mention,
          notify_on_lead_assigned: preferences.notify_on_lead_assigned,
          notify_on_fishbowl: preferences.notify_on_fishbowl,
          notify_on_escalated: preferences.notify_on_escalated,
          notify_on_lead_status: preferences.notify_on_lead_status,
        })
        .eq('id', profile.id);

      if (error) throw error;
      alert('Preferences saved successfully!');
    } catch (error) {
      console.error('Error saving preferences:', error);
      alert('Failed to save preferences');
    } finally {
      setSaving(false);
    }
  }

  async function handleConnectCalendar() {
    setConnecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-auth`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to get authorization URL');
      }

      const { authUrl } = result;

      const popup = window.open(authUrl, 'Google Calendar Authorization', 'width=600,height=700');

      const handleMessage = (event: MessageEvent) => {
        if (event.data.type === 'google-auth-success') {
          window.removeEventListener('message', handleMessage);
          loadPreferences();
          alert('Google Calendar connected successfully!');
        } else if (event.data.type === 'google-auth-error') {
          window.removeEventListener('message', handleMessage);
          alert('Failed to connect Google Calendar');
        }
      };

      window.addEventListener('message', handleMessage);

      const checkPopup = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkPopup);
          setConnecting(false);
        }
      }, 500);
    } catch (error) {
      console.error('Error connecting calendar:', error);
      alert(`Failed to connect Google Calendar: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setConnecting(false);
    }
  }

  async function handleDisconnectCalendar() {
    setDisconnecting(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          google_access_token: null,
          google_refresh_token: null,
          google_token_expires_at: null,
          google_calendar_connected: false,
          google_calendar_email: null,
        })
        .eq('id', profile.id);

      if (error) throw error;

      setCalendarConnected(false);
      setCalendarEmail('');
      alert('Google Calendar disconnected successfully!');
    } catch (error) {
      console.error('Error disconnecting calendar:', error);
      alert('Failed to disconnect Google Calendar');
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleEnablePushNotifications() {
    if (!profile?.id) return;

    setEnablingPush(true);
    try {
      const success = await subscribeToPushNotifications(profile.id);
      if (success) {
        setPushEnabled(true);
        alert('Push notifications enabled successfully!');
      } else {
        alert('Failed to enable push notifications. Please check your browser permissions.');
      }
    } catch (error) {
      console.error('Error enabling push notifications:', error);
      alert('Failed to enable push notifications');
    } finally {
      setEnablingPush(false);
    }
  }

  async function handleDisablePushNotifications() {
    if (!profile?.id) return;

    setEnablingPush(true);
    try {
      const success = await unsubscribeFromPushNotifications(profile.id);
      if (success) {
        setPushEnabled(false);
        alert('Push notifications disabled successfully!');
      } else {
        alert('Failed to disable push notifications');
      }
    } catch (error) {
      console.error('Error disabling push notifications:', error);
      alert('Failed to disable push notifications');
    } finally {
      setEnablingPush(false);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-600">Loading preferences...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-700">
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab('notifications')}
            className={`px-4 py-3 font-medium transition-colors border-b-2 ${
              activeTab === 'notifications'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Notifications & Settings
            </div>
          </button>
          <button
            onClick={() => setActiveTab('business-card')}
            className={`px-4 py-3 font-medium transition-colors border-b-2 ${
              activeTab === 'business-card'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              My Business Card
            </div>
          </button>
          <button
            onClick={() => setActiveTab('rewards')}
            className={`px-4 py-3 font-medium transition-colors border-b-2 ${
              activeTab === 'rewards'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <Award className="w-5 h-5" />
              My Rewards
            </div>
          </button>
          <button
            onClick={() => setActiveTab('proposals')}
            className={`px-4 py-3 font-medium transition-colors border-b-2 ${
              activeTab === 'proposals'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-gray-400 hover:text-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Proposals
            </div>
          </button>
        </nav>
      </div>

      {activeTab === 'business-card' && (
        <UserBusinessCardEditor />
      )}

      {activeTab === 'rewards' && (
        <RewardsDashboard />
      )}

      {activeTab === 'proposals' && (
        <div className="max-w-2xl space-y-8">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="w-6 h-6 text-blue-600" />
              Default Proposal Template
            </h3>
            <p className="text-gray-600 mb-6">
              Choose your preferred template layout for new proposals. This will be automatically
              selected when you review proposals before sending to customers.
            </p>

            {proposalTemplates.length === 0 ? (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
                <FileText className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p className="text-gray-600">No proposal templates available</p>
                <p className="text-sm text-gray-500 mt-2">
                  Contact your administrator to create proposal templates
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-3 mb-6">
                  {proposalTemplates.map((template) => (
                    <label
                      key={template.id}
                      className={`flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        defaultTemplateId === template.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        value={template.id}
                        checked={defaultTemplateId === template.id}
                        onChange={(e) => setDefaultTemplateId(e.target.value)}
                        className="mt-1 w-4 h-4 text-blue-600"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-gray-900">{template.name}</span>
                          {template.is_personal && (
                            <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">
                              Personal
                            </span>
                          )}
                          {template.is_default && !template.is_personal && (
                            <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">
                              Company Default
                            </span>
                          )}
                        </div>
                        {template.description && (
                          <p className="text-sm text-gray-600">{template.description}</p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                  <button
                    onClick={() => setDefaultTemplateId('')}
                    disabled={!defaultTemplateId}
                    className="text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Clear Selection
                  </button>
                  <button
                    onClick={saveDefaultTemplate}
                    disabled={savingTemplate}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save className="w-4 h-4" />
                    {savingTemplate ? 'Saving...' : 'Save Default Template'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === 'notifications' && (
        <div className="max-w-2xl space-y-8">
      <div>
        <div className="mb-6">
          <h3 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
            <Smartphone className="w-6 h-6 text-blue-600" />
            Push Notifications
          </h3>
          <p className="text-gray-300">Get instant notifications on your device even when the app is closed</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          {pushEnabled ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-green-600">
                <CheckCircle className="w-6 h-6" />
                <div>
                  <div className="font-semibold">Push Notifications Enabled</div>
                  <div className="text-sm text-gray-600">You will receive notifications on this device</div>
                </div>
              </div>
              <p className="text-sm text-gray-600">
                You will receive push notifications for mentions, lead assignments, and other important updates based on your notification preferences below.
              </p>
              <button
                onClick={() => setConfirmModal({ title: 'Disable Push Notifications', message: 'Are you sure you want to disable push notifications?', onConfirm: handleDisablePushNotifications })}
                disabled={enablingPush}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <XCircle className="w-4 h-4" />
                {enablingPush ? 'Disabling...' : 'Disable Push Notifications'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-gray-400">
                <XCircle className="w-6 h-6" />
                <div className="font-semibold">Push Notifications Disabled</div>
              </div>
              <p className="text-sm text-gray-600">
                Enable push notifications to receive instant updates on your device even when the app is closed. You will be notified about mentions, lead assignments, and other important events.
              </p>
              <button
                onClick={handleEnablePushNotifications}
                disabled={enablingPush}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Smartphone className="w-4 h-4" />
                {enablingPush ? 'Enabling...' : 'Enable Push Notifications'}
              </button>
            </div>
          )}
        </div>
      </div>

      {profile?.role !== 'admin' && profile?.role !== 'manager' && (
        <div>
          <div className="mb-6">
            <h3 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
              <Eye className="w-6 h-6 text-blue-600" />
              Office Visibility
            </h3>
            <p className="text-gray-300">Control what data you can see based on office locations</p>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                What can you see?
              </label>
              <div className="space-y-3">
                <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    type="radio"
                    name="visibility"
                    value="own_only"
                    checked={visibilityScope === 'own_only'}
                    onChange={(e) => setVisibilityScope(e.target.value)}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-medium text-gray-900">My Records Only</div>
                    <div className="text-sm text-gray-600">See only proposals, projects, invoices, and leads that you created</div>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    type="radio"
                    name="visibility"
                    value="office_only"
                    checked={visibilityScope === 'office_only'}
                    onChange={(e) => setVisibilityScope(e.target.value)}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-medium text-gray-900">My Office</div>
                    <div className="text-sm text-gray-600">See all records from your primary office location</div>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    type="radio"
                    name="visibility"
                    value="selected_offices"
                    checked={visibilityScope === 'selected_offices'}
                    onChange={(e) => setVisibilityScope(e.target.value)}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-medium text-gray-900">Selected Offices</div>
                    <div className="text-sm text-gray-600">Choose specific offices to see records from</div>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    type="radio"
                    name="visibility"
                    value="all_offices"
                    checked={visibilityScope === 'all_offices'}
                    onChange={(e) => setVisibilityScope(e.target.value)}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-medium text-gray-900">All Offices</div>
                    <div className="text-sm text-gray-600">See records from all office locations (full visibility)</div>
                  </div>
                </label>
              </div>
            </div>

            {(visibilityScope === 'office_only' || visibilityScope === 'selected_offices') && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Building2 className="w-4 h-4 inline mr-1" />
                  Primary Office
                </label>
                <select
                  value={primaryOfficeId}
                  onChange={(e) => setPrimaryOfficeId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select your primary office</option>
                  {offices.map((office) => (
                    <option key={office.id} value={office.id}>
                      {office.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {visibilityScope === 'selected_offices' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Additional Offices
                </label>
                <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3">
                  {offices.map((office) => (
                    <label key={office.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={userOffices.includes(office.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setUserOffices([...userOffices, office.id]);
                          } else {
                            setUserOffices(userOffices.filter(id => id !== office.id));
                          }
                        }}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-900">{office.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={handleSaveVisibility}
              disabled={saving}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Visibility Settings'}
            </button>
          </div>
        </div>
      )}

      <div>
        <div className="mb-6">
          <h3 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-blue-600" />
            Google Calendar Integration
          </h3>
          <p className="text-gray-300">Connect your Google Calendar to automatically create reminders</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          {calendarConnected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-green-600">
                <CheckCircle className="w-6 h-6" />
                <div>
                  <div className="font-semibold">Connected</div>
                  <div className="text-sm text-gray-600">{calendarEmail}</div>
                </div>
              </div>
              <p className="text-sm text-gray-600">
                When you set reminder dates on leads, tasks, or discussions, calendar events will automatically be created in your Google Calendar.
              </p>
              <button
                onClick={() => setConfirmModal({ title: 'Disconnect Google Calendar', message: 'Are you sure you want to disconnect your Google Calendar? Future reminders will not be synced.', onConfirm: handleDisconnectCalendar })}
                disabled={disconnecting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <XCircle className="w-4 h-4" />
                {disconnecting ? 'Disconnecting...' : 'Disconnect Calendar'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-gray-400">
                <XCircle className="w-6 h-6" />
                <div className="font-semibold">Not Connected</div>
              </div>
              <p className="text-sm text-gray-600">
                Connect your Google Calendar to automatically create calendar reminders when you set follow-up dates on leads, tasks, and discussions.
              </p>
              <button
                onClick={handleConnectCalendar}
                disabled={connecting}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Calendar className="w-4 h-4" />
                {connecting ? 'Connecting...' : 'Connect Google Calendar'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="mb-6">
          <h3 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
            <Bell className="w-6 h-6 text-blue-600" />
            Notification Preferences
          </h3>
          <p className="text-gray-300">Choose which notifications you want to receive</p>
        </div>

        <div className="space-y-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.notify_on_mention}
              onChange={(e) => setPreferences({ ...preferences, notify_on_mention: e.target.checked })}
              className="mt-1 w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex-1">
              <div className="font-semibold text-gray-900">Mention Notifications</div>
              <div className="text-sm text-gray-600 mt-1">
                Receive notifications when someone mentions you with @ in discussions
              </div>
            </div>
          </label>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.notify_on_lead_assigned}
              onChange={(e) => setPreferences({ ...preferences, notify_on_lead_assigned: e.target.checked })}
              className="mt-1 w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex-1">
              <div className="font-semibold text-gray-900">Lead Assignment Notifications</div>
              <div className="text-sm text-gray-600 mt-1">
                Receive notifications when leads are assigned to you
              </div>
            </div>
          </label>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.notify_on_fishbowl}
              onChange={(e) => setPreferences({ ...preferences, notify_on_fishbowl: e.target.checked })}
              className="mt-1 w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex-1">
              <div className="font-semibold text-gray-900">Fishbowl Lead Notifications</div>
              <div className="text-sm text-gray-600 mt-1">
                Receive notifications when new leads are added to the fishbowl
              </div>
            </div>
          </label>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.notify_on_escalated}
              onChange={(e) => setPreferences({ ...preferences, notify_on_escalated: e.target.checked })}
              className="mt-1 w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex-1">
              <div className="font-semibold text-gray-900">Lead Escalation Notifications</div>
              <div className="text-sm text-gray-600 mt-1">
                Receive notifications when leads are escalated
              </div>
            </div>
          </label>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.notify_on_lead_status}
              onChange={(e) => setPreferences({ ...preferences, notify_on_lead_status: e.target.checked })}
              className="mt-1 w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex-1">
              <div className="font-semibold text-gray-900">Priority Lead Status Updates</div>
              <div className="text-sm text-gray-600 mt-1">
                Receive notifications when your High or Urgent priority leads are claimed or status changes
              </div>
            </div>
          </label>
        </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      </div>
        </div>
      )}

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
