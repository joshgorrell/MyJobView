import { useState, useEffect } from 'react';
import { X, DollarSign, Mail, FileText, Check, CreditCard, Banknote, Building2, Info } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface RecordPaymentModalProps {
  invoice: {
    id: string;
    invoice_number: string;
    contact_id: string;
    total: number;
    amount_paid: number;
    amount_due: number;
    contact_email?: string;
  };
  onClose: () => void;
  onSuccess: () => void;
}

const METHOD_OPTIONS = [
  { value: 'cash', label: 'Cash', icon: Banknote },
  { value: 'check', label: 'Check', icon: FileText },
  { value: 'credit_card', label: 'Credit Card', icon: CreditCard },
  { value: 'ach', label: 'ACH / Bank Transfer', icon: Building2 },
];

export function RecordPaymentModal({ invoice, onClose, onSuccess }: RecordPaymentModalProps) {
  const [amount, setAmount] = useState(invoice.amount_due.toFixed(2));
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState('check');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [ccFeeEnabled, setCcFeeEnabled] = useState(false);
  const [ccFeeType, setCcFeeType] = useState<'percentage' | 'flat'>('percentage');
  const [ccFeePercentage, setCcFeePercentage] = useState(0.03);
  const [ccFeeFlatAmount, setCcFeeFlatAmount] = useState(3.0);
  const [ccFeeLabel, setCcFeeLabel] = useState('Credit Card Convenience Fee');

  const [paymentProcessor, setPaymentProcessor] = useState<string | null>(null);

  const [contactEmail, setContactEmail] = useState(invoice.contact_email || '');
  const [sendReceipt, setSendReceipt] = useState(false);
  const [includePdf, setIncludePdf] = useState(false);
  const [customMessage, setCustomMessage] = useState('');

  useEffect(() => {
    loadConvenienceFeeSettings();
    loadPaymentProcessor();
    if (!invoice.contact_email) {
      loadContactEmail();
    } else {
      setSendReceipt(true);
    }
  }, []);

  async function loadContactEmail() {
    try {
      const { data } = await supabase
        .from('contacts')
        .select('email')
        .eq('id', invoice.contact_id)
        .maybeSingle();
      if (data?.email) {
        setContactEmail(data.email);
        setSendReceipt(true);
      }
    } catch (err) {
      console.error('Error loading contact email:', err);
    }
  }

  async function loadPaymentProcessor() {
    try {
      const { data } = await supabase
        .from('organizations')
        .select('payment_processor')
        .maybeSingle();
      if (data) setPaymentProcessor(data.payment_processor || null);
    } catch (err) {
      console.error('Error loading payment processor:', err);
    }
  }

  async function loadConvenienceFeeSettings() {
    try {
      const { data } = await supabase
        .from('company_settings')
        .select('cc_convenience_fee_enabled, cc_convenience_fee_type, cc_convenience_fee_percentage, cc_convenience_fee_flat_amount, cc_convenience_fee_label')
        .maybeSingle();

      if (data) {
        setCcFeeEnabled(data.cc_convenience_fee_enabled || false);
        setCcFeeType(data.cc_convenience_fee_type || 'percentage');
        setCcFeePercentage(Number(data.cc_convenience_fee_percentage) || 0.03);
        setCcFeeFlatAmount(Number(data.cc_convenience_fee_flat_amount) || 3.0);
        setCcFeeLabel(data.cc_convenience_fee_label || 'Credit Card Convenience Fee');
      }
    } catch (err) {
      console.error('Error loading convenience fee settings:', err);
    }
  }

  const convenienceFee = (() => {
    if (!ccFeeEnabled || paymentMethod !== 'credit_card') return 0;
    const base = parseFloat(amount) || 0;
    return ccFeeType === 'percentage' ? base * ccFeePercentage : ccFeeFlatAmount;
  })();

  const totalWithFee = (parseFloat(amount) || 0) + convenienceFee;
  const hasEmail = !!contactEmail;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const paymentAmount = parseFloat(amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    if (paymentAmount > invoice.amount_due) {
      setError('Payment amount cannot exceed amount due');
      return;
    }

    setLoading(true);

    try {
      const paymentNotes = convenienceFee > 0
        ? `${notes ? notes + '\n\n' : ''}${ccFeeLabel}: $${convenienceFee.toFixed(2)}`
        : notes || null;

      const usesProcessor = (paymentMethod === 'credit_card' || paymentMethod === 'ach') && paymentProcessor;

      const { data: paymentData, error: paymentError } = await supabase
        .from('payments')
        .insert({
          invoice_id: invoice.id,
          contact_id: invoice.contact_id,
          amount: totalWithFee,
          payment_date: paymentDate,
          payment_method: paymentMethod,
          reference_number: referenceNumber || null,
          notes: paymentNotes,
          payment_processor: usesProcessor ? paymentProcessor : null,
        })
        .select()
        .single();

      if (paymentError) throw paymentError;

      const newAmountPaid = invoice.amount_paid + paymentAmount;
      const newAmountDue = invoice.total - newAmountPaid;
      const newStatus = newAmountDue <= 0 ? 'paid' : 'partial';

      const { error: invoiceError } = await supabase
        .from('invoices')
        .update({ amount_paid: newAmountPaid, amount_due: newAmountDue, status: newStatus })
        .eq('id', invoice.id);

      if (invoiceError) throw invoiceError;

      if (sendReceipt && hasEmail) {
        try {
          await supabase.functions.invoke('send-payment-receipt', {
            body: {
              paymentId: paymentData.id,
              includePdf,
              customMessage: customMessage.trim() || undefined,
            },
          });
        } catch (emailError) {
          console.error('Error sending payment receipt:', emailError);
        }
      }

      onSuccess();
    } catch (err) {
      console.error('Error recording payment:', err);
      setError(err instanceof Error ? err.message : 'Failed to record payment');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex flex-col justify-end sm:items-center sm:justify-center sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 bg-green-100 rounded-xl flex items-center justify-center shrink-0">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900 leading-tight">Record Payment</h2>
              <p className="text-xs text-gray-500">Invoice #{invoice.invoice_number}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors touch-manipulation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <form id="record-payment-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto overscroll-contain">
          <div className="px-5 py-4 space-y-5">

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
            )}

            {/* Invoice summary */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-600">Invoice Total</span>
                <span className="font-semibold text-gray-900">${invoice.total.toFixed(2)}</span>
              </div>
              {invoice.amount_paid > 0 && (
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-600">Previously Paid</span>
                  <span className="font-semibold text-green-600">${invoice.amount_paid.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2.5 border-t border-blue-200">
                <span className="text-sm font-semibold text-gray-900">Amount Due</span>
                <span className="text-xl font-bold text-red-600">${invoice.amount_due.toFixed(2)}</span>
              </div>
            </div>

            {/* Payment amount */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2">
                Payment Amount <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium text-lg">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={invoice.amount_due}
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  required
                  className="w-full pl-9 pr-4 py-3.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg font-semibold touch-manipulation"
                  placeholder="0.00"
                  inputMode="decimal"
                />
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setAmount(invoice.amount_due.toFixed(2))}
                  className="w-full py-2.5 bg-slate-700 hover:bg-slate-800 active:bg-slate-900 rounded-xl text-sm font-semibold text-white transition-colors touch-manipulation"
                >
                  Full Amount — ${invoice.amount_due.toFixed(2)}
                </button>
              </div>
            </div>

            {/* Payment method — large tap targets */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2">
                Payment Method <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {METHOD_OPTIONS.map(opt => {
                  const Icon = opt.icon;
                  const selected = paymentMethod === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPaymentMethod(opt.value)}
                      className={`flex items-center gap-2.5 px-3 py-3 rounded-xl border-2 text-sm font-medium transition-all touch-manipulation ${
                        selected
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 active:bg-gray-50'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${selected ? 'text-blue-600' : 'text-gray-400'}`} />
                      <span className="truncate">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Processor info note for CC/ACH */}
            {(paymentMethod === 'credit_card' || paymentMethod === 'ach') && (
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

            {/* Convenience fee alert */}
            {convenienceFee > 0 && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-sm space-y-2">
                <p className="font-semibold text-amber-900">{ccFeeLabel}</p>
                <div className="flex justify-between text-amber-800">
                  <span>Payment Amount</span>
                  <span>${parseFloat(amount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-amber-800">
                  <span>Fee ({ccFeeType === 'percentage' ? `${(ccFeePercentage * 100).toFixed(2)}%` : 'Flat'})</span>
                  <span>${convenienceFee.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold pt-2 border-t border-amber-300 text-amber-900 text-base">
                  <span>Total to Charge</span>
                  <span>${totalWithFee.toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* Date */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2">
                Payment Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={e => setPaymentDate(e.target.value)}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm touch-manipulation"
              />
            </div>

            {/* Reference number */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2">
                Reference #
                <span className="text-gray-400 font-normal ml-1 text-xs">check #, transaction ID, etc.</span>
              </label>
              <input
                type="text"
                value={referenceNumber}
                onChange={e => setReferenceNumber(e.target.value)}
                placeholder="Optional"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm touch-manipulation"
              />
            </div>

            {/* Internal notes */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2">Internal Notes</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="Optional"
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-none touch-manipulation"
              />
            </div>

            {/* Receipt section */}
            <div className={`rounded-xl border-2 transition-colors ${
              sendReceipt ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-200'
            }`}>
              <button
                type="button"
                onClick={() => setSendReceipt(v => !v)}
                disabled={!hasEmail}
                className="w-full flex items-center gap-3 p-4 text-left disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation"
              >
                <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors ${
                  sendReceipt ? 'border-green-500 bg-green-500' : 'border-gray-400 bg-white'
                }`}>
                  {sendReceipt && <Check className="w-4 h-4 text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-green-600 shrink-0" />
                    <span className="text-sm font-semibold text-gray-900">Send payment receipt</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 ml-6 leading-relaxed">
                    {hasEmail
                      ? <><span className="text-gray-700 font-medium">{contactEmail}</span> will receive a confirmation</>
                      : 'No email address on file for this contact'
                    }
                  </p>
                </div>
              </button>

              {sendReceipt && hasEmail && (
                <div className="px-4 pb-4 pt-3 space-y-3 border-t border-green-200">
                  <button
                    type="button"
                    onClick={() => setIncludePdf(v => !v)}
                    className="w-full flex items-center gap-3 text-left touch-manipulation py-1"
                  >
                    <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-colors ${
                      includePdf ? 'border-green-500 bg-green-500' : 'border-gray-400 bg-white'
                    }`}>
                      {includePdf && <Check className="w-4 h-4 text-white" />}
                    </div>
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gray-500 shrink-0" />
                      <span className="text-sm text-gray-700">Attach invoice PDF</span>
                    </div>
                  </button>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                      Personal note <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <textarea
                      value={customMessage}
                      onChange={e => setCustomMessage(e.target.value)}
                      rows={2}
                      placeholder="e.g. Thank you for the quick payment!"
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm resize-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Bottom padding for safe area */}
            <div className="h-2" />
          </div>
        </form>

        {/* Footer — sticky action buttons */}
        <div className="px-5 pb-5 pt-3 border-t border-gray-100 shrink-0 bg-white">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="py-3.5 border-2 border-gray-300 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-50 text-sm touch-manipulation"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="record-payment-form"
              disabled={loading}
              className="py-3.5 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 active:bg-green-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm touch-manipulation"
            >
              {loading
                ? 'Recording...'
                : convenienceFee > 0
                  ? `Charge $${totalWithFee.toFixed(2)}`
                  : 'Record Payment'
              }
            </button>
          </div>
          <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
        </div>
      </div>
    </div>
  );
}
