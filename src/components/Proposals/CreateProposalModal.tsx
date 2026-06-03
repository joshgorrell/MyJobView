import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Contact, Lead } from '../../lib/types';
import { X, Search, AlertCircle, DollarSign, Sparkles, UserPlus } from 'lucide-react';
import ConfirmModal from '../ui/ConfirmModal';
import { lookupTaxRateByZip, formatTaxRate } from '../../lib/taxCalculations';
import type { ProposalPrefill } from '../AIAssistant/AIAssistant';

interface CreateProposalModalProps {
  onClose: () => void;
  onCreated: (proposalId: string, prefillRooms?: ProposalPrefill['rooms']) => void;
  contactId?: string;
  leadId?: string;
  prefill?: ProposalPrefill;
}

type SearchResult = {
  id: string;
  contact_name: string;
  company_name?: string | null;
  email?: string | null;
  zip_code?: string | null;
  source: 'contact' | 'lead';
  raw: Contact | Lead;
};

export default function CreateProposalModal({ onClose, onCreated, contactId, leadId: initialLeadId, prefill }: CreateProposalModalProps) {
  const { profile } = useAuth();
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const [searchQuery, setSearchQuery] = useState(prefill?.contactSearchName || '');
  const [title, setTitle] = useState(prefill?.title || '');
  const [taxEnvironment, setTaxEnvironment] = useState<'residential' | 'commercial'>(prefill?.taxEnvironment || 'residential');
  const [taxProjectType, setTaxProjectType] = useState<string>(prefill?.taxProjectType || 'general_installation_repair');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [zipCode, setZipCode] = useState('');
  const [updatingZip, setUpdatingZip] = useState(false);
  const [taxRate, setTaxRate] = useState<number | null>(null);
  const [taxLookupStatus, setTaxLookupStatus] = useState<'idle' | 'loading' | 'success' | 'failed'>('idle');
  const [taxLookupError, setTaxLookupError] = useState<string>('');
  const [manualTaxRate, setManualTaxRate] = useState('');
  const [salesReps, setSalesReps] = useState<any[]>([]);
  const [selectedSalesRep, setSelectedSalesRep] = useState<string>(profile?.id || '');
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  const projectTypes = [
    { value: 'original_construction', label: 'Original Construction' },
    { value: 'remodel', label: 'Remodel' },
    { value: 'general_installation_repair', label: 'General Installation/Repair or Retail' },
    { value: 'exempt_project', label: 'Exempt Project' },
    { value: 'design_services', label: 'Design Services' },
    { value: 'maintenance_agreement', label: 'Maintenance Agreement' },
    { value: 'membership', label: 'Membership' },
    { value: 'security_monitoring', label: 'Security Monitoring' }
  ];

  const runSearch = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const q = query.trim();
      let contactQuery = supabase
        .from('contacts')
        .select('id, contact_name, company_name, email, zip_code')
        .order('contact_name')
        .limit(25);

      let leadQuery = supabase
        .from('leads')
        .select('id, contact_name, company_name, email, assigned_to, office_id')
        .not('status', 'in', '("closed_won","closed_lost")')
        .order('contact_name')
        .limit(25);

      if (q) {
        contactQuery = contactQuery.or(
          `contact_name.ilike.%${q}%,company_name.ilike.%${q}%,email.ilike.%${q}%`
        );
        leadQuery = leadQuery.or(
          `contact_name.ilike.%${q}%,company_name.ilike.%${q}%,email.ilike.%${q}%`
        );
      }

      const [{ data: contacts }, { data: leads }] = await Promise.all([
        contactQuery,
        leadQuery,
      ]);

      const results: SearchResult[] = [
        ...(contacts || []).map(c => ({
          id: c.id,
          contact_name: c.contact_name,
          company_name: c.company_name,
          email: c.email,
          zip_code: c.zip_code,
          source: 'contact' as const,
          raw: c as Contact,
        })),
        ...(leads || []).map(l => ({
          id: l.id,
          contact_name: l.contact_name,
          company_name: l.company_name,
          email: l.email,
          zip_code: null,
          source: 'lead' as const,
          raw: l as Lead,
        })),
      ];

      setSearchResults(results);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (contactId) {
      loadContact(contactId);
    } else if (initialLeadId) {
      loadLeadById(initialLeadId);
    } else {
      runSearch(searchQuery);
    }
    if (profile?.role === 'admin' || (profile as any)?.can_edit_contact_assignments) {
      loadSalesReps();
    }
    if (profile?.id && !selectedSalesRep) {
      setSelectedSalesRep(profile.id);
    }
  }, [contactId, initialLeadId, profile]);

  useEffect(() => {
    if (selectedResult) return;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      runSearch(searchQuery);
    }, 200);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchQuery, selectedResult, runSearch]);

  useEffect(() => {
    const zip = selectedResult?.zip_code || zipCode;
    if (zip) {
      lookupTaxRate(zip);
    }
  }, [selectedResult?.zip_code]);

  async function loadSalesReps() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .in('role', ['sales', 'admin', 'manager'])
        .order('full_name');
      if (error) throw error;
      setSalesReps(data || []);
    } catch (error) {
      console.error('Error loading sales reps:', error);
    }
  }

  async function loadContact(id: string) {
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setSelectedResult({ id: data.id, contact_name: data.contact_name, company_name: data.company_name, email: data.email, zip_code: data.zip_code, source: 'contact', raw: data });
        if (!title) setTitle(`Proposal for ${data.contact_name}`);
        setZipCode(data.zip_code || '');
      }
    } catch (error) {
      console.error('Error loading contact:', error);
    }
  }

  async function loadLeadById(id: string) {
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setSelectedResult({ id: data.id, contact_name: data.contact_name, company_name: data.company_name, email: data.email, zip_code: null, source: 'lead', raw: data });
        if (!title) setTitle(`Proposal for ${data.contact_name}`);
      }
    } catch (error) {
      console.error('Error loading lead:', error);
    }
  }

  async function lookupTaxRate(zip: string) {
    if (!zip || zip.trim().length < 5) return;

    try {
      setTaxLookupStatus('loading');
      setTaxLookupError('');

      const { data: jurisdiction } = await supabase
        .from('tax_jurisdictions')
        .select('combined_rate')
        .eq('zip_code', zip)
        .eq('is_active', true)
        .order('effective_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (jurisdiction) {
        setTaxRate(jurisdiction.combined_rate);
        setTaxLookupStatus('success');
        return;
      }

      try {
        const result = await lookupTaxRateByZip(zip);
        if (result) {
          setTaxRate(result.combined_rate);
          setTaxLookupStatus('success');
          return;
        }
      } catch (apiError: any) {
        setTaxLookupError(apiError.message || 'Failed to lookup tax rate');
      }

      const { data: defaultJurisdiction } = await supabase
        .from('tax_jurisdictions')
        .select('combined_rate')
        .eq('is_default', true)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (defaultJurisdiction) {
        setTaxRate(defaultJurisdiction.combined_rate);
        setTaxLookupStatus('success');
        setTaxLookupError('Using default company tax rate (ZIP code lookup failed)');
        return;
      }

      setTaxRate(0);
      setTaxLookupStatus('failed');
      setTaxLookupError('Could not find tax rate. Please enter manually.');
    } catch (error) {
      console.error('Error looking up tax rate:', error);
      setTaxRate(0);
      setTaxLookupStatus('failed');
      setTaxLookupError('Tax lookup failed. Please enter rate manually.');
    }
  }

  async function updateContactZipCode() {
    if (!selectedResult || selectedResult.source !== 'contact' || !zipCode.trim()) {
      alert('Please enter a ZIP code');
      return;
    }

    try {
      setUpdatingZip(true);
      const { error } = await supabase
        .from('contacts')
        .update({ zip_code: zipCode.trim() })
        .eq('id', selectedResult.id);
      if (error) throw error;
      setSelectedResult({ ...selectedResult, zip_code: zipCode.trim() });
      lookupTaxRate(zipCode.trim());
    } catch (error) {
      console.error('Error updating ZIP code:', error);
      alert('Failed to update ZIP code');
    } finally {
      setUpdatingZip(false);
    }
  }

  async function handleCreate() {
    if (!selectedResult) {
      alert('Please select a contact or lead');
      return;
    }
    if (!title) {
      alert('Please enter a title');
      return;
    }
    if (!taxProjectType) {
      alert('Please select a project type');
      return;
    }

    const effectiveZip = selectedResult.zip_code || zipCode;
    if (!effectiveZip || !effectiveZip.trim()) {
      alert('ZIP code is required for sales tax calculation. Please enter a ZIP code.');
      return;
    }

    let finalTaxRate = taxRate || 0;
    if (manualTaxRate) {
      const manualRate = parseFloat(manualTaxRate);
      if (!isNaN(manualRate) && manualRate >= 0) {
        finalTaxRate = manualRate / 100;
      }
    }

    if (finalTaxRate === 0 && taxLookupStatus !== 'loading') {
      setConfirmModal({
        title: 'Zero Tax Rate',
        message: 'The sales tax rate is 0%. This may result in incorrect invoices. Are you sure you want to proceed?',
        onConfirm: async () => {
          setConfirmModal(null);
          await doCreate(finalTaxRate);
        }
      });
      return;
    }

    await doCreate(finalTaxRate);
  }

  async function doCreate(finalTaxRate: number) {
    try {
      setCreating(true);

      const { data: companySettings, error: settingsError } = await supabase
        .from('company_settings')
        .select('id, job_module_settings')
        .maybeSingle();

      if (settingsError || !companySettings) {
        throw new Error('Could not load company settings');
      }

      const jobSettings = companySettings?.job_module_settings || {};
      const depositPercent = (jobSettings.deposit_default_percent || 0.5) * 100;

      const { data: userOffices } = await supabase
        .from('user_offices')
        .select('office_id')
        .eq('user_id', profile?.id)
        .limit(1)
        .maybeSingle();

      let resolvedContactId: string;
      let resolvedLeadId: string | null = null;

      if (selectedResult.source === 'contact') {
        resolvedContactId = selectedResult.id;
      } else {
        const lead = selectedResult.raw as Lead;
        resolvedLeadId = lead.id;

        const { data: existingContact } = await supabase
          .from('contacts')
          .select('id')
          .eq('email', lead.email || '')
          .maybeSingle();

        if (existingContact) {
          resolvedContactId = existingContact.id;
          if (zipCode.trim()) {
            await supabase.from('contacts').update({ zip_code: zipCode.trim() }).eq('id', existingContact.id);
          }
        } else {
          const { data: newContact, error: contactError } = await supabase
            .from('contacts')
            .insert({
              contact_name: lead.contact_name,
              company_name: lead.company_name || null,
              email: lead.email || null,
              phone: lead.phone || null,
              contact_type: 'lead',
              zip_code: zipCode.trim() || null,
              office_id: (lead as any).office_id || userOffices?.office_id || null,
              assigned_to: lead.assigned_to || profile?.id || null,
              created_by: profile?.id,
            })
            .select('id')
            .single();

          if (contactError) throw contactError;
          resolvedContactId = newContact.id;
        }
      }

      const { data: proposal, error: proposalError } = await supabase
        .from('proposals')
        .insert({
          company_id: companySettings.id,
          contact_id: resolvedContactId,
          lead_id: resolvedLeadId,
          title,
          status: 'designing',
          tax_rate: finalTaxRate,
          tax_environment: taxEnvironment,
          tax_project_type: taxProjectType,
          deposit_percent: depositPercent,
          created_by: selectedSalesRep || profile?.id,
          office_id: userOffices?.office_id || null
        })
        .select()
        .single();

      if (proposalError) {
        console.error('Proposal insert error:', proposalError);
        throw proposalError;
      }

      onCreated(proposal.id, prefill?.rooms);
    } catch (error: any) {
      console.error('Error creating proposal:', error);
      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      alert(`Failed to create proposal: ${errorMessage}`);
    } finally {
      setCreating(false);
    }
  }

  const effectiveZip = selectedResult?.zip_code || zipCode;
  const needsZip = selectedResult && !effectiveZip;
  const isLeadSelected = selectedResult?.source === 'lead';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-full sm:max-w-2xl max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between p-3 sm:p-4 md:p-6 border-b border-gray-700 flex-shrink-0">
          <h2 className="text-lg sm:text-xl font-bold text-white">Create New Proposal</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white flex-shrink-0">
            <X size={20} className="sm:hidden" />
            <X size={24} className="hidden sm:block" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6">
          {prefill && (
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-900/40 border border-blue-700/50 rounded-lg">
              <Sparkles className="w-4 h-4 text-blue-400 flex-shrink-0" />
              <p className="text-xs text-blue-300">Form pre-filled by AI — review and save when ready</p>
            </div>
          )}

          <div>
            <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-1.5 sm:mb-2">
              Proposal Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter proposal title"
              className="w-full px-3 py-2 sm:px-4 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {(profile?.role === 'admin' || (profile as any)?.can_edit_contact_assignments) && salesReps.length > 0 && (
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-1.5 sm:mb-2">
                Assign To (Sales Rep) *
              </label>
              <select
                value={selectedSalesRep}
                onChange={(e) => setSelectedSalesRep(e.target.value)}
                className="w-full px-3 py-2 sm:px-4 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {salesReps.map(rep => (
                  <option key={rep.id} value={rep.id}>
                    {rep.full_name} ({rep.role})
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">Select which sales rep this proposal should be assigned to</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-1.5 sm:mb-2">
                Environment *
              </label>
              <select
                value={taxEnvironment}
                onChange={(e) => setTaxEnvironment(e.target.value as 'residential' | 'commercial')}
                className="w-full px-3 py-2 sm:px-4 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
              </select>
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-1.5 sm:mb-2">
                Project Type *
              </label>
              <select
                value={taxProjectType}
                onChange={(e) => setTaxProjectType(e.target.value)}
                className="w-full px-3 py-2 sm:px-4 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {projectTypes.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Select Contact or Lead *
            </label>

            {selectedResult ? (
              <>
                <div className={`p-4 rounded-lg border ${isLeadSelected ? 'bg-amber-900/20 border-amber-600/50' : 'bg-gray-900 border-gray-700'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isLeadSelected && (
                        <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                          <UserPlus size={11} />
                          Lead
                        </span>
                      )}
                      <div>
                        <div className="font-semibold text-white">{selectedResult.contact_name}</div>
                        {selectedResult.company_name && (
                          <div className="text-sm text-gray-400">{selectedResult.company_name}</div>
                        )}
                        {selectedResult.email && (
                          <div className="text-sm text-gray-400">{selectedResult.email}</div>
                        )}
                      </div>
                    </div>
                    {!contactId && !initialLeadId && (
                      <button
                        onClick={() => { setSelectedResult(null); setZipCode(''); setTaxRate(null); setTaxLookupStatus('idle'); }}
                        className="text-gray-400 hover:text-white text-sm"
                      >
                        Change
                      </button>
                    )}
                  </div>
                </div>

                {isLeadSelected && (
                  <div className="mt-2 flex items-start gap-2 px-3 py-2 bg-amber-900/20 border border-amber-600/30 rounded-lg">
                    <UserPlus className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-300">
                      This is a lead. A contact record will be created automatically when you create this proposal, and the lead will remain in your pipeline.
                    </p>
                  </div>
                )}

                {needsZip && (
                  <div className="mt-3 p-4 bg-amber-900/30 border border-amber-600 rounded-lg">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="text-amber-500 flex-shrink-0 mt-0.5" size={20} />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-amber-500 mb-2">ZIP Code Required</div>
                        <div className="text-sm text-amber-200 mb-3">
                          A ZIP code is required for accurate sales tax calculation.
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            value={zipCode}
                            onChange={(e) => setZipCode(e.target.value)}
                            placeholder="Enter ZIP code"
                            maxLength={10}
                            className="flex-1 px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                          <button
                            onClick={async () => {
                              if (!zipCode.trim()) return;
                              if (selectedResult.source === 'contact') {
                                await updateContactZipCode();
                              } else {
                                lookupTaxRate(zipCode.trim());
                              }
                            }}
                            disabled={updatingZip || !zipCode.trim()}
                            className="w-full sm:w-auto px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-medium text-sm whitespace-nowrap"
                          >
                            {updatingZip ? 'Saving...' : isLeadSelected ? 'Use ZIP' : 'Add ZIP'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {effectiveZip && (
                  <div className="mt-3 p-4 bg-gray-900 border border-gray-700 rounded-lg">
                    <div className="flex items-start gap-3">
                      <DollarSign className="text-green-500 flex-shrink-0 mt-0.5" size={20} />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-300 mb-2">Sales Tax Rate</div>

                        {taxLookupStatus === 'loading' && (
                          <div className="flex items-center gap-2 text-gray-400 text-sm">
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent"></div>
                            Looking up tax rate...
                          </div>
                        )}

                        {taxLookupStatus === 'success' && taxRate !== null && (
                          <div className="text-green-400 font-semibold text-lg">
                            {formatTaxRate(taxRate)}
                          </div>
                        )}

                        {taxLookupStatus === 'failed' && (
                          <div className="space-y-2">
                            <div className="text-amber-400 text-sm">{taxLookupError}</div>
                            <div>
                              <label className="block text-xs text-gray-400 mb-1">Enter Tax Rate Manually (%)</label>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                max="100"
                                value={manualTaxRate}
                                onChange={(e) => setManualTaxRate(e.target.value)}
                                placeholder="e.g., 8.25"
                                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
                              />
                            </div>
                          </div>
                        )}

                        {taxLookupError && taxLookupStatus === 'success' && (
                          <div className="text-amber-400 text-xs mt-1">{taxLookupError}</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search contacts and leads..."
                    className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="max-h-64 overflow-y-auto space-y-1 border border-gray-700 rounded-lg p-2">
                  {loading ? (
                    <div className="flex items-center justify-center gap-2 text-gray-400 py-4 text-sm">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-500 border-t-white"></div>
                      Searching...
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="text-center text-gray-400 py-4 text-sm">No contacts or leads found</div>
                  ) : (
                    searchResults.map(result => (
                      <button
                        key={`${result.source}-${result.id}`}
                        onClick={() => {
                          setSelectedResult(result);
                          if (!title) setTitle(`Proposal for ${result.contact_name}`);
                          setZipCode(result.zip_code || '');
                          if (result.zip_code) lookupTaxRate(result.zip_code);
                        }}
                        className="w-full text-left p-3 bg-gray-900 hover:bg-gray-750 rounded-lg transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          {result.source === 'lead' && (
                            <span className="flex-shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                              <UserPlus size={10} />
                              Lead
                            </span>
                          )}
                          <div className="min-w-0">
                            <div className="font-semibold text-white truncate">{result.contact_name}</div>
                            {result.company_name && (
                              <div className="text-sm text-gray-400 truncate">{result.company_name}</div>
                            )}
                            {result.email && (
                              <div className="text-sm text-gray-400 truncate">{result.email}</div>
                            )}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="p-3 sm:p-4 md:p-6 border-t border-gray-700 flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 sm:px-6 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !selectedResult || !title || needsZip || taxLookupStatus === 'loading'}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-medium text-sm"
          >
            {creating ? 'Creating...' : taxLookupStatus === 'loading' ? 'Looking up tax rate...' : 'Create Proposal'}
          </button>
        </div>
      </div>

      <ConfirmModal
        isOpen={!!confirmModal}
        title={confirmModal?.title || ''}
        message={confirmModal?.message || ''}
        variant="warning"
        onConfirm={() => confirmModal?.onConfirm()}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}
