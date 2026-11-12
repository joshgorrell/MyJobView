import { useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react';

/** Read-only integration readiness panel. Connection registration and credentials
 * are server-owned; never infer connectivity from browser configuration. */
export function TechsafeSettings() {
  const [checked, setChecked] = useState(false);
  return <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6 space-y-5">
    <div className="flex items-start gap-3">
      <ShieldCheck className="w-6 h-6 text-blue-600 shrink-0" />
      <div><h4 className="font-semibold text-gray-900">Techsafe Integration</h4>
        <p className="text-sm text-gray-600">Connect approved MJV Sales Orders to Techsafe dealer draft plans.</p></div>
    </div>
    <div className="rounded-md border border-amber-200 bg-amber-50 p-4 flex gap-3">
      <AlertTriangle className="w-5 h-5 shrink-0 text-amber-700" />
      <div className="text-sm text-amber-900"><strong>Connection not verified</strong>
        <p className="mt-1">This screen does not yet have a secured server-side connection status endpoint. Draft synchronization and plan purchases cannot be activated from this page.</p></div>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-md border p-4"><p className="font-medium text-sm">Products</p><p className="text-sm text-gray-600 mt-1">Approved Sales Order items meeting the dealer's per-unit selling-price minimum.</p></div>
      <div className="rounded-md border p-4"><p className="font-medium text-sm">Labor</p><p className="text-sm text-gray-600 mt-1">MJV labor stays read-only; the dealer can set separate draft coverage. Purchased coverage is locked.</p></div>
    </div>
    <div className="text-sm text-gray-600 space-y-2">
      <p className="font-medium text-gray-900">Integration diagnostics</p>
      <p>Server connection: Not verified</p><p>Approved Sales Order source reader: Not certified for live sync</p>
      <p>Draft sync: Not enabled</p><p>Purchased plan changes: Blocked by policy</p>
    </div>
    <p className="text-xs text-gray-500">No credentials, customer records, or plan data are sent from this settings panel.</p>
  </section>;
}
