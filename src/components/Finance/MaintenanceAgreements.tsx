import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Search, Plus, Wrench, DollarSign, Calendar, X, AlertCircle, CheckCircle, Loader2, ChevronRight } from 'lucide-react';
import SecurityContractDetail from './SecurityContractDetail';
import { AGREEMENT_TYPE_COLORS, SYSTEM_TYPE_LABELS, SERVICE_SCHEDULE_LABELS, type AgreementType, type SystemType } from '../../lib/types';

interface MaintenanceAgreement {
  id: string;
  contract_number: string | null;
  status: string;
  monthly_price: number | null;
  term_months: number | null;
  renewal_term_months: number | null;
  billing_frequency_override: string | null;
  cancellation_notice_days: number | null;
  service_schedule: string | null;
  system_type: string | null;
  notes: string | null;
  created_at: string;
  activated_at: string | null;
  contact: { id: string; full_name: string; email: string; phone: string } | null;
  subscription: { id: string; next_billing_date: string; custom_amount: number; auto_renew: boolean; status: string } | null;
  sales_order: { id: string; order_number: string } | null;
}

export default function MaintenanceAgreements() {
  const [agreements, setAgreements] = useState<MaintenanceAgreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedAgreement, setSelectedAgreement] = useState<MaintenanceAgreement | null>(null);

  const loadAgreements = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('security_contracts')
        .select(`
          id, contract_number, status, monthly_price, term_months, renewal_term_months,
          billing_frequency_override, cancellation_notice_days, service_schedule, system_type,
          notes, created_at, activated_at,
          contact:contacts(id, full_name, email, phone),
          subscription:recurring_subscriptions(id, next_billing_date, custom_amount, auto_renew, status),
          sales_order:sales_orders(id, order_number)
        `)
        .eq('agreement_type', 'maintenance')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAgreements(data || []);
    } catch (error) {
      console.error('Error loading maintenance agreements:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAgreements();
    const channel = supabase
      .channel('maintenance_agreements_changes')
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
              <Wrench className="w-7 h-7 text-green-600" />
              Maintenance Agreements
            </h2>
            <p className="text-gray-500 mt-1">Manage system maintenance agreements with recurring billing</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
          >
            <Plus className="w-4 h-4" />
            Create Maintenance Agreement
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
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
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
            <Wrench className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No maintenance agreements found</p>
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
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Schedule</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Billing</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Price</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Next Billing</th>
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
                      <td className="px-4 py-3 text-sm text-gray-600">{a.service_schedule ? SERVICE_SCHEDULE_LABELS[a.service_schedule] || a.service_schedule : '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 capitalize">{a.billing_frequency_override || '—'}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        ${a.monthly_price ? a.monthly_price.toFixed(2) : (a.subscription?.custom_amount || 0).toFixed(2)}
                        <span className="text-gray-400 text-xs ml-1">/{a.billing_frequency_override === 'yearly' ? 'yr' : 'mo'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${statusBadgeColors[a.status] || 'bg-gray-100 text-gray-700'}`}>
                          {a.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {a.subscription?.next_billing_date ? new Date(a.subscription.next_billing_date).toLocaleDateString() : '—'}
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
          <CreateMaintenanceAgreementModal
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

function CreateMaintenanceAgreementModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [contactId, setContactId] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [contactResults, setContactResults] = useState<any[]>([]);
  const [searchingContacts, setSearchingContacts] = useState(false);

  const [systemType, setSystemType] = useState<SystemType>('security');
  const [salesOrderId, setSalesOrderId] = useState('');
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [serviceSchedule, setServiceSchedule] = useState<string>('annual');
  const [billingFrequency, setBillingFrequency] = useState<string>('yearly');
  const [price, setPrice] = useState('');
  const [termMonths, setTermMonths] = useState(12);
  const [renewalTermMonths, setRenewalTermMonths] = useState(12);
  const [notes, setNotes] = useState('');

  const [maintenancePlanId, setMaintenancePlanId] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('recurring_plans')
      .select('id')
      .eq('plan_type', 'maintenance_agreement')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => { if (data) setMaintenancePlanId(data.id); });
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

  async function loadSalesOrdersForContact(cId: string) {
    try {
      const { data, error } = await supabase
        .from('sales_orders')
        .select('id, order_number, status, contract_total, created_at')
        .eq('contact_id', cId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setSalesOrders(data || []);
    } catch (err) {
      console.error('Error loading sales orders:', err);
    }
  }

  function selectContact(contact: any) {
    setContactId(contact.id);
    setContactName(contact.full_name || '');
    setContactSearch('');
    setContactResults([]);
    loadSalesOrdersForContact(contact.id);
  }

  async function handleSave() {
    if (!contactId) { setError('Please select a customer'); return; }
    if (!price || parseFloat(price) <= 0) { setError('Please enter a valid price'); return; }
    if (!maintenancePlanId) { setError('Maintenance billing plan not found. Please contact admin.'); return; }

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
          plan_id: maintenancePlanId,
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
          sales_order_id: salesOrderId || null,
          agreement_type: 'maintenance' as AgreementType,
          system_type: systemType,
          service_schedule: serviceSchedule,
          billing_frequency_override: billingFrequency,
          monthly_price: numericPrice,
          term_months: termMonths,
          renewal_term_months: renewalTermMonths,
          cancellation_notice_days: 30,
          status: 'active',
          activated_at: new Date().toISOString(),
          approved_at: new Date().toISOString(),
          notes: notes || null,
        })
        .select()
        .single();

      if (contractError) throw contractError;

      onCreated();
    } catch (err: any) {
      console.error('Error creating maintenance agreement:', err);
      setError(err.message || 'Failed to create maintenance agreement');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-green-600" />
            Create Maintenance Agreement
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
              <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                <span className="text-sm font-medium text-gray-900">{contactName}</span>
                <button
                  onClick={() => { setContactId(''); setContactName(''); setSalesOrders([]); setSalesOrderId(''); }}
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
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Service Schedule *</label>
              <select
                value={serviceSchedule}
                onChange={(e) => setServiceSchedule(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="quarterly">Quarterly (4x / year)</option>
                <option value="semi_annual">Semi-Annual (2x / year)</option>
                <option value="annual">Annual (1x / year)</option>
              </select>
            </div>
          </div>

          {salesOrders.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Linked Sales Order (Optional)</label>
              <select
                value={salesOrderId}
                onChange={(e) => setSalesOrderId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">None</option>
                {salesOrders.map(so => (
                  <option key={so.id} value={so.id}>
                    {so.order_number} — ${so.contract_total?.toFixed(2)} ({so.status})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Billing Frequency *</label>
              <select
                value={billingFrequency}
                onChange={(e) => setBillingFrequency(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="yearly">Yearly (billed annually)</option>
                <option value="monthly">Monthly (billed monthly)</option>
              </select>
            </div>
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
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Term (months)</label>
              <select
                value={termMonths}
                onChange={(e) => setTermMonths(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value={12}>12 months</option>
                <option value={24}>24 months</option>
                <option value={36}>36 months</option>
                <option value={48}>48 months</option>
                <option value={60}>60 months</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Renewal Term (months)</label>
              <select
                value={renewalTermMonths}
                onChange={(e) => setRenewalTermMonths(parseInt(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Additional notes about this maintenance agreement..."
            />
          </div>

          <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700 flex items-start gap-2">
            <Calendar className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>This agreement will auto-renew unless cancelled at least 30 days before the renewal date.</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !contactId || !price}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Create Agreement
          </button>
        </div>
      </div>
    </div>
  );
}
