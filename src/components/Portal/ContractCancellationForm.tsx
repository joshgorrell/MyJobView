import { useState, useEffect } from 'react';
import { X, AlertTriangle, DollarSign, Calendar, CheckCircle, Loader2, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';

interface Contract {
  id: string;
  contract_number: string;
  start_date: string;
  end_date: string;
  monthly_rate: number;
  status: string;
}

interface CancellationFormProps {
  contractId?: string;
  contactId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const inputClass = 'w-full px-4 py-3.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-gray-900 placeholder-gray-400 text-sm';
const labelClass = 'block text-sm font-semibold text-gray-700 mb-1.5';

export function ContractCancellationForm({ contractId, contactId, onClose, onSuccess }: CancellationFormProps) {
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<'select' | 'form' | 'success'>('select');
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [selectedContractId, setSelectedContractId] = useState<string>(contractId || '');

  const [formData, setFormData] = useState({
    cancellation_reason: '',
    custom_reason: '',
    requested_end_date: '',
  });

  const [calculatedData, setCalculatedData] = useState({
    months_remaining: 0,
    is_early_termination: false,
    buyout_amount: 0,
    contract_end_date: '',
  });

  useEffect(() => {
    if (contractId) {
      loadContract(contractId);
    } else {
      loadActiveContracts();
    }
  }, [contractId, contactId]);

  async function loadActiveContracts() {
    try {
      const { data, error } = await supabase
        .from('security_contracts')
        .select('id, contract_number, start_date, end_date, monthly_rate, status')
        .eq('contact_id', contactId)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        setContracts(data);
        if (data.length === 1) {
          setSelectedContractId(data[0].id);
          setContract(data[0]);
          calculateCancellationDetails(data[0]);
          setStep('form');
        }
      }
    } catch (error) {
      console.error('Error loading contracts:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadContract(id: string) {
    try {
      const { data, error } = await supabase
        .from('security_contracts')
        .select('id, contract_number, start_date, end_date, monthly_rate, status')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setContract(data);
        calculateCancellationDetails(data);
        setStep('form');
      }
    } catch (error) {
      console.error('Error loading contract:', error);
    } finally {
      setLoading(false);
    }
  }

  function calculateCancellationDetails(contractData: Contract) {
    const today = new Date();
    const endDate = new Date(contractData.end_date);
    const monthsRemaining = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30));
    const daysRemaining = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const isEarlyTermination = daysRemaining > 90;
    const buyoutAmount = isEarlyTermination ? monthsRemaining * contractData.monthly_rate : 0;

    setCalculatedData({
      months_remaining: monthsRemaining,
      is_early_termination: isEarlyTermination,
      buyout_amount: buyoutAmount,
      contract_end_date: contractData.end_date,
    });

    const minDate = new Date();
    minDate.setDate(minDate.getDate() + 1);
    setFormData(prev => ({
      ...prev,
      requested_end_date: minDate.toISOString().split('T')[0],
    }));
  }

  function handleContractSelect(id: string) {
    const selected = contracts.find(c => c.id === id);
    if (selected) {
      setSelectedContractId(id);
      setContract(selected);
      calculateCancellationDetails(selected);
      setStep('form');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contract) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('security_contract_cancellations')
        .insert({
          contract_id: contract.id,
          contact_id: contactId,
          cancellation_reason: formData.cancellation_reason,
          custom_reason: formData.cancellation_reason === 'other' ? formData.custom_reason : null,
          requested_end_date: formData.requested_end_date,
          contract_end_date: calculatedData.contract_end_date,
          months_remaining: calculatedData.months_remaining,
          monthly_rate: contract.monthly_rate,
          buyout_amount: calculatedData.buyout_amount,
          is_early_termination: calculatedData.is_early_termination,
        });

      if (error) throw error;
      setStep('success');
    } catch (error) {
      console.error('Error submitting cancellation:', error);
      alert('Failed to submit cancellation request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-[#0f2347] animate-spin mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Loading your contracts...</p>
        </div>
      </div>
    );
  }

  if (step === 'select' && contracts.length > 1) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Select Contract to Cancel</h2>
          <p className="text-sm text-gray-500 mt-0.5">Choose which monitoring contract you'd like to cancel.</p>
        </div>
        <div className="p-6 space-y-3">
          {contracts.map((c) => (
            <button
              key={c.id}
              onClick={() => handleContractSelect(c.id)}
              className="w-full text-left p-4 sm:p-5 border-2 border-gray-200 hover:border-[#0f2347] hover:bg-[#0f2347]/5 rounded-2xl transition-all group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900 text-sm sm:text-base">{c.contract_number}</p>
                  <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                    {formatCurrency(c.monthly_rate)}/mo &middot; Ends {new Date(c.end_date).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-semibold">
                    Active
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-[#0f2347] transition-colors" />
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (step === 'success') {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 sm:p-10 max-w-lg mx-auto text-center">
        <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-green-100">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3">Request Submitted</h2>
        <p className="text-gray-500 mb-6 text-sm sm:text-base leading-relaxed">
          Your cancellation request has been submitted. Our team will review it and contact you within 1–2 business days to complete the process.
        </p>
        {calculatedData.is_early_termination && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6 text-left">
            <p className="text-sm text-orange-800 leading-relaxed">
              Your contract has an early termination buyout of{' '}
              <strong>{formatCurrency(calculatedData.buyout_amount)}</strong>.
              Our team will provide payment instructions.
            </p>
          </div>
        )}
        <button
          onClick={() => { onSuccess(); onClose(); }}
          className="w-full py-3.5 bg-[#0f2347] hover:bg-[#1a3a6e] text-white rounded-xl font-semibold transition-colors text-sm"
        >
          Return to Portal
        </button>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 sm:p-10 max-w-md mx-auto text-center">
        <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-5 border-4 border-orange-100">
          <AlertTriangle className="w-8 h-8 text-orange-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">No Active Contracts</h2>
        <p className="text-gray-500 mb-6 text-sm leading-relaxed">
          You don't have any active security monitoring contracts to cancel.
        </p>
        <button
          onClick={onClose}
          className="w-full py-3 border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl font-medium text-sm transition-colors"
        >
          Back to Portal
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden max-w-3xl mx-auto">
      <div className="px-5 sm:px-8 py-5 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Cancel Monitoring Contract</h2>
          <p className="text-sm text-gray-500 mt-0.5">Contract {contract.contract_number}</p>
        </div>
        <button onClick={onClose} className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-5 sm:p-8 space-y-5">
        {/* Contract Details */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5">
          <h3 className="font-semibold text-gray-900 text-sm mb-3">Contract Details</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Contract #', value: contract.contract_number },
              { label: 'Monthly Rate', value: formatCurrency(contract.monthly_rate) },
              { label: 'Contract Ends', value: new Date(contract.end_date).toLocaleDateString() },
              { label: 'Months Left', value: String(calculatedData.months_remaining) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white rounded-xl p-3 border border-slate-200">
                <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                <p className="font-bold text-gray-900 text-sm">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Fee Banner */}
        {calculatedData.is_early_termination ? (
          <div className="bg-orange-50 border-2 border-orange-200 rounded-2xl p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5 text-orange-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-orange-900 mb-1">Early Termination Fee Applies</h3>
                <p className="text-sm text-orange-800 mb-3 leading-relaxed">
                  Your contract has more than 90 days remaining. Cancelling early requires payment of the remaining contract value.
                </p>
                <div className="bg-white rounded-xl p-4 border border-orange-200 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-orange-700 font-medium">Total Buyout Amount</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {calculatedData.months_remaining} months &times; {formatCurrency(contract.monthly_rate)}/mo
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <DollarSign className="w-5 h-5 text-orange-600" />
                    <span className="text-2xl sm:text-3xl font-bold text-orange-900">
                      {formatCurrency(calculatedData.buyout_amount).replace('$', '')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4 sm:p-5 flex items-start gap-3">
            <div className="w-9 h-9 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-green-900 text-sm mb-0.5">No Early Termination Fee</h3>
              <p className="text-sm text-green-800 leading-relaxed">
                Your contract is within 90 days of completion. You can cancel without any additional charges.
              </p>
            </div>
          </div>
        )}

        {/* Form Fields */}
        <div className="space-y-4">
          <div>
            <label className={labelClass}>
              Reason for Cancellation <span className="text-red-400">*</span>
            </label>
            <select
              required
              value={formData.cancellation_reason}
              onChange={(e) => setFormData({ ...formData, cancellation_reason: e.target.value })}
              className={inputClass}
            >
              <option value="">Select a reason...</option>
              <option value="found_better_company">Found a company I like better</option>
              <option value="moving">Moving</option>
              <option value="not_using_enough">Not using it enough</option>
              <option value="found_better_price">Found a better price</option>
              <option value="financial_reasons">Financial reasons</option>
              <option value="switching_to_self_monitoring">Switching to self-monitoring</option>
              <option value="other">Other</option>
            </select>
          </div>

          {formData.cancellation_reason === 'other' && (
            <div>
              <label className={labelClass}>
                Please explain <span className="text-red-400">*</span>
              </label>
              <textarea
                required
                value={formData.custom_reason}
                onChange={(e) => setFormData({ ...formData, custom_reason: e.target.value })}
                rows={3}
                className={`${inputClass} resize-none`}
                placeholder="Please provide details..."
              />
            </div>
          )}

          <div>
            <label className={labelClass}>
              Requested Last Day of Service <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              required
              value={formData.requested_end_date}
              onChange={(e) => setFormData({ ...formData, requested_end_date: e.target.value })}
              min={new Date().toISOString().split('T')[0]}
              className={inputClass}
            />
            <p className="mt-2 text-xs text-gray-400 flex items-start gap-1.5">
              <Calendar className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              We bill on the 1st of each month. If you select a date after the 1st, you'll be billed for the full prior month.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3.5 border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl font-medium text-sm transition-colors min-h-[44px]"
          >
            Keep My Contract
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 py-3.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm min-h-[44px] flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit Cancellation Request'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
