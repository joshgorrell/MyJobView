import React, { useState, useEffect } from 'react';
import { DollarSign, Calendar, Percent, Package, TrendingUp, Info, Plus, Trash2, GripVertical, AlertTriangle, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface PaymentScheduleItem {
  id?: string;
  name: string;
  type: 'deposit' | 'progress' | 'final';
  amount_type: 'percentage' | 'fixed';
  amount: number;
  due_timing: string;
}

export interface BillingPhase {
  id?: string;
  phase_order: number;
  title: string;
  amount_type: 'percentage' | 'fixed';
  amount: number;
  notes?: string;
}

interface DepositConfigurationProps {
  proposalId?: string;
  requireDeposit: boolean;
  depositType: 'percentage' | 'parts_total' | 'custom' | 'none';
  depositPercent: number;
  depositAmount: number;
  acceptanceMethods: string[];
  paymentSchedule?: PaymentScheduleItem[];
  progressBillingType?: 'monthly' | 'completion' | 'none';
  progressInvoiceTerms?: 'net_10' | 'net_30' | 'net_45' | 'net_60' | 'due_on_receipt';
  balancePaymentTerms?: string;
  billingPhases?: BillingPhase[];
  onChange: (field: string, value: any) => void;
  onBillingPhasesChange?: (phases: BillingPhase[]) => void;
}

export default function DepositConfiguration({
  proposalId,
  requireDeposit,
  depositType,
  depositPercent,
  depositAmount,
  acceptanceMethods,
  paymentSchedule = [],
  progressBillingType = 'completion',
  progressInvoiceTerms = 'net_30',
  balancePaymentTerms = 'Upon project completion or progress',
  billingPhases: externalBillingPhases,
  onChange,
  onBillingPhasesChange
}: DepositConfigurationProps) {
  const [partsTotal, setPartsTotal] = useState(0);
  const [laborTotal, setLaborTotal] = useState(0);
  const [proposalTotal, setProposalTotal] = useState(0);
  const [customDepositAmount, setCustomDepositAmount] = useState(depositAmount || 0);
  const [taxTotal, setTaxTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [billingPhases, setBillingPhases] = useState<BillingPhase[]>(externalBillingPhases || []);
  const [phasesLoaded, setPhasesLoaded] = useState(false);
  const [phaseInputValues, setPhaseInputValues] = useState<Record<number, string>>({});
  const [customDepositInput, setCustomDepositInput] = useState(String(depositAmount || 0));

  useEffect(() => {
    if (proposalId) {
      loadProposalTotals();
    }
  }, [proposalId]);

  useEffect(() => {
    if (depositType !== 'custom') {
      updateDefaultSchedule();
    }
  }, [depositType, depositPercent, customDepositAmount, proposalTotal, partsTotal]);

  useEffect(() => {
    handleDepositTypeChange();
  }, [depositType]);

  useEffect(() => {
    if (externalBillingPhases && !phasesLoaded) {
      setBillingPhases(externalBillingPhases);
    }
  }, [externalBillingPhases]);

  async function loadProposalTotals() {
    if (!proposalId) return;

    try {
      setLoading(true);

      const { data: proposal, error } = await supabase
        .from('proposals')
        .select('parts_total, labor_total, tax_amount, total')
        .eq('id', proposalId)
        .maybeSingle();

      if (error) throw error;

      if (proposal) {
        setPartsTotal(proposal.parts_total || 0);
        setLaborTotal(proposal.labor_total || 0);
        setTaxTotal(proposal.tax_amount || 0);
        setProposalTotal(proposal.total || 0);
      }

      if (!phasesLoaded && proposalId) {
        await loadBillingPhases();
      }
    } catch (error) {
      console.error('Error loading proposal totals:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadBillingPhases() {
    if (!proposalId) return;
    try {
      const { data, error } = await supabase
        .from('proposal_billing_phases')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('phase_order');

      if (error) throw error;

      if (data && data.length > 0) {
        const phases: BillingPhase[] = data.map(row => ({
          id: row.id,
          phase_order: row.phase_order,
          title: row.title,
          amount_type: row.amount_type,
          amount: row.amount,
          notes: row.notes || ''
        }));
        setBillingPhases(phases);
        onBillingPhasesChange?.(phases);
      } else if (depositType === 'custom' && data?.length === 0) {
        const defaultPhases = getDefaultCustomPhases();
        setBillingPhases(defaultPhases);
        onBillingPhasesChange?.(defaultPhases);
      }
      setPhasesLoaded(true);
    } catch (error) {
      console.error('Error loading billing phases:', error);
    }
  }

  function getDefaultCustomPhases(): BillingPhase[] {
    return [
      { phase_order: 0, title: 'At Acceptance', amount_type: 'percentage', amount: 50 },
      { phase_order: 1, title: 'Upon Completion', amount_type: 'percentage', amount: 50 }
    ];
  }

  function handleDepositTypeChange() {
    if (depositType === 'none') {
      onChange('require_deposit', false);
      onChange('progress_invoice_terms', 'net_30');
      if (!acceptanceMethods.includes('purchase_order')) {
        onChange('acceptance_methods', [...acceptanceMethods, 'purchase_order']);
      }
      onChange('balance_payment_terms', 'Net 30 from invoice date');
    } else {
      onChange('require_deposit', true);
      onChange('progress_invoice_terms', 'net_10');
      if (!acceptanceMethods.includes('payment')) {
        onChange('acceptance_methods', [...acceptanceMethods, 'payment']);
      }
      onChange('balance_payment_terms', 'Upon project completion');
      if (depositType === 'percentage') {
        onChange('deposit_amount', 0);
      } else if (depositType === 'parts_total') {
        onChange('deposit_amount', partsTotal);
      }
    }

    if (depositType === 'custom' && !phasesLoaded && proposalId) {
      loadBillingPhases();
    } else if (depositType === 'custom' && billingPhases.length === 0) {
      const defaults = getDefaultCustomPhases();
      setBillingPhases(defaults);
      onBillingPhasesChange?.(defaults);
    }
  }

  function updateDefaultSchedule() {
    if (!requireDeposit || depositType === 'none' || depositType === 'custom') {
      if (depositType !== 'custom') {
        onChange('payment_schedule', []);
      }
      return;
    }

    const schedule: PaymentScheduleItem[] = [];

    if (depositType === 'percentage') {
      schedule.push({
        name: 'Deposit',
        type: 'deposit',
        amount_type: 'percentage',
        amount: depositPercent,
        due_timing: 'Upon acceptance'
      });
      schedule.push({
        name: 'Progress Billing',
        type: 'progress',
        amount_type: 'percentage',
        amount: 100 - depositPercent,
        due_timing: 'Monthly as work is performed'
      });
    } else if (depositType === 'parts_total') {
      const remainingBalance = proposalTotal - partsTotal;
      schedule.push({
        name: 'Deposit',
        type: 'deposit',
        amount_type: 'fixed',
        amount: partsTotal,
        due_timing: 'Upon acceptance'
      });
      schedule.push({
        name: 'Progress Billing',
        type: 'progress',
        amount_type: 'fixed',
        amount: remainingBalance,
        due_timing: 'Monthly as work is performed'
      });
    }

    onChange('payment_schedule', schedule);
  }

  function handlePhaseChange(index: number, field: keyof BillingPhase, value: any) {
    const updated = billingPhases.map((p, i) => i === index ? { ...p, [field]: value } : p);
    setBillingPhases(updated);
    onBillingPhasesChange?.(updated);
  }

  function addPhase() {
    const newPhase: BillingPhase = {
      phase_order: billingPhases.length,
      title: '',
      amount_type: 'percentage',
      amount: 0
    };
    const updated = [...billingPhases, newPhase];
    setBillingPhases(updated);
    onBillingPhasesChange?.(updated);
  }

  function removePhase(index: number) {
    const updated = billingPhases
      .filter((_, i) => i !== index)
      .map((p, i) => ({ ...p, phase_order: i }));
    setBillingPhases(updated);
    onBillingPhasesChange?.(updated);
  }

  function movePhase(index: number, direction: 'up' | 'down') {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === billingPhases.length - 1) return;
    const updated = [...billingPhases];
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    [updated[index], updated[swapIndex]] = [updated[swapIndex], updated[index]];
    const reordered = updated.map((p, i) => ({ ...p, phase_order: i }));
    setBillingPhases(reordered);
    onBillingPhasesChange?.(reordered);
  }

  const getPhasesTotal = () => {
    return billingPhases.reduce((sum, phase) => {
      if (phase.amount_type === 'percentage') {
        return sum + phase.amount;
      } else {
        return sum + phase.amount;
      }
    }, 0);
  };

  const getPhasesFixedTotal = () => {
    const allFixed = billingPhases.every(p => p.amount_type === 'fixed');
    const allPct = billingPhases.every(p => p.amount_type === 'percentage');
    if (allPct) return getPhasesTotal();
    if (allFixed) return getPhasesTotal();
    return null;
  };

  const hasOnlyPercentages = billingPhases.length > 0 && billingPhases.every(p => p.amount_type === 'percentage');
  const hasOnlyFixed = billingPhases.length > 0 && billingPhases.every(p => p.amount_type === 'fixed');
  const phasesTotal = getPhasesTotal();
  const pctTotal = hasOnlyPercentages ? phasesTotal : billingPhases.reduce((s, p) => p.amount_type === 'percentage' ? s + p.amount : s, 0);
  const isBalanced = hasOnlyPercentages
    ? Math.abs(phasesTotal - 100) < 0.01
    : hasOnlyFixed
    ? Math.abs(phasesTotal - proposalTotal) < 1
    : true;

  const hasMethod = (method: string) => acceptanceMethods?.includes(method);

  const toggleMethod = (method: string) => {
    const methods = acceptanceMethods || [];
    if (methods.includes(method)) {
      onChange('acceptance_methods', methods.filter(m => m !== method));
    } else {
      onChange('acceptance_methods', [...methods, method]);
    }
  };

  const calculateDepositAmount = () => {
    if (depositType === 'percentage') return (proposalTotal * depositPercent) / 100;
    if (depositType === 'parts_total') return partsTotal;
    if (depositType === 'custom') return customDepositAmount;
    return 0;
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          Deposit &amp; Payment Configuration
        </h2>
        <p className="text-sm text-blue-100 mt-1">Configure how customers will pay for this proposal</p>
      </div>

      <div className="p-6 space-y-6">
        {/* Require Deposit Toggle */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div>
            <label className="text-sm font-medium text-gray-900">Require Deposit</label>
            <p className="text-xs text-gray-500 mt-1">Customer must pay deposit to accept proposal</p>
          </div>
          <button
            type="button"
            onClick={() => onChange('require_deposit', !requireDeposit)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${requireDeposit ? 'bg-blue-600' : 'bg-gray-300'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${requireDeposit ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        {requireDeposit && (
          <>
            {/* Deposit Type Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-3">Deposit Type</label>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <button
                  type="button"
                  onClick={() => onChange('deposit_type', 'percentage')}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${depositType === 'percentage' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <Percent className={`w-5 h-5 mb-2 ${depositType === 'percentage' ? 'text-blue-600' : 'text-gray-400'}`} />
                  <div className="text-sm font-medium text-gray-900">Percentage</div>
                  <div className="text-xs text-gray-500 mt-1">% of total</div>
                </button>

                <button
                  type="button"
                  onClick={() => onChange('deposit_type', 'parts_total')}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${depositType === 'parts_total' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <Package className={`w-5 h-5 mb-2 ${depositType === 'parts_total' ? 'text-blue-600' : 'text-gray-400'}`} />
                  <div className="text-sm font-medium text-gray-900">Parts Total</div>
                  <div className="text-xs text-gray-500 mt-1">All materials</div>
                </button>

                <button
                  type="button"
                  onClick={() => onChange('deposit_type', 'custom')}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${depositType === 'custom' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <Calendar className={`w-5 h-5 mb-2 ${depositType === 'custom' ? 'text-blue-600' : 'text-gray-400'}`} />
                  <div className="text-sm font-medium text-gray-900">Custom Schedule</div>
                  <div className="text-xs text-gray-500 mt-1">Named phases</div>
                </button>

                <button
                  type="button"
                  onClick={() => onChange('deposit_type', 'none')}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${depositType === 'none' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <DollarSign className={`w-5 h-5 mb-2 ${depositType === 'none' ? 'text-blue-600' : 'text-gray-400'}`} />
                  <div className="text-sm font-medium text-gray-900">No Deposit</div>
                  <div className="text-xs text-gray-500 mt-1">PO only</div>
                </button>
              </div>
            </div>

            {/* Deposit Amount Configuration - Standard Types */}
            {depositType !== 'none' && depositType !== 'custom' && (
              <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg p-5 border border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-3">Configure Deposit Amount</label>

                    {depositType === 'percentage' && (
                      <div>
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            value={depositPercent}
                            onChange={(e) => onChange('deposit_percent', parseFloat(e.target.value))}
                            className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                          />
                          <div className="flex items-center gap-1 min-w-[100px]">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="1"
                              value={depositPercent}
                              onChange={(e) => onChange('deposit_percent', parseFloat(e.target.value) || 0)}
                              className="w-16 px-2 py-1.5 border border-gray-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="text-sm font-medium text-gray-700">%</span>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">Typical range: 25–50%</p>
                      </div>
                    )}

                    {depositType === 'parts_total' && (
                      <div>
                        <div className="bg-white rounded-lg p-4 border border-gray-300">
                          <div className="text-sm text-gray-600 mb-2">Materials Total:</div>
                          <div className="text-2xl font-bold text-gray-900">{formatCurrency(partsTotal)}</div>
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Adjust if needed:</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={partsTotal}
                              onChange={(e) => setPartsTotal(parseFloat(e.target.value) || 0)}
                              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-2">Customer pays all materials upfront</p>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-3">Deposit Summary</label>
                    <div className="bg-white rounded-lg p-4 border border-gray-300 space-y-3">
                      {loading ? (
                        <div className="text-center py-4 text-gray-500 text-sm">Loading totals...</div>
                      ) : (
                        <>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Subtotal:</span>
                            <span className="text-sm text-gray-900">{formatCurrency(partsTotal + laborTotal)}</span>
                          </div>
                          {taxTotal > 0 && (
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-600">Tax:</span>
                              <span className="text-sm text-gray-900">{formatCurrency(taxTotal)}</span>
                            </div>
                          )}
                          <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                            <span className="text-sm font-semibold text-gray-900">Proposal Total:</span>
                            <span className="text-sm font-bold text-gray-900">{formatCurrency(proposalTotal)}</span>
                          </div>
                          <div className="pt-3 border-t-2 border-gray-300">
                            <div className="flex justify-between items-center">
                              <span className="text-sm font-medium text-gray-900">Deposit Amount:</span>
                              <span className="text-xl font-bold text-blue-600">{formatCurrency(calculateDepositAmount())}</span>
                            </div>
                            {depositType === 'percentage' && (
                              <div className="text-xs text-gray-500 text-right mt-1">{depositPercent}% of total</div>
                            )}
                          </div>
                          <div className="flex justify-between items-center pt-2">
                            <span className="text-sm text-gray-600">Remaining Balance:</span>
                            <span className="text-sm font-medium text-gray-900">{formatCurrency(proposalTotal - calculateDepositAmount())}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Custom Schedule Builder */}
            {depositType === 'custom' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Custom Payment Schedule</h3>
                    <p className="text-xs text-gray-500 mt-0.5">Define named billing phases — use percentages, fixed amounts, or a mix</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Balance indicator */}
                    {billingPhases.length > 0 && (
                      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${
                        isBalanced
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {isBalanced
                          ? <CheckCircle className="w-3.5 h-3.5" />
                          : <AlertTriangle className="w-3.5 h-3.5" />
                        }
                        {hasOnlyPercentages
                          ? `${phasesTotal.toFixed(0)}% of total`
                          : hasOnlyFixed
                          ? `${formatCurrency(phasesTotal)} of ${formatCurrency(proposalTotal)}`
                          : `${pctTotal.toFixed(0)}% + fixed`
                        }
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={addPhase}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Schedule Entry
                    </button>
                  </div>
                </div>

                {billingPhases.length === 0 && (
                  <div className="text-center py-10 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                    <Calendar className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">No billing schedule entries defined yet</p>
                    <button
                      type="button"
                      onClick={addPhase}
                      className="mt-3 text-xs text-blue-600 hover:underline"
                    >
                      Add your first schedule entry
                    </button>
                  </div>
                )}

                <div className="space-y-2">
                  {billingPhases.map((phase, index) => (
                    <div
                      key={index}
                      className="bg-white border border-gray-200 rounded-lg p-4 flex items-start gap-3 hover:border-gray-300 transition-colors"
                    >
                      {/* Order controls */}
                      <div className="flex flex-col items-center gap-1 pt-1">
                        <button
                          type="button"
                          onClick={() => movePhase(index, 'up')}
                          disabled={index === 0}
                          className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed"
                          title="Move up"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <GripVertical className="w-4 h-4 text-gray-300" />
                        <button
                          type="button"
                          onClick={() => movePhase(index, 'down')}
                          disabled={index === billingPhases.length - 1}
                          className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed"
                          title="Move down"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>

                      {/* Phase number badge */}
                      <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {index + 1}
                      </div>

                      {/* Phase fields */}
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3">
                        {/* Title */}
                        <div className="md:col-span-1">
                          <label className="block text-xs font-medium text-gray-500 mb-1">Entry Name</label>
                          <input
                            type="text"
                            value={phase.title}
                            onChange={(e) => handlePhaseChange(index, 'title', e.target.value)}
                            placeholder="e.g. At Acceptance"
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>

                        {/* Amount type + amount */}
                        <div className="md:col-span-1">
                          <label className="block text-xs font-medium text-gray-500 mb-1">Amount</label>
                          <div className="flex items-center gap-2">
                            {/* Toggle: % vs $ */}
                            <div className="flex rounded-lg border border-gray-300 overflow-hidden flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => handlePhaseChange(index, 'amount_type', 'percentage')}
                                className={`px-2.5 py-2 text-xs font-medium transition-colors ${
                                  phase.amount_type === 'percentage'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white text-gray-600 hover:bg-gray-50'
                                }`}
                              >
                                %
                              </button>
                              <button
                                type="button"
                                onClick={() => handlePhaseChange(index, 'amount_type', 'fixed')}
                                className={`px-2.5 py-2 text-xs font-medium transition-colors ${
                                  phase.amount_type === 'fixed'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white text-gray-600 hover:bg-gray-50'
                                }`}
                              >
                                $
                              </button>
                            </div>
                            <div className="relative flex-1">
                              {phase.amount_type === 'fixed' && (
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                              )}
                              <input
                                type="text"
                                inputMode="decimal"
                                value={phaseInputValues[index] !== undefined ? phaseInputValues[index] : String(phase.amount)}
                                onChange={(e) => setPhaseInputValues(prev => ({ ...prev, [index]: e.target.value }))}
                                onFocus={(e) => {
                                  setPhaseInputValues(prev => ({ ...prev, [index]: String(phase.amount) }));
                                  e.target.select();
                                }}
                                onBlur={(e) => {
                                  const parsed = parseFloat(e.target.value);
                                  const clamped = isNaN(parsed) || parsed < 0 ? 0
                                    : phase.amount_type === 'percentage' ? Math.min(parsed, 100)
                                    : parsed;
                                  handlePhaseChange(index, 'amount', clamped);
                                  setPhaseInputValues(prev => { const n = { ...prev }; delete n[index]; return n; });
                                }}
                                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                className={`w-full py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                  phase.amount_type === 'fixed' ? 'pl-6 pr-3' : 'px-3'
                                }`}
                              />
                              {phase.amount_type === 'percentage' && (
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                              )}
                            </div>
                          </div>
                          {/* Show dollar equivalent for percentages */}
                          {phase.amount_type === 'percentage' && proposalTotal > 0 && (
                            <p className="text-xs text-gray-400 mt-1">
                              = {formatCurrency((proposalTotal * phase.amount) / 100)}
                            </p>
                          )}
                        </div>

                        {/* Notes */}
                        <div className="md:col-span-1">
                          <label className="block text-xs font-medium text-gray-500 mb-1">Notes (optional)</label>
                          <input
                            type="text"
                            value={phase.notes || ''}
                            onChange={(e) => handlePhaseChange(index, 'notes', e.target.value)}
                            placeholder="Internal notes"
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      {/* Remove button */}
                      <button
                        type="button"
                        onClick={() => removePhase(index)}
                        className="mt-0.5 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                        title="Remove phase"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Balance summary */}
                {billingPhases.length > 0 && (
                  <div className={`rounded-lg p-4 border ${
                    isBalanced ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
                  }`}>
                    <div className="flex items-start gap-3">
                      {isBalanced
                        ? <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                        : <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                      }
                      <div className="flex-1">
                        <p className={`text-sm font-medium ${isBalanced ? 'text-green-800' : 'text-amber-800'}`}>
                          {hasOnlyPercentages
                            ? isBalanced ? 'Schedule entries total 100% — balanced' : `Schedule entries total ${phasesTotal.toFixed(1)}% — should equal 100%`
                            : hasOnlyFixed
                            ? isBalanced ? 'Schedule entries match proposal total — balanced' : `Schedule entries total ${formatCurrency(phasesTotal)} vs proposal ${formatCurrency(proposalTotal)}`
                            : 'Mixed percentage and fixed amounts'
                          }
                        </p>
                        {!isBalanced && hasOnlyPercentages && (
                          <p className="text-xs text-amber-700 mt-1">
                            {phasesTotal < 100 ? `${(100 - phasesTotal).toFixed(1)}% unallocated` : `${(phasesTotal - 100).toFixed(1)}% over-allocated`}
                          </p>
                        )}
                        {!isBalanced && hasOnlyFixed && proposalTotal > 0 && (
                          <p className="text-xs text-amber-700 mt-1">
                            {phasesTotal < proposalTotal
                              ? `${formatCurrency(proposalTotal - phasesTotal)} unallocated`
                              : `${formatCurrency(phasesTotal - proposalTotal)} over-allocated`
                            }
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Invoice draft note */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-blue-900">Draft invoices will be pre-created</p>
                    <p className="text-xs text-blue-700 mt-1">
                      When this proposal is accepted and becomes a Sales Order, draft invoices will be pre-created for each phase above.
                      You can review, modify, and send them when each phase is ready to bill.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Payment Terms Configuration - Standard Types */}
            {depositType !== 'none' && depositType !== 'custom' && calculateDepositAmount() < proposalTotal && (
              <div className="bg-amber-50 rounded-lg p-5 border border-amber-200">
                <div className="flex items-start gap-3 mb-4">
                  <TrendingUp className="w-5 h-5 text-amber-600 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Progress Billing Terms</h3>
                    <p className="text-xs text-amber-700 mt-1">
                      Progress invoices are billed monthly as work progresses (or earlier if project completes).
                      {hasMethod('purchase_order') && ' Net 30 terms are recommended for PO customers.'}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                      Progress Invoice Payment Terms
                      {hasMethod('purchase_order') && (
                        <span className="ml-2 text-xs text-amber-600 font-normal">(Net 30 recommended for PO)</span>
                      )}
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: 'due_on_receipt', label: 'Due on Receipt' },
                        { value: 'net_10', label: 'Net 10' },
                        { value: 'net_30', label: 'Net 30' }
                      ].map((term) => (
                        <button
                          key={term.value}
                          type="button"
                          onClick={() => {
                            onChange('progress_invoice_terms', term.value);
                            onChange('progress_billing_type', 'monthly');
                          }}
                          className={`p-2.5 rounded-lg border-2 transition-all text-center ${
                            progressInvoiceTerms === term.value
                              ? 'border-amber-600 bg-amber-100 font-semibold'
                              : 'border-gray-300 hover:border-gray-400 bg-white'
                          }`}
                        >
                          <div className="text-xs text-gray-900">{term.label}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Final Balance Due</label>
                    <input
                      type="text"
                      value={balancePaymentTerms}
                      onChange={(e) => onChange('balance_payment_terms', e.target.value)}
                      placeholder="e.g., Upon project completion, Net 30 from completion"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Payment Schedule Preview - Standard Types */}
            {depositType !== 'none' && depositType !== 'custom' && paymentSchedule.length > 0 && (
              <div className="bg-blue-50 rounded-lg p-5 border border-blue-200">
                <div className="flex items-start gap-3 mb-4">
                  <Calendar className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Payment Schedule Preview</h3>
                    <p className="text-xs text-blue-700 mt-1">How this will appear on the proposal</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {paymentSchedule.map((item, index) => (
                    <div key={index} className="bg-white rounded-lg p-4 border border-blue-200">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-blue-600" />
                            <span className="text-sm font-medium text-gray-900">{item.name}</span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">{item.due_timing}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-base font-semibold text-gray-900">
                            {item.amount_type === 'percentage' ? `${item.amount}%` : formatCurrency(item.amount)}
                          </div>
                          {item.amount_type === 'percentage' && (
                            <div className="text-xs text-gray-500">{formatCurrency((proposalTotal * item.amount) / 100)}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* PO Mode Notice */}
            {depositType === 'none' && (
              <div className="bg-blue-50 rounded-lg p-5 border border-blue-200">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-600 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-semibold text-blue-900">Purchase Order Mode Active</h3>
                    <p className="text-xs text-blue-700 mt-2">
                      No deposit required when accepting via Purchase Order. Customer will be invoiced with Net 30 payment terms.
                      Progress invoices will be billed monthly as work progresses.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Acceptance Methods */}
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-3">Acceptance Methods</label>
          <p className="text-xs text-gray-500 mb-3">How can customers accept this proposal?</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => toggleMethod('payment')}
              className={`p-4 rounded-lg border-2 transition-all text-left ${
                hasMethod('payment') ? 'border-green-600 bg-green-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={hasMethod('payment')}
                  readOnly
                  className="w-5 h-5 text-green-600 rounded focus:ring-2 focus:ring-green-500 mt-0.5"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">Pay Deposit Online</div>
                  <div className="text-xs text-gray-500 mt-1">Customer pays deposit via credit card/payment portal</div>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => toggleMethod('purchase_order')}
              className={`p-4 rounded-lg border-2 transition-all text-left ${
                hasMethod('purchase_order') ? 'border-green-600 bg-green-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={hasMethod('purchase_order')}
                  readOnly
                  className="w-5 h-5 text-green-600 rounded focus:ring-2 focus:ring-green-500 mt-0.5"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">Upload Purchase Order</div>
                  <div className="text-xs text-gray-500 mt-1">Customer uploads PO document (commercial/government)</div>
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-medium text-amber-900 mb-2">How Payment Works:</h4>
              <ul className="text-xs text-amber-800 space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 mt-0.5">•</span>
                  <span>Upon acceptance, system creates a Sales Order and Project automatically</span>
                </li>
                {depositType === 'custom' ? (
                  <li className="flex items-start gap-2">
                    <span className="text-amber-600 mt-0.5">•</span>
                    <span>Draft invoices are pre-created for each custom billing phase</span>
                  </li>
                ) : (
                  <li className="flex items-start gap-2">
                    <span className="text-amber-600 mt-0.5">•</span>
                    <span>Deposit invoice is generated immediately for payment methods</span>
                  </li>
                )}
                <li className="flex items-start gap-2">
                  <span className="text-amber-600 mt-0.5">•</span>
                  <span>Both acceptance methods can be enabled to give customers flexibility</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
