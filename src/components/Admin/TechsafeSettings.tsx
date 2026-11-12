import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type Status = { registeredConnections: number; activeConnections: number; lastConnectionUpdate: string | null; liveSyncEnabled: boolean; sourceReaderCertified: boolean };
export function TechsafeSettings() {
  const [status,setStatus] = useState<Status | null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const refresh = useCallback(async () => {
    setLoading(true);setError('');
    const {data,error} = await supabase.rpc('get_techsafe_integration_status');
    if(error){setStatus(null);setError('Unable to verify Techsafe connection status.');}
    else setStatus(data as Status);
    setLoading(false);
  },[]);
  useEffect(()=>{void refresh();},[refresh]);
  return <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6 space-y-5">
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3"><ShieldCheck className="w-6 h-6 text-blue-600 shrink-0" />
        <div><h4 className="font-semibold text-gray-900">Techsafe Integration</h4>
          <p className="text-sm text-gray-600">Approved MJV Sales Orders → Techsafe draft plans.</p></div></div>
      <button type="button" onClick={()=>void refresh()} disabled={loading} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm disabled:opacity-50"><RefreshCw className="w-4 h-4" />Refresh</button>
    </div>
    <div className="rounded-md border border-amber-200 bg-amber-50 p-4 flex gap-3">
      <AlertTriangle className="w-5 h-5 shrink-0 text-amber-700" />
      <div className="text-sm text-amber-900"><strong>Automatic synchronization is not enabled</strong>
        <p className="mt-1">Source certification and end-to-end receiver verification are required before sending customer data.</p></div>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-md border p-4"><p className="font-medium text-sm">Products</p><p className="text-sm text-gray-600 mt-1">Qualifying items at or above the dealer's per-unit selling-price minimum.</p></div>
      <div className="rounded-md border p-4"><p className="font-medium text-sm">Labor</p><p className="text-sm text-gray-600 mt-1">Read-only MJV amount alongside dealer-adjustable draft coverage.</p></div>
    </div>
    <div className="text-sm space-y-2" aria-live="polite">
      <p className="font-medium text-gray-900">Connection diagnostics</p>
      {loading ? <p>Checking server status…</p> : error ? <p className="text-red-700">{error}</p> : status ? <>
        <p>Registered Sales Order connections: <strong>{status.registeredConnections}</strong></p>
        <p>Active connection records: <strong>{status.activeConnections}</strong></p>
        <p>Last connection update: {status.lastConnectionUpdate ? new Date(status.lastConnectionUpdate).toLocaleString() : 'None'}</p>
        <p>Trusted source reader: {status.sourceReaderCertified ? 'Certified' : 'Not certified'}</p>
        <p>Live draft sync: {status.liveSyncEnabled ? 'Enabled' : 'Disabled'}</p>
      </> : null}
    </div>
    <p className="text-xs text-gray-500">Connection counts are scoped to your organization. No secrets or customer data are exposed here.</p>
  </section>;
}
