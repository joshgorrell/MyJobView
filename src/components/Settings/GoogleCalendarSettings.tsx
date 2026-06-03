import { useState, useEffect } from 'react';
import { Calendar, CheckCircle, XCircle, RefreshCw, ExternalLink } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import ConfirmModal from '../ui/ConfirmModal';

interface CalendarConnection {
  is_connected: boolean;
  calendar_email?: string;
  last_sync?: string;
  expires_at?: string;
}

export function GoogleCalendarSettings() {
  const [connection, setConnection] = useState<CalendarConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  useEffect(() => {
    loadConnectionStatus();
  }, []);

  async function loadConnectionStatus() {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('google_calendar_tokens, google_calendar_refresh_token')
        .eq('id', (await supabase.auth.getUser()).data.user?.id)
        .single();

      if (profile?.google_calendar_tokens) {
        const tokens = profile.google_calendar_tokens as any;
        setConnection({
          is_connected: true,
          calendar_email: tokens.email,
          expires_at: tokens.expires_at
        });
      } else {
        setConnection({
          is_connected: false
        });
      }
    } catch (error) {
      console.error('Error loading connection status:', error);
      setConnection({
        is_connected: false
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const redirectUrl = `${window.location.origin}/calendar-connected`;

      const authUrl = `${supabaseUrl}/functions/v1/google-calendar-auth?user_id=${user.id}&redirect_url=${encodeURIComponent(redirectUrl)}`;

      window.location.href = authUrl;
    } catch (error) {
      console.error('Error initiating OAuth:', error);
      alert('Failed to connect to Google Calendar');
    }
  }

  async function handleDisconnect() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('profiles')
        .update({
          google_calendar_tokens: null,
          google_calendar_refresh_token: null
        })
        .eq('id', user.id);

      if (error) throw error;

      setConnection({
        is_connected: false
      });
    } catch (error) {
      console.error('Error disconnecting:', error);
      alert('Failed to disconnect Google Calendar');
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      // Get recent appointments
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: appointments } = await supabase
        .from('appointments')
        .select(`
          id,
          title,
          description,
          appointment_date,
          start_time,
          end_time,
          contacts:contact_id (
            first_name,
            last_name,
            email
          )
        `)
        .gte('appointment_date', thirtyDaysAgo.toISOString().split('T')[0])
        .is('google_calendar_event_id', null);

      if (!appointments || appointments.length === 0) {
        alert('No new appointments to sync');
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: { user } } = await supabase.auth.getUser();

      for (const apt of appointments) {
        try {
          const response = await fetch(
            `${supabaseUrl}/functions/v1/google-calendar-event`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
              },
              body: JSON.stringify({
                user_id: user?.id,
                appointment: {
                  id: apt.id,
                  title: apt.title,
                  description: apt.description,
                  date: apt.appointment_date,
                  start_time: apt.start_time,
                  end_time: apt.end_time,
                  attendee_email: apt.contacts?.email
                }
              })
            }
          );

          if (!response.ok) {
            console.error(`Failed to sync appointment ${apt.id}`);
          }
        } catch (error) {
          console.error(`Error syncing appointment ${apt.id}:`, error);
        }
      }

      alert(`Synced ${appointments.length} appointment(s) to Google Calendar`);
      await loadConnectionStatus();
    } catch (error) {
      console.error('Error syncing:', error);
      alert('Failed to sync appointments');
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
          <Calendar className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Google Calendar Integration</h3>
          <p className="text-sm text-gray-600">Sync your appointments with Google Calendar</p>
        </div>
      </div>

      {connection?.is_connected ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-green-50 rounded-lg border border-green-200">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-green-900">Connected to Google Calendar</p>
              {connection.calendar_email && (
                <p className="text-sm text-green-700 mt-1">{connection.calendar_email}</p>
              )}
              {connection.expires_at && (
                <p className="text-xs text-green-600 mt-1">
                  Token expires: {new Date(connection.expires_at).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">Sync Settings</h4>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="auto-sync"
                    defaultChecked
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="auto-sync">
                    Automatically sync new appointments
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="two-way-sync"
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="two-way-sync">
                    Enable two-way sync (updates from Google Calendar)
                  </label>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSync}
                disabled={syncing}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>
              <button
                onClick={() => setConfirmModal({ title: 'Disconnect Google Calendar', message: 'Are you sure you want to disconnect Google Calendar?', onConfirm: handleDisconnect })}
                className="px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50"
              >
                Disconnect
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-200">
            <a
              href="https://calendar.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              Open Google Calendar
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <XCircle className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-gray-900">Not connected</p>
              <p className="text-gray-300">
                Connect your Google Calendar to automatically sync appointments
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h4 className="font-medium text-blue-900 mb-2">Benefits of connecting:</h4>
              <ul className="space-y-1 text-sm text-blue-800">
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-0.5">•</span>
                  <span>Automatically add appointments to your Google Calendar</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-0.5">•</span>
                  <span>Share calendar availability with your team</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-0.5">•</span>
                  <span>Get reminders and notifications from Google</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-0.5">•</span>
                  <span>Sync across all your devices</span>
                </li>
              </ul>
            </div>

            <button
              onClick={handleConnect}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center justify-center gap-2"
            >
              <Calendar className="w-5 h-5" />
              Connect Google Calendar
            </button>

            <p className="text-xs text-gray-500 text-center">
              By connecting, you authorize MyJobView to access your Google Calendar
            </p>
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
