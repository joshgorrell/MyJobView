import React, { useState, useEffect, useCallback } from 'react';
import { BillingPrefBadge } from '../Shared/BillingPrefBadge';
import { supabase } from '../../lib/supabase';
import { Search, Plus, ShieldCheck, DollarSign, Calendar, X, AlertCircle, CheckCircle, Loader2, ChevronRight, Package } from 'lucide-react';
import SecurityContractDetail from './SecurityContractDetail';
import { SYSTEM_TYPE_LABELS, EQUIPMENT_WARRANTY_MAX_AGE_MONTHS, type SystemType, type CustomerPurchasedEquipment } from '../../lib/types';

interface WarrantyAgreement {
  id: string;
  contract_number: string | null;
  status: string;
  monthly_price: number | null;
  term_months: number | null;
  renewal_term_months: number | null;
  billing_frequency_override: string | null;
  warranty_start_date: string | null;
  warranty_end_date: string | null;
  system_type: string | null;
  notes: string | null;
  created_at: string;
  activated_at: string | null;
  contact: { id: string; full_name: string; email: string; phone: string } | null;
  subscription: { id: string; next_billing_date: string; custom_amount: number; auto_renew: boolean; status: string } | null;
  equipment: { id: string; equipment_type: string; product_id: string | null; warranty_term_months: number | null; warranty_provider: string | null; quantity: number }[];
}

export default function EquipmentWarrantyAgreements() {
  const [agreements, setAgreements] = useState<WarrantyAgreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedAgreement, setSelectedAgreement] = useState<WarrantyAgreement | null>(null);

  const loadAgreements = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('security_contracts')
        .select(`
          id, contract_number, status, monthly_price, term_months, renewal_term_months,
          billing_frequency_override, warranty_start_date, warranty_end_date, system_type,
          notes, created_at, activated_at,
          contact:contacts(id, full_name, email, phone),
          subscription:recurring_subscriptions(id, next_billing_date, custom_amount, auto_renew, status),
          equipment:security_contract_equipment(id, equipment_type, product_id, warranty_term_months, warranty_provider, quantity)
        `)
        .eq('agreement_type', 'equipment_warranty')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAgreements(data || []);
    } catch (error) {
      console.error('Error loading warranty agreements:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAgreements();
    const channel = supabase
      .channel('warranty_agreements_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'security_contracts' }, () => {
        loadAgreements();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadAgreements]);

  const filtered = agreements.filter(a => {
    const matchesSearch = !searchTerm ||
      a.contact?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.contact?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.contract_number?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || a.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusOptions = [
    { value: 'all', label: 'All Statuses' },
    { value: 'draft', label: 'Draft' },
    { value: 'pending_approval', label: 'Pending Approval' },
    { value: 'active', label: 'Active' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  const statusBadgeColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700',
    pending_approval: 'bg-yellow-100 text-yellow-700',
    active: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700',
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ShieldCheck className="w-7 h-7 text-amber-600" />
              Equipment Extended Warranty
            </h2>
            <p className="text-gray-500 mt-1">Manage equipment extended warranty agreements with recurring billing</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium"
          >
            <Plus className="w-4 h-4" />
            Create Warranty Agreement
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by customer, email, or contract number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            {statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <ShieldCheck className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No equipment warranty agreements found</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Contract #</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Customer</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">System Type</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Items</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Warranty Period</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Billing</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Pref</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Price</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map(a => (
                    <tr
                      key={a.id}
                      onClick={() => setSelectedAgreement(a)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{a.contract_number || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{a.contact?.full_name || '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{a.system_type ? SYSTEM_TYPE_LABELS[a.system_type as SystemType] || a.system_type : '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{a.equipment?.length || 0} item(s)</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {a.warranty_start_date && a.warranty_end_date
                          ? `${new Date(a.warranty_start_date).toLocaleDateString()} - ${new Date(a.warranty_end_date).toLocaleDateString()}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 capitalize">{a.billing_frequency_override || '—'}</td>
                      <td className="px-4 py-3">
                        {a.contact_id && <BillingPrefBadge contactId={a.contact_id} />}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        ${a.monthly_price ? a.monthly_price.toFixed(2) : (a.subscription?.custom_amount || 0).toFixed(2)}
                        <span className="text-gray-400 text-xs ml-1">/{a.billing_frequency_override === 'yearly' ? 'yr' : 'mo'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${statusBadgeColors[a.status] || 'bg-gray-100 text-gray-700'}`}>
                          {a.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {showCreateModal && (
          <CreateWarrantyAgreementModal
            onClose={() => setShowCreateModal(false)}
            onCreated={() => { setShowCreateModal(false); loadAgreements(); }}
          />
        )}

        {selectedAgreement && (
          <SecurityContractDetail
            contractId={selectedAgreement.id}
            onClose={() => setSelectedAgreement(null)}
          />
        )}
      </div>
    </div>
  );
}

interface SelectedEquipment {
  product_id: string;
  product_name: string;
  manufacturer: string | null;
  model_number: string | null;
  quantity: number;
  unit_price: number;
  age_months: number | null;
  warranty_term_months: number;
  warranty_provider: string;
}

function CreateWarrantyAgreementModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [contactId, setContactId] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [contactResults, setContactResults] = useState<any[]>([]);
  const [searchingContacts, setSearchingContacts] = useState(false);

  const [systemType, setSystemType] = useState<SystemType>('security');
  const [equipment, setEquipment] = useState<CustomerPurchasedEquipment[]>([]);
  const [selectedEquipment, setSelectedEquipment] = useState<SelectedEquipment[]>([]);
  const [loadingEquipment, setLoadingEquipment] = useState(false);

  const [billingFrequency, setBillingFrequency] = useState<string>('yearly');
  const [price, setPrice] = useState('');
  const [termMonths, setTermMonths] = useState(12);
  const [renewalTermMonths, setRenewalTermMonths] = useState(12);
  const [warrantyStartDate, setWarrantyStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  const [warrantyPlanId, setWarrantyPlanId] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('recurring_plans')
      .select('id')
      .eq('plan_type', 'equipment_warranty')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (data) setWarrantyPlanId(data.id); });
  }, []);

  const searchContacts = useCallback(async (query: string) => {
    if (query.length < 2) { setContactResults([]); return; }
    setSearchingContacts(true);
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, full_name, email, phone')
        .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(10);
      if (error) throw error;
      setContactResults(data || []);
    } catch (err) {
      console.error('Error searching contacts:', err);
    } finally {
      setSearchingContacts(false);
    }
  }, []);

  async function loadEquipment(cId: string) {
    setLoadingEquipment(true);
    try {
      const { data, error } = await supabase.rpc('get_customer_purchased_equipment', { p_contact_id: cId });
      if (error) throw error;
      setEquipment(data || []);
    } catch (err) {
      console.error('Error loading purchased equipment:', err);
      setEquipment([]);
    } finally {
      setLoadingEquipment(false);
    }
  }

  function selectContact(contact: any) {
    setContactId(contact.id);
    setContactName(contact.full_name || '');
    setContactSearch('');
    setContactResults([]);
    setSelectedEquipment([]);
    loadEquipment(contact.id);
  }

  function toggleEquipment(item: CustomerPurchasedEquipment) {
    const isEligible = item.age_months === null || item.age_months < EQUIPMENT_WARRANTY_MAX_AGE_MONTHS;
    if (!isEligible) return;

    const existing = selectedEquipment.find(e => e.product_id === item.product_id);
    if (existing) {
      setSelectedEquipment(selectedEquipment.filter(e => e.product_id !== item.product_id));
    } else {
      setSelectedEquipment([...selectedEquipment, {
        product_id: item.product_id,
        product_name: item.product_name,
        manufacturer: item.manufacturer,
        model_number: item.model_number,
        quantity: item.quantity,
        unit_price: item.unit_price,
        age_months: item.age_months,
        warranty_term_months: 12,
        warranty_provider: item.manufacturer || 'OEM',
      }]);
    }
  }

  function updateEquipmentItem(productId: string, field: keyof SelectedEquipment, value: any) {
    setSelectedEquipment(selectedEquipment.map(e =>
      e.product_id === productId ? { ...e, [field]: value } : e
    ));
  }

  const totalEquipmentValue = selectedEquipment.reduce((sum, e) => sum + e.unit_price * e.quantity, 0);
  const maxWarrantyTerm = selectedEquipment.reduce((max, e) => Math.max(max, e.warranty_term_months), 0);

  useEffect(() => {
    if (maxWarrantyTerm > 0 && warrantyStartDate) {
      const endDate = new Date(warrantyStartDate);
      endDate.setMonth(endDate.getMonth() + maxWarrantyTerm);
      setWarrantyEndDate(endDate.toISOString().split('T')[0]);
    }
  }, [maxWarrantyTerm, warrantyStartDate]);

  const [warrantyEndDate, setWarrantyEndDate] = useState('');

  async function handleSave() {
    if (!contactId) { setError('Please select a customer'); return; }
    if (selectedEquipment.length === 0) { setError('Please select at least one equipment item to cover'); return; }
    if (!price || parseFloat(price) <= 0) { setError('Please enter a valid price'); return; }
    if (!warrantyStartDate || !warrantyEndDate) { setError('Please set warranty start and end dates'); return; }
    if (!warrantyPlanId) { setError('Warranty billing plan not found. Please contact admin.'); return; }

    setSaving(true);
    setError('');
    try {
      const numericPrice = parseFloat(price);
      const today = new Date();
      const nextBillingDate = new Date(today);
      if (billingFrequency === 'yearly') {
        nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1);
      } else {
        nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
      }

      const { data: sub, error: subError } = await supabase
        .from('recurring_subscriptions')
        .insert({
          contact_id: contactId,
          plan_id: warrantyPlanId,
          custom_amount: numericPrice,
          start_date: today.toISOString().split('T')[0],
          next_billing_date: nextBillingDate.toISOString().split('T')[0],
          billing_day: today.getDate(),
          auto_invoice: true,
          auto_send: false,
          auto_renew: true,
          status: 'active',
        })
        .select()
        .single();

      if (subError) throw subError;

      const { data: contract, error: contractError } = await supabase
        .from('security_contracts')
        .insert({
          contact_id: contactId,
          subscription_id: sub.id,
          agreement_type: 'equipment_warranty',
          system_type: systemType,
          billing_frequency_override: billingFrequency,
          monthly_price: numericPrice,
          term_months: termMonths,
          renewal_term_months: renewalTermMonths,
          cancellation_notice_days: 30,
          warranty_start_date: warrantyStartDate,
          warranty_end_date: warrantyEndDate,
          status: 'active',
          activated_at: new Date().toISOString(),
          approved_at: new Date().toISOString(),
          notes: notes || null,
        })
        .select()
        .single();

      if (contractError) throw contractError;

      const equipmentRows = selectedEquipment.map(e => ({
        contract_id: contract.id,
        product_id: e.product_id,
        equipment_type: e.product_name,
        quantity: Math.round(e.quantity),
        warranty_term_months: e.warranty_term_months,
        warranty_provider: e.warranty_provider,
      }));

      const { error: equipError } = await supabase
        .from('security_contract_equipment')
        .insert(equipmentRows);

      if (equipError) throw equipError;

      onCreated();
    } catch (err: any) {
      console.error('Error creating warranty agreement:', err);
      setError(err.message || 'Failed to create warranty agreement');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-600" />
            Create Equipment Warranty Agreement
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Customer *</label>
            {contactId ? (
              <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <span className="text-sm font-medium text-gray-900">{contactName}</span>
                <button
                  onClick={() => { setContactId(''); setContactName(''); setEquipment([]); setSelectedEquipment([]); }}
                  className="text-gray-400 hover:text-red-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search customers by name or email..."
                    value={contactSearch}
                    onChange={(e) => { setContactSearch(e.target.value); searchContacts(e.target.value); }}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                {searchingContacts && <p className="text-xs text-gray-400 mt-1">Searching...</p>}
                {contactResults.length > 0 && (
                  <div className="mt-2 border border-gray-200 rounded-lg max-h-48 overflow-y-auto">
                    {contactResults.map(c => (
                      <button
                        key={c.id}
                        onClick={() => selectContact(c)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                      >
                        <span className="text-sm font-medium text-gray-900">{c.full_name}</span>
                        <span className="text-xs text-gray-500 ml-2">{c.email}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">System Type *</label>
              <select
                value={systemType}
                onChange={(e) => setSystemType(e.target.value as SystemType)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="security">Security</option>
                <option value="surveillance" disabled>Surveillance (Coming Soon)</option>
                <option value="access_control" disabled>Access Control (Coming Soon)</option>
                <option value="audio_video" disabled>Audio / Video (Coming Soon)</option>
                <option value="automation" disabled>Automation (Coming Soon)</option>
                <option value="networking" disabled>Networking (Coming Soon)</option>
                <option value="lighting_control" disabled>Lighting Control (Coming Soon)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Billing Frequency *</label>
              <select
                value={billingFrequency}
                onChange={(e) => setBillingFrequency(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="yearly">Yearly (billed annually)</option>
                <option value="monthly">Monthly (billed monthly)</option>
              </select>
            </div>
          </div>

          {contactId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Purchased Equipment (Eligible if &lt; {EQUIPMENT_WARRANTY_MAX_AGE_MONTHS} months old) *
              </label>
              {loadingEquipment ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : equipment.length === 0 ? (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                  <Package className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No purchased equipment found for this customer</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-2">
                  {equipment.map((item, idx) => {
                    const isSelected = selectedEquipment.some(e => e.product_id === item.product_id);
                    const isEligible = item.age_months === null || item.age_months < EQUIPMENT_WARRANTY_MAX_AGE_MONTHS;
                    return (
                      <div
                        key={`${item.product_id}-${idx}`}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                          isSelected ? 'bg-amber-50 border-amber-300' :
                          isEligible ? 'bg-white border-gray-200 hover:border-amber-200 cursor-pointer' :
                          'bg-gray-50 border-gray-200 opacity-60'
                        }`}
                        onClick={() => isEligible && toggleEquipment(item)}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!isEligible}
                          onChange={() => toggleEquipment(item)}
                          className="w-4 h-4 rounded"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{item.product_name}</p>
                          <p className="text-xs text-gray-500">
                            {item.manufacturer || '—'} {item.model_number ? `· ${item.model_number}` : ''}
                            {' · Qty: '}{item.quantity}
                            {' · $'}{item.unit_price.toFixed(2)}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          {item.age_months !== null && (
                            <p className={`text-xs font-medium ${isEligible ? 'text-green-600' : 'text-red-600'}`}>
                              {item.age_months} mo old
                            </p>
                          )}
                          {item.purchase_date && (
                            <p className="text-xs text-gray-400">
                              {new Date(item.purchase_date).toLocaleDateString()}
                            </p>
                          )}
                          {!isEligible && (
                            <p className="text-xs text-red-500">Not eligible</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {selectedEquipment.length > 0 && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">Warranty Details Per Item</label>
              {selectedEquipment.map(e => (
                <div key={e.product_id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{e.product_name}</p>
                    <p className="text-xs text-gray-500">{e.manufacturer || '—'} · Qty {e.quantity}</p>
                  </div>
                  <input
                    type="number"
                    placeholder="Term (mo)"
                    value={e.warranty_term_months}
                    onChange={(ev) => updateEquipmentItem(e.product_id, 'warranty_term_months', parseInt(ev.target.value) || 0)}
                    className="w-24 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                  <input
                    type="text"
                    placeholder="Provider"
                    value={e.warranty_provider}
                    onChange={(ev) => updateEquipmentItem(e.product_id, 'warranty_provider', ev.target.value)}
                    className="w-32 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              ))}
              <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg text-sm">
                <span className="text-gray-600">Total Equipment Value:</span>
                <span className="font-semibold text-gray-900">${totalEquipmentValue.toFixed(2)}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Warranty Start Date *</label>
              <input
                type="date"
                value={warrantyStartDate}
                onChange={(e) => setWarrantyStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Warranty End Date *</label>
              <input
                type="date"
                value={warrantyEndDate}
                onChange={(e) => setWarrantyEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Price *</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Term (months)</label>
              <select
                value={termMonths}
                onChange={(e) => setTermMonths(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value={12}>12 months</option>
                <option value={24}>24 months</option>
                <option value={36}>36 months</option>
                <option value={48}>48 months</option>
                <option value={60}>60 months</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Renewal Term</label>
              <select
                value={renewalTermMonths}
                onChange={(e) => setRenewalTermMonths(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value={12}>12 months</option>
                <option value={24}>24 months</option>
                <option value={36}>36 months</option>
                <option value={48}>48 months</option>
                <option value={60}>60 months</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="Additional notes about this warranty agreement..."
            />
          </div>

          <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700 flex items-start gap-2">
            <Calendar className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>This agreement will auto-renew unless cancelled at least 30 days before the renewal date.</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 sticky bottom-0 bg-white">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !contactId || selectedEquipment.length === 0 || !price}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Create Agreement
          </button>
        </div>
      </div>
    </div>
  );
}
