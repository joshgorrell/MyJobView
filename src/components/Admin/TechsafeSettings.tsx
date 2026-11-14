import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react';
import { TechsafeOrderSync } from './TechsafeOrderSync';
import { supabase } from '../../lib/supabase';

type SenderReadiness = {
  senderEnabled: boolean;
  environment: 'sandbox' | 'production' | 'unconfigured';
  privateDatabaseConfigured: boolean;
  receiverCredentialsPresent: boolean;
  senderReady: boolean;
};

function isSenderReadiness(value: unknown): value is SenderReadiness {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return typeof s.senderEnabled === 'boolean' &&
    ['sandbox', 'production', 'unconfigured'].includes(String(s.environment)) &&
    typeof s.privateDatabaseConfigured === 'boolean' &&
    typeof s.receiverCredentialsPresent === 'boolean' &&
    typeof s.senderReady === 'boolean';
}

type Status = {
  registeredConnections: number;
  activeConnections: number;
  lastConnectionUpdate: string | null;
  liveSyncEnabled: boolean;
  sourceReaderCertified: boolean;
};

function isStatus(value: unknown): value is Status {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return Number.isSafeInteger(s.registeredConnections) &&
    Number.isSafeInteger(s.activeConnections) &&
    (s.registeredConnections as number) >= 0 &&
    (s.activeConnections as number) >= 0 &&
    (s.activeConnections as number) <= (s.registeredConnections as number) &&
    (s.lastConnectionUpdate === null ||
      (typeof s.lastConnectionUpdate === 'string' && !Number.isNaN(Date.parse(s.lastConnectionUpdate)))) &&
    typeof s.liveSyncEnabled === 'boolean' &&
    typeof s.sourceReaderCertified === 'boolean';
}

export function TechsafeSettings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [senderReadiness, setSenderReadiness] = useState<SenderReadiness | null>(null);
  const [checkingSender, setCheckingSender] = useState(false);
  const [senderError, setSenderError] = useState('');
  const checkConnection = useCallback(async () => {
    setCheckingSender(true);
    setSenderError('');
    setSenderReadiness(null);
    try {
      const { data, error } = await supabase.functions.invoke('techsafe-send-sales-order/readiness', { method: 'GET' });
      if (error || !isSenderReadiness(data)) throw new Error('readiness_unverified');
      setSenderReadiness(data);
    } catch {
      setSenderError('Unable to verify live sender readiness. Check administrator access and the deployed function.');
    } finally {
      setCheckingSender(false);
    }
  }, []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('get_techsafe_integration_status');
      if (rpcError || !isStatus(data)) throw new Error('unverified_status');
      setStatus(data);
    } catch {
      setStatus(null);
      setError('Unable to verify Techsafe connection status. Synchronization readiness is unknown.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const hasConnection = status !== null && status.activeConnections > 0;
  const certified = status?.sourceReaderCertified === true;
  const enabled = status?.liveSyncEnabled === true;
  const ready = hasConnection && certified && enabled;

  return <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6 space-y-5">
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <ShieldCheck className="w-6 h-6 text-blue-600 shrink-0" />
        <div><h4 className="font-semibold text-gray-900">Techsafe Integration</h4>
          <p className="text-sm text-gray-600">Approved MJV Sales Orders → Techsafe draft plans.</p></div>
      </div>
      <button type="button" onClick={() => void refresh()} disabled={loading}
        className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:opacity-50">
        <RefreshCw className="w-4 h-4" />Refresh
      </button>
    </div>
    {!loading && !error && ready ? (
      <div className="rounded-md border border-green-200 bg-green-50 p-4 text-sm text-green-900">
        All reported readiness gates are satisfied. This is a status report, not proof of a successful Sales Order delivery.
      </div>
    ) : (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 flex gap-3">
        <AlertTriangle className="w-5 h-5 shrink-0 text-amber-700" />
        <div className="text-sm text-amber-900"><strong>Automatic synchronization is not verified as ready</strong>
          <p className="mt-1">A registered active connection, certified source reader and enabled server sync are all required. Only active connections can be sent below.</p>
        </div>
      </div>
    )}
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-md border p-4"><p className="font-medium text-sm">Products</p>
        <p className="text-sm text-gray-600 mt-1">Qualifying items at or above the dealer's per-unit selling-price minimum.</p></div>
      <div className="rounded-md border p-4"><p className="font-medium text-sm">Labor</p>
        <p className="text-sm text-gray-600 mt-1">Read-only MJV amount alongside dealer-adjustable draft coverage.</p></div>
    </div>
    <div className="text-sm space-y-2" aria-live="polite">
      <p className="font-medium text-gray-900">Connection diagnostics</p>
      {loading ? <p>Checking server status…</p> : error ? <p className="text-red-700">{error}</p> : status ? <>
        <p>Registered Sales Order connections: <strong>{status.registeredConnections}</strong></p>
        <p>Active connection records: <strong>{status.activeConnections}</strong></p>
        <p>Last connection update: {status.lastConnectionUpdate ? new Date(status.lastConnectionUpdate).toLocaleString() : 'None'}</p>
        <p>Active connection: <strong>{hasConnection ? 'Present' : 'Missing'}</strong></p>
        <p>Trusted source reader: <strong>{certified ? 'Certified' : 'Not certified'}</strong></p>
        <p>Live draft sync: <strong>{enabled ? 'Enabled' : 'Disabled'}</strong></p>
      </> : null}
    </div>
    <div className="border-t pt-5 space-y-3" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h5 className="font-semibold text-gray-900">Live sender readiness</h5>
          <p className="text-sm text-gray-600">Read-only check of the deployed Edge Function. No credentials are displayed or changed.</p>
        </div>
        <button type="button" onClick={() => void checkConnection()} disabled={checkingSender}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium disabled:opacity-50">
          {checkingSender ? 'Checking…' : 'Check Connection'}
        </button>
      </div>
      {senderError && <p className="text-sm text-red-700" role="alert">{senderError}</p>}
      {senderReadiness && <div className="rounded-md border border-gray-200 p-3 text-sm space-y-1">
        <p>Sender: <strong>{senderReadiness.senderEnabled ? 'Enabled' : 'Disabled'}</strong></p>
        <p>Environment: <strong>{senderReadiness.environment}</strong></p>
        <p>Private database: <strong>{senderReadiness.privateDatabaseConfigured ? 'Configured' : 'Not configured'}</strong></p>
        <p>Receiver credentials: <strong>{senderReadiness.receiverCredentialsPresent ? 'Present' : 'Missing'}</strong></p>
        <p>Sender runtime: <strong>{senderReadiness.senderReady ? 'Configured' : 'Not ready'}</strong></p>
        <p className="text-xs text-gray-500">This does not confirm an active pairing, valid receiver token, or successful import.</p>
      </div>}
    </div>
    <TechsafeOrderSync />
    <p className="text-xs text-gray-500">Organization-scoped diagnostics. A connection record alone does not certify a source reader or enable customer data transfer. No credentials or customer data are shown.</p>
  </section>;
}
