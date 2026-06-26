import { useState, useEffect, useCallback } from 'react';
import { X, DollarSign, Mail, FileText, Check, CreditCard, Banknote, Building2, ChevronDown, ChevronUp, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface OpenInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  total: number;
  amount_paid: number;
  amount_due: number;
  status: string;
}

interface AllocationRow extends OpenInvoice {
  allocation: string;
}

interface ApplyBulkPaymentModalProps {
  contactId: string;
  contactName: string;
  onClose: () => void;
  onSuccess: () => void;
}

const METHOD_OPTIONS = [
  { value: 'cash', label: 'Cash', icon: Banknote },
  { value: 'check', label: 'Check', icon: FileText },
  { value: 'credit_card', label: 'Credit Card', icon: CreditCard },
  { value: 'bank_transfer', label: 'ACH / Bank Transfer', icon: Building2 },
];

export function ApplyBulkPaymentModal({ contactId, contactName, onClose, onSuccess }: ApplyBulkPaymentModalProps) {
  const [invoices, setInvoices] = useState<OpenInvoice[]>([]);
  const [allocations, setAllocations] = useState<AllocationRow[]>([]);
  const [totalAmount, setTotalAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState('check');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [sendReceipt, setSendReceipt] = useState(false);
  const [customMessage, setCustomMessage] = useState('');
  const [showMethodPicker, setShowMethodPicker] = useState(false);

  const [ccFeeEnabled, setCcFeeEnabled] = useState(false);
  const [ccFeeType, setCcFeeType] = useState<'percentage' | 'flat'>('percentage');
  const [ccFeePercentage, setCcFeePercentage] = useState(0.03);
  const [ccFeeFlatAmount, setCcFeeFlatAmount] = useState(3.0);
  const [ccFeeLabel, setCcFeeLabel] = useState('Credit Card Convenience Fee');
  const [paymentProcessor, setPaymentProcessor] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [invoicesResult, contactResult, settingsResult, orgResult] = await Promise.all([
        supabase
          .from('invoices')
          .select('id, invoice_number, invoice_date, due_date, total, amount_paid, amount_due, status')
          .eq('contact_id', contactId)
          .not('status', 'in', '("paid","voided")')
          .order('invoice_date', { ascending: true }),
        supabase
          .from('contacts')
          .select('email')
          .eq('id', contactId)
          .maybeSingle(),
        supabase
          .from('company_settings')
          .select('cc_convenience_fee_enabled, cc_convenience_fee_type, cc_convenience_fee_percentage, cc_convenience_fee_flat_amount, cc_convenience_fee_label')
          .maybeSingle(),
        supabase
          .from('organizations')
          .select('payment_processor')
          .maybeSingle(),
      ]);

      const openInvoices = invoicesResult.data || [];
      setInvoices(openInvoices);
      setAllocations(openInvoices.map(inv => ({ ...inv, allocation: '' })));

      if (contactResult.data?.email) {
        setContactEmail(contactResult.data.email);
        setSendReceipt(true);
      }

      if (settingsResult.data) {
        const s = settingsResult.data;
        setCcFeeEnabled(s.cc_convenience_fee_enabled || false);
        setCcFeeType(s.cc_convenience_fee_type || 'percentage');
        setCcFeePercentage(Number(s.cc_convenience_fee_percentage) || 0.03);
        setCcFeeFlatAmount(Number(s.cc_convenience_fee_flat_amount) || 3.0);
        setCcFeeLabel(s.cc_convenience_fee_label || 'Credit Card Convenience Fee');
      }

      if (orgResult.data?.payment_processor) {
        setPaymentProcessor(orgResult.data.payment_processor);
      }
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load open invoices');
    } finally {
      setLoading(false);
    }
  }

  const totalEntered = parseFloat(totalAmount) || 0;
  const totalOutstanding = invoices.reduce((s, inv) => s + inv.amount_due, 0);
  const totalAllocated = allocations.reduce((s, row) => s + (parseFloat(row.allocation) || 0), 0);
  const remaining = totalEntered - totalAllocated;

  const convenienceFee = (() => {
    if (!ccFeeEnabled || paymentMethod !== 'credit_card') return 0;
    return ccFeeType === 'percentage' ? totalEntered * ccFeePercentage : ccFeeFlatAmount;
  })();

  const autoDistribute = useCallback((amount: string) => {
    const total = parseFloat(amount) || 0;
    if (total <= 0) {
      setAllocations(prev => prev.map(row => ({ ...row, allocation: '' })));
      return;
    }
    let remaining = total;
    setAllocations(prev =>
      prev.map(row => {
        if (remaining <= 0) return { ...row, allocation: '' };
        const apply = Math.min(remaining, row.amount_due);
        remaining -= apply;
        return { ...row, allocation: apply > 0 ? apply.toFixed(2) : '' };
      })
    );
  }, []);

  function handleTotalAmountChange(val: string) {
    setTotalAmount(val);
    autoDistribute(val);
  }

  function handleFillAll() {
    const val = totalOutstanding.toFixed(2);
    setTotalAmount(val);
    autoDistribute(val);
  }

  function handleAllocationChange(invoiceId: string, val: string) {
    setAllocations(prev => prev.map(row => row.id === invoiceId ? { ...row, allocation: val } : row));
  }

  function handleFillInvoice(invoiceId: string) {
    const row = allocations.find(r => r.id === invoiceId);
    if (!row) return;
    handleAllocationChange(invoiceId, row.amount_due.toFixed(2));
  }

  const hasOverAllocation = allocations.some(row => {
    const alloc = parseFloat(row.allocation) || 0;
    return alloc > row.amount_due;
  });

  const allocationExceedsTotal = totalAllocated > totalEntered + 0.005;
  const canSubmit = totalEntered > 0 && totalAllocated > 0 && !hasOverAllocation && !allocationExceedsTotal && !submitting && (paymentMethod !== 'check' || referenceNumber.trim() !== '');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError('');
    setSubmitting(true);

    const rows = allocations.filter(row => (parseFloat(row.allocation) || 0) > 0);

    try {
      const paymentNotes = convenienceFee > 0
        ? `${notes ? notes + '\n\n' : ''}${ccFeeLabel}: $${convenienceFee.toFixed(2)}`
        : notes || null;

      const insertedPaymentIds: string[] = [];
      const usesProcessor = (paymentMethod === 'credit_card' || paymentMethod === 'bank_transfer') && paymentProcessor;

      for (const row of rows) {
        const alloc = parseFloat(row.allocation);

        const { data: paymentData, error: paymentError } = await supabase
          .from('payments')
          .insert({
            invoice_id: row.id,
            contact_id: contactId,
            amount: alloc,
            payment_date: paymentDate,
            payment_method: paymentMethod,
            reference_number: referenceNumber || null,
            notes: paymentNotes,
            payment_processor: usesProcessor ? paymentProcessor : null,
          })
          .select('id')
          .single();

        if (paymentError) throw paymentError;
        insertedPaymentIds.push(paymentData.id);

        const newAmountPaid = row.amount_paid + alloc;
        const newAmountDue = row.total - newAmountPaid;
        const newStatus = newAmountDue <= 0.005 ? 'paid' : 'partial';

        const { error: invoiceError } = await supabase
          .from('invoices')
          .update({ amount_paid: newAmountPaid, amount_due: Math.max(0, newAmountDue), status: newStatus })
          .eq('id', row.id);

        if (invoiceError) throw invoiceError;
      }

      if (sendReceipt && contactEmail && insertedPaymentIds.length > 0) {
        const bulkSummary = rows.map((row, i) => ({
          paymentId: insertedPaymentIds[i],
          invoiceId: row.id,
          invoiceNumber: row.invoice_number,
          amountApplied: parseFloat(row.allocation),
          previousAmountDue: row.amount_due,
          newBalance: Math.max(0, row.amount_due - parseFloat(row.allocation)),
        }));

        try {
          await supabase.functions.invoke('send-payment-receipt', {
            body: {
              bulkMode: true,
              contactId,
              contactEmail,
              contactName,
              totalPaid: totalAllocated,
              paymentMethod,
              paymentDate,
              referenceNumber: referenceNumber || undefined,
              bulkSummary,
              customMessage: customMessage.trim() || undefined,
            },
          });
        } catch (emailErr) {
          console.error('Error sending bulk receipt:', emailErr);
        }
      }

      onSuccess();
    } catch (err) {
      console.error('Error recording bulk payment:', err);
      setError(err instanceof Error ? err.message : 'Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  }

  const selectedMethod = METHOD_OPTIONS.find(m => m.value === paymentMethod);
  const SelectedIcon = selectedMethod?.icon || DollarSign;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex flex-col justify-end sm:items-center sm:justify-center sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[94vh] sm:max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 bg-green-100 rounded-xl flex items-center justify-center shrink-0">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900 leading-tight">Apply Payment</h2>
              <p className="text-sm text-gray-500 truncate">{contactName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors touch-manipulation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-16">
            <div className="text-center">
              <div className="w-10 h-10 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-500">Loading open invoices...</p>
            </div>
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-16 px-6 text-center">
            <div>
              <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
              <p className="text-gray-700 font-semibold">No open invoices</p>
              <p className="text-sm text-gray-400 mt-1">{contactName} has no unpaid invoices.</p>
            </div>
          </div>
        ) : (
          <form id="bulk-payment-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto overscroll-contain">
            <div className="px-5 py-5 space-y-6">

              {error && (
                <div className="flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  {error}
                </div>
              )}

              {/* Outstanding summary banner */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-blue-600 font-medium uppercase tracking-wide">Total Outstanding</p>
                  <p className="text-2xl font-bold text-blue-900">${totalOutstanding.toFixed(2)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-blue-600 font-medium uppercase tracking-wide">Open Invoices</p>
                  <p className="text-2xl font-bold text-blue-900">{invoices.length}</p>
                </div>
              </div>

              {/* Total payment amount */}
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-2">
                  Total Payment Received <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium text-lg">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={totalAmount}
                    onChange={e => handleTotalAmountChange(e.target.value)}
                    required
                    className="w-full pl-9 pr-4 py-3.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent text-lg font-semibold touch-manipulation"
                    placeholder="0.00"
                    inputMode="decimal"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleFillAll}
                  className="mt-2.5 w-full py-2.5 bg-slate-700 hover:bg-slate-800 active:bg-slate-900 rounded-xl text-sm font-semibold text-white transition-colors touch-manipulation"
                >
                  Pay All Open — ${totalOutstanding.toFixed(2)}
                </button>
              </div>

              {/* Convenience fee */}
              {convenienceFee > 0 && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-sm space-y-1.5">
                  <p className="font-semibold text-amber-900">{ccFeeLabel}</p>
                  <div className="flex justify-between text-amber-800">
                    <span>Payment Amount</span>
                    <span>${totalEntered.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-amber-800">
                    <span>Fee ({ccFeeType === 'percentage' ? `${(ccFeePercentage * 100).toFixed(2)}%` : 'Flat'})</span>
                    <span>${convenienceFee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold pt-1.5 border-t border-amber-300 text-amber-900 text-base">
                    <span>Total to Charge</span>
                    <span>${(totalEntered + convenienceFee).toFixed(2)}</span>
                  </div>
                </div>
              )}

              {/* Payment method */}
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-2">Payment Method <span className="text-red-500">*</span></label>
                <button
                  type="button"
                  onClick={() => setShowMethodPicker(v => !v)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 border-2 border-gray-200 rounded-xl text-sm font-medium text-gray-800 hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <SelectedIcon className="w-4 h-4 text-gray-500" />
                    {selectedMethod?.label}
                  </div>
                  {showMethodPicker ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>
                {showMethodPicker && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {METHOD_OPTIONS.map(opt => {
                      const Icon = opt.icon;
                      const selected = paymentMethod === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => { setPaymentMethod(opt.value); setShowMethodPicker(false); }}
                          className={`flex items-center gap-2.5 px-3 py-3 rounded-xl border-2 text-sm font-medium transition-all touch-manipulation ${
                            selected
                              ? 'border-green-500 bg-green-50 text-green-700'
                              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                          }`}
                        >
                          <Icon className={`w-4 h-4 shrink-0 ${selected ? 'text-green-600' : 'text-gray-400'}`} />
                          <span className="truncate">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Processor info note for CC/ACH */}
              {(paymentMethod === 'credit_card' || paymentMethod === 'bank_transfer') && (
                <div className={`flex items-start gap-2.5 p-3 rounded-xl text-sm ${
                  paymentProcessor
                    ? 'bg-blue-50 border border-blue-200 text-blue-800'
                    : 'bg-amber-50 border border-amber-200 text-amber-800'
                }`}>
                  <Info className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    {paymentProcessor
                      ? <>Processed via <strong className="capitalize">{paymentProcessor.replace('_', '.')}</strong>. Record the transaction here after payment is collected.</>
                      : <>No payment processor configured. Go to Admin &gt; Integrations &gt; Payment Processor to set one up.</>
                    }
                  </span>
                </div>
              )}

              {/* Date and reference */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Payment Date <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={e => setPaymentDate(e.target.value)}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm touch-manipulation"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">
                    {paymentMethod === 'check' ? (
                      <>Check # <span className="text-red-500">*</span></>
                    ) : (
                      <>Reference # <span className="text-gray-400 font-normal ml-1 text-xs">optional</span></>
                    )}
                  </label>
                  <input
                    type="text"
                    value={referenceNumber}
                    onChange={e => setReferenceNumber(e.target.value)}
                    required={paymentMethod === 'check'}
                    placeholder={paymentMethod === 'check' ? 'Enter check number' : 'Transaction ID, etc.'}
                    className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm touch-manipulation ${
                      paymentMethod === 'check' ? 'border-gray-400 font-semibold' : 'border-gray-300'
                    }`}
                  />
                </div>
              </div>

              {/* Invoice allocation table */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-800">Invoice Allocations</h3>
                  <span className="text-xs text-gray-400">Oldest first — edit any amount below</span>
                </div>

                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] gap-0 bg-gray-50 border-b border-gray-200 px-4 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    <span>Invoice</span>
                    <span className="text-right pr-4">Amount Due</span>
                    <span className="text-right pr-4">Apply</span>
                    <span className="text-right">Balance</span>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {allocations.map((row, idx) => {
                      const alloc = parseFloat(row.allocation) || 0;
                      const newBalance = Math.max(0, row.amount_due - alloc);
                      const overAllocated = alloc > row.amount_due;
                      return (
                        <div key={row.id} className={`px-4 py-3 ${overAllocated ? 'bg-red-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                          {/* Mobile layout */}
                          <div className="sm:hidden space-y-2">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-sm font-semibold text-gray-900">#{row.invoice_number}</span>
                                <span className="ml-2 text-xs text-gray-400">{new Date(row.invoice_date).toLocaleDateString()}</span>
                              </div>
                              <span className="text-xs font-semibold text-gray-700">${row.amount_due.toFixed(2)} due</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="relative flex-1">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={row.allocation}
                                  onChange={e => handleAllocationChange(row.id, e.target.value)}
                                  placeholder="0.00"
                                  inputMode="decimal"
                                  className={`w-full pl-7 pr-3 py-2 border rounded-lg text-sm font-semibold focus:ring-2 focus:ring-green-500 focus:border-transparent touch-manipulation ${overAllocated ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => handleFillInvoice(row.id)}
                                className="px-2.5 py-2 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 whitespace-nowrap"
                              >
                                Full
                              </button>
                            </div>
                            {overAllocated && (
                              <p className="text-xs text-red-600 font-medium flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> Exceeds amount due by ${(alloc - row.amount_due).toFixed(2)}
                              </p>
                            )}
                            {alloc > 0 && !overAllocated && (
                              <p className="text-xs text-gray-500">Balance after: <span className={`font-semibold ${newBalance <= 0 ? 'text-green-600' : 'text-gray-700'}`}>${newBalance.toFixed(2)}</span></p>
                            )}
                          </div>

                          {/* Desktop layout */}
                          <div className="hidden sm:grid grid-cols-[1fr_auto_auto_auto] gap-0 items-center">
                            <div>
                              <div className="text-sm font-semibold text-gray-900">#{row.invoice_number}</div>
                              <div className="text-xs text-gray-400 mt-0.5">{new Date(row.invoice_date).toLocaleDateString()}{row.due_date ? ` · Due ${new Date(row.due_date).toLocaleDateString()}` : ''}</div>
                            </div>
                            <div className="text-right pr-4">
                              <span className="text-sm font-semibold text-gray-700">${row.amount_due.toFixed(2)}</span>
                            </div>
                            <div className="pr-4">
                              <div className="flex items-center gap-1.5">
                                <div className="relative">
                                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={row.allocation}
                                    onChange={e => handleAllocationChange(row.id, e.target.value)}
                                    placeholder="0.00"
                                    inputMode="decimal"
                                    className={`w-28 pl-6 pr-2 py-2 border rounded-lg text-sm font-semibold focus:ring-2 focus:ring-green-500 focus:border-transparent touch-manipulation ${overAllocated ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleFillInvoice(row.id)}
                                  className="px-2 py-2 text-xs font-medium bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 whitespace-nowrap"
                                >
                                  Full
                                </button>
                              </div>
                              {overAllocated && (
                                <p className="text-xs text-red-600 font-medium mt-1 flex items-center gap-1">
                                  <AlertCircle className="w-3 h-3" /> Over by ${(alloc - row.amount_due).toFixed(2)}
                                </p>
                              )}
                            </div>
                            <div className="text-right">
                              <span className={`text-sm font-semibold ${newBalance <= 0 && alloc > 0 ? 'text-green-600' : 'text-gray-700'}`}>
                                {alloc > 0 ? `$${newBalance.toFixed(2)}` : '—'}
                              </span>
                              {newBalance <= 0 && alloc > 0 && (
                                <div className="text-xs text-green-600 font-medium">Paid in full</div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Internal notes */}
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-2">Internal Notes</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Optional"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm resize-none touch-manipulation"
                />
              </div>

              {/* Receipt toggle */}
              <div className={`rounded-xl border-2 transition-colors ${sendReceipt ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-200'}`}>
                <button
                  type="button"
                  onClick={() => setSendReceipt(v => !v)}
                  disabled={!contactEmail}
                  className="w-full flex items-center gap-3 p-4 text-left disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
                >
                  <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors ${sendReceipt ? 'border-green-500 bg-green-500' : 'border-gray-400 bg-white'}`}>
                    {sendReceipt && <Check className="w-4 h-4 text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-green-600 shrink-0" />
                      <span className="text-sm font-semibold text-gray-900">Send payment receipt</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 ml-6 leading-relaxed">
                      {contactEmail
                        ? <><span className="text-gray-700 font-medium">{contactEmail}</span> will receive a combined receipt</>
                        : 'No email address on file for this contact'
                      }
                    </p>
                  </div>
                </button>
                {sendReceipt && contactEmail && (
                  <div className="px-4 pb-4 pt-1 border-t border-green-200">
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5 mt-2">
                      Personal note <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <textarea
                      value={customMessage}
                      onChange={e => setCustomMessage(e.target.value)}
                      rows={2}
                      placeholder="e.g. Thank you for the payment!"
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm resize-none"
                    />
                  </div>
                )}
              </div>

              <div className="h-2" />
            </div>
          </form>
        )}

        {/* Sticky footer tally + actions */}
        {!loading && invoices.length > 0 && (
          <div className="border-t border-gray-100 bg-white shrink-0">
            {/* Tally bar */}
            <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-xs text-gray-400 font-medium">Entered</div>
                <div className="text-sm font-bold text-gray-900">${totalEntered.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400 font-medium">Allocated</div>
                <div className={`text-sm font-bold ${allocationExceedsTotal ? 'text-red-600' : 'text-gray-900'}`}>${totalAllocated.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400 font-medium">Unallocated</div>
                <div className={`text-sm font-bold ${remaining < -0.005 ? 'text-red-600' : remaining > 0.005 ? 'text-amber-600' : 'text-green-600'}`}>
                  ${Math.abs(remaining).toFixed(2)}{remaining < -0.005 ? ' over' : remaining > 0.005 ? ' left' : ''}
                </div>
              </div>
            </div>
            {/* Validation messages */}
            {(hasOverAllocation || allocationExceedsTotal) && (
              <div className="px-5 py-2 flex items-center gap-2 text-xs text-red-600 bg-red-50 border-b border-red-100">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {hasOverAllocation ? 'One or more allocations exceed the invoice amount due.' : 'Total allocations exceed the payment amount entered.'}
              </div>
            )}
            {/* Action buttons */}
            <div className="px-5 pb-5 pt-3">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="py-3.5 border-2 border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-50 text-sm touch-manipulation"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="bulk-payment-form"
                  disabled={!canSubmit}
                  className="py-3.5 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 active:bg-green-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm touch-manipulation"
                >
                  {submitting
                    ? 'Saving...'
                    : `Record $${totalAllocated.toFixed(2)}`
                  }
                </button>
              </div>
              <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
