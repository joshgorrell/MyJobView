import type { SecurityContractSummary as Summary } from '../../lib/securityOnboarding';
import { formatCurrency } from '../../lib/utils';

const date = (value: string | null) => value ? new Date(value.length === 10 ? `${value}T12:00:00` : value).toLocaleDateString() : 'Not scheduled';
export function SecurityContractSummary({ summary }: { summary: Summary }) {
  return <section aria-label="Contract details" className="space-y-4">
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {[
        ['Monthly amount', `${formatCurrency(Number(summary.monthly_price))} before applicable tax`],
        ['Amount due', summary.amount_due === null ? 'Contact your provider for the current balance' : formatCurrency(Number(summary.amount_due))],
        ['Months left in initial term', summary.months_remaining === null ? 'Awaiting activation date' : String(summary.months_remaining)],
      ].map(([label,value]) => <div key={label} className="rounded-xl bg-slate-50 p-4"><p className="text-sm text-gray-600">{label}</p><p className="font-semibold text-gray-900 mt-1">{value}</p></div>)}
    </div>
    <p className="text-sm text-gray-600">Months remaining are rounded up. Initial term: {summary.term_months} months. Monitoring starts: {date(summary.start_date)}. Initial term ends: {date(summary.initial_term_end)}.</p>
    <p className="text-gray-700">First payment scheduled: {date(summary.first_payment_date || null)}. First payment confirmed: {summary.first_payment_made_at ? date(summary.first_payment_made_at) : 'Not yet confirmed'}. Dates are set by your provider after installation and account setup. Advance notice may delay a scheduled debit.</p>
    {summary.initial_term_complete && <p className="text-gray-700">The initial term has ended. Renewal and cancellation follow your signed agreement{summary.renewal_term_months ? ` (recorded renewal interval: ${summary.renewal_term_months} month${summary.renewal_term_months === 1 ? '' : 's'})` : ''}.</p>}
    <p className="text-gray-700">Billing: {summary.billing_frequency === 'annual' ? 'Annual' : 'Monthly'} · {summary.billing_mode === 'mail' ? 'Admin-approved mailed invoices, included in the account price' : summary.autopay_revoked_at ? 'AutoPay authorization revoked' : summary.autopay_paused ? 'AutoPay paused' : 'AutoPay'}.
      {summary.next_debit_at && ` Next scheduled debit: ${date(summary.next_debit_at)}.`}</p>
    {Number(summary.pending_payment_amount) > 0 && <p className="rounded-xl bg-amber-50 text-amber-900 p-4">{formatCurrency(Number(summary.pending_payment_amount))} is awaiting payment confirmation or reconciliation. The balance changes after payment is confirmed.</p>}
    {summary.invoices.length > 0 && <div className="overflow-x-auto"><table className="w-full text-sm text-left"><caption className="text-left font-semibold mb-2">Monitoring invoices</caption><thead><tr><th className="p-2">Invoice</th><th className="p-2">Due</th><th className="p-2">Total</th><th className="p-2">Balance</th><th className="p-2">Status</th></tr></thead><tbody>{summary.invoices.map((invoice,index) => <tr key={`${invoice.number}-${index}`} className="border-t"><td className="p-2">{invoice.number}</td><td className="p-2">{date(invoice.due_date)}</td><td className="p-2">{formatCurrency(Number(invoice.total))}</td><td className="p-2">{formatCurrency(Number(invoice.amount_due))}</td><td className="p-2">{invoice.status} · {invoice.payment_status}</td></tr>)}</tbody></table></div>}
  </section>;
}
