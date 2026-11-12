import { PhoneVoicemailPermissions } from './PhoneVoicemailPermissions';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { PhoneCall, ExternalLink, Loader2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

type Connection = {
  accountId: string;
  status: string;
  updatedAt: string;
  mailboxes: { extensionId: string; enabled: boolean }[];
};
/** Credentials are never returned to the browser. */
export function RingCentralSettings() {
  const [busy, setBusy] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState('');
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [confirmAccountId, setConfirmAccountId] = useState<string | null>(null);
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false);
  const [subscriptionBusy, setSubscriptionBusy] = useState(false);
  const [confirmSubscription, setConfirmSubscription] = useState(false);
  const [subscriptionResult, setSubscriptionResult] = useState('');
  const [diagnosticsError, setDiagnosticsError] = useState('');
  const [diagnostics, setDiagnostics] = useState<{
    connections: Array<{status: string; extension_number?: string | null; extension_name?: string | null;
      registered_mailbox?: boolean; mailbox_enabled?: boolean; http_status?: number;
      subscription_check?: 'active' | 'missing' | 'unavailable'; subscription_expiration?: string | null}>;
    mailboxes: Array<{extension_id: string; display_name: string | null; enabled: boolean}>;
  } | null>(null);
  async function checkConnection() {
    setDiagnosticsBusy(true);
    setDiagnosticsError('');
    try {
      const { data, error: diagnosticError } = await supabase.functions.invoke('ringcentral-mailbox-diagnostics', { method: 'GET' });
      if (diagnosticError) {
        const status = (diagnosticError as { context?: { status?: number } }).context?.status;
        throw new Error(status === 403 ? 'Only an MJV administrator can run connection diagnostics.' :
          'Connection check failed. Confirm RingCentral integration configuration and try again.');
      }
      if (!Array.isArray(data?.connections) || !Array.isArray(data?.mailboxes)) throw new Error('Invalid diagnostics response.');
      setDiagnostics(data);
    } catch (err) {
      setDiagnosticsError(err instanceof Error ? err.message : 'Connection check failed.');
    } finally { setDiagnosticsBusy(false); }
  }
  async function manageSubscription() {
    if (subscriptionBusy) return;
    setConfirmSubscription(false);
    setSubscriptionBusy(true);
    setSubscriptionResult('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        'ringcentral-webhook-subscription', { method: 'POST', body: {} },
      );
      if (invokeError || (data?.status !== 'created' && data?.status !== 'renewed')) {
        // Supabase FunctionsHttpError puts non-2xx JSON in context, not data.
        // Show safe server error codes and HTTP status instead of a generic message.
        let response = data as { error?: string; http_status?: number; provider_code?: string; invalid_parameter?: string; provider_message?: string } | null;
        let status: number | undefined;
        if (invokeError) {
          const context = (invokeError as { context?: Response }).context;
          if (context && typeof context.status === 'number') {
            status = context.status;
            try {
              const body = await context.json() as { error?: string; http_status?: number; provider_code?: string; invalid_parameter?: string; provider_message?: string };
              response = body;
            } catch { /* Gateway errors may not return JSON. */ }
          }
        }
        const reason = typeof response?.error === 'string' && /^[a-z0-9_]{1,80}$/.test(response.error)
          ? response.error.replace(/_/g, ' ') : 'Subscription request failed';
        const providerStatus = typeof response?.http_status === 'number'
          ? ` (RingCentral HTTP ${response.http_status})` : '';
        const detail = typeof response?.provider_message === 'string' ? ` · ${response.provider_message}` :
          typeof response?.invalid_parameter === 'string' ? ` · Invalid parameter: ${response.invalid_parameter}` :
          typeof response?.provider_code === 'string' ? ` · ${response.provider_code}` : '';
        throw new Error(`${reason}${providerStatus}${status ? ` · MJV HTTP ${status}` : ''}${detail}`);
      }
      setSubscriptionResult(data.status === 'created' ? 'Subscription created.' : 'Subscription renewed.');
      await checkConnection();
    } catch (err) {
      setSubscriptionResult(err instanceof Error ? err.message : 'Subscription request failed.');
    } finally { setSubscriptionBusy(false); }
  }
  async function loadConnections() {
    // A refresh or disconnect invalidates the previous diagnostic snapshot.
    setDiagnostics(null);
    setDiagnosticsError('');
    setError('');
    setLoading(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        'ringcentral-connection-management', { method: 'GET' },
      );
      if (invokeError) throw invokeError;
      setConnections(Array.isArray(data?.connections) ? data.connections : []);
    } catch {
      setConnections([]);
      setError('Connection status is unavailable. Check the RingCentral integration configuration.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void loadConnections(); void checkConnection(); }, []);
  async function disconnect(accountId: string) {
    if (disconnecting) return;
    setDisconnecting(accountId);
    setError('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        'ringcentral-connection-management', {
          method: 'DELETE', body: { accountId, confirm: true },
        },
      );
      if (invokeError || data?.disconnected !== true) throw new Error('Disconnect failed');
      setConfirmAccountId(null);
      await loadConnections();
    } catch {
      setError('Unable to disconnect RingCentral. Please try again.');
    } finally {
      setDisconnecting(null);
    }
  }
  async function connect() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        'ringcentral-oauth-start', { method: 'POST', body: {} },
      );
      if (invokeError) throw invokeError;
      if (typeof data?.authorizationUrl !== 'string') throw new Error('Authorization is unavailable');
      const url = new URL(data.authorizationUrl);
      if (url.origin !== 'https://platform.ringcentral.com' &&
          url.origin !== 'https://platform.devtest.ringcentral.com') {
        throw new Error('Unexpected RingCentral authorization destination');
      }
      if (url.pathname !== '/restapi/oauth/authorize') throw new Error('Invalid authorization destination');
      window.location.assign(url.toString());
    } catch {
      setError('Could not start RingCentral authorization. Confirm the integration is configured and try again.');
      setBusy(false);
    }
  }
  const enabledMailboxCount = connections.reduce((count, connection) =>
    count + connection.mailboxes.filter(mailbox => mailbox.enabled).length, 0);
  const hasConnectedAccount = connections.some(connection => connection.status === 'connected');
  const current = diagnostics?.connections.find(c => c.status === 'connected');
  const subscriptionActive = current?.subscription_check === 'active';
  const mailboxReady = current?.registered_mailbox && current?.mailbox_enabled;
  const status = !hasConnectedAccount ? 'Not connected' :
    !subscriptionActive ? 'Setup needs attention' :
    !mailboxReady ? 'Mailbox needs attention' : 'Connected — delivery not yet verified';
  return (
    <section className="space-y-5 rounded-xl border border-gray-200 bg-white p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 text-lg font-semibold text-gray-900"><PhoneCall className="h-5 w-5 text-blue-600" />RingCentral</h4>
          <p className="mt-1 text-sm text-gray-600">Connect your phone system and deliver voicemail notifications to Flow.</p>
        </div>
        <button type="button" onClick={() => { void loadConnections(); void checkConnection(); }} disabled={loading || diagnosticsBusy}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-50">
          <RefreshCw className="h-4 w-4" /> Refresh status
        </button>
      </div>
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4" aria-live="polite">
        <div className="flex items-center gap-2 font-medium text-gray-900">
          {subscriptionActive && mailboxReady ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <AlertCircle className="h-5 w-5 text-amber-600" />}
          {loading || diagnosticsBusy ? 'Checking RingCentral…' : status}
        </div>
        <p className="mt-1 text-xs text-gray-600">An active subscription and enabled mailbox do not guarantee voicemail transcription or Flow delivery until a test succeeds.</p>
        {diagnosticsError && <p role="alert" className="mt-2 text-sm text-red-700">{diagnosticsError}</p>}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-gray-200 p-4">
          <h5 className="font-semibold text-gray-900">1. Connection</h5>
          <p className="mt-1 text-sm text-gray-600">{current ? `${current.extension_name || 'Connected account'}${current.extension_number ? ' · Ext. ' + current.extension_number : ''}` : hasConnectedAccount ? 'Connected' : 'Not connected'}</p>
          <p className="mt-1 text-xs text-gray-500">Authorization only; phone routing is unchanged.</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <h5 className="font-semibold text-gray-900">2. Voicemail subscription</h5>
          <p className="mt-1 text-sm font-medium">{current?.subscription_check || 'Not checked'}</p>
          {current?.subscription_expiration && <p className="mt-1 text-xs text-gray-600">Expires {new Date(current.subscription_expiration).toLocaleString()}</p>}
          <p className="mt-1 text-xs text-gray-500">Renewal is manual until automatic renewal is configured.</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <h5 className="font-semibold text-gray-900">3. Mailboxes</h5>
          <p className="mt-1 text-sm">{diagnostics?.mailboxes.length ? `${diagnostics.mailboxes.filter(m => m.enabled).length} of ${diagnostics.mailboxes.length} enabled` : 'No mailbox status yet'}</p>
          <p className="mt-1 text-xs text-gray-500">Enabling a mailbox allows MJV to receive its notifications.</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {!hasConnectedAccount && <button type="button" disabled={busy} onClick={() => void connect()}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          <ExternalLink className="h-4 w-4" />{busy ? 'Connecting…' : 'Connect RingCentral'}
        </button>}
        <button type="button" disabled={subscriptionBusy || loading || connections.length !== 1} onClick={() => setConfirmSubscription(true)}
          className="rounded-lg border border-blue-300 px-4 py-2 text-sm font-medium text-blue-800 disabled:opacity-50">
          {subscriptionBusy ? 'Working…' : subscriptionActive ? 'Renew subscription' : 'Create voicemail subscription'}
        </button>
        <button type="button" disabled={diagnosticsBusy} onClick={() => void checkConnection()}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium disabled:opacity-50">
          {diagnosticsBusy ? 'Checking…' : 'Check connection'}
        </button>
      </div>
      {confirmSubscription && <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
        <p className="text-sm text-blue-950">Create or renew RingCentral voicemail notifications? This will not change call routing or mailbox enablement.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={subscriptionBusy} onClick={() => void manageSubscription()} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white">Confirm</button>
          <button type="button" disabled={subscriptionBusy} onClick={() => setConfirmSubscription(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Cancel</button>
        </div>
      </div>}
      {subscriptionResult && <p role="status" className="text-sm text-gray-700">{subscriptionResult}</p>}
      <PhoneVoicemailPermissions />
      <div className="border-t border-gray-200 pt-4">
        <button type="button" onClick={() => setShowAdvanced(v => !v)} aria-expanded={showAdvanced}
          className="text-sm font-medium text-gray-600 hover:text-gray-900">{showAdvanced ? 'Hide advanced settings' : 'Advanced settings & account management'}</button>
        {showAdvanced && <div className="mt-4 space-y-3">
          <p className="text-xs text-gray-500">Account IDs are technical identifiers, not extension numbers. Disconnecting disables registered mailboxes and removes saved authorization; voicemail history is retained.</p>
          {connections.map(connection => <div key={connection.accountId} className="rounded-lg border border-gray-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><p className="text-sm font-medium">Account {connection.accountId}</p><p className="text-xs text-gray-500">Status: {connection.status}</p></div>
              <button type="button" disabled={disconnecting !== null} onClick={() => setConfirmAccountId(connection.accountId)}
                className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700">Disconnect</button>
            </div>
            {connection.mailboxes.map(m => <p key={m.extensionId} className="mt-1 text-xs text-gray-600">Mailbox ID {m.extensionId}: {m.enabled ? 'Enabled' : 'Disabled'}</p>)}
            {confirmAccountId === connection.accountId && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-900">Disconnect this RingCentral account and disable its mailboxes?</p>
              <div className="mt-2 flex gap-2">
                <button type="button" disabled={disconnecting !== null} onClick={() => void disconnect(connection.accountId)} className="rounded-lg bg-red-700 px-3 py-2 text-sm text-white">Confirm disconnect</button>
                <button type="button" onClick={() => setConfirmAccountId(null)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">Cancel</button>
              </div>
            </div>}
          </div>)}
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        </div>}
      </div>
    </section>
  );
}
