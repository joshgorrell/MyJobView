import { useEffect, useState } from 'react';
import { Building2, CreditCard, Loader2, ShieldCheck, X } from 'lucide-react';
import { calculateConvenienceFee, type ConvenienceFeeSettings } from '../../lib/convenienceFee';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';

export type InvoicePaymentChoice = {
  invoiceId: string;
  amount: number;
  method: 'credit_card' | 'ach';
};

interface InvoiceCheckoutModalProps {
  invoice: { id: string; invoice_number: string; amount_due: number };
  onClose: () => void;
  onContinue: (choice: InvoicePaymentChoice) => Promise<void>;
}

/** MJV owns the single checkout. Secure payment fields must tokenize directly with Intuit. */
export function InvoiceCheckoutModal({ invoice, onClose, onContinue }: InvoiceCheckoutModalProps) {
  const [method, setMethod] = useState<'credit_card' | 'ach'>('credit_card');
  const [amount, setAmount] = useState(invoice.amount_due.toFixed(2));
  const [settings, setSettings] = useState<ConvenienceFeeSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    supabase.from('company_settings')
      .select('cc_convenience_fee_enabled, cc_convenience_fee_type, cc_convenience_fee_percentage, cc_convenience_fee_flat_amount, cc_convenience_fee_label')
      .maybeSingle()
      .then(({ data, error: settingsError }) => {
        if (!active) return;
        if (settingsError || !data) setError('Payment options could not be loaded. Please try again.');
        else setSettings(data as ConvenienceFeeSettings);
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const paymentAmount = Number(amount);
  const validAmount = Number.isFinite(paymentAmount) && paymentAmount >= 0.01 && paymentAmount <= invoice.amount_due;
  const fee = calculateConvenienceFee(validAmount ? paymentAmount : 0, method, settings);
  const rateLabel = settings?.cc_convenience_fee_type === 'flat'
    ? ''
    : ` (${((Number(settings?.cc_convenience_fee_percentage) || 0) * 100).toFixed(2)}%)`;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!validAmount || !settings || loading || submitting) return;
    setError('');
    setSubmitting(true);
    try {
      await onContinue({ invoiceId: invoice.id, amount: paymentAmount, method });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Payment could not be started. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="invoice-checkout-title" className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">Invoice #{invoice.invoice_number}</p>
            <h2 id="invoice-checkout-title" className="mt-1 text-xl font-bold text-slate-900">Make a payment</h2>
            <p className="mt-1 text-sm text-slate-500">Balance due {formatCurrency(invoice.amount_due)}</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
        </div>

        <form onSubmit={submit} className="space-y-6 px-6 py-6">
          <div>
            <label htmlFor="checkout-amount" className="mb-2 block text-sm font-semibold text-slate-800">Amount to pay</label>
            <div className="relative">
              <span className="absolute left-4 top-3 text-slate-500">$</span>
              <input id="checkout-amount" type="number" min="0.01" max={invoice.amount_due} step="0.01" required value={amount} onChange={event => setAmount(event.target.value)} className="w-full rounded-xl border border-slate-300 py-3 pl-8 pr-4 text-lg font-semibold text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100" />
            </div>
            {!validAmount && <p className="mt-2 text-sm text-red-600">Enter an amount from $0.01 to {formatCurrency(invoice.amount_due)}.</p>}
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-slate-800">How would you like to pay?</legend>
            <div className="grid grid-cols-2 gap-3">
              {([
                { value: 'credit_card' as const, title: 'Credit card', subtitle: fee.applies ? `${fee.label}${rateLabel}` : 'No card fee', icon: CreditCard },
                { value: 'ach' as const, title: 'Bank account', subtitle: 'No card fee', icon: Building2 },
              ]).map(option => <button key={option.value} type="button" onClick={() => setMethod(option.value)} aria-pressed={method === option.value} className={`rounded-xl border-2 p-4 text-left transition-colors ${method === option.value ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                <option.icon className={method === option.value ? 'text-blue-600' : 'text-slate-500'} size={22} />
                <span className="mt-3 block text-sm font-semibold text-slate-900">{option.title}</span>
                <span className="mt-1 block text-xs text-slate-500">{option.subtitle}</span>
              </button>)}
            </div>
          </fieldset>

          <div className="rounded-xl bg-slate-50 p-4 text-sm">
            <div className="flex justify-between text-slate-600"><span>Applied to invoice</span><span>{formatCurrency(validAmount ? paymentAmount : 0)}</span></div>
            {method === 'credit_card' && fee.applies && <div className="mt-2 flex justify-between gap-4 text-slate-600"><span>{fee.label}{rateLabel}</span><span>{formatCurrency(fee.feeAmount)}</span></div>}
            <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 text-base font-bold text-slate-900"><span>Total to authorize</span><span>{formatCurrency(fee.totalWithFee)}</span></div>
          </div>

          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={!validAmount || !settings || loading || submitting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3.5 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
            {submitting || loading ? <Loader2 className="animate-spin" size={18} /> : <ShieldCheck size={18} />}
            Pay {formatCurrency(fee.totalWithFee)}
          </button>
          <p className="text-center text-xs text-slate-500">Your payment method and final total stay in this checkout.</p>
        </form>
      </section>
    </div>
  );
}
