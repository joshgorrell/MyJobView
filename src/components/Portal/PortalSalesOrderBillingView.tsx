import { useState, useEffect } from 'react';
import { DollarSign, CheckCircle, Clock, AlertCircle, CreditCard, FileText, ExternalLink, Phone, Mail } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';

interface BillingInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  status: string;
  total: number;
  amount_paid: number;
  amount_due: number;
  qbo_invoice_id: string | null;
}

interface CompanyContact {
  phone: string | null;
  email: string | null;
}

interface PortalSalesOrderBillingViewProps {
  salesOrderId: string;
  contractTotal: number;
}

function InvoiceStatusBadge({ status }: { status: string }) {
  if (status === 'paid') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
        <CheckCircle className="w-3 h-3" />
        Paid
      </span>
    );
  }
  if (status === 'overdue') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
        <AlertCircle className="w-3 h-3" />
        Overdue
      </span>
    );
  }
  if (status === 'partial') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
        <Clock className="w-3 h-3" />
        Partial
      </span>
    );
  }
  if (status === 'sent' || status === 'open') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
        <Clock className="w-3 h-3" />
        Due
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
      <FileText className="w-3 h-3" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export function PortalSalesOrderBillingView({ salesOrderId, contractTotal }: PortalSalesOrderBillingViewProps) {
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyContact, setCompanyContact] = useState<CompanyContact>({ phone: null, email: null });

  useEffect(() => {
    loadBillingData();
  }, [salesOrderId]);

  async function loadBillingData() {
    try {
      const impersonatingContactId = localStorage.getItem('admin_impersonating_contact');
      let contactId: string | null = null;

      if (impersonatingContactId) {
        contactId = impersonatingContactId;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('contact_id')
          .eq('id', user.id)
          .maybeSingle();

        if (!profile?.contact_id) return;
        contactId = profile.contact_id;
      }

      if (!contactId) return;

      const [invoiceResult, settingsResult] = await Promise.all([
        supabase
          .from('invoices')
          .select(`
            id,
            invoice_number,
            invoice_date,
            due_date,
            status,
            total,
            amount_paid,
            amount_due,
            qbo_invoice_id
          `)
          .eq('sales_order_id', salesOrderId)
          .eq('contact_id', contactId)
          .order('invoice_date', { ascending: true }),
        supabase
          .from('company_settings')
          .select('phone, email')
          .maybeSingle(),
      ]);

      if (invoiceResult.error) throw invoiceResult.error;
      setInvoices((invoiceResult.data || []) as BillingInvoice[]);

      if (settingsResult.data) {
        setCompanyContact({
          phone: (settingsResult.data as any).phone || null,
          email: (settingsResult.data as any).email || null,
        });
      }
    } catch (error) {
      console.error('Error loading billing data:', error);
    } finally {
      setLoading(false);
    }
  }

  const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.total, 0);
  const totalPaid = invoices.reduce((sum, inv) => sum + inv.amount_paid, 0);
  const totalDue = invoices.reduce((sum, inv) => sum + inv.amount_due, 0);
  const progressPct = contractTotal > 0 ? Math.min(100, (totalPaid / contractTotal) * 100) : 0;
  const outstandingInvoices = invoices.filter(inv => inv.status !== 'paid' && inv.status !== 'void' && inv.status !== 'draft');
  const payableOnline = outstandingInvoices.filter(inv => inv.qbo_invoice_id);
  const needsContact = outstandingInvoices.filter(inv => !inv.qbo_invoice_id);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top-level payment CTA */}
      {outstandingInvoices.length > 0 && (
        <div className={`rounded-xl border p-4 sm:p-5 ${
          payableOnline.length > 0 ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <p className={`text-base font-semibold ${payableOnline.length > 0 ? 'text-blue-900' : 'text-amber-900'}`}>
                {outstandingInvoices.length === 1
                  ? '1 invoice outstanding'
                  : `${outstandingInvoices.length} invoices outstanding`}
              </p>
              <p className={`text-sm mt-0.5 ${payableOnline.length > 0 ? 'text-blue-700' : 'text-amber-700'}`}>
                Total due: <span className="font-semibold">{formatCurrency(totalDue)}</span>
              </p>
            </div>
            {payableOnline.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {payableOnline.map(inv => (
                  <a
                    key={inv.id}
                    href={`https://app.qbo.intuit.com/app/invoice?txnId=${inv.qbo_invoice_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    <CreditCard className="w-4 h-4" />
                    Pay {payableOnline.length === 1 ? 'Now' : inv.invoice_number}
                    <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                  </a>
                ))}
              </div>
            )}
            {payableOnline.length === 0 && needsContact.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {companyContact.phone && (
                  <a
                    href={`tel:${companyContact.phone}`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    <Phone className="w-4 h-4" />
                    Call to Pay
                  </a>
                )}
                {companyContact.email && (
                  <a
                    href={`mailto:${companyContact.email}?subject=Payment inquiry`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-amber-300 hover:bg-amber-50 text-amber-800 text-sm font-semibold rounded-lg transition-colors"
                  >
                    <Mail className="w-4 h-4" />
                    Email Us
                  </a>
                )}
                {!companyContact.phone && !companyContact.email && (
                  <p className="text-sm text-amber-700 font-medium">Please contact us to arrange payment.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-medium text-gray-500 mb-1">Contract Total</p>
          <p className="text-lg font-bold text-gray-900">{formatCurrency(contractTotal)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-medium text-gray-500 mb-1">Total Invoiced</p>
          <p className="text-lg font-bold text-gray-900">{formatCurrency(totalInvoiced)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-medium text-gray-500 mb-1">Total Paid</p>
          <p className="text-lg font-bold text-green-700">{formatCurrency(totalPaid)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs font-medium text-gray-500 mb-1">Balance Remaining</p>
          <p className={`text-lg font-bold ${totalDue > 0 ? 'text-red-600' : 'text-gray-400'}`}>
            {formatCurrency(totalDue)}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      {contractTotal > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-700">Payment Progress</p>
            <p className="text-sm font-semibold text-gray-900">{progressPct.toFixed(0)}%</p>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
            <div
              className="h-3 rounded-full transition-all duration-500"
              style={{
                width: `${progressPct}%`,
                background: progressPct >= 100 ? '#16a34a' : '#2563eb',
              }}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-xs text-gray-500">{formatCurrency(totalPaid)} paid</p>
            <p className="text-xs text-gray-500">{formatCurrency(contractTotal)} total</p>
          </div>
        </div>
      )}

      {/* Invoice list */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Invoices</h3>
        {invoices.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <DollarSign className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No invoices have been issued for this project yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {invoices.map((invoice) => {
              const isDue = invoice.status !== 'paid' && invoice.status !== 'void' && invoice.status !== 'draft';
              const isOverdue = isDue && invoice.due_date && new Date(invoice.due_date) < new Date();
              const effectiveStatus = isOverdue ? 'overdue' : invoice.status;

              return (
                <div
                  key={invoice.id}
                  className={`bg-white rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
                    isOverdue ? 'border-red-200' : 'border-gray-200'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-gray-900 text-sm">{invoice.invoice_number}</span>
                      <InvoiceStatusBadge status={effectiveStatus} />
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                      <span>{new Date(invoice.invoice_date).toLocaleDateString()}</span>
                      {invoice.due_date && (
                        <span className={isOverdue ? 'text-red-500 font-medium' : ''}>
                          Due {new Date(invoice.due_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-900">{formatCurrency(invoice.total)}</p>
                      {invoice.amount_paid > 0 && invoice.status !== 'paid' && (
                        <p className="text-xs text-gray-500">{formatCurrency(invoice.amount_paid)} paid</p>
                      )}
                    </div>

                    {isDue && invoice.qbo_invoice_id && (
                      <a
                        href={`https://app.qbo.intuit.com/app/invoice?txnId=${invoice.qbo_invoice_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        Pay Now
                        <ExternalLink className="w-3 h-3 opacity-70" />
                      </a>
                    )}
                    {isDue && !invoice.qbo_invoice_id && (
                      <div className="flex items-center gap-2">
                        {companyContact.phone ? (
                          <a
                            href={`tel:${companyContact.phone}`}
                            className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            Call to Pay
                          </a>
                        ) : (
                          <span className="text-xs text-gray-400 italic">Contact us to pay</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
