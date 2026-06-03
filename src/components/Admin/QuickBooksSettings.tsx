import { useState, useEffect } from 'react';
import { DollarSign, CheckCircle, XCircle, ExternalLink, Download, Users, RefreshCw, Eye, ArrowUpDown } from 'lucide-react';
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
  const [settings, setSettings] = useState<QBSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStats, setSyncStats] = useState<{
    complete: number;
    partial: number;
    minimal: number;
    pending: number;
  } | null>(null);
  const [showCustomerBrowser, setShowCustomerBrowser] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  useEffect(() => {
    loadSettings();
    loadSyncStats();

    const params = new URLSearchParams(window.location.search);
    const qboStatus = params.get('qbo');
    if (qboStatus === 'success') {
      alert('QuickBooks connected successfully!');
      window.history.replaceState({}, '', '/admin/settings');
      loadSettings();
      loadSyncStats();
    } else if (qboStatus === 'error') {
      alert('Failed to connect to QuickBooks. Please try again.');
      window.history.replaceState({}, '', '/admin/settings');
    }
  }, []);

  async function loadSettings() {
    try {
      const { data, error } = await supabase
        .from('quickbooks_settings')
        .select('*')
        .maybeSingle();

      if (error) throw error;
      setSettings(data);
    } catch (error) {
      console.error('Error loading QuickBooks settings:', error);
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

  async function handleConnect() {
    setConnecting(true);
    try {
      const clientId = import.meta.env.VITE_QUICKBOOKS_CLIENT_ID;
      const redirectUri = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-oauth-callback`;

      if (!clientId) {
        alert('QuickBooks is not configured. Please contact your administrator.');
        return;
      }

      const authUrl = new URL('https://appcenter.intuit.com/connect/oauth2');
      authUrl.searchParams.set('client_id', clientId);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', 'com.intuit.quickbooks.accounting');
      authUrl.searchParams.set('state', Math.random().toString(36).substring(7));

      window.location.href = authUrl.toString();
    } catch (error) {
      console.error('Error connecting to QuickBooks:', error);
      alert('Failed to initiate QuickBooks connection');
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    try {
      if (settings?.id) {
        await supabase
          .from('quickbooks_settings')
          .update({ is_connected: false })
          .eq('id', settings.id);
      }

      await loadSettings();
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

      await loadSettings();
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

      await loadSettings();
      alert(`Auto-sync to QuickBooks ${newValue ? 'enabled' : 'disabled'} successfully`);
    } catch (error) {
      console.error('Error toggling auto-sync:', error);
      alert('Failed to update auto-sync setting');
    }
  }

  async function handleSyncNow() {
    setSyncing(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-fetch-customers`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const result = await response.json();

      if (result.success) {
        alert(result.message || 'Customer sync complete');
        await loadSettings();
        await loadSyncStats();
      } else {
        throw new Error(result.error || 'Failed to sync customers');
      }
    } catch (error) {
      console.error('Error syncing customers:', error);
      alert('Failed to sync customers: ' + (error as Error).message);
    } finally {
      setSyncing(false);
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
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
                    <CheckCircle className="w-3 h-3" />
                    Connected
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
                <p className="text-xs text-gray-500 mt-1">
                  Company ID: {settings.realm_id}
                </p>
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
                onClick={handleConnect}
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
            loadSettings();
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
