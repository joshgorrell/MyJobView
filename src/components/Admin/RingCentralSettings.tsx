import { PhoneVoicemailPermissions } from './PhoneVoicemailPermissions';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { PhoneCall, ExternalLink, Loader2 } from 'lucide-react';

type Connection = {
  accountId: string;
  status: string;
  updatedAt: string;
  mailboxes: { extensionId: string; enabled: boolean }[];
};
/** Credentials are never returned to the browser. */
export function RingCentralSettings() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [confirmAccountId, setConfirmAccountId] = useState<string | null>(null);
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false);
  const [subscriptionBusy, setSubscriptionBusy] = useState(false);
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
    if (subscriptionBusy || !window.confirm('Create or renew the RingCentral voicemail notification subscription for the connected mailbox? This does not enable voicemail processing or change call routing.')) return;
    setSubscriptionBusy(true);
    setSubscriptionResult('');
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        'ringcentral-webhook-subscription', { method: 'POST', body: {} },
      );
      if (invokeError || (data?.status !== 'created' && data?.status !== 'renewed')) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Subscription request failed. Check integration configuration.');
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
  useEffect(() => { void loadConnections(); }, []);
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
  return (
    <section className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <PhoneCall className="w-5 h-5 text-blue-600" aria-hidden="true" />
        <h4 className="font-semibold text-gray-900">RingCentral — AI Phone Dispatcher</h4>
      </div>
      <p className="text-sm text-gray-600">
        Securely authorize your company's RingCentral account to prepare voicemail
        transcription and routing into Flow. No passwords or API tokens are entered here.
      </p>
      <p className="text-sm text-gray-600">
        Connecting does not change your phone system, enable voicemail processing,
        or activate any mailbox. Mailboxes stay disabled until reviewed.
      </p>
      <button type="button" disabled={busy} onClick={connect}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
        {busy ? 'Connecting…' : 'Connect RingCentral'}
      </button>
      {!loading && !error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" role="status">
          <p className="font-semibold">Voicemail ingestion: {enabledMailboxCount === 0 ? 'Not active' : 'Not yet verified'}</p>
          <p className="mt-1">
            {!hasConnectedAccount ? 'Connect a RingCentral account before configuring voicemail ingestion.' :
              enabledMailboxCount === 0 ? 'RingCentral is connected, but no registered mailbox is enabled for voicemail ingestion.' :
              'At least one mailbox is enabled. This does not confirm webhook subscription, delivery, transcription, or Flow routing.'}
          </p>
          <p className="mt-1">Use Connection diagnostics below to verify account identity. Enabling mailboxes and RingCentral webhook delivery require separate verification; this screen does not change call routing.</p>
        </div>
      )}
      <div className="space-y-3 border-t border-gray-200 pt-4">
        <div className="flex items-center justify-between gap-2">
          <h5 className="font-medium text-gray-900">Connected accounts</h5>
          <button type="button" onClick={() => void loadConnections()} disabled={loading}
            className="text-sm text-blue-700 hover:underline disabled:opacity-50">Refresh</button>
        </div>
        {loading && <p className="text-sm text-gray-500">Checking connections…</p>}
        {!loading && !error && connections.length === 0 && <p className="text-sm text-gray-500">No connected RingCentral accounts.</p>}
        {connections.map(connection => (
          <div key={connection.accountId} className="rounded-lg border border-gray-200 p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-sm text-gray-900">Account {connection.accountId}</p>
                <p className="text-xs text-gray-500">Status: {connection.status}</p>
              </div>
              <button type="button" disabled={disconnecting !== null}
                onClick={() => setConfirmAccountId(connection.accountId)}
                className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50">
                {disconnecting === connection.accountId ? 'Disconnecting…' : 'Disconnect'}
              </button>
            </div>
            {confirmAccountId === connection.accountId && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-3">
                <p className="text-sm text-red-900">
                  Disconnect account {connection.accountId}? Its mailboxes will be disabled,
                  and MJV's saved authorization will be removed. Existing voicemail history is retained.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => void disconnect(connection.accountId)}
                    disabled={disconnecting !== null}
                    className="rounded-lg bg-red-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
                    Confirm disconnect
                  </button>
                  <button type="button" onClick={() => setConfirmAccountId(null)}
                    disabled={disconnecting !== null}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700">
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <div className="text-xs text-gray-600">
              {connection.mailboxes.length === 0 ? 'No registered mailboxes' :
                connection.mailboxes.map(m => (
                  <p key={m.extensionId}>RingCentral extension ID {m.extensionId}: {m.enabled ? 'Enabled' : 'Disabled'}</p>
                ))}
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-3 border-t border-gray-200 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h5 className="font-medium text-gray-900">Connection diagnostics</h5>
            <p className="text-xs text-gray-500">Verify OAuth renewal and the connected mailbox without changing phone routing.</p>
          </div>
          <button type="button" disabled={subscriptionBusy || loading || connections.length !== 1}
            className="rounded-lg border border-blue-300 px-3 py-2 text-sm font-medium disabled:opacity-50"
            onClick={() => void manageSubscription()}>
            {subscriptionBusy ? 'Configuring…' : 'Create / renew voicemail subscription'}
          </button>
          <button type="button" disabled={diagnosticsBusy}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium disabled:opacity-50"
            onClick={() => void checkConnection()}>
            {diagnosticsBusy ? 'Checking…' : 'Check RingCentral connection'}
          </button>
        </div>
        {subscriptionResult && <p role="status" className="text-sm text-gray-700">{subscriptionResult}</p>}
        {diagnosticsError && <p role="alert" className="text-sm text-red-700">{diagnosticsError}</p>}
        {diagnostics && (
          <div className="rounded-lg border border-gray-200 p-3 space-y-1 text-sm" aria-live="polite">
            {diagnostics.connections.length === 0 && <p>No RingCentral account connected.</p>}
            {diagnostics.connections.map((connection, i) => (
              <p key={i}>
                Connection: {connection.status}
                {connection.extension_number && ` · Extension ${connection.extension_number}`}
                {connection.extension_name && ` · ${connection.extension_name}`}
                {connection.subscription_check && ` · Voicemail subscription: ${connection.subscription_check}`}
                {connection.subscription_expiration && ` · Expires: ${new Date(connection.subscription_expiration).toLocaleString()}`}
                {connection.registered_mailbox !== undefined && ` · Registered: ${connection.registered_mailbox ? 'yes' : 'no'}`}
                {connection.mailbox_enabled !== undefined && ` · Enabled: ${connection.mailbox_enabled ? 'yes' : 'no'}`}
              </p>
            ))}
            {diagnostics.mailboxes.map(mailbox => (
              <p key={mailbox.extension_id}>Mailbox {mailbox.display_name || mailbox.extension_id}: {mailbox.enabled ? 'enabled' : 'disabled'}</p>
            ))}
          </div>
        )}
      </div>
      <PhoneVoicemailPermissions />
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <p className="text-xs text-gray-500">
        Requires a configured RingCentral OAuth application and an MJV administrator account.
      </p>
    </section>
  );
}
