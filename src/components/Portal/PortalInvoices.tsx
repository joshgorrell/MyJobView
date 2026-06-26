import { useState, useEffect } from 'react';
import { DollarSign, ArrowLeft, CreditCard, CheckCircle, AlertCircle, Clock, RefreshCw, Calendar, Info, XCircle, Phone, Mail, FileText, History, RotateCcw, Printer } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import { InvoiceDetailModal } from '../Invoices/InvoiceDetailModal';
import { buildPortalInvoicePrintHTML, openInvoicePrint, type PrintableCompanyInfo } from '../../lib/portalInvoicePrint';

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  amount_paid: number;
  amount_due: number;
  project_number: string | null;
  qbo_invoice_id: string | null;
}

interface RecurringSubscription {
  id: string;
  next_billing_date: string;
  start_date: string;
  end_date: string | null;
  status: string;
  custom_amount: number | null;
  notes: string | null;
  cancellation_requested: boolean;
  recurring_plans: {
    plan_name: string;
    billing_frequency: string;
    amount: number;
    description: string | null;
  };
  subscription_cancellations: Array<{
    id: string;
    effective_date: string;
    reason_category: string;
    reason_details: string | null;
    will_continue_billing: boolean;
  }> | null;
}

type ViewMode = 'outstanding' | 'history' | 'subscriptions';

export function PortalInvoices({ isEmbedded = false }: { isEmbedded?: boolean } = {}) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [recurringSubscriptions, setRecurringSubscriptions] = useState<RecurringSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('outstanding');
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [selectedSubscription, setSelectedSubscription] = useState<RecurringSubscription | null>(null);
  const [paymentUnavailableInvoice, setPaymentUnavailableInvoice] = useState<Invoice | null>(null);
  const [companyContact, setCompanyContact] = useState<{ phone?: string; email?: string } | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelDetails, setCancelDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showRetentionPrompt, setShowRetentionPrompt] = useState(false);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [payingAll, setPayingAll] = useState(false);
  const [detailInvoiceId, setDetailInvoiceId] = useState<string | null>(null);
  const [confirmPayAll, setConfirmPayAll] = useState(false);
  const [paymentWindowsOpened, setPaymentWindowsOpened] = useState(false);
  const [printingInvoiceId, setPrintingInvoiceId] = useState<string | null>(null);

  const dissatisfactionReasons = ['too_expensive', 'not_using_service', 'switching_provider', 'service_quality', 'financial_reasons', 'other'];

  useEffect(() => {
    loadInvoices();
    loadCompanyContact();
  }, []);

  async function loadCompanyContact() {
    const { data } = await supabase
      .from('company_settings')
      .select('phone, email')
      .maybeSingle();
    if (data) setCompanyContact({ phone: data.phone, email: data.email });
  }

  async function recordInvoiceOpens(invoiceIds: string[]) {
    if (invoiceIds.length === 0) return;
    for (const invoiceId of invoiceIds) {
      await supabase.rpc('record_invoice_open', {
        p_invoice_id: invoiceId,
        p_user_agent: navigator.userAgent,
      });
    }
  }

  async function loadInvoices() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('contact_id')
        .eq('id', user.id)
        .maybeSingle();

      if (!profile?.contact_id) return;

      const [invoicesRes, subscriptionsRes] = await Promise.all([
        supabase
          .from('invoices')
          .select(`
            id,
            invoice_number,
            invoice_date,
            due_date,
            status,
            subtotal,
            tax,
            total,
            amount_paid,
            amount_due,
            project_id,
            qbo_invoice_id,
            projects:project_id (
              project_number
            )
          `)
          .eq('contact_id', profile.contact_id)
          .order('invoice_date', { ascending: false }),
        supabase
          .from('recurring_subscriptions')
          .select(`
            id,
            next_billing_date,
            start_date,
            end_date,
            status,
            custom_amount,
            notes,
            cancellation_requested,
            recurring_plans (
              plan_name,
              billing_frequency,
              amount,
              description
            ),
            subscription_cancellations (
              id,
              effective_date,
              reason_category,
              reason_details,
              will_continue_billing
            )
          `)
          .eq('contact_id', profile.contact_id)
          .in('status', ['active', 'paused'])
      ]);

      if (invoicesRes.error) throw invoicesRes.error;

      const formattedInvoices = (invoicesRes.data || []).map((invoice: any) => ({
        ...invoice,
        project_number: invoice.projects?.project_number || null,
      }));

      setInvoices(formattedInvoices);
      setRecurringSubscriptions(subscriptionsRes.data || []);

      const unpaidIds = (invoicesRes.data || [])
        .filter((inv: any) => inv.status !== 'paid' && inv.status !== 'void')
        .map((inv: any) => inv.id);
      recordInvoiceOpens(unpaidIds);
    } catch (error) {
      console.error('Error loading invoices:', error);
    } finally {
      setLoading(false);
    }
  }

  function toggleInvoiceSelection(invoiceId: string) {
    setSelectedInvoiceIds(prev =>
      prev.includes(invoiceId)
        ? prev.filter(id => id !== invoiceId)
        : [...prev, invoiceId]
    );
  }

  function selectAllUnpaidInvoices() {
    const unpaidInvoices = outstandingInvoices;
    setSelectedInvoiceIds(unpaidInvoices.map(inv => inv.id));
  }

  function clearSelection() {
    setSelectedInvoiceIds([]);
    setPaymentWindowsOpened(false);
  }

  async function handlePayment(invoice: Invoice) {
    try {
      if (!invoice.qbo_invoice_id) {
        setPaymentUnavailableInvoice(invoice);
        return;
      }

      const { data: companySettings } = await supabase
        .from('company_settings')
        .select('qbo_realm_id, phone, email')
        .maybeSingle();

      if (!companySettings?.qbo_realm_id) {
        setPaymentUnavailableInvoice(invoice);
        return;
      }

      const paymentUrl = `https://app.qbo.intuit.com/app/paynow?invoiceId=${invoice.qbo_invoice_id}`;
      window.open(paymentUrl, '_blank');
    } catch (error) {
      console.error('Error initiating payment:', error);
      setPaymentUnavailableInvoice(invoice);
    }
  }

  async function executePayAll() {
    setPayingAll(true);
    setConfirmPayAll(false);
    try {
      const selectedInvoices = invoices.filter(inv => selectedInvoiceIds.includes(inv.id));
      const { data: companySettings } = await supabase
        .from('company_settings')
        .select('qbo_realm_id')
        .maybeSingle();

      if (!companySettings?.qbo_realm_id) {
        alert('Payment processing is not configured. Please contact support.');
        return;
      }

      for (const invoice of selectedInvoices) {
        window.open(`https://app.qbo.intuit.com/app/paynow?invoiceId=${invoice.qbo_invoice_id}`, '_blank');
      }

      setPaymentWindowsOpened(true);
    } catch (error) {
      console.error('Error initiating batch payment:', error);
      alert('Failed to process payments. Please try again or contact support.');
    } finally {
      setPayingAll(false);
    }
  }

  async function handlePayAll() {
    if (selectedInvoiceIds.length === 0) return;

    const selectedInvoices = invoices.filter(inv => selectedInvoiceIds.includes(inv.id));
    const unsyncedInvoices = selectedInvoices.filter(inv => !inv.qbo_invoice_id);

    if (unsyncedInvoices.length > 0) {
      alert(`${unsyncedInvoices.length} invoice(s) are not yet synced with QuickBooks. Please contact support.`);
      return;
    }

    setConfirmPayAll(true);
  }

  async function handlePrintInvoice(invoice: Invoice) {
    setPrintingInvoiceId(invoice.id);
    try {
      const [itemsRes, paymentsRes, settingsRes, officeRes, contactRes] = await Promise.all([
        supabase
          .from('invoice_line_items')
          .select('description, quantity, unit_price, amount, notes, notes_visible_on_invoice')
          .eq('invoice_id', invoice.id)
          .order('sort_order'),
        supabase
          .from('invoice_payments')
          .select('payment_date, payment_method, amount')
          .eq('invoice_id', invoice.id)
          .order('payment_date'),
        supabase
          .from('company_settings')
          .select('company_name, company_logo_url, phone, email')
          .maybeSingle(),
        supabase
          .from('office_addresses')
          .select('address_line1, address_line2, city, state, zip, phone')
          .eq('is_primary', true)
          .maybeSingle(),
        supabase
          .from('invoices')
          .select(`
            invoice_title, billing_name, billing_address_line1, billing_address_line2,
            billing_city, billing_state, billing_zip,
            contacts(full_name, contact_name, first_name, last_name, street_address, city, state, zip_code)
          `)
          .eq('id', invoice.id)
          .maybeSingle(),
      ]);

      const extra = contactRes.data as any;
      const contact = extra?.contacts;
      const contactName = contact?.full_name || contact?.contact_name ||
        `${contact?.first_name || ''} ${contact?.last_name || ''}`.trim() || '';

      const company: PrintableCompanyInfo = {
        company_name: settingsRes.data?.company_name,
        logo_url: settingsRes.data?.company_logo_url,
        phone: officeRes.data?.phone || settingsRes.data?.phone,
        email: settingsRes.data?.email,
        address_line1: officeRes.data?.address_line1,
        address_line2: officeRes.data?.address_line2,
        city: officeRes.data?.city,
        state: officeRes.data?.state,
        zip: officeRes.data?.zip,
      };

      const printable = {
        ...invoice,
        invoice_title: extra?.invoice_title || null,
        billing_name: extra?.billing_name || contactName || null,
        billing_address_line1: extra?.billing_address_line1 || contact?.street_address || null,
        billing_address_line2: extra?.billing_address_line2 || null,
        billing_city: extra?.billing_city || contact?.city || null,
        billing_state: extra?.billing_state || contact?.state || null,
        billing_zip: extra?.billing_zip || contact?.zip_code || null,
      };

      const html = buildPortalInvoicePrintHTML(
        printable,
        itemsRes.data || [],
        paymentsRes.data || [],
        company,
      );
      openInvoicePrint(html);
    } catch (err) {
      console.error('Error generating print:', err);
    } finally {
      setPrintingInvoiceId(null);
    }
  }

  function openCancelModal(subscription: RecurringSubscription) {
    setSelectedSubscription(subscription);
    setCancelReason('');
    setCancelDetails('');
    setShowRetentionPrompt(false);
    setCancelModalOpen(true);
  }

  function handleReasonChange(reason: string) {
    setCancelReason(reason);
    setShowRetentionPrompt(dissatisfactionReasons.includes(reason));
  }

  async function handleCancelSubscription() {
    if (!selectedSubscription || !cancelReason) {
      alert('Please select a reason for cancellation.');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('process_subscription_cancellation', {
        p_subscription_id: selectedSubscription.id,
        p_reason_category: cancelReason,
        p_reason_details: cancelDetails || null,
      });

      if (error) throw error;

      const result = data as { success: boolean; error?: string; effective_date?: string; will_continue_billing?: boolean };

      if (!result.success) {
        alert(result.error || 'Failed to cancel subscription');
        return;
      }

      alert(
        result.will_continue_billing
          ? `Your subscription has been scheduled for cancellation. Billing will continue until ${new Date(result.effective_date!).toLocaleDateString()}.`
          : `Your subscription will be cancelled after the next billing cycle on ${new Date(result.effective_date!).toLocaleDateString()}.`
      );

      setCancelModalOpen(false);
      setSelectedSubscription(null);
      loadInvoices();
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      alert('Failed to cancel subscription. Please try again or contact support.');
    } finally {
      setSubmitting(false);
    }
  }

  const outstandingInvoices = invoices.filter(inv => inv.status !== 'paid' && inv.status !== 'void');
  const paidInvoices = invoices.filter(inv => inv.status === 'paid');
  const selectedInvoices = invoices.filter(inv => selectedInvoiceIds.includes(inv.id));
  const selectedTotal = selectedInvoices.reduce((sum, inv) => sum + inv.amount_due, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">Loading invoices...</p>
        </div>
      </div>
    );
  }

  const mainContent = (
    <>
        {/* Tab Navigation */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="flex gap-1 -mb-px overflow-x-auto scrollbar-none" style={{WebkitOverflowScrolling: 'touch'}}>
            <button
              onClick={() => setViewMode('outstanding')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                viewMode === 'outstanding'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <CreditCard className="w-4 h-4 flex-shrink-0" />
              Outstanding
              {outstandingInvoices.length > 0 && (
                <span className={`inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold rounded-full ${
                  viewMode === 'outstanding' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {outstandingInvoices.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setViewMode('history')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                viewMode === 'history'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <History className="w-4 h-4 flex-shrink-0" />
              History
              {paidInvoices.length > 0 && (
                <span className={`inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold rounded-full ${
                  viewMode === 'history' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {paidInvoices.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setViewMode('subscriptions')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                viewMode === 'subscriptions'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <RefreshCw className="w-4 h-4 flex-shrink-0" />
              Subscriptions
              {recurringSubscriptions.length > 0 && (
                <span className={`inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold rounded-full ${
                  viewMode === 'subscriptions' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {recurringSubscriptions.length}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* Outstanding Tab */}
        {viewMode === 'outstanding' && (
          <>
            {/* Payment windows opened notice */}
            {paymentWindowsOpened && (
              <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-green-900 text-sm">Payment windows opened</p>
                    <p className="text-green-700 text-sm mt-0.5">
                      Complete the payment in each QuickBooks window. Once done, refresh this page to see updated balances.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => { setPaymentWindowsOpened(false); clearSelection(); loadInvoices(); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex-shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Refresh
                </button>
              </div>
            )}

            {outstandingInvoices.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">You're all caught up!</h3>
                <p className="text-gray-500">No outstanding invoices at this time.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Batch selection toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-gray-500">
                    {outstandingInvoices.length} invoice{outstandingInvoices.length !== 1 ? 's' : ''} outstanding
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedInvoiceIds.length > 0 ? (
                      <>
                        <button
                          onClick={clearSelection}
                          className="px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors min-h-[40px]"
                        >
                          Clear ({selectedInvoiceIds.length})
                        </button>
                        <button
                          onClick={() => handlePayAll}
                          disabled={payingAll}
                          className="px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm font-medium disabled:opacity-50 transition-colors min-h-[40px]"
                        >
                          <CreditCard className="w-4 h-4" />
                          <span>Pay {selectedInvoiceIds.length} · {formatCurrency(selectedTotal)}</span>
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={selectAllUnpaidInvoices}
                        className="px-3 py-2 text-sm border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors min-h-[40px]"
                      >
                        Select All
                      </button>
                    )}
                  </div>
                </div>

                {outstandingInvoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    className={`bg-white rounded-lg shadow-sm border-2 p-6 hover:shadow-md transition-all ${
                      selectedInvoiceIds.includes(invoice.id)
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1 flex items-start gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={selectedInvoiceIds.includes(invoice.id)}
                          onChange={() => toggleInvoiceSelection(invoice.id)}
                          className="mt-1.5 w-5 h-5 text-blue-600 rounded focus:ring-blue-500 cursor-pointer flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h3 className="text-base sm:text-lg font-semibold text-gray-900">{invoice.invoice_number}</h3>
                            <StatusBadge status={invoice.status} />
                          </div>
                          {invoice.project_number && (
                            <p className="text-sm text-gray-600 mb-2">Project: {invoice.project_number}</p>
                          )}
                          <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-sm text-gray-500">
                            <span>Issued: {new Date(invoice.invoice_date).toLocaleDateString()}</span>
                            {invoice.due_date && (
                              <span>Due: {new Date(invoice.due_date).toLocaleDateString()}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setDetailInvoiceId(invoice.id)}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 border border-blue-200 rounded-lg transition-colors font-medium flex-shrink-0 min-h-[40px]"
                      >
                        <FileText className="w-4 h-4" />
                        <span className="hidden xs:inline">View</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2 sm:gap-4 p-3 sm:p-4 bg-gray-50 rounded-lg mb-4">
                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">Total</p>
                        <p className="text-sm sm:text-base font-bold text-gray-900 truncate">
                          {formatCurrency(invoice.total)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">Paid</p>
                        <p className="text-sm sm:text-base font-bold text-green-600 truncate">
                          {formatCurrency(invoice.amount_paid)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 mb-0.5">Due</p>
                        <p className="text-sm sm:text-base font-bold text-orange-600 truncate">
                          {formatCurrency(invoice.amount_due)}
                        </p>
                      </div>
                    </div>

                    {selectedInvoiceIds.includes(invoice.id) ? (
                      <div className="w-full px-4 py-2 bg-blue-100 border-2 border-blue-300 rounded-lg flex items-center justify-center gap-2 font-medium text-blue-700">
                        <CheckCircle className="w-4 h-4" />
                        Selected for Batch Payment
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handlePayment(invoice)}
                          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 font-medium transition-colors"
                        >
                          <CreditCard className="w-4 h-4" />
                          Pay {formatCurrency(invoice.amount_due)}
                        </button>
                        <button
                          onClick={() => handlePrintInvoice(invoice)}
                          disabled={printingInvoiceId === invoice.id}
                          title="Print invoice"
                          className="px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 flex items-center justify-center transition-colors disabled:opacity-50"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h3 className="text-base font-semibold text-blue-900 mb-2 flex items-center gap-2">
                <AlertCircle className="w-5 h-5" />
                Payment Information
              </h3>
              <p className="text-blue-700 text-sm mb-2">
                Click "Pay" on any invoice to be taken to QuickBooks Payments where you can pay by credit card or ACH transfer.
              </p>
              <p className="text-blue-700 text-sm">
                Recurring subscriptions are charged automatically on your billing date. Invoices will appear in your invoice list once generated.
              </p>
            </div>
          </>
        )}

        {/* History Tab */}
        {viewMode === 'history' && (
          <>
            {paidInvoices.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                <History className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Payment History</h3>
                <p className="text-gray-500">Paid invoices will appear here once you complete a payment.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-gray-500">
                  {paidInvoices.length} paid invoice{paidInvoices.length !== 1 ? 's' : ''}
                </p>
                {paidInvoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <h3 className="text-base sm:text-lg font-semibold text-gray-900">{invoice.invoice_number}</h3>
                          <StatusBadge status={invoice.status} />
                        </div>
                        {invoice.project_number && (
                          <p className="text-sm text-gray-600 mb-2">Project: {invoice.project_number}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-sm text-gray-500">
                          <span>Issued: {new Date(invoice.invoice_date).toLocaleDateString()}</span>
                          {invoice.due_date && (
                            <span>Paid by: {new Date(invoice.due_date).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-3 flex-shrink-0">
                        <div className="text-left sm:text-right">
                          <p className="text-xs text-gray-500 mb-0.5">Total Paid</p>
                          <p className="text-base sm:text-xl font-bold text-green-600">
                            {formatCurrency(invoice.total)}
                          </p>
                        </div>
                        <button
                          onClick={() => setDetailInvoiceId(invoice.id)}
                          className="flex items-center gap-1.5 px-3 py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 border border-blue-200 rounded-lg transition-colors font-medium min-h-[40px]"
                        >
                          <FileText className="w-4 h-4" />
                          View
                        </button>
                        <button
                          onClick={() => handlePrintInvoice(invoice)}
                          disabled={printingInvoiceId === invoice.id}
                          title="Print invoice"
                          className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-gray-700 hover:bg-gray-50 border border-gray-200 rounded-lg transition-colors font-medium min-h-[40px] disabled:opacity-50"
                        >
                          <Printer className="w-4 h-4" />
                          Print
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Subscriptions Tab */}
        {viewMode === 'subscriptions' && (
          <>
            {recurringSubscriptions.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                <RefreshCw className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Active Subscriptions</h3>
                <p className="text-gray-500">You don't have any active recurring subscriptions at this time.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recurringSubscriptions.map((subscription) => {
                  const amount = subscription.custom_amount || subscription.recurring_plans?.amount || 0;
                  const startDate = new Date(subscription.start_date);
                  const endDate = subscription.end_date ? new Date(subscription.end_date) : null;
                  const nextBilling = new Date(subscription.next_billing_date);
                  const today = new Date();
                  const daysUntilEnd = endDate ? Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;

                  return (
                    <div key={subscription.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-3">
                            <RefreshCw className="w-5 h-5 text-teal-600" />
                            <h3 className="text-lg font-semibold text-gray-900">
                              {subscription.recurring_plans?.plan_name || 'Recurring Subscription'}
                            </h3>
                            <SubscriptionStatusBadge status={subscription.status} />
                          </div>

                          {subscription.recurring_plans?.description && (
                            <p className="text-sm text-gray-600 mb-3">{subscription.recurring_plans.description}</p>
                          )}

                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <Calendar className="w-4 h-4" />
                              <span>Billing Frequency: <span className="font-medium capitalize">{subscription.recurring_plans?.billing_frequency}</span></span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <CheckCircle className="w-4 h-4 text-green-600" />
                              <span>Auto-Pay Enabled — Charges automatically on billing date</span>
                            </div>
                            <div className="text-sm text-gray-500">
                              Next billing: <span className="font-medium text-gray-700">{nextBilling.toLocaleDateString()}</span>
                            </div>
                            <div className="text-sm text-gray-500">
                              Contract started: {startDate.toLocaleDateString()}
                            </div>

                            {endDate && (
                              <div className="flex items-start gap-2 mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                                <div className="text-sm">
                                  <p className="font-medium text-amber-900">Contract ends: {endDate.toLocaleDateString()}</p>
                                  {daysUntilEnd !== null && daysUntilEnd > 0 && (
                                    <p className="text-amber-700 mt-1">{daysUntilEnd} days remaining.</p>
                                  )}
                                  {daysUntilEnd !== null && daysUntilEnd <= 0 && (
                                    <p className="text-amber-700 mt-1">Your contract has ended. Contact us to cancel or renew.</p>
                                  )}
                                </div>
                              </div>
                            )}

                            {!endDate && (
                              <div className="flex items-start gap-2 mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                                <p className="text-sm text-blue-700">This is an ongoing subscription with no end date. Contact us to cancel anytime.</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-xs text-gray-500 mb-1">Recurring Amount (Auto-Pay)</p>
                        <p className="text-2xl font-bold text-gray-900">
                          ${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} / {subscription.recurring_plans?.billing_frequency}
                        </p>
                      </div>

                      {subscription.notes && (
                        <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                          <p className="text-xs text-gray-500 mb-1">Notes</p>
                          <p className="text-sm text-gray-700">{subscription.notes}</p>
                        </div>
                      )}

                      {subscription.cancellation_requested && subscription.subscription_cancellations && subscription.subscription_cancellations.length > 0 && (
                        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="font-semibold text-red-900 mb-1">Cancellation Pending</p>
                              <p className="text-sm text-red-700">
                                Your subscription will end on {new Date(subscription.subscription_cancellations[0].effective_date).toLocaleDateString()}.
                                {subscription.subscription_cancellations[0].will_continue_billing && ' Billing will continue until that date.'}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {!subscription.cancellation_requested && subscription.status === 'active' && (
                        <button
                          onClick={() => openCancelModal(subscription)}
                          className="mt-4 w-full px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 flex items-center justify-center gap-2 font-medium transition-colors"
                        >
                          <XCircle className="w-4 h-4" />
                          Cancel Subscription
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </>
  );

  const modals = (
    <>
      {/* Cancel Subscription Modal */}
      {cancelModalOpen && selectedSubscription && (
        <div className="fixed inset-0 bg-black/75 flex items-end sm:items-center justify-center sm:p-4 z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-lg shadow-xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="p-5 sm:p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Cancel Subscription</h2>
                  <p className="text-gray-500">{selectedSubscription.recurring_plans?.plan_name}</p>
                </div>
                <button onClick={() => setCancelModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  <XCircle className="w-5 h-5 text-gray-600" />
                </button>
              </div>

              <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-900 font-medium mb-2">Important Information:</p>
                <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
                  {selectedSubscription.end_date ? (
                    <>
                      <li>Your subscription will be cancelled on your contract end date</li>
                      <li>You will continue to be billed until {new Date(selectedSubscription.end_date).toLocaleDateString()}</li>
                      <li>You will retain access to services until that date</li>
                    </>
                  ) : (
                    <>
                      <li>Your subscription will be cancelled at the end of the current billing cycle</li>
                      <li>You will be billed one final time on {new Date(selectedSubscription.next_billing_date).toLocaleDateString()}</li>
                      <li>You will retain access until that date</li>
                    </>
                  )}
                </ul>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Why are you cancelling? <span className="text-red-600">*</span>
                  </label>
                  <select
                    value={cancelReason}
                    onChange={(e) => handleReasonChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select a reason...</option>
                    <option value="too_expensive">Too expensive</option>
                    <option value="not_using_service">Not using the service</option>
                    <option value="switching_provider">Switching to another provider</option>
                    <option value="service_quality">Service quality issues</option>
                    <option value="moving_relocating">Moving or relocating</option>
                    <option value="business_closed">Business closed</option>
                    <option value="financial_reasons">Financial reasons</option>
                    <option value="no_longer_needed">No longer needed</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                {showRetentionPrompt && (
                  <div className="p-4 bg-blue-50 border-2 border-blue-300 rounded-lg">
                    <div className="flex items-start gap-3">
                      <Info className="w-6 h-6 text-blue-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <h4 className="font-semibold text-blue-900 mb-2">We'd love to keep your business!</h4>
                        <p className="text-sm text-blue-800 mb-3">
                          Is there anything we can do to address your concerns? We value your feedback and would like the opportunity to make things right.
                        </p>
                        <p className="text-sm text-blue-700 font-medium">
                          Please share your concerns below, and our team will reach out before your cancellation is processed.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Additional details{showRetentionPrompt && <span className="text-blue-600 ml-1">(Please tell us more so we can help!)</span>}
                  </label>
                  <textarea
                    value={cancelDetails}
                    onChange={(e) => setCancelDetails(e.target.value)}
                    rows={4}
                    placeholder={
                      showRetentionPrompt
                        ? "What would it take to keep your business? We're here to help..."
                        : "Help us improve by sharing more details about your decision..."
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  />
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setCancelModalOpen(false)}
                  disabled={submitting}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors disabled:opacity-50"
                >
                  Keep Subscription
                </button>
                <button
                  onClick={handleCancelSubscription}
                  disabled={submitting || !cancelReason}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Processing...' : 'Confirm Cancellation'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Batch Payment Confirmation Modal */}
      {confirmPayAll && (
        <div className="fixed inset-0 bg-black/75 flex items-end sm:items-center justify-center sm:p-4 z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Confirm Batch Payment</h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {selectedInvoices.length} invoice{selectedInvoices.length !== 1 ? 's' : ''} selected
                  </p>
                </div>
                <button onClick={() => setConfirmPayAll(false)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                  <XCircle className="w-5 h-5 text-gray-400" />
                </button>
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden mb-5">
                <div className="divide-y divide-gray-100">
                  {selectedInvoices.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{inv.invoice_number}</p>
                        {inv.project_number && (
                          <p className="text-xs text-gray-500">Project {inv.project_number}</p>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-orange-600">{formatCurrency(inv.amount_due)}</p>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t border-gray-200">
                  <p className="text-sm font-semibold text-gray-900">Total Due</p>
                  <p className="text-base font-bold text-gray-900">{formatCurrency(selectedTotal)}</p>
                </div>
              </div>

              <p className="text-xs text-gray-500 mb-5">
                A separate QuickBooks payment window will open for each invoice. Complete the payment in each window to settle your balance.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmPayAll(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={executePayAll}
                  disabled={payingAll}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <CreditCard className="w-4 h-4" />
                  Open Payment Windows
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Detail Modal */}
      {detailInvoiceId && (
        <InvoiceDetailModal
          invoiceId={detailInvoiceId}
          onClose={() => setDetailInvoiceId(null)}
          readonly={true}
        />
      )}

      {/* Payment Unavailable Modal */}
      {paymentUnavailableInvoice && (
        <div className="fixed inset-0 bg-black/75 flex items-end sm:items-center justify-center sm:p-4 z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-sm p-5 sm:p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Payment Link Unavailable</h3>
                  <p className="text-sm text-gray-500">{paymentUnavailableInvoice.invoice_number}</p>
                </div>
              </div>
              <button onClick={() => setPaymentUnavailableInvoice(null)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                <XCircle className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              The online payment link for this invoice isn't ready yet. Please contact us and we'll get it sorted out right away.
            </p>
            {(companyContact?.phone || companyContact?.email) && (
              <div className="space-y-2 mb-5">
                {companyContact.phone && (
                  <a href={`tel:${companyContact.phone}`} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <Phone className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-800">{companyContact.phone}</span>
                  </a>
                )}
                {companyContact.email && (
                  <a href={`mailto:${companyContact.email}`} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <Mail className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    <span className="text-sm font-medium text-gray-800">{companyContact.email}</span>
                  </a>
                )}
              </div>
            )}
            <button
              onClick={() => setPaymentUnavailableInvoice(null)}
              className="w-full px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );

  if (isEmbedded) {
    return (
      <div>
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900">My Invoices</h2>
          <p className="text-sm text-gray-500 mt-0.5">View and pay your invoices and subscriptions</p>
        </div>
        {mainContent}
        {modals}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#0f2347] text-white shadow-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 sm:h-20 gap-3">
            <a href="/portal" className="flex items-center gap-1.5 px-3 py-2 text-blue-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors min-h-[44px]">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline text-sm font-medium">Dashboard</span>
            </a>
            <img src="/el_logo_color_(2).png" alt="Electronic Life" className="h-8 sm:h-10 object-contain flex-shrink-0" />
            <div className="hidden sm:block border-l border-white/20 pl-4">
              <p className="text-white font-semibold text-sm leading-tight">My Invoices</p>
              <p className="text-blue-300 text-xs">View and pay your invoices and subscriptions</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        {mainContent}
      </main>
      {modals}
    </div>
  );
}

function SubscriptionStatusBadge({ status }: { status: string }) {
  const configs: Record<string, { icon: React.ReactNode; label: string; className: string }> = {
    active: { icon: <CheckCircle className="w-4 h-4" />, label: 'Active', className: 'bg-green-100 text-green-700' },
    paused: { icon: <Clock className="w-4 h-4" />, label: 'Paused', className: 'bg-yellow-100 text-yellow-700' },
    cancelled: { icon: <XCircle className="w-4 h-4" />, label: 'Cancelled', className: 'bg-red-100 text-red-700' },
    expired: { icon: <AlertCircle className="w-4 h-4" />, label: 'Expired', className: 'bg-gray-100 text-gray-700' },
  };
  const config = configs[status] || configs.active;
  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${config.className}`}>
      {config.icon}
      {config.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { icon: React.ReactNode; label: string; className: string }> = {
    draft: { icon: <Clock className="w-4 h-4" />, label: 'Draft', className: 'bg-gray-100 text-gray-700' },
    sent: { icon: <Clock className="w-4 h-4" />, label: 'Sent', className: 'bg-blue-100 text-blue-700' },
    partial: { icon: <AlertCircle className="w-4 h-4" />, label: 'Partially Paid', className: 'bg-yellow-100 text-yellow-700' },
    paid: { icon: <CheckCircle className="w-4 h-4" />, label: 'Paid', className: 'bg-green-100 text-green-700' },
    overdue: { icon: <AlertCircle className="w-4 h-4" />, label: 'Overdue', className: 'bg-red-100 text-red-700' },
  };
  const config = configs[status] || configs.draft;
  return (
    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${config.className}`}>
      {config.icon}
      {config.label}
    </span>
  );
}
