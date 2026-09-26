import { useEffect, useRef, useState } from 'react';
import { Building2, CreditCard, Loader2, ShieldCheck, X } from 'lucide-react';
import { tokenizeIntuitPayment, type BankTokenInput, type CardTokenInput } from '../../lib/intuitPaymentToken';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';

export type InvoicePaymentChoice = {
  invoiceId: string;
  amount: number;
  method: 'credit_card' | 'ach';
  token: string;
};

type PaymentQuote = { invoiceId: string; amount: number; method: 'credit_card' | 'ach'; fee: number; total: number; feeLabel: string | null; environment: 'sandbox' | 'production' };

interface InvoiceCheckoutModalProps {
  invoice: { id: string; invoice_number: string; amount_due: number };
  onClose: () => void;
  onContinue: (choice: InvoicePaymentChoice) => Promise<void>;
}

/** MJV owns the single checkout. Secure payment fields must tokenize directly with Intuit. */
export function InvoiceCheckoutModal({ invoice, onClose, onContinue }: InvoiceCheckoutModalProps) {
  const [method, setMethod] = useState<'credit_card' | 'ach'>('credit_card');
  const [amount, setAmount] = useState(invoice.amount_due.toFixed(2));
  const [quote, setQuote] = useState<PaymentQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    let active = true;
    setQuote(null);
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 0.01 || value > invoice.amount_due || Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) {
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    const timer = window.setTimeout(() => {
      supabase.functions.invoke('quote-invoice-payment', { body: { invoiceId: invoice.id, amount: value, method } })
      .then(({ data, error: quoteError }) => {
        if (!active) return;
        if (quoteError || data?.error) setError('Payment quote could not be loaded. Please try again.');
        else { setQuote(data as PaymentQuote); setError(''); }
        setLoading(false);
      });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [amount, method, invoice.id, invoice.amount_due]);

  const paymentAmount = Number(amount);
  const validAmount = Number.isFinite(paymentAmount) && paymentAmount >= 0.01 && paymentAmount <= invoice.amount_due &&
    Math.abs(paymentAmount * 100 - Math.round(paymentAmount * 100)) < 0.000001;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!validAmount || !quote || loading || submitting || quote.amount !== paymentAmount || quote.method !== method) return;
    setError('');
    setSubmitting(true);
    try {
      const fields = new FormData(formRef.current!);
      const read = (name: string) => String(fields.get(name) || '').trim();
      let token: string;
      if (method === 'credit_card') {
        const expiry = read('cardExpiry').match(/^(0[1-9]|1[0-2])\s*\/\s*(\d{2}|\d{4})$/);
        if (!expiry) throw new Error('Enter the expiration date as MM/YY.');
        const card: CardTokenInput = {
          name: read('cardName'), number: read('cardNumber').replace(/[\s-]/g, ''),
          expMonth: expiry[1], expYear: expiry[2].length === 2 ? `20${expiry[2]}` : expiry[2],
          cvc: read('cardCvc'),
          address: { streetAddress: read('streetAddress'), city: read('city'), region: read('region').toUpperCase(), postalCode: read('postalCode'), country: 'US' },
        };
        token = await tokenizeIntuitPayment({ card }, quote.environment);
      } else {
        if (!fields.get('achConsent')) throw new Error('Please authorize the bank account debit.');
        const bankAccount: BankTokenInput = {
          name: read('bankName'), routingNumber: read('routingNumber'), accountNumber: read('accountNumber'),
          accountType: read('accountType') as BankTokenInput['accountType'], phone: read('bankPhone'),
        };
        token = await tokenizeIntuitPayment({ bankAccount }, quote.environment);
      }
      await onContinue({ invoiceId: invoice.id, amount: paymentAmount, method, token });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Payment could not be started. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="invoice-checkout-title" className="max-h-[95vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">Invoice #{invoice.invoice_number}</p>
            <h2 id="invoice-checkout-title" className="mt-1 text-xl font-bold text-slate-900">Make a payment</h2>
            <p className="mt-1 text-sm text-slate-500">Balance due {formatCurrency(invoice.amount_due)}</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-full p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
        </div>

        <form ref={formRef} onSubmit={submit} className="space-y-6 px-6 py-6">
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
                { value: 'credit_card' as const, title: 'Credit card', subtitle: quote?.feeLabel || 'Card fee shown below', icon: CreditCard },
                { value: 'ach' as const, title: 'Bank account', subtitle: 'No card fee', icon: Building2 },
              ]).map(option => <button key={option.value} type="button" onClick={() => setMethod(option.value)} aria-pressed={method === option.value} className={`rounded-xl border-2 p-4 text-left transition-colors ${method === option.value ? 'border-blue-600 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                <option.icon className={method === option.value ? 'text-blue-600' : 'text-slate-500'} size={22} />
                <span className="mt-3 block text-sm font-semibold text-slate-900">{option.title}</span>
                <span className="mt-1 block text-xs text-slate-500">{option.subtitle}</span>
              </button>)}
            </div>
          </fieldset>

          <fieldset className="space-y-3 border-t border-slate-100 pt-5">
            <legend className="text-sm font-semibold text-slate-800">{method === 'credit_card' ? 'Card details' : 'Bank account details'}</legend>
            {method === 'credit_card' ? <>
              <input name="cardName" required autoComplete="cc-name" placeholder="Name on card" aria-label="Name on card" className="w-full rounded-xl border border-slate-300 p-3" />
              <input name="cardNumber" required inputMode="numeric" autoComplete="cc-number" placeholder="Card number" aria-label="Card number" className="w-full rounded-xl border border-slate-300 p-3" />
              <div className="grid grid-cols-2 gap-3">
                <input name="cardExpiry" required autoComplete="cc-exp" placeholder="MM/YY" aria-label="Expiration date" className="w-full rounded-xl border border-slate-300 p-3" />
                <input name="cardCvc" required inputMode="numeric" autoComplete="cc-csc" placeholder="Security code" aria-label="Security code" className="w-full rounded-xl border border-slate-300 p-3" />
              </div>
              <input name="streetAddress" required autoComplete="billing address-line1" placeholder="Billing street address" aria-label="Billing street address" className="w-full rounded-xl border border-slate-300 p-3" />
              <div className="grid grid-cols-3 gap-3">
                <input name="city" required autoComplete="billing address-level2" placeholder="City" aria-label="Billing city" className="col-span-1 w-full rounded-xl border border-slate-300 p-3" />
                <input name="region" required maxLength={2} autoComplete="billing address-level1" placeholder="State" aria-label="Billing state" className="w-full rounded-xl border border-slate-300 p-3" />
                <input name="postalCode" required autoComplete="billing postal-code" placeholder="ZIP" aria-label="Billing ZIP" className="w-full rounded-xl border border-slate-300 p-3" />
              </div>
            </> : <>
              <input name="bankName" required autoComplete="name" placeholder="Name on account" aria-label="Name on account" className="w-full rounded-xl border border-slate-300 p-3" />
              <select name="accountType" aria-label="Account type" className="w-full rounded-xl border border-slate-300 p-3">
                <option value="PERSONAL_CHECKING">Personal checking</option><option value="PERSONAL_SAVINGS">Personal savings</option>
                <option value="BUSINESS_CHECKING">Business checking</option><option value="BUSINESS_SAVINGS">Business savings</option>
              </select>
              <input name="routingNumber" required inputMode="numeric" pattern="[0-9]{9}" placeholder="9-digit routing number" aria-label="Routing number" className="w-full rounded-xl border border-slate-300 p-3" />
              <input name="accountNumber" required inputMode="numeric" placeholder="Account number" aria-label="Account number" className="w-full rounded-xl border border-slate-300 p-3" />
              <input name="bankPhone" required autoComplete="tel" placeholder="Phone number" aria-label="Phone number" className="w-full rounded-xl border border-slate-300 p-3" />
              <label className="flex gap-2 text-xs leading-5 text-slate-600"><input name="achConsent" type="checkbox" required className="mt-1" />I authorize this one-time debit of the total shown below from my bank account.</label>
            </>}
          </fieldset>

          <div className="rounded-xl bg-slate-50 p-4 text-sm">
            <div className="flex justify-between text-slate-600"><span>Applied to invoice</span><span>{formatCurrency(quote?.amount ?? 0)}</span></div>
            {quote?.feeLabel && <div className="mt-2 flex justify-between gap-4 text-slate-600"><span>{quote.feeLabel}</span><span>{formatCurrency(quote.fee)}</span></div>}
            <div className="mt-3 flex justify-between border-t border-slate-200 pt-3 text-base font-bold text-slate-900"><span>Total to authorize</span><span>{quote ? formatCurrency(quote.total) : 'Calculating…'}</span></div>
          </div>

          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={!validAmount || !quote || loading || submitting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3.5 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
            {submitting || loading ? <Loader2 className="animate-spin" size={18} /> : <ShieldCheck size={18} />}
            Pay {quote ? formatCurrency(quote.total) : '—'}
          </button>
          <p className="text-center text-xs text-slate-500">Your payment method and final total stay in this checkout.</p>
        </form>
      </section>
    </div>
  );
}
