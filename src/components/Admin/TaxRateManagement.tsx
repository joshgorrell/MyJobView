import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Search, CreditCard as Edit2, Trash2, Star, MapPin, Key, Save, ExternalLink, Hash, Globe, Info, CheckCircle, AlertTriangle, BookOpen } from 'lucide-react';
import {
  TaxJurisdiction,
  lookupTaxRateByZip,
  formatTaxRate,
  STATE_TAX_RULES,
} from '../../lib/taxCalculations';
import ConfirmModal from '../ui/ConfirmModal';

const SUPPORTED_NEXUS_STATES = [
  { code: 'KS', name: 'Kansas', form: 'ST-36' },
  { code: 'MO', name: 'Missouri', form: 'Form 53-1' },
  { code: 'TX', name: 'Texas', form: 'Form 01-117' },
  { code: 'OK', name: 'Oklahoma', form: 'STS-20002' },
  { code: 'NE', name: 'Nebraska', form: 'Form 10' },
  { code: 'CO', name: 'Colorado', form: 'DR 0100' },
  { code: 'AR', name: 'Arkansas', form: 'ET-1' },
  { code: 'IA', name: 'Iowa', form: 'GovConnect' },
];

export default function TaxRateManagement() {
  const [jurisdictions, setJurisdictions] = useState<TaxJurisdiction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingJurisdiction, setEditingJurisdiction] = useState<TaxJurisdiction | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [lookupZip, setLookupZip] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [showApiKeySettings, setShowApiKeySettings] = useState(false);
  const [showNexusSettings, setShowNexusSettings] = useState(false);
  const [taxjarApiKey, setTaxjarApiKey] = useState('');
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [testingApiKey, setTestingApiKey] = useState(false);
  const [apiKeyUpdatedAt, setApiKeyUpdatedAt] = useState<string | null>(null);
  const [nexusStates, setNexusStates] = useState<string[]>(['KS']);
  const [savingNexus, setSavingNexus] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [activeRulesState, setActiveRulesState] = useState<string | null>(null);
  const [activeRulesEnv, setActiveRulesEnv] = useState<'residential' | 'commercial'>('residential');

  useEffect(() => {
    loadJurisdictions();
    loadSettings();
  }, []);

  async function loadJurisdictions() {
    try {
      const { data, error } = await supabase
        .from('tax_jurisdictions')
        .select('*')
        .order('is_default', { ascending: false })
        .order('state')
        .order('city');

      if (error) throw error;
      setJurisdictions(data || []);
    } catch (error) {
      console.error('Error loading tax jurisdictions:', error);
    } finally {
      setLoading(false);
    }
  }

  async function deleteJurisdiction(id: string) {
    try {
      const { error } = await supabase
        .from('tax_jurisdictions')
        .delete()
        .eq('id', id);

      if (error) throw error;
      loadJurisdictions();
    } catch (error) {
      console.error('Error deleting jurisdiction:', error);
      alert('Failed to delete tax jurisdiction.');
    }
  }

  async function loadSettings() {
    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select('taxjar_api_key, taxjar_api_key_updated_at, nexus_states')
        .maybeSingle();

      if (error) throw error;
      setTaxjarApiKey(data?.taxjar_api_key || '');
      setApiKeyUpdatedAt(data?.taxjar_api_key_updated_at || null);
      if (data?.nexus_states?.length) setNexusStates(data.nexus_states);
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  async function saveApiKey() {
    setSavingApiKey(true);
    try {
      const { data: settingsData } = await supabase
        .from('company_settings')
        .select('id')
        .maybeSingle();

      if (!settingsData) throw new Error('Company settings not found');

      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from('company_settings')
        .update({
          taxjar_api_key: taxjarApiKey || null,
          taxjar_api_key_updated_at: taxjarApiKey ? nowIso : null,
        })
        .eq('id', settingsData.id);

      if (error) throw error;
      setApiKeyUpdatedAt(taxjarApiKey ? nowIso : null);
      alert('TaxJar API key saved successfully!');
      setShowApiKeySettings(false);
    } catch (error) {
      console.error('Error saving API key:', error);
      alert('Failed to save API key');
    } finally {
      setSavingApiKey(false);
    }
  }

  async function saveNexusStates() {
    setSavingNexus(true);
    try {
      const { data: settingsData } = await supabase
        .from('company_settings')
        .select('id')
        .maybeSingle();

      if (!settingsData) throw new Error('Company settings not found');

      const { error } = await supabase
        .from('company_settings')
        .update({ nexus_states: nexusStates })
        .eq('id', settingsData.id);

      if (error) throw error;
      setShowNexusSettings(false);
      alert('Nexus states saved. The Sales Tax Reports will now show tabs for each active state.');
    } catch (error) {
      console.error('Error saving nexus states:', error);
      alert('Failed to save nexus states');
    } finally {
      setSavingNexus(false);
    }
  }

  async function testApiKey() {
    setTestingApiKey(true);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/taxjar-lookup`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'test' }),
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        alert(`TaxJar connection failed: ${data.error || response.statusText}`);
      } else {
        alert('TaxJar connection successful!');
      }
    } catch (error: any) {
      console.error('Error testing TaxJar API:', error);
      alert(`Failed to test TaxJar connection: ${error?.message || 'Unknown error'}`);
    } finally {
      setTestingApiKey(false);
    }
  }

  async function handleLookupZip() {
    if (!lookupZip.trim()) return;

    setLookingUp(true);
    try {
      const result = await lookupTaxRateByZip(lookupZip);
      if (result) {
        setEditingJurisdiction(result);
        setShowAddModal(true);
      } else {
        alert('Could not find tax rate for this zip code. Please enter manually.');
      }
    } catch (error: any) {
      console.error('Error looking up tax rate:', error);
      const errorMessage = error?.message || 'Failed to lookup tax rate. Please try again or enter manually.';
      alert(errorMessage);
    } finally {
      setLookingUp(false);
    }
  }

  function handleAddNew() {
    setEditingJurisdiction({
      id: '',
      zip_code: '',
      city: '',
      county: '',
      state: 'KS',
      combined_rate: 0,
      state_rate: 0,
      county_rate: 0,
      city_rate: 0,
      special_rate: 0,
      jurisdiction_name: '',
      is_default: false,
      ks_jurisdiction_code: '',
    });
    setShowAddModal(true);
  }

  function toggleNexusState(code: string) {
    setNexusStates(prev =>
      prev.includes(code) ? prev.filter(s => s !== code) : [...prev, code]
    );
  }

  const uniqueStates = [...new Set(jurisdictions.map(j => j.state))].sort();

  const filteredJurisdictions = jurisdictions.filter((j) => {
    const matchSearch = searchTerm === ''
      ? true
      : j.jurisdiction_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        j.zip_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        j.state.toLowerCase().includes(searchTerm.toLowerCase());
    const matchState = stateFilter === '' || j.state === stateFilter;
    return matchSearch && matchState;
  });

  const activeRules = activeRulesState ? STATE_TAX_RULES[activeRulesState] : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Tax Rate Management</h2>
          <p className="mt-1 text-sm text-gray-600">
            Configure sales tax jurisdictions and rates for all service areas
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowNexusSettings(!showNexusSettings)}
            className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <Globe className="w-4 h-4" />
            Nexus States
            {nexusStates.length > 0 && (
              <span className="bg-blue-100 text-blue-700 text-xs font-medium px-1.5 py-0.5 rounded-full">
                {nexusStates.length}
              </span>
            )}
          </button>
          <button
            onClick={handleAddNew}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Tax Rate
          </button>
        </div>
      </div>

      {/* Nexus States Settings */}
      {showNexusSettings && (
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Globe className="w-5 h-5 text-blue-600" />
                Nexus State Configuration
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                Select all states where your company has sales tax nexus. Active states appear as tabs in the Sales Tax Reports.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {SUPPORTED_NEXUS_STATES.map(({ code, name, form }) => {
              const isActive = nexusStates.includes(code);
              const hasRule = !!STATE_TAX_RULES[code];
              return (
                <label
                  key={code}
                  className={`flex flex-col gap-1 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                    isActive
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isActive}
                        onChange={() => toggleNexusState(code)}
                        className="rounded border-gray-300 text-blue-600"
                      />
                      <span className="font-semibold text-gray-900">{code}</span>
                    </div>
                    {hasRule && (
                      <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">Rules</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-600">{name}</span>
                  <span className="text-xs text-gray-400">{form}</span>
                </label>
              );
            })}
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex gap-2">
            <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              States marked with <strong>Rules</strong> have built-in tax calculation logic (parts vs. labor rules, exemption handling). Other states will use combined rate only until rules are added.
            </p>
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowNexusSettings(false)}
              className="px-4 py-2 text-gray-700 hover:text-gray-900"
            >
              Cancel
            </button>
            <button
              onClick={saveNexusStates}
              disabled={savingNexus || nexusStates.length === 0}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {savingNexus ? 'Saving...' : 'Save Nexus States'}
            </button>
          </div>
        </div>
      )}

      {/* State Tax Rules Reference */}
      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-600" />
            State Tax Rules Reference
          </h3>
          <p className="text-sm text-gray-500 mt-1">Click a state to view its tax rules for parts, labor, and exemptions</p>
        </div>
        <div className="p-4">
          <div className="flex flex-wrap gap-2 mb-4">
            {Object.entries(STATE_TAX_RULES).map(([code, rule]) => (
              <button
                key={code}
                onClick={() => setActiveRulesState(activeRulesState === code ? null : code)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                  activeRulesState === code
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-blue-300 hover:text-blue-700'
                }`}
              >
                {code} — {rule.stateName}
              </button>
            ))}
            {Object.keys(STATE_TAX_RULES).length === 0 && (
              <p className="text-sm text-gray-500">No state rules configured yet.</p>
            )}
          </div>

          {activeRules && (
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-gray-900">{activeRules.stateName} — {activeRulesState}</h4>
                <div className="flex items-center gap-3">
                  <div className="flex rounded-lg border border-gray-300 overflow-hidden text-xs font-medium">
                    <button
                      onClick={() => setActiveRulesEnv('residential')}
                      className={`px-3 py-1.5 transition-colors ${activeRulesEnv === 'residential' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                    >
                      Residential
                    </button>
                    <button
                      onClick={() => setActiveRulesEnv('commercial')}
                      className={`px-3 py-1.5 transition-colors border-l border-gray-300 ${activeRulesEnv === 'commercial' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                    >
                      Commercial
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded font-medium">
                      Filing: {activeRules.filingFormNumber}
                    </span>
                    <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded font-medium">
                      Exemption: {activeRules.exemptionFormNumber}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { type: 'original_construction', label: 'Original Construction' },
                  { type: 'remodel', label: 'Remodel / Renovation' },
                  { type: 'general_installation_repair', label: 'General Repair / Service' },
                ].map(({ type, label }) => {
                  const applicability = activeRules.getApplicability(
                    activeRulesEnv,
                    type as 'original_construction' | 'remodel' | 'general_installation_repair'
                  );
                  return (
                    <div key={type} className="bg-white rounded border border-gray-200 p-3">
                      <p className="font-medium text-sm text-gray-900 mb-2">{label}</p>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm">
                          {applicability.partsTaxable ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                          ) : (
                            <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                          )}
                          <span className={applicability.partsTaxable ? 'text-amber-700' : 'text-green-700'}>
                            Parts: {applicability.partsTaxable ? 'Taxable' : 'Exempt'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          {applicability.laborTaxable ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                          ) : (
                            <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                          )}
                          <span className={applicability.laborTaxable ? 'text-amber-700' : 'text-green-700'}>
                            Labor: {applicability.laborTaxable ? 'Taxable' : 'Exempt'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{applicability.explanation}</p>
                      </div>
                    </div>
                  );
                })}
                <div className="bg-white rounded border border-gray-200 p-3 flex flex-col justify-between">
                  <div>
                    <p className="font-medium text-sm text-gray-900 mb-1">Resources</p>
                    <a
                      href={activeRules.revenueAuthorityUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Revenue Authority Website
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Lookup + API Key */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h3 className="font-semibold text-blue-900 flex items-center gap-2">
              <Search className="w-4 h-4" />
              Quick ZIP Code Lookup
            </h3>
            <p className="text-sm text-blue-700 mt-1">
              Enter a zip code to automatically fetch tax rates via TaxJar and add a jurisdiction
            </p>
          </div>
          <button
            onClick={() => setShowApiKeySettings(!showApiKeySettings)}
            className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-sm"
          >
            <Key className="w-4 h-4" />
            {taxjarApiKey ? (
              <span className="flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                API Key Configured
              </span>
            ) : 'Configure API Key'}
          </button>
        </div>

        {showApiKeySettings && (
          <div className="mt-3 p-3 bg-white rounded border border-blue-300">
            <div className="flex items-start gap-2 mb-3">
              <ExternalLink className="w-4 h-4 text-blue-600 mt-1 flex-shrink-0" />
              <div className="text-sm text-gray-700">
                <p className="font-medium mb-1">Get a TaxJar API Key</p>
                <p className="mb-2">
                  Sign up at{' '}
                  <a
                    href="https://www.taxjar.com/api/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    taxjar.com
                  </a>{' '}
                  and generate a token from API Access in your account settings.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                TaxJar API Key
              </label>
              <input
                type="text"
                value={taxjarApiKey}
                onChange={(e) => setTaxjarApiKey(e.target.value)}
                placeholder="Enter your TaxJar API key..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              {apiKeyUpdatedAt && (
                <p className="text-xs text-gray-500">
                  Last updated: {new Date(apiKeyUpdatedAt).toLocaleString()}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={saveApiKey}
                  disabled={savingApiKey}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 text-sm"
                >
                  <Save className="w-4 h-4" />
                  {savingApiKey ? 'Saving...' : 'Save API Key'}
                </button>
                <button
                  onClick={testApiKey}
                  disabled={testingApiKey || !taxjarApiKey}
                  className="px-4 py-2 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 disabled:opacity-50 text-sm"
                >
                  {testingApiKey ? 'Testing...' : 'Test Connection'}
                </button>
                <button
                  onClick={() => setShowApiKeySettings(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-3">
          <input
            type="text"
            value={lookupZip}
            onChange={(e) => setLookupZip(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLookupZip()}
            placeholder="Enter zip code..."
            className="flex-1 px-3 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            maxLength={10}
          />
          <button
            onClick={handleLookupZip}
            disabled={lookingUp || !lookupZip.trim()}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {lookingUp ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                Looking up...
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Lookup
              </>
            )}
          </button>
        </div>
      </div>

      {/* Jurisdictions Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b border-gray-200">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search jurisdictions..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {uniqueStates.length > 1 && (
              <select
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
              >
                <option value="">All States</option>
                {uniqueStates.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Jurisdiction
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Zip / State
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Filing Code
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tax Rates
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredJurisdictions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    No tax jurisdictions found. Add one or use the ZIP lookup above.
                  </td>
                </tr>
              ) : (
                filteredJurisdictions.map((jurisdiction) => {
                  const stateCode = jurisdiction.state?.toUpperCase();
                  const hasKsCode = stateCode === 'KS' && jurisdiction.ks_jurisdiction_code;
                  const hasMoCode = stateCode === 'MO' && jurisdiction.mo_jurisdiction_code;
                  const missingCode = (stateCode === 'KS' && !jurisdiction.ks_jurisdiction_code) ||
                                      (stateCode === 'MO' && !jurisdiction.mo_jurisdiction_code);

                  return (
                    <tr key={jurisdiction.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {jurisdiction.is_default && (
                            <Star className="w-4 h-4 text-yellow-500 fill-current flex-shrink-0" />
                          )}
                          <div>
                            <div className="font-medium text-gray-900">
                              {jurisdiction.jurisdiction_name}
                            </div>
                            {(jurisdiction.city || jurisdiction.county) && (
                              <div className="text-sm text-gray-500 flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {[jurisdiction.city, jurisdiction.county ? `${jurisdiction.county} County` : ''].filter(Boolean).join(', ')}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div>{jurisdiction.zip_code || '-'}</div>
                        <div className="mt-0.5">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                            stateCode === 'KS' ? 'bg-blue-100 text-blue-800' :
                            stateCode === 'MO' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {stateCode}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {hasKsCode && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <Hash className="w-3 h-3" />
                            KS: {jurisdiction.ks_jurisdiction_code}
                          </span>
                        )}
                        {hasMoCode && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <Hash className="w-3 h-3" />
                            MO: {jurisdiction.mo_jurisdiction_code}
                          </span>
                        )}
                        {missingCode && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                            <AlertTriangle className="w-3 h-3" />
                            Missing
                          </span>
                        )}
                        {!['KS', 'MO'].includes(stateCode) && (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-semibold text-gray-900">
                          {formatTaxRate(jurisdiction.combined_rate)} combined
                        </div>
                        <div className="text-xs text-gray-500">
                          State: {formatTaxRate(jurisdiction.state_rate)} | County: {formatTaxRate(jurisdiction.county_rate)}
                          {jurisdiction.city_rate > 0 && ` | City: ${formatTaxRate(jurisdiction.city_rate)}`}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          {jurisdiction.is_default && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 w-fit">
                              Default
                            </span>
                          )}
                          {(jurisdiction as any).source === 'taxjar' && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 w-fit">
                              TaxJar
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => {
                            setEditingJurisdiction(jurisdiction);
                            setShowAddModal(true);
                          }}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (jurisdiction.is_default) {
                              alert('Cannot delete the default tax jurisdiction.');
                              return;
                            }
                            setConfirmDeleteId(jurisdiction.id);
                          }}
                          className="text-red-600 hover:text-red-800"
                          disabled={jurisdiction.is_default}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && editingJurisdiction && (
        <JurisdictionModal
          jurisdiction={editingJurisdiction}
          onClose={() => {
            setShowAddModal(false);
            setEditingJurisdiction(null);
          }}
          onSave={() => {
            setShowAddModal(false);
            setEditingJurisdiction(null);
            loadJurisdictions();
          }}
        />
      )}

      <ConfirmModal
        isOpen={confirmDeleteId !== null}
        title="Delete Tax Jurisdiction"
        message="Are you sure you want to delete this tax jurisdiction? This action cannot be undone."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => {
          if (confirmDeleteId) deleteJurisdiction(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}

function JurisdictionModal({
  jurisdiction,
  onClose,
  onSave,
}: {
  jurisdiction: TaxJurisdiction;
  onClose: () => void;
  onSave: () => void;
}) {
  const [formData, setFormData] = useState<TaxJurisdiction & { mo_jurisdiction_code?: string }>(
    jurisdiction as TaxJurisdiction & { mo_jurisdiction_code?: string }
  );
  const [saving, setSaving] = useState(false);

  const stateCode = formData.state?.toUpperCase();
  const stateRules = STATE_TAX_RULES[stateCode];

  function autoCalcCombined() {
    const total = (formData.state_rate || 0) + (formData.county_rate || 0) + (formData.city_rate || 0) + (formData.special_rate || 0);
    setFormData(prev => ({ ...prev, combined_rate: total }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: profileData } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .maybeSingle();

      const dataToSave = {
        ...formData,
        state: formData.state?.toUpperCase(),
        organization_id: profileData?.organization_id,
        updated_at: new Date().toISOString(),
      };

      if (formData.id) {
        const { error } = await supabase
          .from('tax_jurisdictions')
          .update(dataToSave)
          .eq('id', formData.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('tax_jurisdictions').insert([dataToSave]);
        if (error) throw error;
      }

      onSave();
    } catch (error) {
      console.error('Error saving jurisdiction:', error);
      alert('Failed to save tax jurisdiction.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold">
              {formData.id ? 'Edit Tax Jurisdiction' : 'Add Tax Jurisdiction'}
            </h3>
          </div>

          <div className="p-6 space-y-5">
            {/* State Rules Notice */}
            {stateRules && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2">
                <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <strong>{stateRules.stateName}</strong> — Built-in tax rules active.
                  Filing form: <strong>{stateRules.filingFormNumber}</strong>.
                  Labor exemptions and parts taxability are automatically calculated based on project type.
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Jurisdiction Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.jurisdiction_name}
                  onChange={(e) => setFormData({ ...formData, jurisdiction_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Overland Park, Johnson County, KS"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Zip Code</label>
                <input
                  type="text"
                  value={formData.zip_code || ''}
                  onChange={(e) => setFormData({ ...formData, zip_code: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="66210"
                  maxLength={10}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
                <select
                  required
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select state...</option>
                  {SUPPORTED_NEXUS_STATES.map(s => (
                    <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
                  ))}
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input
                  type="text"
                  value={formData.city || ''}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">County</label>
                <input
                  type="text"
                  value={formData.county || ''}
                  onChange={(e) => setFormData({ ...formData, county: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* KS Filing Code */}
              {stateCode === 'KS' && (
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <span className="flex items-center gap-1">
                      <Hash className="w-3.5 h-3.5" />
                      KS ST-36 Jurisdiction Code
                    </span>
                  </label>
                  <input
                    type="text"
                    value={formData.ks_jurisdiction_code || ''}
                    onChange={(e) => setFormData({ ...formData, ks_jurisdiction_code: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. 028"
                    maxLength={10}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Required for Kansas ST-36 filing worksheet. Find codes at{' '}
                    <a href="https://www.ksrevenue.gov/salesinfo.html" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      ksrevenue.gov
                    </a>.
                  </p>
                </div>
              )}

              {/* MO Filing Code */}
              {stateCode === 'MO' && (
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <span className="flex items-center gap-1">
                      <Hash className="w-3.5 h-3.5" />
                      MO Form 53-1 District Code
                    </span>
                  </label>
                  <input
                    type="text"
                    value={formData.mo_jurisdiction_code || ''}
                    onChange={(e) => setFormData({ ...formData, mo_jurisdiction_code: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. 11-000"
                    maxLength={20}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Required for Missouri Form 53-1 filing. Find codes at{' '}
                    <a href="https://dor.mo.gov/business/sales/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                      dor.mo.gov
                    </a>.
                  </p>
                </div>
              )}
            </div>

            {/* Tax Rates */}
            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-gray-900">Tax Rates</h4>
                <button
                  type="button"
                  onClick={autoCalcCombined}
                  className="text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  Auto-calculate combined
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { key: 'state_rate', label: 'State Rate (%)', placeholder: stateCode === 'KS' ? '6.5' : stateCode === 'MO' ? '4.225' : '6.25' },
                  { key: 'county_rate', label: 'County Rate (%)', placeholder: '1.00' },
                  { key: 'city_rate', label: 'City Rate (%)', placeholder: '1.00' },
                  { key: 'special_rate', label: 'Special District Rate (%)', placeholder: '0.50' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      max="100"
                      value={(formData[key as keyof typeof formData] as number) * 100}
                      onChange={(e) =>
                        setFormData({ ...formData, [key]: (parseFloat(e.target.value) || 0) / 100 })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder={placeholder}
                    />
                  </div>
                ))}

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Combined Rate (%) *
                  </label>
                  <input
                    type="number"
                    required
                    step="0.001"
                    min="0"
                    max="100"
                    value={formData.combined_rate * 100}
                    onChange={(e) =>
                      setFormData({ ...formData, combined_rate: (parseFloat(e.target.value) || 0) / 100 })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-semibold"
                    placeholder="8.475"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Enter as percentage (e.g., 8.475 for 8.475%). Use the "Auto-calculate" link above to sum the components.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_default"
                checked={formData.is_default}
                onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                className="rounded border-gray-300"
              />
              <label htmlFor="is_default" className="text-sm text-gray-700">
                Set as default company tax rate
              </label>
            </div>
          </div>

          <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-gray-700 hover:text-gray-900">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Jurisdiction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
