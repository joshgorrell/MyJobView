import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { X, Search } from 'lucide-react';

interface CreateSubscriptionModalProps {
  subscription?: any;
  onClose: () => void;
  onSaved: () => void;
}

export default function CreateSubscriptionModal({ subscription, onClose, onSaved }: CreateSubscriptionModalProps) {
  const [contacts, setContacts] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [nextBillingDate, setNextBillingDate] = useState('');
  const [billingDay, setBillingDay] = useState('');
  const [autoInvoice, setAutoInvoice] = useState(true);
  const [autoSend, setAutoSend] = useState(false);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadContacts();
    loadPlans();

    if (subscription) {
      setSelectedContactId(subscription.contact_id || '');
      setSelectedPlanId(subscription.plan_id || '');
      setCustomAmount(subscription.custom_amount?.toString() || '');
      setStartDate(subscription.start_date || '');
      setNextBillingDate(subscription.next_billing_date || '');
      setBillingDay(subscription.billing_day?.toString() || '');
      setAutoInvoice(subscription.auto_invoice ?? true);
      setAutoSend(subscription.auto_send ?? false);
      setNotes(subscription.notes || '');
    } else {
      const today = new Date().toISOString().split('T')[0];
      setStartDate(today);
      setNextBillingDate(today);
    }
  }, [subscription]);

  async function loadContacts() {
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, contact_name, email')
        .order('contact_name');

      if (error) throw error;
      setContacts(data || []);
    } catch (error) {
      console.error('Error loading contacts:', error);
    }
  }

  async function loadPlans() {
    try {
      const { data, error } = await supabase
        .from('recurring_plans')
        .select('*')
        .eq('is_active', true)
        .order('plan_name');

      if (error) throw error;
      setPlans(data || []);
    } catch (error) {
      console.error('Error loading plans:', error);
    }
  }

  async function handleSave() {
    if (!selectedContactId || !selectedPlanId || !startDate || !nextBillingDate) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      setSaving(true);

      const { data: companySettings } = await supabase
        .from('company_settings')
        .select('id')
        .maybeSingle();

      if (!companySettings) {
        alert('Company settings not found');
        return;
      }

      const subscriptionData = {
        company_id: companySettings.id,
        contact_id: selectedContactId,
        plan_id: selectedPlanId,
        custom_amount: customAmount ? parseFloat(customAmount) : null,
        start_date: startDate,
        next_billing_date: nextBillingDate,
        billing_day: billingDay ? parseInt(billingDay) : null,
        auto_invoice: autoInvoice,
        auto_send: autoSend,
        notes,
        status: 'active',
      };

      if (subscription) {
        const { error } = await supabase
          .from('recurring_subscriptions')
          .update(subscriptionData)
          .eq('id', subscription.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('recurring_subscriptions')
          .insert(subscriptionData);

        if (error) throw error;
      }

      onSaved();
    } catch (error) {
      console.error('Error saving subscription:', error);
      alert('Failed to save subscription');
    } finally {
      setSaving(false);
    }
  }

  const filteredContacts = contacts.filter(contact =>
    contact.contact_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    contact.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-2xl border border-gray-700 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-700 sticky top-0 bg-gray-800">
          <h2 className="text-xl font-bold text-white">
            {subscription ? 'Edit Subscription' : 'Create New Subscription'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Contact *
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-10 pr-4 py-2 text-white mb-2"
                placeholder="Search contacts..."
              />
            </div>
            <select
              value={selectedContactId}
              onChange={(e) => setSelectedContactId(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
            >
              <option value="">Select a contact</option>
              {filteredContacts.map(contact => (
                <option key={contact.id} value={contact.id}>
                  {contact.contact_name} {contact.email ? `(${contact.email})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Plan *
            </label>
            <select
              value={selectedPlanId}
              onChange={(e) => setSelectedPlanId(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
            >
              <option value="">Select a plan</option>
              {plans.map(plan => (
                <option key={plan.id} value={plan.id}>
                  {plan.plan_name} - ${plan.amount} ({plan.billing_frequency})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Custom Amount (optional)
            </label>
            <input
              type="number"
              step="0.01"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
              placeholder="Leave blank to use plan amount"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Start Date *
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Next Billing Date *
              </label>
              <input
                type="date"
                value={nextBillingDate}
                onChange={(e) => setNextBillingDate(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Billing Day (1-31, optional)
            </label>
            <input
              type="number"
              min="1"
              max="31"
              value={billingDay}
              onChange={(e) => setBillingDay(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
              placeholder="Defaults to 1st of month"
            />
            <p className="text-xs text-gray-400 mt-1">
              Drafts are scheduled on the 1st of the month unless otherwise specified
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="autoInvoice"
                checked={autoInvoice}
                onChange={(e) => setAutoInvoice(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <label htmlFor="autoInvoice" className="text-sm text-gray-300">
                Automatically create invoices
              </label>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="autoSend"
                checked={autoSend}
                onChange={(e) => setAutoSend(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <label htmlFor="autoSend" className="text-sm text-gray-300">
                Automatically send invoices
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
              rows={3}
              placeholder="Additional notes..."
            />
          </div>
        </div>

        <div className="flex gap-3 p-6 border-t border-gray-700">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : subscription ? 'Update Subscription' : 'Create Subscription'}
          </button>
        </div>
      </div>
    </div>
  );
}
