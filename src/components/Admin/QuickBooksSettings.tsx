import { useState, useEffect } from 'react';
import { DollarSign, CheckCircle, XCircle, ExternalLink, Download, Users, RefreshCw, Eye, ArrowUpDown, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { QuickBooksSettings as QBSettings } from '../../lib/types';
import { useAuth } from '../../contexts/AuthContext';
import { QuickBooksCustomerBrowser } from './QuickBooksCustomerBrowser';
import ConfirmModal from '../ui/ConfirmModal';

interface QBCustomer {
  id: string;
  displayName: string;
  givenName: string | null;
  familyName: string | null;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  balance: number;
  active: boolean;
}

export function QuickBooksSettings() {
  const { profile } = useAuth();
  const [settings, setSettings] = useState<Omit<QBSettings, 'access_token' | 'refresh_token' | 'token_expires_at'> | null>(null);
  const [loading, setLoading] = useState(true);
  const [monitoringItem, setMonitoringItem] = useState('');
  const [monitoringMessage, setMonitoringMessage] = useState('');
  const [billingItems, setBillingItems] = useState<Array<{id:string;name:string;income_account:string}>>([]);
  const [billingBusy, setBillingBusy] = useState(false);
  const [settingsError, setSettingsError] = useState(false);
  const [connectionResult] = useState(() => new URLSearchParams(window.location.search).get('qbo'));
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [syncStats, setSyncStats] = useState<{
    complete: number;
    partial: number;
    minimal: number;
    pending: number;
  } | null>(null);
  const [showCustomerBrowser, setShowCustomerBrowser] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  useEffect(() => {
    if (!profile?.organization_id) return;

    loadSettings(profile.organization_id);
    loadSyncStats();

  }, [profile?.organization_id]);

  async function loadSettings(organizationId: string) {
    setSettingsError(false);
    try {
      const { data, error } = await supabase
        .from('quickbooks_settings')
        .select('security_monitoring_item_id, payments_enabled, id, realm_id, is_connected, environment, company_name, auto_import_customers, auto_import_complete_data, auto_sync_enabled, last_customer_sync_at, last_invoice_sync_at, last_payment_sync_at, last_reconciliation_at, last_fetch_count, last_fetch_completed_at, last_webhook_at, last_synced_at, sync_health, invoice_sync_status, payment_sync_status, customer_sync_status, last_error, organization_id, created_at, updated_at')
        .eq('organization_id', organizationId)
        .abortSignal(AbortSignal.timeout(15000))
        .maybeSingle();

      if (error) throw error;
      setSettings(data);
      setMonitoringItem(data?.security_monitoring_item_id || "");
    } catch (error) {
      console.error('Error loading QuickBooks settings:', error);
      setSettingsError(true);
    } finally {
      setLoading(false);
    }
  }

  async function loadSyncStats() {
    try {
      const { data, error } = await supabase
        .from('quickbooks_staged_customers')
        .select('completeness_status, import_status');

      if (error) throw error;

      if (data) {
        const stats = {
          complete: data.filter(c => c.completeness_status === 'complete' && c.import_status === 'pending').length,
          partial: data.filter(c => c.completeness_status === 'partial' && c.import_status === 'pending').length,
          minimal: data.filter(c => c.completeness_status === 'minimal' && c.import_status === 'pending').length,
          pending: data.filter(c => c.import_status === 'pending').length,
        };
        setSyncStats(stats);
      }
    } catch (error) {
      console.error('Error loading sync stats:', error);
    }
  }

  async function handleConnect(includePayments = false) {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('quickbooks-oauth-initiate', {body:{includePayments}});
      if (error || !data?.authorizationUrl) {
        throw new Error('Unable to start QuickBooks connection');
      }
      window.location.assign(data.authorizationUrl);
    } catch (error) {
      console.error('Error connecting to QuickBooks:', error);
      alert('Failed to initiate QuickBooks connection');
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    try {
      const { error } = await supabase.functions.invoke('quickbooks-disconnect', { body: {} });
      if (error) throw error;
      await loadSettings(profile?.organization_id ?? '');
    } catch (error) {
      console.error('Error disconnecting QuickBooks:', error);
      alert('Failed to disconnect QuickBooks');
    }
  }

  async function handleToggleAutoImport() {
    if (!settings?.id) return;

    try {
      const newValue = !settings.auto_import_complete_data;
      await supabase
        .from('quickbooks_settings')
        .update({ auto_import_complete_data: newValue })
        .eq('id', settings.id);

      await loadSettings(profile?.organization_id ?? '');
      alert(`Auto-import of complete customers ${newValue ? 'enabled' : 'disabled'} successfully`);
    } catch (error) {
      console.error('Error toggling auto-import:', error);
      alert('Failed to update auto-import setting');
    }
  }

  async function handleToggleAutoSync() {
    if (!settings?.id) return;

    try {
      const newValue = !settings.auto_sync_enabled;
      await supabase
        .from('quickbooks_settings')
        .update({ auto_sync_enabled: newValue })
        .eq('id', settings.id);

      await loadSettings(profile?.organization_id ?? '');
      alert(`Auto-sync to QuickBooks ${newValue ? 'enabled' : 'disabled'} successfully`);
    } catch (error) {
      console.error('Error toggling auto-sync:', error);
      alert('Failed to update auto-sync setting');
    }
  }

  async function handleSyncNow() {
    setSyncing(true);
    try {
      const syncFunctions = ['quickbooks-sync-customer', 'quickbooks-sync-invoices', 'quickbooks-sync-payments'];
      for (const functionName of syncFunctions) {
        const { data: result, error } = await supabase.functions.invoke(functionName, { body: { runType: 'manual' } });
        if (error || !result?.success) throw new Error(`The ${functionName.replace('quickbooks-sync-', '')} sync failed`);
      }
      alert('Customer, invoice, and payment synchronization completed.');
      await loadSettings(profile?.organization_id ?? '');
      await loadSyncStats();
    } catch (error) {
      console.error('Error syncing QuickBooks:', error);
      alert('QuickBooks synchronization could not be completed.');
    } finally {
      setSyncing(false);
    }
  }

  async function handleReconcile() {
    setReconciling(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('quickbooks-reconcile', { body: {} });
      if (error || !result?.success) throw new Error('Reconciliation failed');
      alert(`Read-only reconciliation completed with ${result.counts?.discrepancies || 0} discrepancies for review.`);
      await loadSettings(profile?.organization_id ?? '');
    } catch (error) {
      console.error('Error reconciling QuickBooks:', error);
      alert('Read-only reconciliation could not be completed.');
    } finally {
      setReconciling(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const isConnected = settings?.is_connected;

  return (
    <div className="space-y-6">
      {connectionResult === 'success' && !settingsError && settings?.is_connected && <div role="status" className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-900">QuickBooks authorization saved. Accounting is connected; Payments is {settings.payments_enabled ? 'connected' : 'not connected'}{settings.environment === 'sandbox' ? ' in sandbox (test mode)' : ' in production'}.</div>}
      {connectionResult === 'error' && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-900">QuickBooks authorization did not complete. Your previous connection status is shown below. Try connecting again.</div>}
      <button type="button" disabled={loading} onClick={() => { if (profile?.organization_id) void loadSettings(profile.organization_id); }} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900"><RefreshCw className="h-4 w-4" />Refresh connection status</button>
      {settings?.is_connected && <div className="rounded-lg border p-4 space-y-3">
        <label className="block font-medium" htmlFor="security-qbo-item">QuickBooks reference item for monitoring/service income</label>
        <div className="flex flex-col sm:flex-row gap-2">
          <select id="security-qbo-item" value={monitoringItem} onChange={e => setMonitoringItem(e.target.value)} disabled={billingBusy || profile?.role !== 'admin'} className="min-w-0 w-full rounded-lg border border-gray-300 bg-white p-3 text-gray-900 [color-scheme:light]">
            <option value="">Choose the income reference service item</option>
            {monitoringItem && !billingItems.some(i=>i.id===monitoringItem) && <option value={monitoringItem}>Saved reference item ({monitoringItem}) — load items to view its account</option>}
            {billingItems.map(item=><option key={item.id} value={item.id}>{item.name} · {item.income_account}</option>)}
          </select>
          <button type="button" disabled={billingBusy || profile?.role !== 'admin'} className="shrink-0 rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 disabled:opacity-50" onClick={async()=>{
            setBillingBusy(true);setMonitoringMessage('');
            try {
              const {data,error}=await supabase.functions.invoke('security-qbo-billing-setup',{body:{action:'list'}});
              if(error || data?.error) throw new Error(data?.error || 'QuickBooks service items could not be loaded. Please retry.');
              setBillingItems(data.items);
              if(!data.items.length) setMonitoringMessage('No eligible service items found. Create a service item with the correct income account in QuickBooks, then load items again.');
            } catch(e) {setMonitoringMessage(e instanceof Error?e.message:'Items could not be loaded.');}
            finally {setBillingBusy(false);}
          }}>{billingBusy ? 'Loading…' : 'Load QuickBooks items'}</button>
        </div>
        <p className="text-sm text-gray-600">Select an existing QuickBooks service item whose income account should be used for new monitoring and additional service items. Invoice lines use separate items matching the services selected on the agreement; this reference item is not used to combine them. Payments access and tax classification must also be configured before billing.</p>
        <button type="button" disabled={billingBusy || !billingItems.some(i=>i.id===monitoringItem) || profile?.role !== 'admin'} className="rounded bg-blue-700 text-white px-4 py-2 disabled:opacity-50" onClick={async () => {
          if (profile?.role !== 'admin') { setMonitoringMessage('Only Admin can configure monitoring billing.'); return; }
          setBillingBusy(true);
          try {
            const {data,error}=await supabase.functions.invoke('security-qbo-billing-setup',{body:{action:'save',itemId:monitoringItem}});
            if(error || data?.error) throw new Error(data?.error || 'Billing setup could not be saved. Please retry.');
            setMonitoringMessage(`Saved: ${data.item.name} · ${data.item.income_account}`);
          } catch(e) {setMonitoringMessage(e instanceof Error?e.message:'Billing setup could not be saved.');}
          finally {setBillingBusy(false);}
        }}>Save monitoring item</button>
        {monitoringMessage && <p role="status">{monitoringMessage}</p>}
      </div>}
      {settingsError && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">QuickBooks status could not be loaded</p>
            <p className="mt-1 text-sm">Refresh the page and try again. Your connection has not been changed.</p>
          </div>
        </div>
      )}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">QuickBooks Online Integration</h3>
        <p className="text-sm text-gray-600">
          Connect your QuickBooks Online account to sync customers and create invoices
        </p>
      </div>

      <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
              isConnected ? 'bg-green-100' : 'bg-gray-200'
            }`}>
              <DollarSign className={`w-6 h-6 ${
                isConnected ? 'text-green-600' : 'text-gray-400'
              }`} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-semibold text-gray-900">QuickBooks Online</h4>
                {isConnected ? (
                  <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded ${settings?.sync_health === 'error' ? 'bg-red-100 text-red-700' : settings?.sync_health === 'degraded' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-700'}`}>
                    {settings?.sync_health === 'error' ? <XCircle className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
                    {settings?.sync_health === 'error' ? 'Needs Attention' : settings?.sync_health === 'degraded' ? 'Degraded' : 'Connected'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-200 text-gray-700 text-xs font-medium rounded">
                    <XCircle className="w-3 h-3" />
                    Not Connected
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600">
                {isConnected
                  ? 'Your QuickBooks account is connected and ready to use'
                  : 'Connect to sync leads as customers and create invoices'
                }
              </p>
              {isConnected && settings?.realm_id && (
                <div className="mt-1 space-y-1">
                  <p className="text-xs text-gray-500">{settings.company_name || 'Connected company'} · {settings.environment === 'production' ? 'Production' : 'Sandbox'}</p>
                  <p className="text-xs text-gray-500">Realm ID: {settings.realm_id}</p>
                </div>
              )}
            </div>
          </div>

          <div>
            {isConnected ? (
              <button
                onClick={() => setConfirmDisconnect(true)}
                className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium border border-red-300"
              >
                Disconnect
              </button>
            ) : (
              <button
                onClick={() => void handleConnect()}
                disabled={connecting}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                {connecting ? 'Connecting...' : 'Connect to QuickBooks'}
              </button>
            )}
          </div>
        </div>
      </div>

      {isConnected && (
        <>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-blue-900">QuickBooks Payments: {settings?.payments_enabled ? 'Connected' : 'Not connected'}</h3>
            {settings?.environment === 'sandbox' && <p className="text-sm text-amber-900">This connection uses the QuickBooks sandbox. It is for testing and cannot collect live customer payments.</p>}
            <p className="text-sm text-blue-900">Connecting QuickBooks Accounting does not automatically enable payment enrollment. Security onboarding requires QuickBooks Payments access to save cards or bank accounts and select existing payment methods. Your Intuit app and merchant account must support Payments.</p>
            <button onClick={()=>void handleConnect(true)} disabled={connecting} className="px-4 py-2 bg-blue-900 text-white rounded-lg disabled:opacity-50">{settings?.payments_enabled ? 'Reconnect QuickBooks Payments' : 'Connect QuickBooks Payments'}</button>
          </div>
          <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-blue-900 flex items-center gap-2">
                <ArrowUpDown className="w-4 h-4" />
                Bidirectional Sync
              </h4>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings?.auto_import_complete_data ?? false}
                    onChange={handleToggleAutoImport}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-blue-900">Auto-Import from QuickBooks</span>
                </label>
                <p className="text-xs text-blue-700 ml-6">
                  Automatically import customers with complete data from QuickBooks to Contacts
                </p>
              </div>
              <div className="space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings?.auto_sync_enabled ?? false}
                    onChange={handleToggleAutoSync}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-blue-900">Auto-Sync to QuickBooks</span>
                </label>
                <p className="text-xs text-blue-700 ml-6">
                  Automatically create QuickBooks customers when you add contacts with complete data
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-purple-900 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Customer Sync Status
              </h4>
              <button
                onClick={handleSyncNow}
                disabled={syncing}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
              >
                <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Fetching...' : 'Fetch from QuickBooks'}
              </button>
            </div>

            {syncStats && syncStats.pending > 0 && (
              <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-white rounded-lg p-3 border border-green-200">
                  <div className="text-2xl font-bold text-green-600">{syncStats.complete}</div>
                  <div className="text-xs text-gray-600">Complete - Ready to Import</div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-yellow-200">
                  <div className="text-2xl font-bold text-yellow-600">{syncStats.partial}</div>
                  <div className="text-xs text-gray-600">Partial - Needs Review</div>
                </div>
                <div className="bg-white rounded-lg p-3 border border-red-200">
                  <div className="text-2xl font-bold text-red-600">{syncStats.minimal}</div>
                  <div className="text-xs text-gray-600">Minimal - Insufficient Data</div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {settings?.last_customer_sync_at && (
                <p className="text-xs text-purple-700">
                  Last fetch: {new Date(settings.last_customer_sync_at).toLocaleString()}
                  {settings?.last_fetch_count && ` (${settings.last_fetch_count} customers)`}
                </p>
              )}

              {syncStats && syncStats.pending > 0 ? (
                <button
                  onClick={() => setShowCustomerBrowser(true)}
                  className="w-full px-4 py-2 bg-white border-2 border-purple-600 text-purple-600 rounded-lg hover:bg-purple-50 transition-colors font-medium flex items-center justify-center gap-2 text-sm"
                >
                  <Eye className="w-4 h-4" />
                  Review {syncStats.pending} Pending Customers
                </button>
              ) : (
                <p className="text-sm text-purple-800 text-center py-2">
                  No pending customers. All QuickBooks customers are synced.
                </p>
              )}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-gray-900">Connection Health</h4>
              <div className="flex gap-2">
                <button onClick={handleReconcile} disabled={reconciling} className="px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50">{reconciling ? 'Reconciling...' : 'Read-only Reconcile'}</button>
                <button onClick={handleSyncNow} disabled={syncing} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">{syncing ? 'Syncing...' : 'Sync Now'}</button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600">
              <p>Last successful sync: {settings?.last_synced_at ? new Date(settings.last_synced_at).toLocaleString() : 'Not yet recorded'}</p>
              <p>Last QBO webhook: {settings?.last_webhook_at ? new Date(settings.last_webhook_at).toLocaleString() : 'Not yet received'}</p>
              <p>Last reconciliation: {settings?.last_reconciliation_at ? new Date(settings.last_reconciliation_at).toLocaleString() : 'Not yet run'}</p>
              <p>Customer sync: {settings?.customer_sync_status || 'Idle'}</p>
              <p>Invoice sync: {settings?.invoice_sync_status || 'Idle'}</p>
              <p>Payment sync: {settings?.payment_sync_status || 'Idle'}</p>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-2">How Bidirectional Sync Works:</h4>
            <div className="space-y-2 text-sm text-blue-800">
              <div>
                <strong>QuickBooks → MyJobView:</strong>
                <ul className="ml-4 mt-1 space-y-1">
                  <li>• Customers with complete data are automatically imported as contacts</li>
                  <li>• Customers with incomplete data are staged for manual review</li>
                  <li>• Click "Review Pending Customers" to import staged customers</li>
                </ul>
              </div>
              <div>
                <strong>MyJobView → QuickBooks:</strong>
                <ul className="ml-4 mt-1 space-y-1">
                  <li>• New contacts with complete data are automatically synced to QuickBooks</li>
                  <li>• Contacts require: name + (email or phone) to sync</li>
                  <li>• Sync happens immediately when contact is created</li>
                </ul>
              </div>
            </div>
          </div>
        </>
      )}

      {!isConnected && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-2">Setup Instructions:</h4>
          <ol className="space-y-2 text-sm text-gray-600">
            <li>1. Click "Connect to QuickBooks" above</li>
            <li>2. Sign in to your QuickBooks Online account</li>
            <li>3. Authorize the connection to allow access</li>
            <li>4. You'll be redirected back here once connected</li>
          </ol>
          <p className="text-xs text-gray-500 mt-3">
            Note: You need admin permissions in your QuickBooks account to connect
          </p>
        </div>
      )}

      {showCustomerBrowser && (
        <QuickBooksCustomerBrowser
          onClose={() => setShowCustomerBrowser(false)}
          onImportComplete={() => {
            loadSettings(profile?.organization_id ?? '');
            loadSyncStats();
          }}
        />
      )}

      <ConfirmModal
        isOpen={confirmDisconnect}
        title="Disconnect QuickBooks"
        message="Are you sure you want to disconnect QuickBooks?"
        variant="danger"
        confirmLabel="Disconnect"
        onConfirm={() => {
          setConfirmDisconnect(false);
          handleDisconnect();
        }}
        onCancel={() => setConfirmDisconnect(false)}
      />
    </div>
  );
}
