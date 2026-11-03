import {useState,useEffect} from 'react';
import {DollarSign} from 'lucide-react';
import {supabase} from '../../lib/supabase';
import {useAuth} from '../../contexts/AuthContext';
import {formatCurrency} from '../../lib/utils';

interface AccountCredit {
  id: string;
  amount: number;
  amount_applied: number;
  amount_remaining: number;
  status: string;
  notes: string | null;
  created_at: string;
  sales_order_id: string | null;
  source_invoice_id: string | null;
  sales_order?: { order_number: string } | null;
  source_invoice?: { invoice_number: string } | null;
}

function ContactAccountCredits({ contactId }: { contactId: string }) {
  const {profile}=useAuth();
  const organizationId=profile?.organization_id;
  const [credits, setCredits] = useState<AccountCredit[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(false);
      if(!organizationId){setLoadError(true);setLoading(false);return;}
      const allCredits: AccountCredit[] = [];
      try {
        for (let page = 0; ; page += 1) {
          const { data, error } = await supabase
            .from('customer_account_credits')
            .select(`
              id, amount, amount_applied, amount_remaining, status, notes, created_at,
              sales_order_id, source_invoice_id,
              sales_order:sales_orders(order_number),
              source_invoice:invoices(invoice_number)
            `)
            .eq('contact_id', contactId)
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .range(page * 500, page * 500 + 499)
            .overrideTypes<AccountCredit[], { merge: false }>();
          if (cancelled) return;
          if (error) throw error;
          const batch = data || [];
          allCredits.push(...batch);
          if (batch.length < 500) break;
        }
        if (!cancelled) setCredits(allCredits);
      } catch {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [contactId,organizationId]);

  if (loading) return <p className="text-sm text-gray-500">Loading customer credits…</p>;
  if (loadError) return <p role="alert" className="text-sm text-red-700">Unable to load customer credits.</p>;

  const openCredits = credits.filter(c => c.status === 'open' && Number(c.amount_remaining) > 0);
  const otherCredits = credits.filter(c => c.status !== 'open' || Number(c.amount_remaining) <= 0);
  const totalAvailable = openCredits.reduce((sum, credit) => sum + Number(credit.amount_remaining || 0), 0);

  function fmt(n: number) {
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const displayedOther = otherCredits;

  return (
    <div className="border-t border-gray-200 pt-6">
      <h3 className="text-xs sm:text-sm font-medium text-gray-700 uppercase tracking-wide pb-2 border-b border-gray-200 mb-3 flex items-center gap-2">
        <DollarSign className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-green-600" />
        Credit History & Open Credits
        <span className={`ml-auto text-sm font-bold normal-case tracking-normal ${totalAvailable > 0 ? 'text-red-700' : 'text-gray-600'}`}>
          ${fmt(totalAvailable)} available
        </span>
      </h3>

      {openCredits.length === 0 && (
        <p className="text-sm text-gray-500">No open credits on account.</p>
      )}

      <div className="space-y-2">
        {credits.length === 0 && <p className="text-sm text-gray-500">No credit history recorded.</p>}
        {openCredits.map(credit => (
          <div key={credit.id} className="p-3 bg-green-50 rounded-lg border border-green-200">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-green-800">
                    ${fmt(credit.amount_remaining)} remaining
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200 font-medium">
                    Open
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Issued {new Date(credit.created_at).toLocaleDateString()}
                  {credit.amount_applied > 0 && (
                    <> · ${fmt(credit.amount_applied)} of ${fmt(credit.amount)} applied</>
                  )}
                </div>
                {credit.source_invoice && (
                  <div className="text-xs text-gray-500 mt-0.5">
                    From Invoice #{credit.source_invoice.invoice_number}
                    {credit.sales_order && (
                      <> · SO #{credit.sales_order.order_number}</>
                    )}
                  </div>
                )}
                {credit.notes && (
                  <p className="text-xs text-gray-600 mt-1 leading-relaxed">{credit.notes}</p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <div className="text-base font-bold text-gray-700">${fmt(credit.amount)}</div>
                <div className="text-xs text-gray-400">original</div>
              </div>
            </div>
          </div>
        ))}

        {displayedOther.map(credit => (
          <div key={credit.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200 opacity-70">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-700">${fmt(credit.amount)}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                    credit.status === 'fully_applied'
                      ? 'bg-blue-100 text-blue-700 border border-blue-200'
                      : 'bg-gray-200 text-gray-500 border border-gray-300'
                  }`}>
                    {credit.status === 'fully_applied' ? 'Applied' : 'Voided'}
                  </span>
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {new Date(credit.created_at).toLocaleDateString()}
                  {credit.source_invoice && (
                    <> · Invoice #{credit.source_invoice.invoice_number}</>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


export function ContactPaymentsCredits({ contactId }: { contactId: string }) {
  const {profile}=useAuth();
  const organizationId=profile?.organization_id;
  const [payments, setPayments] = useState<Array<{id: string; invoice_id: string; amount: number; payment_date: string; payment_method: string | null; reference_number: string | null}>>([]);
  const [invoices, setInvoices] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(false);
      if(!organizationId){setError(true);setLoading(false);return;}
      const rows: Array<{ id: string; invoice_number: string }> = [];
      for (let page = 0; ; page += 1) {
        const inv = await supabase.from('invoices')
          .select('id, invoice_number')
          .eq('contact_id', contactId)
            .eq('organization_id', organizationId)
          .order('id', { ascending: true })
          .range(page * 500, page * 500 + 499);
        if (cancelled) return;
        if (inv.error) { setError(true); setLoading(false); return; }
        const batch = inv.data || [];
        rows.push(...batch);
        if (batch.length < 500) break;
      }
      setInvoices(Object.fromEntries(rows.map(row => [row.id, row.invoice_number])));
      if (!rows.length) { setPayments([]); setLoading(false); return; }
      // Supabase PostgREST limits IN-list size and returns at most 1,000 rows
      // by default. Fetch in bounded batches so older payments aren't hidden.
      const invoiceIds = rows.map(row => row.id);
      const allPayments: typeof payments = [];
      for (let offset = 0; offset < invoiceIds.length; offset += 100) {
        const ids = invoiceIds.slice(offset, offset + 100);
        for (let page = 0; ; page += 1) {
          const result = await supabase.from('payments')
            .select('id, invoice_id, amount, payment_date, payment_method, reference_number')
            .in('invoice_id', ids)
            .eq('organization_id', organizationId)
            .order('payment_date', { ascending: false })
            .order('id', { ascending: false })
            .range(page * 500, page * 500 + 499);
          if (cancelled) return;
          if (result.error) { setError(true); setLoading(false); return; }
          const batch = result.data || [];
          allPayments.push(...batch);
          if (batch.length < 500) break;
        }
      }
      if (cancelled) return;
      allPayments.sort((a, b) => b.payment_date.localeCompare(a.payment_date) || b.id.localeCompare(a.id));
      setPayments(allPayments);
      setLoading(false);
    }
    void load().catch(() => {if(!cancelled){setError(true);setLoading(false);}});
    return () => { cancelled = true; };
  }, [contactId,organizationId]);
  return <div className="space-y-6">
    <ContactAccountCredits key={contactId} contactId={contactId} />
    <section className="border-t border-gray-200 pt-5">
      <h3 className="font-semibold text-gray-900 mb-3">Payment History</h3>
      {loading ? <p className="text-sm text-gray-500">Loading payments…</p>
        : error ? <p role="alert" className="text-sm text-red-700">Unable to load payment history.</p>
        : payments.length === 0 ? <p className="text-sm text-gray-500">No invoice payments recorded.</p>
        : <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
          {payments.map(payment => <div key={payment.id} className="p-3 flex flex-wrap items-center justify-between gap-2">
            <div><div className="text-sm font-medium text-gray-900">{new Date(payment.payment_date + 'T12:00:00').toLocaleDateString()} · Invoice #{invoices[payment.invoice_id] || '—'}</div>
              <div className="text-xs text-gray-500">{payment.payment_method || 'Payment'}{payment.reference_number ? ` · ${payment.reference_number}` : ''}</div></div>
            <strong className="text-sm text-gray-900">{formatCurrency(Number(payment.amount))}</strong>
          </div>)}
        </div>}
    </section>
  </div>;
}
