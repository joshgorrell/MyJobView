import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { DollarSign, Map, Calendar, MessageSquare, Save, ExternalLink, Sparkles, Mail, Eye, EyeOff, AlertTriangle, CreditCard, Check, ChevronRight } from 'lucide-react';
import { QuickBooksSettings } from './QuickBooksSettings';

interface CompanySettings {
  google_maps_api_key?: string;
  twilio_account_sid?: string;
  twilio_auth_token?: string;
  twilio_phone_number?: string;
  on_my_way_sms_template?: string;
  openai_api_key?: string;
  ai_assistant_enabled?: boolean;
  from_email?: string;
  from_name?: string;
  reply_to_email?: string;
  google_maps_api_key_updated_at?: string;
  twilio_auth_token_updated_at?: string;
  openai_api_key_updated_at?: string;
}

interface OrgPaymentSettings {
  payment_processor: 'quickbooks' | 'stripe' | 'bill_com' | null;
  stripe_invoice_publishable_key: string | null;
  stripe_invoice_secret_key: string | null;
  bill_com_org_id: string | null;
  bill_com_api_key: string | null;
  payment_processor_updated_at: string | null;
}

export function IntegrationsSettings() {
  const [activeIntegration, setActiveIntegration] = useState<'payment_processor' | 'quickbooks' | 'google_maps' | 'google_calendar' | 'twilio' | 'openai' | 'resend'>('payment_processor');
  const [settings, setSettings] = useState<CompanySettings>({});
  const [originalSettings, setOriginalSettings] = useState<CompanySettings>({});
  const [loading, setLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [changedKeys, setChangedKeys] = useState<string[]>([]);

  // Show/hide toggles for password fields
  const [showGoogleMapsKey, setShowGoogleMapsKey] = useState(false);
  const [showTwilioToken, setShowTwilioToken] = useState(false);
  const [showOpenAIKey, setShowOpenAIKey] = useState(false);

  // Payment processor state (stored on organizations table)
  const [orgId, setOrgId] = useState<string | null>(null);
  const [paymentSettings, setPaymentSettings] = useState<OrgPaymentSettings>({
    payment_processor: null,
    stripe_invoice_publishable_key: null,
    stripe_invoice_secret_key: null,
    bill_com_org_id: null,
    bill_com_api_key: null,
    payment_processor_updated_at: null,
  });
  const [originalPaymentSettings, setOriginalPaymentSettings] = useState<OrgPaymentSettings>({
    payment_processor: null,
    stripe_invoice_publishable_key: null,
    stripe_invoice_secret_key: null,
    bill_com_org_id: null,
    bill_com_api_key: null,
    payment_processor_updated_at: null,
  });
  const [showStripeSecret, setShowStripeSecret] = useState(false);
  const [showBillComKey, setShowBillComKey] = useState(false);
  const [paymentSaveMessage, setPaymentSaveMessage] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [showPaymentConfirmDialog, setShowPaymentConfirmDialog] = useState(false);

  useEffect(() => {
    loadSettings();
    loadPaymentSettings();
  }, []);

  async function loadSettings() {
    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select('google_maps_api_key, twilio_account_sid, twilio_auth_token, twilio_phone_number, on_my_way_sms_template, openai_api_key, ai_assistant_enabled, from_email, from_name, reply_to_email, google_maps_api_key_updated_at, twilio_auth_token_updated_at, openai_api_key_updated_at')
        .single();

      if (error) throw error;
      if (data) {
        setSettings(data);
        setOriginalSettings(data);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  async function loadPaymentSettings() {
    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, payment_processor, stripe_invoice_publishable_key, stripe_invoice_secret_key, bill_com_org_id, bill_com_api_key, payment_processor_updated_at')
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setOrgId(data.id);
        const ps: OrgPaymentSettings = {
          payment_processor: data.payment_processor || null,
          stripe_invoice_publishable_key: data.stripe_invoice_publishable_key || null,
          stripe_invoice_secret_key: data.stripe_invoice_secret_key || null,
          bill_com_org_id: data.bill_com_org_id || null,
          bill_com_api_key: data.bill_com_api_key || null,
          payment_processor_updated_at: data.payment_processor_updated_at || null,
        };
        setPaymentSettings(ps);
        setOriginalPaymentSettings(ps);
      }
    } catch (error) {
      console.error('Error loading payment settings:', error);
    }
  }

  function checkForChangedAPIKeys() {
    const changed: string[] = [];

    if (originalSettings.google_maps_api_key && settings.google_maps_api_key !== originalSettings.google_maps_api_key) {
      changed.push('Google Maps API Key');
    }
    if (originalSettings.twilio_auth_token && settings.twilio_auth_token !== originalSettings.twilio_auth_token) {
      changed.push('Twilio Auth Token');
    }
    if (originalSettings.openai_api_key && settings.openai_api_key !== originalSettings.openai_api_key) {
      changed.push('OpenAI API Key');
    }

    return changed;
  }

  function handleSaveClick() {
    const changed = checkForChangedAPIKeys();
    if (changed.length > 0) {
      setChangedKeys(changed);
      setShowConfirmDialog(true);
    } else {
      saveSettings();
    }
  }

  function handlePaymentSaveClick() {
    const hasExistingProcessor = originalPaymentSettings.payment_processor !== null;
    const processorChanged = paymentSettings.payment_processor !== originalPaymentSettings.payment_processor;
    if (hasExistingProcessor && processorChanged && paymentSettings.payment_processor !== null) {
      setShowPaymentConfirmDialog(true);
    } else {
      savePaymentSettings();
    }
  }

  async function savePaymentSettings() {
    if (!orgId) return;
    setPaymentLoading(true);
    setPaymentSaveMessage('');
    setShowPaymentConfirmDialog(false);

    try {
      const updateData: any = {
        payment_processor: paymentSettings.payment_processor,
        stripe_invoice_publishable_key: paymentSettings.stripe_invoice_publishable_key || null,
        stripe_invoice_secret_key: paymentSettings.stripe_invoice_secret_key || null,
        bill_com_org_id: paymentSettings.bill_com_org_id || null,
        bill_com_api_key: paymentSettings.bill_com_api_key || null,
        payment_processor_updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('organizations')
        .update(updateData)
        .eq('id', orgId);

      if (error) throw error;

      await loadPaymentSettings();
      setPaymentSaveMessage('Payment processor saved!');
      setTimeout(() => setPaymentSaveMessage(''), 3000);
    } catch (error) {
      console.error('Error saving payment settings:', error);
      setPaymentSaveMessage('Error saving payment settings');
    } finally {
      setPaymentLoading(false);
    }
  }

  async function saveSettings() {
    setLoading(true);
    setSaveMessage('');
    setShowConfirmDialog(false);

    try {
      const { data: currentSettings } = await supabase
        .from('company_settings')
        .select('id')
        .maybeSingle();

      if (currentSettings?.id) {
        // Build the update object with timestamp tracking
        const updateData: any = { ...settings };

        // Update timestamps for changed API keys
        if (settings.google_maps_api_key !== originalSettings.google_maps_api_key) {
          updateData.google_maps_api_key_updated_at = new Date().toISOString();
        }
        if (settings.twilio_auth_token !== originalSettings.twilio_auth_token) {
          updateData.twilio_auth_token_updated_at = new Date().toISOString();
        }
        if (settings.openai_api_key !== originalSettings.openai_api_key) {
          updateData.openai_api_key_updated_at = new Date().toISOString();
        }

        const { error } = await supabase
          .from('company_settings')
          .update(updateData)
          .eq('id', currentSettings.id);

        if (error) throw error;

        // Reload to get updated timestamps
        await loadSettings();
      }

      setSaveMessage('Settings saved successfully!');
      setTimeout(() => setSaveMessage(''), 3000);
    } catch (error) {
      console.error('Error saving settings:', error);
      setSaveMessage('Error saving settings');
    } finally {
      setLoading(false);
    }
  }

  function formatTimestamp(timestamp?: string) {
    if (!timestamp) return 'Not configured yet';

    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-1">Third-Party Integrations</h3>
        <p className="text-sm text-gray-600">Connect and configure external services</p>
      </div>

      {/* Warning Banner */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
          <div>
            <h5 className="font-medium text-yellow-900 mb-1">Important: Verify API Keys Before Saving</h5>
            <p className="text-sm text-yellow-700">
              Password managers may auto-fill these fields incorrectly. Always verify the values using the show/hide toggles before saving changes to avoid overwriting your API keys.
            </p>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Confirm API Key Changes</h3>
                <p className="text-sm text-gray-600 mb-3">
                  You're about to overwrite the following API keys:
                </p>
                <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 mb-4">
                  {changedKeys.map((key) => (
                    <li key={key}>{key}</li>
                  ))}
                </ul>
                <p className="text-sm text-gray-600">
                  Are you sure you want to continue?
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setShowConfirmDialog(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={saveSettings}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Yes, Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Processor Confirm Dialog */}
      {showPaymentConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Change Payment Processor?</h3>
                <p className="text-sm text-gray-600 mb-3">
                  You're switching from <strong>{originalPaymentSettings.payment_processor?.replace('_', '.') || 'none'}</strong> to{' '}
                  <strong>{paymentSettings.payment_processor?.replace('_', '.') || 'none'}</strong>.
                </p>
                <p className="text-sm text-gray-500">
                  Existing payment records will not be affected. Future credit card and ACH payments will use the new processor.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setShowPaymentConfirmDialog(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={savePaymentSettings}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Yes, Switch Processor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Integration Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1 flex-wrap -mb-px">
          <button
            onClick={() => setActiveIntegration('payment_processor')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeIntegration === 'payment_processor'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            Payment Processor
            {paymentSettings.payment_processor && (
              <span className="ml-1 px-1.5 py-0.5 text-xs bg-green-100 text-green-700 rounded-full font-medium">Active</span>
            )}
          </button>
          <button
            onClick={() => setActiveIntegration('quickbooks')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeIntegration === 'quickbooks'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            QuickBooks
          </button>
          <button
            onClick={() => setActiveIntegration('google_maps')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeIntegration === 'google_maps'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Map className="w-4 h-4" />
            Google Maps
          </button>
          <button
            onClick={() => setActiveIntegration('google_calendar')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeIntegration === 'google_calendar'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Calendar className="w-4 h-4" />
            Google Calendar
          </button>
          <button
            onClick={() => setActiveIntegration('twilio')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeIntegration === 'twilio'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            Twilio SMS
          </button>
          <button
            onClick={() => setActiveIntegration('resend')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeIntegration === 'resend'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Mail className="w-4 h-4" />
            Email / Resend
          </button>
          <button
            onClick={() => setActiveIntegration('openai')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeIntegration === 'openai'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            OpenAI / ChatGPT
          </button>
        </nav>
      </div>

      {/* Payment Processor Integration */}
      {activeIntegration === 'payment_processor' && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 space-y-6">
          <div>
            <h4 className="text-base font-semibold mb-2 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-blue-600" />
              Payment Processor
            </h4>
            <p className="text-sm text-gray-600">
              Select the payment processor used for credit card and ACH payments on invoices. Only one processor can be active at a time.
            </p>
          </div>

          {/* Processor Selection Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { value: null, label: 'None', description: 'No online payments', icon: null },
              { value: 'quickbooks', label: 'QuickBooks', description: 'Use QuickBooks Payments', icon: <DollarSign className="w-5 h-5 text-green-600" /> },
              { value: 'stripe', label: 'Stripe', description: 'Use Stripe for payments', icon: <CreditCard className="w-5 h-5 text-blue-600" /> },
              { value: 'bill_com', label: 'Bill.com', description: 'Use Bill.com payments', icon: <CreditCard className="w-5 h-5 text-orange-600" /> },
            ].map((option) => {
              const isSelected = paymentSettings.payment_processor === option.value;
              return (
                <button
                  key={String(option.value)}
                  type="button"
                  onClick={() => setPaymentSettings({ ...paymentSettings, payment_processor: option.value as OrgPaymentSettings['payment_processor'] })}
                  className={`relative flex flex-col items-start gap-2 p-4 rounded-lg border-2 text-left transition-all ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {isSelected && (
                    <span className="absolute top-2 right-2">
                      <Check className="w-4 h-4 text-blue-600" />
                    </span>
                  )}
                  <div className="flex items-center gap-2">
                    {option.icon ?? <div className="w-5 h-5 rounded-full bg-gray-200" />}
                    <span className="font-medium text-sm text-gray-900">{option.label}</span>
                  </div>
                  <p className="text-xs text-gray-500">{option.description}</p>
                </button>
              );
            })}
          </div>

          {/* QuickBooks: info panel */}
          {paymentSettings.payment_processor === 'quickbooks' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <DollarSign className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h5 className="font-medium text-green-900 mb-1">Uses Existing QuickBooks Connection</h5>
                  <p className="text-sm text-green-700 mb-3">
                    Credit card and ACH payments will be processed through your connected QuickBooks Payments account. No additional credentials are required here.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveIntegration('quickbooks')}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-green-800 hover:text-green-900"
                  >
                    Go to QuickBooks Settings
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Stripe: credential fields */}
          {paymentSettings.payment_processor === 'stripe' && (
            <div className="space-y-4 border border-gray-200 rounded-lg p-4">
              <h5 className="font-medium text-gray-900">Stripe Credentials</h5>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Publishable Key
                </label>
                <input
                  type="text"
                  name="stripe-publishable-key"
                  autoComplete="off"
                  data-lpignore="true"
                  data-form-type="other"
                  value={paymentSettings.stripe_invoice_publishable_key || ''}
                  onChange={(e) => setPaymentSettings({ ...paymentSettings, stripe_invoice_publishable_key: e.target.value })}
                  placeholder="pk_live_..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                />
                <p className="mt-1 text-xs text-gray-500">Starts with pk_live_ or pk_test_</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Secret Key
                </label>
                <div className="relative">
                  <input
                    type={showStripeSecret ? 'text' : 'password'}
                    name="stripe-secret-key"
                    autoComplete="off"
                    data-lpignore="true"
                    data-form-type="other"
                    value={paymentSettings.stripe_invoice_secret_key || ''}
                    onChange={(e) => setPaymentSettings({ ...paymentSettings, stripe_invoice_secret_key: e.target.value })}
                    placeholder="sk_live_..."
                    className="w-full px-4 py-2 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowStripeSecret(!showStripeSecret)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    {showStripeSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">Starts with sk_live_ or sk_test_</p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-700">
                  Get your API keys from the{' '}
                  <a
                    href="https://dashboard.stripe.com/apikeys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium hover:underline inline-flex items-center gap-0.5"
                  >
                    Stripe Dashboard
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </p>
              </div>

              {paymentSettings.payment_processor_updated_at && (
                <p className="text-xs text-gray-400">
                  Last updated: {formatTimestamp(paymentSettings.payment_processor_updated_at)}
                </p>
              )}
            </div>
          )}

          {/* Bill.com: credential fields */}
          {paymentSettings.payment_processor === 'bill_com' && (
            <div className="space-y-4 border border-gray-200 rounded-lg p-4">
              <h5 className="font-medium text-gray-900">Bill.com Credentials</h5>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Organization ID
                </label>
                <input
                  type="text"
                  name="billcom-org-id"
                  autoComplete="off"
                  value={paymentSettings.bill_com_org_id || ''}
                  onChange={(e) => setPaymentSettings({ ...paymentSettings, bill_com_org_id: e.target.value })}
                  placeholder="Enter your Bill.com Organization ID"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  API Key
                </label>
                <div className="relative">
                  <input
                    type={showBillComKey ? 'text' : 'password'}
                    name="billcom-api-key"
                    autoComplete="off"
                    data-lpignore="true"
                    data-form-type="other"
                    value={paymentSettings.bill_com_api_key || ''}
                    onChange={(e) => setPaymentSettings({ ...paymentSettings, bill_com_api_key: e.target.value })}
                    placeholder="Enter your Bill.com API Key"
                    className="w-full px-4 py-2 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowBillComKey(!showBillComKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    {showBillComKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-xs text-blue-700">
                  Find your credentials in the{' '}
                  <a
                    href="https://developer.bill.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium hover:underline inline-flex items-center gap-0.5"
                  >
                    Bill.com Developer Portal
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </p>
              </div>

              {paymentSettings.payment_processor_updated_at && (
                <p className="text-xs text-gray-400">
                  Last updated: {formatTimestamp(paymentSettings.payment_processor_updated_at)}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handlePaymentSaveClick}
              disabled={paymentLoading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {paymentLoading ? 'Saving...' : 'Save Payment Settings'}
            </button>
            {paymentSaveMessage && (
              <span className={`text-sm ${paymentSaveMessage.includes('Error') ? 'text-red-600' : 'text-green-600'}`}>
                {paymentSaveMessage}
              </span>
            )}
          </div>
        </div>
      )}

      {/* QuickBooks Integration */}
      {activeIntegration === 'quickbooks' && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6">
          <QuickBooksSettings />
        </div>
      )}

      {/* Google Maps Integration */}
      {activeIntegration === 'google_maps' && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 space-y-6">
          <div>
            <h4 className="text-base font-semibold mb-2 flex items-center gap-2">
              <Map className="w-5 h-5 text-blue-600" />
              Google Maps API
            </h4>
            <p className="text-sm text-gray-600 mb-4">
              Enable address autocomplete, geocoding, and mapping features throughout the application.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Google Maps API Key
            </label>
            <div className="relative">
              <input
                type={showGoogleMapsKey ? 'text' : 'password'}
                name="google-maps-api-key"
                autoComplete="off"
                data-lpignore="true"
                data-form-type="other"
                value={settings.google_maps_api_key || ''}
                onChange={(e) => setSettings({ ...settings, google_maps_api_key: e.target.value })}
                placeholder="Enter your Google Maps API key"
                className="w-full px-4 py-2 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setShowGoogleMapsKey(!showGoogleMapsKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showGoogleMapsKey ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <p className="text-gray-500">
                Get your API key from the{' '}
                <a
                  href="https://console.cloud.google.com/google/maps-apis"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  Google Cloud Console
                  <ExternalLink className="w-3 h-3" />
                </a>
              </p>
              <span className="text-gray-400">
                Last updated: {formatTimestamp(settings.google_maps_api_key_updated_at)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveClick}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Save Changes
            </button>
            {saveMessage && (
              <span className={`text-sm ${saveMessage.includes('Error') ? 'text-red-600' : 'text-green-600'}`}>
                {saveMessage}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Google Calendar Integration */}
      {activeIntegration === 'google_calendar' && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 space-y-6">
          <div>
            <h4 className="text-base font-semibold mb-2 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              Google Calendar Sync
            </h4>
            <p className="text-sm text-gray-600 mb-4">
              Sync appointments and schedules with Google Calendar. Users can connect their individual calendars from their user preferences.
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <h5 className="font-medium text-blue-900 mb-1">User-Level Configuration</h5>
                <p className="text-sm text-blue-700">
                  Google Calendar integration is configured per user. Each user can connect their own Google Calendar
                  by going to their User Preferences and clicking "Connect Google Calendar".
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <h5 className="font-medium text-gray-900 mb-2">Setup Instructions:</h5>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
              <li>Create a project in Google Cloud Console</li>
              <li>Enable the Google Calendar API</li>
              <li>Create OAuth 2.0 credentials</li>
              <li>Add authorized redirect URIs</li>
              <li>Configure OAuth consent screen</li>
            </ol>
            <a
              href="https://developers.google.com/calendar/api/quickstart/js"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
            >
              View Google Calendar API Documentation
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}

      {/* Twilio SMS Integration */}
      {activeIntegration === 'twilio' && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 space-y-6">
          <div>
            <h4 className="text-base font-semibold mb-2 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-600" />
              Twilio SMS
            </h4>
            <p className="text-sm text-gray-600 mb-4">
              Send SMS reminders, notifications, and alerts to customers and team members.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Account SID
              </label>
              <input
                type="text"
                name="twilio-account-sid"
                autoComplete="off"
                value={settings.twilio_account_sid || ''}
                onChange={(e) => setSettings({ ...settings, twilio_account_sid: e.target.value })}
                placeholder="Enter your Twilio Account SID"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Auth Token
              </label>
              <div className="relative">
                <input
                  type={showTwilioToken ? 'text' : 'password'}
                  name="twilio-auth-token"
                  autoComplete="off"
                  data-lpignore="true"
                  data-form-type="other"
                  value={settings.twilio_auth_token || ''}
                  onChange={(e) => setSettings({ ...settings, twilio_auth_token: e.target.value })}
                  placeholder="Enter your Twilio Auth Token"
                  className="w-full px-4 py-2 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={() => setShowTwilioToken(!showTwilioToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showTwilioToken ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-400">
                Last updated: {formatTimestamp(settings.twilio_auth_token_updated_at)}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number
              </label>
              <input
                type="tel"
                name="twilio-phone-number"
                autoComplete="off"
                value={settings.twilio_phone_number || ''}
                onChange={(e) => setSettings({ ...settings, twilio_phone_number: e.target.value })}
                placeholder="+1234567890"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="mt-2 text-xs text-gray-500">
                Your Twilio phone number in E.164 format (e.g., +1234567890)
              </p>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-6 mt-6">
            <h5 className="text-sm font-semibold text-gray-900 mb-3">SMS Templates</h5>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                "On My Way" Notification Template
              </label>
              <textarea
                value={settings.on_my_way_sms_template || ''}
                onChange={(e) => setSettings({ ...settings, on_my_way_sms_template: e.target.value })}
                placeholder="Hi {customer_name}, this is {tech_name}. I'm on my way to your location for work order {job_number}. I should arrive soon. Thank you!"
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
              />
              <div className="mt-2 space-y-1">
                <p className="text-xs text-gray-600">Available variables:</p>
                <div className="flex flex-wrap gap-2">
                  <code className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs">{'{tech_name}'}</code>
                  <code className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs">{'{customer_name}'}</code>
                  <code className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs">{'{job_number}'}</code>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  This message is sent when a technician clicks "On My Way" before arriving at a job site.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-700 mb-2">
              Get your Twilio credentials from the{' '}
              <a
                href="https://console.twilio.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline inline-flex items-center gap-1"
              >
                Twilio Console
                <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveClick}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Save Changes
            </button>
            {saveMessage && (
              <span className={`text-sm ${saveMessage.includes('Error') ? 'text-red-600' : 'text-green-600'}`}>
                {saveMessage}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Resend Email Integration */}
      {activeIntegration === 'resend' && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 space-y-6">
          <div>
            <h4 className="text-base font-semibold mb-2 flex items-center gap-2">
              <Mail className="w-5 h-5 text-blue-600" />
              Resend Email Service
            </h4>
            <p className="text-sm text-gray-600 mb-4">
              Configure email settings for sending proposals, invoices, and notifications to customers.
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Mail className="w-5 h-5 text-blue-600 mt-0.5" />
              <div>
                <h5 className="font-medium text-blue-900 mb-1">Important: Domain Verification Required</h5>
                <p className="text-sm text-blue-700">
                  The "From Email" must use a domain you've verified in Resend. For example, if you verify "yourdomain.com",
                  you can use emails like proposals@yourdomain.com or hello@yourdomain.com.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                From Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={settings.from_email || ''}
                onChange={(e) => setSettings({ ...settings, from_email: e.target.value })}
                placeholder="proposals@yourdomain.com"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="mt-2 text-xs text-gray-500">
                Must be from a domain verified in Resend (e.g., proposals@yourdomain.com)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                From Name
              </label>
              <input
                type="text"
                value={settings.from_name || ''}
                onChange={(e) => setSettings({ ...settings, from_name: e.target.value })}
                placeholder="Your Company Name"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="mt-2 text-xs text-gray-500">
                The name that appears in the "From" field (e.g., "Acme Corporation")
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reply-To Email
              </label>
              <input
                type="email"
                value={settings.reply_to_email || ''}
                onChange={(e) => setSettings({ ...settings, reply_to_email: e.target.value })}
                placeholder="support@yourdomain.com"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="mt-2 text-xs text-gray-500">
                Where customer replies will be sent (optional, defaults to "From Email")
              </p>
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h5 className="font-medium text-yellow-900 mb-2">API Key Configuration</h5>
            <p className="text-sm text-yellow-700">
              The Resend API key is automatically configured in your Supabase Edge Functions secrets.
              You don't need to enter it here.
            </p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <h5 className="font-medium text-gray-900 mb-2">Getting Started with Resend:</h5>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
              <li>Create an account at{' '}
                <a
                  href="https://resend.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  resend.com
                  <ExternalLink className="w-3 h-3" />
                </a>
              </li>
              <li>Verify your domain in the Resend dashboard</li>
              <li>Update DNS records for your domain (SPF, DKIM, DMARC)</li>
              <li>Wait for domain verification to complete (usually a few minutes)</li>
              <li>Enter your verified email address above and save</li>
            </ol>
            <a
              href="https://resend.com/docs/dashboard/domains/introduction"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
            >
              View Resend Domain Verification Guide
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveClick}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Save Email Settings
            </button>
            {saveMessage && (
              <span className={`text-sm ${saveMessage.includes('Error') ? 'text-red-600' : 'text-green-600'}`}>
                {saveMessage}
              </span>
            )}
          </div>
        </div>
      )}

      {/* OpenAI Integration */}
      {activeIntegration === 'openai' && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 space-y-6">
          <div>
            <h4 className="text-base font-semibold mb-2 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-600" />
              OpenAI / ChatGPT
            </h4>
            <p className="text-sm text-gray-600 mb-4">
              Enable AI-powered features like automatic Scope of Work generation for proposals using OpenAI's ChatGPT models.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              OpenAI API Key
            </label>
            <div className="relative">
              <input
                type={showOpenAIKey ? 'text' : 'password'}
                name="openai-api-key"
                autoComplete="off"
                data-lpignore="true"
                data-form-type="other"
                value={settings.openai_api_key || ''}
                onChange={(e) => setSettings({ ...settings, openai_api_key: e.target.value })}
                placeholder="sk-proj-..."
                className="w-full px-4 py-2 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setShowOpenAIKey(!showOpenAIKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showOpenAIKey ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between text-xs">
              <p className="text-gray-500">
                Get your API key from{' '}
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  OpenAI Platform
                  <ExternalLink className="w-3 h-3" />
                </a>
              </p>
              <span className="text-gray-400">
                Last updated: {formatTimestamp(settings.openai_api_key_updated_at)}
              </span>
            </div>
          </div>

          {/* AI Assistant toggle */}
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 pr-4">
                <h5 className="font-medium text-gray-900 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  AI Assistant (Chat Widget)
                </h5>
                <p className="text-sm text-gray-500 mt-0.5">
                  Enable the floating AI chat widget for all staff users. Requires an API key above.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSettings({ ...settings, ai_assistant_enabled: !settings.ai_assistant_enabled })}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  settings.ai_assistant_enabled ? 'bg-blue-600' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    settings.ai_assistant_enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            {settings.ai_assistant_enabled && !settings.openai_api_key && (
              <p className="mt-2 text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-md px-3 py-1.5 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                An OpenAI API key is required for the assistant to function.
              </p>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h5 className="font-medium text-blue-900 mb-2">AI-Powered Features</h5>
            <ul className="space-y-2 text-sm text-blue-700">
              <li className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span><strong>Scope of Work Generation:</strong> Automatically generate professional, detailed scope of work documents from your proposal line items</span>
              </li>
              <li className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span><strong>Smart Descriptions:</strong> AI analyzes your products and creates compelling, customer-friendly descriptions</span>
              </li>
              <li className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span><strong>Professional Formatting:</strong> Documents are formatted with sections, bullet points, and clear structure</span>
              </li>
            </ul>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h5 className="font-medium text-green-900 mb-2">ChatGPT Plus Benefits</h5>
            <p className="text-sm text-green-700">
              Your ChatGPT Plus subscription gives you access to OpenAI's API. Create an API key on the OpenAI platform to use it here. API usage is billed separately from ChatGPT Plus at competitive rates.
            </p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <h5 className="font-medium text-gray-900 mb-2">Getting Started:</h5>
            <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
              <li>Visit the OpenAI Platform and sign in</li>
              <li>Navigate to API Keys section</li>
              <li>Click "Create new secret key"</li>
              <li>Copy the generated API key (starts with sk-proj-...)</li>
              <li>Paste it into the field above and click Save</li>
              <li>Look for the "Generate with AI" button in the Proposal Builder</li>
            </ol>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveClick}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              Save Changes
            </button>
            {saveMessage && (
              <span className={`text-sm ${saveMessage.includes('Error') ? 'text-red-600' : 'text-green-600'}`}>
                {saveMessage}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
