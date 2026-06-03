import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { X } from 'lucide-react';

interface CreatePlanModalProps {
  plan?: any;
  planType?: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function CreatePlanModal({ plan, planType, onClose, onSaved }: CreatePlanModalProps) {
  const [planName, setPlanName] = useState('');
  const [description, setDescription] = useState('');
  const [billingFrequency, setBillingFrequency] = useState('monthly');
  const [amount, setAmount] = useState('');
  const [taxRate, setTaxRate] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (plan) {
      setPlanName(plan.plan_name || '');
      setDescription(plan.description || '');
      setBillingFrequency(plan.billing_frequency || 'monthly');
      setAmount(plan.amount?.toString() || '');
      setTaxRate(plan.tax_rate ? (plan.tax_rate * 100).toString() : '');
      setIsActive(plan.is_active ?? true);
    }
  }, [plan]);

  async function handleSave() {
    if (!planName || !amount) {
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

      const planData = {
        company_id: companySettings.id,
        plan_name: planName,
        description,
        billing_frequency: billingFrequency,
        amount: parseFloat(amount),
        tax_rate: taxRate ? parseFloat(taxRate) / 100 : 0,
        is_active: isActive,
        plan_type: plan?.plan_type || planType || 'other',
      };

      if (plan) {
        const { error } = await supabase
          .from('recurring_plans')
          .update(planData)
          .eq('id', plan.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('recurring_plans')
          .insert(planData);

        if (error) throw error;
      }

      onSaved();
    } catch (error) {
      console.error('Error saving plan:', error);
      alert('Failed to save plan');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-md border border-gray-700">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">
            {plan ? 'Edit Plan' : 'Create New Plan'}
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
              Plan Name *
            </label>
            <input
              type="text"
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
              placeholder="e.g., Basic Subscription"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
              rows={3}
              placeholder="Plan description"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Billing Frequency *
            </label>
            <select
              value={billingFrequency}
              onChange={(e) => setBillingFrequency(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Amount *
            </label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
              placeholder="0.00"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Tax Rate (%)
            </label>
            <input
              type="number"
              step="0.01"
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
              placeholder="0.00"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <label htmlFor="isActive" className="text-sm text-gray-300">
              Plan is active
            </label>
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
            {saving ? 'Saving...' : plan ? 'Update Plan' : 'Create Plan'}
          </button>
        </div>
      </div>
    </div>
  );
}
