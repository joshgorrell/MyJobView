import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import { X, RefreshCw } from 'lucide-react';

interface ConvertToRecurringModalProps {
  invoice: any;
  onClose: () => void;
  onConverted: () => void;
}

export default function ConvertToRecurringModal({ invoice, onClose, onConverted }: ConvertToRecurringModalProps) {
  const [planName, setPlanName] = useState(`${invoice.customer_name} - Recurring Invoice`);
  const [billingFrequency, setBillingFrequency] = useState('monthly');
  const [amount, setAmount] = useState(invoice.total.toString());
  const [billingDay, setBillingDay] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [autoInvoice, setAutoInvoice] = useState(true);
  const [autoSend, setAutoSend] = useState(false);
  const [notes, setNotes] = useState(`Converted from invoice ${invoice.invoice_number}`);
  const [converting, setConverting] = useState(false);

  async function handleConvert() {
    if (!amount || parseFloat(amount) <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    try {
      setConverting(true);

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
        description: `Recurring billing plan for ${invoice.customer_name}`,
        billing_frequency: billingFrequency,
        amount: parseFloat(amount),
        tax_rate: 0,
        is_active: true,
      };

      const { data: plan, error: planError } = await supabase
        .from('recurring_plans')
        .insert(planData)
        .select()
        .single();

      if (planError) throw planError;

      const nextBillingDate = calculateNextBillingDate(startDate, billingFrequency, billingDay ? parseInt(billingDay) : null);

      const subscriptionData = {
        company_id: companySettings.id,
        contact_id: invoice.contact_id,
        plan_id: plan.id,
        start_date: startDate,
        next_billing_date: nextBillingDate,
        billing_day: billingDay ? parseInt(billingDay) : null,
        auto_invoice: autoInvoice,
        auto_send: autoSend,
        notes,
        status: 'active',
      };

      const { error: subscriptionError } = await supabase
        .from('recurring_subscriptions')
        .insert(subscriptionData);

      if (subscriptionError) throw subscriptionError;

      alert('Successfully converted to recurring subscription!');
      onConverted();
    } catch (error) {
      console.error('Error converting to recurring:', error);
      alert('Failed to convert to recurring subscription');
    } finally {
      setConverting(false);
    }
  }

  function calculateNextBillingDate(start: string, frequency: string, day: number | null): string {
    const startDate = new Date(start);
    let nextDate = new Date(startDate);

    switch (frequency) {
      case 'daily':
        nextDate.setDate(nextDate.getDate() + 1);
        break;
      case 'weekly':
        nextDate.setDate(nextDate.getDate() + 7);
        break;
      case 'monthly':
        if (day && day >= 1 && day <= 31) {
          nextDate.setMonth(nextDate.getMonth() + 1);
          nextDate.setDate(day);
        } else {
          nextDate.setMonth(nextDate.getMonth() + 1);
        }
        break;
      case 'quarterly':
        nextDate.setMonth(nextDate.getMonth() + 3);
        break;
      case 'yearly':
        nextDate.setFullYear(nextDate.getFullYear() + 1);
        break;
      default:
        nextDate.setMonth(nextDate.getMonth() + 1);
    }

    return nextDate.toISOString().split('T')[0];
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-2xl border border-gray-700 max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-700 sticky top-0 bg-gray-800">
          <div className="flex items-center gap-3">
            <RefreshCw className="text-teal-400" size={24} />
            <div>
              <h2 className="text-xl font-bold text-white">Convert to Recurring</h2>
              <p className="text-sm text-gray-400">Create a recurring subscription from this invoice</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-gray-700/50 rounded-lg p-4 border border-gray-600">
            <h3 className="text-sm font-semibold text-white mb-2">Invoice Details</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-400">Invoice #:</span>
                <span className="text-white ml-2">{invoice.invoice_number}</span>
              </div>
              <div>
                <span className="text-gray-400">Customer:</span>
                <span className="text-white ml-2">{invoice.customer_name}</span>
              </div>
              <div>
                <span className="text-gray-400">Amount:</span>
                <span className="text-white ml-2">{formatCurrency(invoice.total)}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Plan Name *
            </label>
            <input
              type="text"
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
              placeholder="e.g., Monthly Service Agreement"
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
              Recurring Amount *
            </label>
            <input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white"
              placeholder="0.00"
            />
            <p className="text-xs text-gray-400 mt-1">
              Amount will be charged on each billing cycle
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                Automatically create invoices on billing dates
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
                Automatically send invoices to customer
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
              placeholder="Additional notes about this recurring subscription"
            />
          </div>

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-blue-400 mb-2">What happens next?</h4>
            <ul className="text-sm text-gray-300 space-y-1">
              <li>• A new recurring plan will be created</li>
              <li>• A subscription will be set up for this customer</li>
              <li>• Invoices will be generated automatically based on your settings</li>
              <li>• The original invoice remains unchanged</li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 p-4 sm:p-6 border-t border-gray-700">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConvert}
            disabled={converting}
            className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {converting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span className="hidden sm:inline">Converting...</span>
                <span className="sm:hidden">Converting...</span>
              </>
            ) : (
              <>
                <RefreshCw size={18} />
                <span className="hidden sm:inline">Convert to Recurring</span>
                <span className="sm:hidden">Convert</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
