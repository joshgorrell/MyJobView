import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  X, Printer, Download, Mail, DollarSign, CheckCircle,
  Clock, AlertCircle, Send, CreditCard, Loader2,
  Pencil, Check, ChevronDown, ChevronUp, Info, ShieldCheck,
  Ban, Trash2, MapPin, BarChart2, ArrowLeftRight, Receipt, Eye
} from 'lucide-react';
import { RecordPaymentModal } from './RecordPaymentModal';
import ConfirmModal from '../ui/ConfirmModal';
import {
  getTaxApplicability, getProjectTypeDisplayName, getEnvironmentDisplayName,
  type TaxEnvironment, type TaxProjectType
} from '../../lib/taxCalculations';

interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  is_taxable?: boolean;
  item_type?: 'labor' | 'material';
  notes?: string | null;
  notes_visible_on_invoice?: boolean | null;
}

interface Payment {
  id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
}

interface InvoiceDetail {
  id: string;
  invoice_number: string;
  invoice_title: string | null;
  invoice_date: string;
  due_date: string | null;
  status: string;
  subtotal: number;
  tax_amount: number;
  tax_rate: number;
  total: number;
  amount_paid: number;
  amount_due: number;
  notes: string | null;
  payment_terms: string | null;
  contact_id: string | null;
  sales_order_id: string | null;
  source_type: string | null;
  billing_name: string | null;
  billing_address_line1: string | null;
  billing_address_line2: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_zip: string | null;
  tax_environment: TaxEnvironment | null;
  tax_project_type: TaxProjectType | null;
  tax_override: boolean | null;
  tax_override_reason: string | null;
  tax_jurisdiction_id: string | null;
  bill_to_contact_id: string | null;
  bill_to_contact?: {
    id: string;
    full_name: string | null;
    company_name: string | null;
    first_name: string | null;
    last_name: string | null;
    street_address: string | null;
    city: string | null;
    state: string | null;
    zip_code: string | null;
  } | null;
  contacts: {
    contact_name: string | null;
    first_name: string | null;
    last_name: string | null;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    street_address: string | null;
    city: string | null;
    state: string | null;
    zip_code: string | null;
    is_tax_exempt?: boolean;
  } | null;
  invoice_line_items: InvoiceLineItem[];
  payments: Payment[];
  tax_jurisdictions?: {
    jurisdiction_name: string | null;
    combined_rate: number | null;
    city: string | null;
    county: string | null;
    state: string | null;
  } | null;
}

interface CompanySettings {
  company_name: string | null;
  company_email: string | null;
  company_logo_url: string | null;
  default_invoice_terms_and_conditions: string | null;
}

interface OfficeAddress {
  office_name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
}

interface InvoiceDetailModalProps {
  invoiceId: string;
  onClose: () => void;
  onPaymentRecorded?: () => void;
  onVoided?: () => void;
  onDeleted?: () => void;
  readonly?: boolean;
}

function formatPaymentTerms(terms: string | null): string {
  if (!terms) return '';
  const map: Record<string, string> = {
    'net_10': 'Net 10',
    'net_15': 'Net 15',
    'net_30': 'Net 30',
    'net_45': 'Net 45',
    'net_60': 'Net 60',
    'due_on_receipt': 'Due on Receipt',
  };
  return map[terms.toLowerCase()] || terms;
}

export function InvoiceDetailModal({ invoiceId, onClose, onPaymentRecorded, onVoided, onDeleted, readonly = false }: InvoiceDetailModalProps) {
  const { profile } = useAuth();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [officeAddress, setOfficeAddress] = useState<OfficeAddress | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState(false);
  const [emailOverride, setEmailOverride] = useState('');
  const [editingLineItemId, setEditingLineItemId] = useState<string | null>(null);
  const [editingDescription, setEditingDescription] = useState('');
  const [savingDescription, setSavingDescription] = useState(false);
  const [showTaxDetails, setShowTaxDetails] = useState(false);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [editingBilling, setEditingBilling] = useState(false);
  const [billingDraft, setBillingDraft] = useState({ name: '', line1: '', line2: '', city: '', state: '', zip: '' });
  const [savingBilling, setSavingBilling] = useState(false);
  const [includeBillingProgress, setIncludeBillingProgress] = useState(false);
  const [billingSummary, setBillingSummary] = useState<any>(null);
  const [loadingBillingSummary, setLoadingBillingSummary] = useState(false);
  const [billingSummaryError, setBillingSummaryError] = useState(false);
  const [hasPartialCO, setHasPartialCO] = useState(false);
  const [invoiceOpens, setInvoiceOpens] = useState<Array<{ id: string; opened_at: string; event_type: string; user_agent: string | null }>>([]);
  const [showActivitySection, setShowActivitySection] = useState(false);
  const descriptionInputRef = useRef<HTMLInputElement>(null);

  const canDeletePaidInvoices = profile?.role === 'admin' || profile?.can_delete_invoices === true;

  async function reverseCOBillingForInvoice(inv: InvoiceDetail) {
    const { data: links } = await supabase
      .from('invoice_change_order_links')
      .select('change_order_id, amount_billed')
      .eq('invoice_id', inv.id);

    if (!links || links.length === 0) return;

    for (const link of links) {
      const { data: otherLinks } = await supabase
        .from('invoice_change_order_links')
        .select('amount_billed, invoice_id, invoices!inner(status)')
        .eq('change_order_id', link.change_order_id)
        .neq('invoice_id', inv.id);

      const remainingBilled = (otherLinks || [])
        .filter((l: any) => l.invoices?.status !== 'void')
        .reduce((sum: number, l: any) => sum + (l.amount_billed || 0), 0);

      const { data: co } = await supabase
        .from('change_orders')
        .select('total_amount')
        .eq('id', link.change_order_id)
        .maybeSingle();

      let newStatus = 'unbilled';
      if (remainingBilled > 0 && co && remainingBilled < co.total_amount) newStatus = 'partially_billed';
      else if (remainingBilled > 0 && co && remainingBilled >= co.total_amount) newStatus = 'fully_billed';

      await supabase
        .from('change_orders')
        .update({ amount_billed: remainingBilled, billing_status: newStatus })
        .eq('id', link.change_order_id);
    }
  }

  async function handleVoidInvoice() {
    if (!invoice) return;
    setActionLoading(true);
    setConfirmVoid(false);
    try {
      await reverseCOBillingForInvoice(invoice);
      await supabase.from('invoice_change_order_links').delete().eq('invoice_id', invoice.id);
      const { error } = await supabase
        .from('invoices')
        .update({ status: 'void' })
        .eq('id', invoice.id);
      if (error) throw error;
      onVoided?.();
      onClose();
    } catch (err) {
      console.error('Error voiding invoice:', err);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteInvoice() {
    if (!invoice) return;
    setActionLoading(true);
    setConfirmDelete(false);
    try {
      await reverseCOBillingForInvoice(invoice);
      const { error } = await supabase.from('invoices').delete().eq('id', invoice.id);
      if (error) throw error;
      onDeleted?.();
      onClose();
    } catch (err) {
      console.error('Error deleting invoice:', err);
    } finally {
      setActionLoading(false);
    }
  }

  useEffect(() => {
    loadInvoice();
    loadSettings();
    loadInvoiceOpens();
  }, [invoiceId]);

  async function loadInvoiceOpens() {
    const { data } = await supabase
      .from('invoice_opens')
      .select('id, opened_at, event_type, user_agent')
      .eq('invoice_id', invoiceId)
      .order('opened_at', { ascending: false });
    setInvoiceOpens(data ?? []);
  }

  async function loadInvoice() {
    const { data, error } = await supabase
      .from('invoices')
      .select(`
        id, invoice_number, invoice_title, invoice_date, due_date, status,
        subtotal, tax_amount, tax_rate, total, amount_paid, amount_due,
        notes, payment_terms, contact_id, sales_order_id, source_type,
        billing_name, billing_address_line1, billing_address_line2, billing_city, billing_state, billing_zip,
        tax_environment, tax_project_type, tax_override, tax_override_reason, tax_jurisdiction_id,
        bill_to_contact_id,
        contacts:contact_id (
          contact_name, first_name, last_name, full_name, email, phone,
          street_address, city, state, zip_code, is_tax_exempt
        ),
        bill_to_contact:bill_to_contact_id (
          id, full_name, company_name, first_name, last_name,
          street_address, city, state, zip_code
        ),
        invoice_line_items (
          id, description, quantity, unit_price, amount, is_taxable, item_type, notes, notes_visible_on_invoice
        ),
        payments (
          id, amount, payment_date, payment_method
        ),
        tax_jurisdictions:tax_jurisdiction_id (
          jurisdiction_name, combined_rate, city, county, state
        )
      `)
      .eq('id', invoiceId)
      .maybeSingle();

    if (!error && data) {
      setInvoice(data as any);
      const { data: coLinks } = await supabase
        .from('invoice_change_order_links')
        .select('fully_billed')
        .eq('invoice_id', invoiceId);
      setHasPartialCO((coLinks || []).some((l: any) => l.fully_billed === false));
    }
    setLoading(false);
  }

  async function loadSettings() {
    const [settingsRes, officeRes] = await Promise.all([
      supabase
        .from('company_settings')
        .select('company_name, company_email, company_logo_url, default_invoice_terms_and_conditions')
        .maybeSingle(),
      supabase
        .from('company_offices')
        .select('office_name, address_line1, address_line2, city, state, zip, phone')
        .order('display_order', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);
    if (settingsRes.data) setSettings(settingsRes.data);
    if (officeRes.data) setOfficeAddress(officeRes.data as OfficeAddress);
  }

  async function loadBillingSummary(salesOrderId: string) {
    setLoadingBillingSummary(true);
    setBillingSummaryError(false);
    try {
      const { data, error } = await supabase.rpc('get_billing_summary', { p_sales_order_id: salesOrderId });
      if (error) throw error;
      setBillingSummary(data);
    } catch (err) {
      console.error('Error loading billing summary:', err);
      setBillingSummaryError(true);
      setIncludeBillingProgress(false);
    } finally {
      setLoadingBillingSummary(false);
    }
  }

  function handleToggleBillingProgress(checked: boolean) {
    setIncludeBillingProgress(checked);
    if (checked && !billingSummary && invoice?.sales_order_id) {
      loadBillingSummary(invoice.sales_order_id);
    }
  }

  async function handleSendEmail() {
    setSendingEmail(true);
    setConfirmEmail(false);
    try {
      const body: Record<string, any> = { invoiceId };
      const trimmed = emailOverride.trim();
      if (trimmed && trimmed !== invoice?.contacts?.email) {
        body.overrideEmail = trimmed;
      } else if (trimmed) {
        body.overrideEmail = trimmed;
      }
      if (includeBillingProgress && billingSummary && invoice && settings) {
        body.billingProgressHtml = buildBillingProgressHTML(billingSummary, invoice.id, invoice.invoice_number, settings);
      }
      const { error } = await supabase.functions.invoke('send-invoice-email', { body });
      if (error) throw error;
      setEmailSent(true);
      setTimeout(() => setEmailSent(false), 4000);
      loadInvoice();
    } catch (err) {
      console.error('Error sending invoice:', err);
    } finally {
      setSendingEmail(false);
    }
  }

  async function handleDownloadPdf() {
    setDownloadingPdf(true);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-invoice-pdf`;
      const { data: { session } } = await supabase.auth.getSession();
      const requestBody: Record<string, any> = { invoiceId };
      if (includeBillingProgress && billingSummary && invoice && settings) {
        requestBody.billingProgressHtml = buildBillingProgressHTML(billingSummary, invoice.id, invoice.invoice_number, settings);
      }
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) throw new Error('Failed to generate PDF');
      const html = await response.text();

      const win = window.open('', '_blank');
      if (win) {
        win.document.write(html);
        win.document.close();
        setTimeout(() => win.print(), 500);
      }
    } catch (err) {
      console.error('Error generating PDF:', err);
    } finally {
      setDownloadingPdf(false);
    }
  }

  function startEditingBilling() {
    if (!invoice) return;
    const billName = invoice.billing_name || (invoice.contacts ? (invoice.contacts.full_name || invoice.contacts.contact_name || `${invoice.contacts.first_name || ''} ${invoice.contacts.last_name || ''}`.trim()) : '') || '';
    setBillingDraft({
      name: billName,
      line1: invoice.billing_address_line1 || invoice.contacts?.street_address || '',
      line2: invoice.billing_address_line2 || '',
      city: invoice.billing_city || invoice.contacts?.city || '',
      state: invoice.billing_state || invoice.contacts?.state || '',
      zip: invoice.billing_zip || invoice.contacts?.zip_code || '',
    });
    setEditingBilling(true);
  }

  async function saveBilling() {
    if (!invoice) return;
    setSavingBilling(true);
    try {
      const { error } = await supabase
        .from('invoices')
        .update({
          billing_name: billingDraft.name || null,
          billing_address_line1: billingDraft.line1 || null,
          billing_address_line2: billingDraft.line2 || null,
          billing_city: billingDraft.city || null,
          billing_state: billingDraft.state || null,
          billing_zip: billingDraft.zip || null,
        })
        .eq('id', invoice.id);
      if (error) throw error;
      setInvoice(prev => prev ? {
        ...prev,
        billing_name: billingDraft.name || null,
        billing_address_line1: billingDraft.line1 || null,
        billing_address_line2: billingDraft.line2 || null,
        billing_city: billingDraft.city || null,
        billing_state: billingDraft.state || null,
        billing_zip: billingDraft.zip || null,
      } : prev);
      setEditingBilling(false);
    } catch (err) {
      console.error('Error saving billing address:', err);
    } finally {
      setSavingBilling(false);
    }
  }

  function getBillToContactName(btc: NonNullable<InvoiceDetail['bill_to_contact']>) {
    return btc.company_name || btc.full_name || `${btc.first_name || ''} ${btc.last_name || ''}`.trim();
  }

  function getCustomerName(inv: InvoiceDetail) {
    const c = inv.contacts;
    if (!c) return '';
    return c.full_name || c.contact_name || `${c.first_name || ''} ${c.last_name || ''}`.trim();
  }

  async function swapInvoiceBilling() {
    if (!invoice) return;
    const btc = invoice.bill_to_contact;
    const isCurrentlyBillTo = !!invoice.billing_name && btc && invoice.billing_name === getBillToContactName(btc);

    let newBilling: Partial<InvoiceDetail>;
    if (!isCurrentlyBillTo && btc) {
      newBilling = {
        billing_name: getBillToContactName(btc),
        billing_address_line1: btc.street_address || null,
        billing_address_line2: null,
        billing_city: btc.city || null,
        billing_state: btc.state || null,
        billing_zip: btc.zip_code || null,
      };
    } else {
      const c = invoice.contacts;
      newBilling = {
        billing_name: c ? (c.full_name || c.contact_name || `${c.first_name || ''} ${c.last_name || ''}`.trim()) : null,
        billing_address_line1: c?.street_address || null,
        billing_address_line2: null,
        billing_city: c?.city || null,
        billing_state: c?.state || null,
        billing_zip: c?.zip_code || null,
      };
    }

    try {
      const { error } = await supabase
        .from('invoices')
        .update(newBilling)
        .eq('id', invoice.id);
      if (error) throw error;
      setInvoice(prev => prev ? { ...prev, ...newBilling } : prev);
    } catch (err) {
      console.error('Error swapping billing:', err);
    }
  }

  function handlePrint() {
    if (!invoice || !settings) return;
    let html = buildPrintHTML(invoice, settings, officeAddress);
    if (includeBillingProgress && billingSummary) {
      html = html.replace('</body>', buildBillingProgressHTML(billingSummary, invoice.id, invoice.invoice_number, settings) + '</body>');
    }
    const win = window.open('', '_blank', 'width=900,height=700');
    if (win) {
      win.document.write(html);
      win.document.close();
      setTimeout(() => {
        win.focus();
        win.print();
      }, 600);
    }
  }

  function startEditingDescription(item: InvoiceLineItem) {
    setEditingLineItemId(item.id);
    setEditingDescription(item.description);
    setTimeout(() => descriptionInputRef.current?.focus(), 50);
  }

  function cancelEditingDescription() {
    setEditingLineItemId(null);
    setEditingDescription('');
  }

  async function saveDescription(itemId: string) {
    if (!editingDescription.trim()) return;
    setSavingDescription(true);
    try {
      const { error } = await supabase
        .from('invoice_line_items')
        .update({ description: editingDescription.trim() })
        .eq('id', itemId);
      if (error) throw error;
      setInvoice(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          invoice_line_items: prev.invoice_line_items.map(li =>
            li.id === itemId ? { ...li, description: editingDescription.trim() } : li
          ),
        };
      });
      setEditingLineItemId(null);
      setEditingDescription('');
    } catch (err) {
      console.error('Error saving description:', err);
    } finally {
      setSavingDescription(false);
    }
  }

  function fmt(n: number) {
    return (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function getStatusStyle(status: string) {
    switch (status) {
      case 'paid': return { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle };
      case 'sent': return { bg: 'bg-blue-100', text: 'text-blue-700', icon: Send };
      case 'partial': return { bg: 'bg-amber-100', text: 'text-amber-700', icon: CreditCard };
      case 'overdue': return { bg: 'bg-red-100', text: 'text-red-700', icon: AlertCircle };
      case 'void': return { bg: 'bg-gray-100', text: 'text-gray-500', icon: Ban };
      default: return { bg: 'bg-gray-100', text: 'text-gray-700', icon: Clock };
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-8 flex items-center gap-4 shadow-2xl">
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
          <span className="text-gray-700 font-medium">Loading invoice...</span>
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <p className="text-gray-700 font-medium">Invoice not found.</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 bg-gray-100 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">Close</button>
        </div>
      </div>
    );
  }

  const statusStyle = getStatusStyle(invoice.status);
  const StatusIcon = statusStyle.icon;
  const customerName = invoice.contacts?.full_name ||
    invoice.contacts?.contact_name ||
    `${invoice.contacts?.first_name || ''} ${invoice.contacts?.last_name || ''}`.trim() || 'Customer';
  const canPay = invoice.status !== 'paid' && invoice.status !== 'void' && invoice.amount_due > 0;
  const canVoid = invoice.status !== 'void' &&
    (invoice.status === 'draft' || invoice.status === 'sent' || canDeletePaidInvoices);
  const canDelete = invoice.status === 'draft' || invoice.status === 'sent' || canDeletePaidInvoices;
  const isSalesOrderInvoice = !!invoice.sales_order_id;

  return (
    <>
      <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 pt-6 overflow-y-auto">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-auto">

          {/* Modal Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Invoice #{invoice.invoice_number}</h2>
                {invoice.invoice_title && (
                  <p className="text-sm text-gray-500 leading-none mt-0.5">{invoice.invoice_title}</p>
                )}
              </div>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${statusStyle.bg} ${statusStyle.text}`}>
                <StatusIcon className="w-3 h-3" />
                {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
              </span>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Action Bar */}
          <div className="flex items-center gap-2 px-6 py-3 bg-gray-50 border-b border-gray-100 flex-wrap">
            {!readonly && canPay && (
              <button
                onClick={() => setShowPaymentModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                <DollarSign className="w-4 h-4" />
                Record Payment
              </button>
            )}
            {isSalesOrderInvoice && (
              <label className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg cursor-pointer select-none hover:bg-gray-50 transition-colors">
                {loadingBillingSummary ? (
                  <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
                ) : (
                  <input
                    type="checkbox"
                    checked={includeBillingProgress}
                    onChange={e => handleToggleBillingProgress(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                  />
                )}
                <BarChart2 className="w-4 h-4 text-blue-500 shrink-0" />
                <span className="text-sm font-medium text-gray-700">Billing Progress</span>
                {billingSummaryError && (
                  <span className="text-xs text-red-500 ml-1">Failed to load</span>
                )}
              </label>
            )}
            <button
              onClick={handlePrint}
              disabled={loadingBillingSummary}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={downloadingPdf || loadingBillingSummary}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {downloadingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Save PDF
            </button>
            {!readonly && (
              <button
                onClick={() => { setEmailOverride(invoice?.contacts?.email || ''); setConfirmEmail(true); }}
                disabled={sendingEmail || loadingBillingSummary}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {sendingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                {emailSent ? 'Sent!' : 'Email Invoice'}
              </button>
            )}
            {!readonly && canVoid && (
              <button
                onClick={() => setConfirmVoid(true)}
                disabled={actionLoading}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-amber-300 hover:bg-amber-50 text-amber-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ml-auto"
              >
                <Ban className="w-4 h-4" />
                Void
              </button>
            )}
            {!readonly && canDelete && (
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={actionLoading}
                className={`flex items-center gap-2 px-4 py-2 bg-white border border-red-300 hover:bg-red-50 text-red-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${!canVoid ? 'ml-auto' : ''}`}
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            )}
          </div>

          {/* Invoice Body */}
          <div className="p-6 space-y-6">

            {/* Void banner */}
            {invoice.status === 'void' && (
              <div className="flex items-center gap-3 px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl">
                <Ban className="w-5 h-5 text-gray-500 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-gray-700">This invoice has been voided</p>
                  <p className="text-xs text-gray-500 mt-0.5">All linked change order billing has been reversed.</p>
                </div>
              </div>
            )}

            {/* Two-column header info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Bill To</p>
                  {!readonly && !editingBilling && (
                    <button
                      onClick={startEditingBilling}
                      className="p-1 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors"
                      title="Edit billing address"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                  {!readonly && !editingBilling && invoice.bill_to_contact && (
                    <button
                      onClick={swapInvoiceBilling}
                      className="flex items-center gap-1 px-2 py-0.5 text-[11px] bg-gray-100 hover:bg-amber-50 text-gray-500 hover:text-amber-700 border border-gray-200 hover:border-amber-300 rounded-lg transition-colors"
                      title={`Swap billing between ${getCustomerName(invoice)} and ${getBillToContactName(invoice.bill_to_contact)}`}
                    >
                      <ArrowLeftRight className="w-3 h-3" />
                      Swap
                    </button>
                  )}
                  {invoice.bill_to_contact && invoice.billing_name === getBillToContactName(invoice.bill_to_contact) && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 rounded">
                      <Receipt className="w-2.5 h-2.5" />
                      Bill-To Party
                    </span>
                  )}
                </div>
                {editingBilling ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={billingDraft.name}
                      onChange={e => setBillingDraft(d => ({ ...d, name: e.target.value }))}
                      placeholder="Name"
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <input
                      type="text"
                      value={billingDraft.line1}
                      onChange={e => setBillingDraft(d => ({ ...d, line1: e.target.value }))}
                      placeholder="Address line 1"
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <input
                      type="text"
                      value={billingDraft.line2}
                      onChange={e => setBillingDraft(d => ({ ...d, line2: e.target.value }))}
                      placeholder="Address line 2 (optional)"
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        type="text"
                        value={billingDraft.city}
                        onChange={e => setBillingDraft(d => ({ ...d, city: e.target.value }))}
                        placeholder="City"
                        className="col-span-1 px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <input
                        type="text"
                        value={billingDraft.state}
                        onChange={e => setBillingDraft(d => ({ ...d, state: e.target.value }))}
                        placeholder="ST"
                        maxLength={2}
                        className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <input
                        type="text"
                        value={billingDraft.zip}
                        onChange={e => setBillingDraft(d => ({ ...d, zip: e.target.value }))}
                        placeholder="ZIP"
                        className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={saveBilling}
                        disabled={savingBilling}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                      >
                        {savingBilling ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Save
                      </button>
                      <button
                        onClick={() => setEditingBilling(false)}
                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-xs font-medium transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    {(() => {
                      const billName = invoice.billing_name || customerName;
                      const line1 = invoice.billing_address_line1 || invoice.contacts?.street_address;
                      const line2 = invoice.billing_address_line2;
                      const city = invoice.billing_city || invoice.contacts?.city;
                      const state = invoice.billing_state || invoice.contacts?.state;
                      const zip = invoice.billing_zip || invoice.contacts?.zip_code;
                      const cityLine = [city, state, zip].filter(Boolean).join(', ');
                      return (
                        <>
                          <p className="font-semibold text-gray-900 text-base">{billName}</p>
                          {line1 && (
                            <p className="text-sm text-gray-500 mt-1">
                              {line1}{line2 ? <><br />{line2}</> : null}
                              {cityLine ? <><br />{cityLine}</> : null}
                            </p>
                          )}
                          {invoice.contacts?.email && (
                            <p className="text-sm text-gray-500 mt-1">{invoice.contacts.email}</p>
                          )}
                          {invoice.contacts?.phone && (
                            <p className="text-sm text-gray-500">{invoice.contacts.phone}</p>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Invoice Details</p>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Invoice #</span>
                  <span className="font-medium text-gray-900">{invoice.invoice_number}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Date Issued</span>
                  <span className="text-gray-900">{new Date(invoice.invoice_date).toLocaleDateString()}</span>
                </div>
                {invoice.due_date && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Due Date</span>
                    <span className="text-gray-900">{new Date(invoice.due_date).toLocaleDateString()}</span>
                  </div>
                )}
                {invoice.payment_terms && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Terms</span>
                    <span className="text-gray-900">{formatPaymentTerms(invoice.payment_terms)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            {invoice.notes && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1">Notes</p>
                <p className="text-sm text-amber-800 whitespace-pre-wrap leading-relaxed">{invoice.notes}</p>
              </div>
            )}

            {/* Line Items */}
            <div>
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-16">Qty</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Unit Price</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-28">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {invoice.invoice_line_items.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-gray-400 text-sm">No line items</td>
                      </tr>
                    ) : (
                      invoice.invoice_line_items.map(item => (
                        <tr key={item.id} className="hover:bg-gray-50 group">
                          <td className="px-4 py-3">
                            {!readonly && editingLineItemId === item.id ? (
                              <div className="flex items-center gap-2">
                                <input
                                  ref={descriptionInputRef}
                                  type="text"
                                  value={editingDescription}
                                  onChange={e => setEditingDescription(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') saveDescription(item.id);
                                    if (e.key === 'Escape') cancelEditingDescription();
                                  }}
                                  className="flex-1 border border-blue-300 rounded-md px-2 py-1 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                />
                                <button
                                  onClick={() => saveDescription(item.id)}
                                  disabled={savingDescription}
                                  className="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50"
                                  title="Save"
                                >
                                  {savingDescription ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                </button>
                                <button
                                  onClick={cancelEditingDescription}
                                  className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-md transition-colors"
                                  title="Cancel"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-gray-800">{item.description}</span>
                                {!readonly && (
                                  <button
                                    onClick={() => startEditingDescription(item)}
                                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-all"
                                    title="Edit description"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-600">{item.quantity}</td>
                          <td className="px-4 py-3 text-right text-gray-600">${fmt(item.unit_price)}</td>
                          <td className="px-4 py-3 text-right font-medium text-gray-900">${fmt(item.amount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {hasPartialCO && (
                <p className="mt-3 text-xs text-gray-400 italic">
                  This invoice reflects a partial billing. Additional charges may follow.
                </p>
              )}

              {/* Totals */}
              <div className="mt-4 flex justify-end">
                <div className="w-full max-w-xs space-y-2">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Subtotal</span>
                    <span>${fmt(invoice.subtotal)}</span>
                  </div>
                  {invoice.tax_amount > 0 ? (
                    <div className="flex justify-between text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        {invoice.tax_rate > 0
                          ? `Sales Tax (${(invoice.tax_rate <= 1 ? invoice.tax_rate * 100 : invoice.tax_rate).toFixed(2)}%)`
                          : 'Sales Tax'}
                        {(invoice.tax_environment || invoice.tax_project_type) && (
                          <button
                            onClick={() => setShowTaxDetails(v => !v)}
                            className="text-blue-500 hover:text-blue-700 transition-colors"
                            title="View tax breakdown"
                          >
                            <Info className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </span>
                      <span>${fmt(invoice.tax_amount)}</span>
                    </div>
                  ) : (invoice.tax_environment || invoice.tax_project_type) ? (
                    <div className="flex justify-between text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        Sales Tax
                        <button
                          onClick={() => setShowTaxDetails(v => !v)}
                          className="text-blue-500 hover:text-blue-700 transition-colors"
                          title="View tax rules"
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>
                      </span>
                      <span className="text-gray-400 italic text-xs self-center">Not applicable</span>
                    </div>
                  ) : null}

                  {/* Tax Details Toggle Button */}
                  {(invoice.tax_environment || invoice.tax_project_type) && (
                    <div>
                      <button
                        onClick={() => setShowTaxDetails(v => !v)}
                        className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                      >
                        {showTaxDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        {showTaxDetails ? 'Hide tax details' : 'View tax details'}
                      </button>
                    </div>
                  )}

                  <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t-2 border-gray-200">
                    <span>Total</span>
                    <span className="text-blue-600">${fmt(invoice.total)}</span>
                  </div>
                  {invoice.amount_paid > 0 && (
                    <>
                      <div className="flex justify-between text-sm text-green-600">
                        <span>Amount Paid</span>
                        <span>-${fmt(invoice.amount_paid)}</span>
                      </div>
                      <div className="flex justify-between text-base font-bold pt-2 border-t-2 border-red-200 text-red-600">
                        <span>Balance Due</span>
                        <span>${fmt(invoice.amount_due)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Tax Breakdown Panel */}
              {showTaxDetails && (invoice.tax_environment || invoice.tax_project_type) && (
                <TaxBreakdownPanel invoice={invoice} fmt={fmt} />
              )}
            </div>

            {/* Payment History */}
            {invoice.payments && invoice.payments.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Payment History</p>
                <div className="bg-green-50 border border-green-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-green-200">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-green-700 uppercase tracking-wider">Date</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-green-700 uppercase tracking-wider">Method</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-green-700 uppercase tracking-wider">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-green-100">
                      {invoice.payments.map(p => (
                        <tr key={p.id}>
                          <td className="px-4 py-2.5 text-green-800">{new Date(p.payment_date).toLocaleDateString()}</td>
                          <td className="px-4 py-2.5 text-green-700 capitalize">{p.payment_method}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-green-800">${fmt(p.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Customer Activity */}
            {!readonly && (
              <div>
                <button
                  onClick={() => setShowActivitySection(v => !v)}
                  className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 hover:text-gray-600 transition-colors"
                >
                  <BarChart2 className="w-3.5 h-3.5" />
                  Customer Activity
                  <span className="ml-1 text-gray-500 normal-case font-normal">
                    ({invoiceOpens.length} event{invoiceOpens.length !== 1 ? 's' : ''})
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 ml-auto transition-transform ${showActivitySection ? 'rotate-180' : ''}`} />
                </button>
                {showActivitySection && (
                  invoiceOpens.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">No customer views recorded yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {invoiceOpens.map(row => {
                        const isDownload = row.event_type === 'downloaded';
                        const date = new Date(row.opened_at);
                        return (
                          <div key={row.id} className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-lg text-sm">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${isDownload ? 'bg-teal-50 text-teal-700' : 'bg-blue-50 text-blue-700'}`}>
                              {isDownload ? <Download className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                              {isDownload ? 'Downloaded' : 'Viewed'}
                            </span>
                            <span className="text-gray-600 flex-1 text-xs truncate">{row.user_agent || 'Unknown device'}</span>
                            <span className="text-xs text-gray-400 flex-shrink-0">
                              {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              {' '}
                              {date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )
                )}
              </div>
            )}

            {/* Paid badge */}
            {invoice.status === 'paid' && (
              <div className="flex items-center justify-center gap-3 py-4 bg-green-50 border border-green-200 rounded-xl">
                <CheckCircle className="w-6 h-6 text-green-600" />
                <span className="font-semibold text-green-700 text-lg">Paid in Full</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirm Email Modal - staff only */}
      {!readonly && confirmEmail && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <Mail className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Send Invoice Email</h3>
                <p className="text-sm text-gray-500">#{invoice.invoice_number}</p>
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Recipient Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  value={emailOverride}
                  onChange={(e) => setEmailOverride(e.target.value)}
                  placeholder="customer@example.com"
                  className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              {!invoice.contacts?.email && (
                <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  No email on file for this customer
                </p>
              )}
              {invoice.contacts?.email && emailOverride.trim() !== invoice.contacts.email && emailOverride.trim() !== '' && (
                <p className="text-xs text-blue-600 mt-1.5">Sending to a different address than on file</p>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmEmail(false)}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSendEmail}
                disabled={!emailOverride.trim()}
                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
                Send Email
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email sent toast */}
      {emailSent && (
        <div className="fixed bottom-6 right-6 z-[70] flex items-center gap-3 bg-green-600 text-white px-5 py-3 rounded-xl shadow-lg">
          <CheckCircle className="w-5 h-5" />
          <span className="text-sm font-medium">Invoice emailed successfully</span>
        </div>
      )}

      {!readonly && showPaymentModal && (
        <RecordPaymentModal
          invoice={{
            id: invoice.id,
            invoice_number: invoice.invoice_number,
            contact_id: invoice.contact_id || '',
            contact_email: invoice.contacts?.email || undefined,
            total: invoice.total,
            amount_paid: invoice.amount_paid,
            amount_due: invoice.amount_due,
          }}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={() => {
            setShowPaymentModal(false);
            loadInvoice();
            onPaymentRecorded?.();
          }}
        />
      )}

      {actionLoading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70]">
          <div className="bg-white rounded-xl px-8 py-6 flex items-center gap-4 shadow-2xl">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
            <span className="text-gray-700 font-medium">Processing...</span>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmVoid}
        title="Void Invoice"
        message={`Void invoice #${invoice.invoice_number}? This will reverse any linked change order billing amounts so those change orders can be re-billed. This action cannot be undone.`}
        variant="warning"
        confirmLabel="Void Invoice"
        cancelLabel="Cancel"
        onConfirm={handleVoidInvoice}
        onCancel={() => setConfirmVoid(false)}
      />

      <ConfirmModal
        isOpen={confirmDelete}
        title="Delete Invoice"
        message={`Permanently delete invoice #${invoice.invoice_number}?${invoice.amount_paid > 0 ? ' This invoice has payments recorded — those payments will remain on the customer account as credits.' : ''} Any linked change order billing will be reversed. This cannot be undone.`}
        variant="danger"
        confirmLabel="Delete Invoice"
        cancelLabel="Cancel"
        onConfirm={handleDeleteInvoice}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}

function TaxBreakdownPanel({ invoice, fmt }: { invoice: InvoiceDetail; fmt: (n: number) => string }) {
  const env = invoice.tax_environment ?? 'residential';
  const projType = invoice.tax_project_type ?? 'general_installation_repair';
  const { partsTaxable, laborTaxable, explanation } = getTaxApplicability(env, projType);
  const taxRate = invoice.tax_rate <= 1 ? invoice.tax_rate : invoice.tax_rate / 100;
  const taxRatePct = (taxRate * 100).toFixed(2);
  const isExempt = invoice.contacts?.is_tax_exempt;

  const jurisdiction = invoice.tax_jurisdictions;
  const jurisdictionLabel = jurisdiction
    ? [jurisdiction.jurisdiction_name, jurisdiction.city, jurisdiction.county, jurisdiction.state].filter(Boolean).join(', ')
    : null;

  const materialItems = invoice.invoice_line_items.filter(i => (i.item_type ?? 'material') !== 'labor' && i.is_taxable !== false);
  const laborItems = invoice.invoice_line_items.filter(i => i.item_type === 'labor' && i.is_taxable !== false);
  const nonTaxableItems = invoice.invoice_line_items.filter(i => i.is_taxable === false);
  const materialTotal = materialItems.reduce((s, i) => s + i.amount, 0);
  const laborTotal = laborItems.reduce((s, i) => s + i.amount, 0);
  const taxableMaterials = partsTaxable ? materialTotal : 0;
  const taxableLabor = laborTaxable ? laborTotal : 0;
  const taxableBase = taxableMaterials + taxableLabor;

  return (
    <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-blue-100 bg-blue-50">
        <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
        <span className="text-xs font-bold text-blue-800 uppercase tracking-wider">Sales Tax Breakdown</span>
      </div>

      <div className="p-4 space-y-4">

        {/* Tax Rules Context */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Environment</p>
            <p className="font-medium text-gray-800">{getEnvironmentDisplayName(env)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Project Type</p>
            <p className="font-medium text-gray-800">{getProjectTypeDisplayName(projType)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Tax Rate</p>
            <p className="font-medium text-gray-800">
              {taxRate > 0 ? `${taxRatePct}%` : 'No tax'}
              {jurisdictionLabel && (
                <span className="text-gray-500 font-normal ml-1">— {jurisdictionLabel}</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Customer Status</p>
            <p className="font-medium text-gray-800">
              {isExempt ? (
                <span className="inline-flex items-center gap-1 text-green-700">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Tax Exempt
                </span>
              ) : 'Taxable'}
            </p>
          </div>
        </div>

        {/* Tax Rules Explanation */}
        <div className="bg-white border border-blue-100 rounded-lg px-3 py-2.5">
          <p className="text-xs text-gray-600 leading-relaxed">
            <span className="font-semibold text-gray-700">Rule: </span>{explanation}
          </p>
          {invoice.tax_override && invoice.tax_override_reason && (
            <p className="text-xs text-amber-700 mt-1.5 leading-relaxed">
              <span className="font-semibold">Override: </span>{invoice.tax_override_reason}
            </p>
          )}
        </div>

        {/* Per-type breakdown */}
        {!isExempt && (
          <div className="space-y-1.5 text-sm">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Taxable Amounts</p>

            <div className="flex justify-between items-center py-1.5 border-b border-blue-100">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${partsTaxable ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className="text-gray-700">Materials / Parts</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${partsTaxable ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {partsTaxable ? 'Taxable' : 'Not taxable'}
                </span>
                <span className="text-gray-800 font-medium w-20 text-right">${fmt(materialTotal)}</span>
              </div>
            </div>

            <div className="flex justify-between items-center py-1.5 border-b border-blue-100">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${laborTaxable ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className="text-gray-700">Labor</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${laborTaxable ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {laborTaxable ? 'Taxable' : 'Not taxable'}
                </span>
                <span className="text-gray-800 font-medium w-20 text-right">${fmt(laborTotal)}</span>
              </div>
            </div>

            {nonTaxableItems.length > 0 && (
              <div className="flex justify-between items-center py-1.5 border-b border-blue-100">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-gray-300" />
                  <span className="text-gray-700">Overridden (non-taxable)</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                    Not taxable
                  </span>
                  <span className="text-gray-800 font-medium w-20 text-right">
                    ${fmt(nonTaxableItems.reduce((s, i) => s + i.amount, 0))}
                  </span>
                </div>
              </div>
            )}

            {taxRate > 0 && (
              <div className="flex justify-between items-center pt-2">
                <span className="text-gray-600 text-xs">
                  Taxable base × {taxRatePct}%
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-gray-400 text-xs">${fmt(taxableBase)} × {taxRatePct}%</span>
                  <span className="font-bold text-gray-900 w-20 text-right">${fmt(invoice.tax_amount)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {isExempt && (
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>This customer has a tax exemption certificate on file. No sales tax is applied.</span>
          </div>
        )}
      </div>
    </div>
  );
}

function buildBillingProgressHTML(summary: any, currentInvoiceId: string, currentInvoiceNumber: string, settings: CompanySettings | null): string {
  const fmt = (n: number) => (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct = (n: number) => Math.min(100, Math.max(0, n || 0)).toFixed(1);

  const proposalTotal: number = summary.proposal_total || 0;
  const changeOrdersTotal: number = summary.change_orders_total || 0;
  const contractTotal: number = summary.contract_total || 0;
  const billedTotal: number = summary.billed_total || 0;
  const remainingBalance: number = summary.remaining_balance || 0;
  const billingProgressPct: number = summary.billing_progress_percent || 0;

  const invoices: any[] = summary.invoices || [];
  const changeOrders: any[] = summary.change_orders || [];

  const totalPaid = invoices.reduce((sum: number, inv: any) => sum + (inv.amount_paid || 0), 0);
  const totalUnpaid = billedTotal - totalPaid;

  const paidPct = contractTotal > 0 ? Math.min(100, (totalPaid / contractTotal) * 100) : 0;
  const unpaidPct = contractTotal > 0 ? Math.min(100 - paidPct, (totalUnpaid / contractTotal) * 100) : 0;
  const remainingPct = Math.max(0, 100 - paidPct - unpaidPct);

  const statusColors: Record<string, string> = {
    draft: '#6b7280', sent: '#3b82f6', partial: '#f59e0b', paid: '#10b981', overdue: '#ef4444', void: '#9ca3af',
  };

  const billingStatusColors: Record<string, string> = {
    unbilled: '#6b7280', partially_billed: '#f59e0b', fully_billed: '#10b981',
  };

  const invoicesHTML = invoices.map((inv: any) => {
    const isCurrent = inv.id === currentInvoiceId;
    const statusColor = statusColors[inv.status] || '#6b7280';
    const statusLabel = (inv.status || '').charAt(0).toUpperCase() + (inv.status || '').slice(1);
    const sourceLabel = inv.source_type === 'deposit' ? 'Deposit' : inv.source_type === 'progress' ? 'Progress' : inv.source_type === 'change_order' ? 'Change Order' : 'Standard';
    return `
      <tr style="${isCurrent ? 'background:#eff6ff;' : ''}border-bottom:1px solid #f3f4f6;">
        <td style="padding:8px 10px;font-size:12px;color:#111827;font-weight:${isCurrent ? '700' : '500'};">#${inv.invoice_number}${isCurrent ? ' <span style="font-size:10px;color:#3b82f6;font-weight:600;">(This Invoice)</span>' : ''}</td>
        <td style="padding:8px 10px;font-size:12px;color:#374151;">${inv.invoice_title || '—'}</td>
        <td style="padding:8px 10px;font-size:12px;color:#6b7280;">${inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString() : '—'}</td>
        <td style="padding:8px 10px;font-size:11px;color:#374151;">${sourceLabel}</td>
        <td style="padding:8px 10px;font-size:12px;text-align:right;color:#111827;font-weight:500;">$${fmt(inv.total)}</td>
        <td style="padding:8px 10px;font-size:12px;text-align:right;color:#10b981;">$${fmt(inv.amount_paid)}</td>
        <td style="padding:8px 10px;font-size:12px;text-align:right;color:${inv.amount_due > 0 ? '#ef4444' : '#6b7280'};">$${fmt(inv.amount_due)}</td>
        <td style="padding:8px 10px;text-align:center;">
          <span style="font-size:10px;font-weight:700;color:${statusColor};background:${statusColor}20;padding:2px 7px;border-radius:20px;white-space:nowrap;">${statusLabel}</span>
        </td>
      </tr>
    `;
  }).join('');

  const approvedCOs = changeOrders.filter((co: any) => co.approval_status === 'approved');
  const changeOrdersHTML = approvedCOs.length > 0 ? approvedCOs.map((co: any) => {
    const billingColor = billingStatusColors[co.billing_status] || '#6b7280';
    const billingLabel = co.billing_status === 'unbilled' ? 'Unbilled' : co.billing_status === 'partially_billed' ? 'Partial' : 'Fully Billed';
    return `
      <tr style="border-bottom:1px solid #f3f4f6;">
        <td style="padding:8px 10px;font-size:12px;color:#111827;font-weight:500;">#${co.change_order_number}</td>
        <td style="padding:8px 10px;font-size:12px;color:#374151;">${co.description || '—'}</td>
        <td style="padding:8px 10px;font-size:12px;text-align:right;color:#111827;font-weight:500;">$${fmt(co.total_impact)}</td>
        <td style="padding:8px 10px;font-size:12px;text-align:right;color:#374151;">$${fmt(co.amount_billed)}</td>
        <td style="padding:8px 10px;text-align:center;">
          <span style="font-size:10px;font-weight:700;color:${billingColor};background:${billingColor}20;padding:2px 7px;border-radius:20px;white-space:nowrap;">${billingLabel}</span>
        </td>
      </tr>
    `;
  }).join('') : `<tr><td colspan="5" style="padding:16px;text-align:center;font-size:12px;color:#9ca3af;">No approved change orders</td></tr>`;

  return `
  <div style="page-break-before:always;max-width:720px;margin:0 auto;padding:32px 0 0;">

    <!-- Page header -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #3b82f6;">
      <div>
        <h1 style="font-size:22px;font-weight:800;color:#111827;letter-spacing:-0.3px;margin:0 0 3px;">Billing Progress Summary</h1>
        <p style="margin:0;font-size:12px;color:#6b7280;">Invoice #${currentInvoiceNumber} &mdash; ${settings?.company_name || ''}</p>
      </div>
      <div style="text-align:right;">
        ${settings?.company_logo_url ? `<img src="${settings.company_logo_url}" alt="Logo" style="height:36px;object-fit:contain;" />` : ''}
      </div>
    </div>

    <!-- 4-cell summary grid -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px;">
      <div style="padding:14px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">
        <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Original Contract</p>
        <p style="margin:0;font-size:18px;font-weight:800;color:#111827;">$${fmt(proposalTotal)}</p>
      </div>
      <div style="padding:14px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;">
        <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Approved Change Orders</p>
        <p style="margin:0;font-size:18px;font-weight:800;color:${changeOrdersTotal >= 0 ? '#10b981' : '#ef4444'};">${changeOrdersTotal >= 0 ? '+' : ''}$${fmt(Math.abs(changeOrdersTotal))}</p>
      </div>
      <div style="padding:14px 16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;">
        <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:0.05em;">Total Contract Value</p>
        <p style="margin:0;font-size:18px;font-weight:800;color:#1d4ed8;">$${fmt(contractTotal)}</p>
      </div>
      <div style="padding:14px 16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">
        <p style="margin:0 0 4px;font-size:10px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:0.05em;">Billed to Date</p>
        <p style="margin:0;font-size:18px;font-weight:800;color:#166534;">$${fmt(billedTotal)}</p>
        <p style="margin:2px 0 0;font-size:11px;color:#6b7280;">${fmtPct(billingProgressPct)}% of contract</p>
      </div>
    </div>

    <!-- Progress bar -->
    <div style="margin-bottom:28px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
        <span style="font-size:11px;font-weight:600;color:#374151;">Payment Progress</span>
        <span style="font-size:11px;color:#6b7280;">Balance Remaining: <strong style="color:#374151;">$${fmt(remainingBalance)}</strong></span>
      </div>
      <div style="height:18px;background:#f3f4f6;border-radius:9px;overflow:hidden;display:flex;">
        ${paidPct > 0 ? `<div style="width:${paidPct.toFixed(1)}%;background:#10b981;display:flex;align-items:center;justify-content:center;">
          ${paidPct >= 8 ? `<span style="font-size:10px;font-weight:700;color:#fff;">${paidPct.toFixed(0)}%</span>` : ''}
        </div>` : ''}
        ${unpaidPct > 0 ? `<div style="width:${unpaidPct.toFixed(1)}%;background:#f59e0b;display:flex;align-items:center;justify-content:center;">
          ${unpaidPct >= 8 ? `<span style="font-size:10px;font-weight:700;color:#fff;">${unpaidPct.toFixed(0)}%</span>` : ''}
        </div>` : ''}
        ${remainingPct > 0 ? `<div style="flex:1;background:#e5e7eb;display:flex;align-items:center;justify-content:center;">
          ${remainingPct >= 8 ? `<span style="font-size:10px;font-weight:600;color:#9ca3af;">${remainingPct.toFixed(0)}%</span>` : ''}
        </div>` : ''}
      </div>
      <div style="display:flex;gap:16px;margin-top:6px;">
        <div style="display:flex;align-items:center;gap:5px;">
          <div style="width:10px;height:10px;background:#10b981;border-radius:2px;"></div>
          <span style="font-size:10px;color:#6b7280;">Paid ($${fmt(totalPaid)})</span>
        </div>
        <div style="display:flex;align-items:center;gap:5px;">
          <div style="width:10px;height:10px;background:#f59e0b;border-radius:2px;"></div>
          <span style="font-size:10px;color:#6b7280;">Invoiced &amp; Unpaid ($${fmt(totalUnpaid)})</span>
        </div>
        <div style="display:flex;align-items:center;gap:5px;">
          <div style="width:10px;height:10px;background:#e5e7eb;border-radius:2px;"></div>
          <span style="font-size:10px;color:#6b7280;">Remaining ($${fmt(remainingBalance)})</span>
        </div>
      </div>
    </div>

    <!-- Invoices table -->
    <div style="margin-bottom:28px;">
      <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.05em;">Contract Invoices</p>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="background:#f9fafb;border-bottom:2px solid #e5e7eb;">
            <th style="text-align:left;padding:8px 10px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Invoice #</th>
            <th style="text-align:left;padding:8px 10px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Title</th>
            <th style="text-align:left;padding:8px 10px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Date</th>
            <th style="text-align:left;padding:8px 10px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Type</th>
            <th style="text-align:right;padding:8px 10px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Amount</th>
            <th style="text-align:right;padding:8px 10px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Paid</th>
            <th style="text-align:right;padding:8px 10px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Balance</th>
            <th style="text-align:center;padding:8px 10px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${invoicesHTML || `<tr><td colspan="8" style="padding:16px;text-align:center;font-size:12px;color:#9ca3af;">No invoices</td></tr>`}
        </tbody>
        <tfoot>
          <tr style="background:#f9fafb;border-top:2px solid #e5e7eb;">
            <td colspan="4" style="padding:10px;font-size:12px;font-weight:700;color:#374151;">Totals</td>
            <td style="padding:10px;text-align:right;font-size:12px;font-weight:700;color:#111827;">$${fmt(billedTotal)}</td>
            <td style="padding:10px;text-align:right;font-size:12px;font-weight:700;color:#10b981;">$${fmt(totalPaid)}</td>
            <td style="padding:10px;text-align:right;font-size:12px;font-weight:700;color:#ef4444;">$${fmt(totalUnpaid)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Change orders table -->
    ${approvedCOs.length > 0 ? `
    <div style="margin-bottom:28px;">
      <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.05em;">Approved Change Orders</p>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="background:#f9fafb;border-bottom:2px solid #e5e7eb;">
            <th style="text-align:left;padding:8px 10px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">CO #</th>
            <th style="text-align:left;padding:8px 10px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Description</th>
            <th style="text-align:right;padding:8px 10px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Value</th>
            <th style="text-align:right;padding:8px 10px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Amount Billed</th>
            <th style="text-align:center;padding:8px 10px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${changeOrdersHTML}
        </tbody>
      </table>
    </div>
    ` : ''}

    <!-- Summary footer -->
    <div style="padding:16px 20px;background:#1e293b;border-radius:8px;color:#fff;">
      <p style="margin:0 0 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;">Financial Summary</p>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;">
        <div>
          <p style="margin:0 0 3px;font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;">Total Contract</p>
          <p style="margin:0;font-size:16px;font-weight:800;color:#f8fafc;">$${fmt(contractTotal)}</p>
        </div>
        <div>
          <p style="margin:0 0 3px;font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;">Total Billed</p>
          <p style="margin:0;font-size:16px;font-weight:800;color:#93c5fd;">$${fmt(billedTotal)}</p>
        </div>
        <div>
          <p style="margin:0 0 3px;font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;">Total Paid</p>
          <p style="margin:0;font-size:16px;font-weight:800;color:#86efac;">$${fmt(totalPaid)}</p>
        </div>
        <div>
          <p style="margin:0 0 3px;font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.04em;">Remaining Balance</p>
          <p style="margin:0;font-size:16px;font-weight:800;color:${remainingBalance > 0 ? '#fca5a5' : '#86efac'};">$${fmt(remainingBalance)}</p>
        </div>
      </div>
    </div>

  </div>`;
}

function buildPrintHTML(invoice: InvoiceDetail, settings: CompanySettings | null, office: OfficeAddress | null = null): string {
  const customerName = invoice.contacts?.full_name ||
    invoice.contacts?.contact_name ||
    `${invoice.contacts?.first_name || ''} ${invoice.contacts?.last_name || ''}`.trim() || 'Customer';

  const billName = invoice.billing_name || customerName;
  const billLine1 = invoice.billing_address_line1 || invoice.contacts?.street_address || '';
  const billLine2 = invoice.billing_address_line2 || '';
  const billCity = invoice.billing_city || invoice.contacts?.city || '';
  const billState = invoice.billing_state || invoice.contacts?.state || '';
  const billZip = invoice.billing_zip || invoice.contacts?.zip_code || '';
  const billCityLine = [billCity, billState, billZip].filter(Boolean).join(', ');

  const fmt = (n: number) => (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const statusColors: Record<string, string> = {
    draft: '#6b7280', sent: '#3b82f6', partial: '#f59e0b', paid: '#10b981', overdue: '#ef4444',
  };
  const statusColor = statusColors[invoice.status] || '#6b7280';
  const statusLabel = invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1);

  const returnAddressLines: string[] = [];
  if (settings?.company_name) returnAddressLines.push(`<strong>${settings.company_name}</strong>`);
  if (office?.address_line1) returnAddressLines.push(office.address_line1);
  if (office?.address_line2) returnAddressLines.push(office.address_line2);
  const cityStateZip = [office?.city, office?.state, office?.zip].filter(Boolean).join(', ');
  if (cityStateZip) returnAddressLines.push(cityStateZip);
  if (office?.phone) returnAddressLines.push(office.phone);
  if (settings?.company_email && !office?.phone) returnAddressLines.push(settings.company_email);

  const itemsHTML = invoice.invoice_line_items.map(item => `
    <tr>
      <td style="padding:10px 12px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">
        ${item.description}
        ${item.notes_visible_on_invoice && item.notes ? `<div style="font-size:11px;color:#6b7280;margin-top:3px;font-style:italic;">${item.notes}</div>` : ''}
      </td>
      <td style="padding:10px 12px;text-align:center;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">${item.quantity}</td>
      <td style="padding:10px 12px;text-align:right;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">$${fmt(item.unit_price)}</td>
      <td style="padding:10px 12px;text-align:right;font-size:13px;font-weight:600;color:#111827;border-bottom:1px solid #f3f4f6;">$${fmt(item.amount)}</td>
    </tr>
  `).join('');

  const paymentsHTML = invoice.payments.length > 0 ? `
    <div style="margin-top:24px;padding:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">
      <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:0.05em;">Payment History</p>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:1px solid #86efac;">
            <th style="text-align:left;padding:6px 8px;font-size:11px;color:#166534;font-weight:600;">Date</th>
            <th style="text-align:left;padding:6px 8px;font-size:11px;color:#166534;font-weight:600;">Method</th>
            <th style="text-align:right;padding:6px 8px;font-size:11px;color:#166534;font-weight:600;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${invoice.payments.map(p => `
            <tr>
              <td style="padding:6px 8px;font-size:12px;color:#166534;">${new Date(p.payment_date).toLocaleDateString()}</td>
              <td style="padding:6px 8px;font-size:12px;color:#166534;text-transform:capitalize;">${p.payment_method}</td>
              <td style="padding:6px 8px;text-align:right;font-size:12px;font-weight:600;color:#166534;">$${fmt(p.amount)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice #${invoice.invoice_number}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: letter portrait; margin: 0.5in 0.75in; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1f2937; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    @media print {
      body { margin: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div style="max-width:720px;margin:0 auto;padding:0;">

    <!-- Return address block (top-left, for double-window envelope) -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0;">
      <div style="font-size:11px;color:#374151;line-height:1.6;min-width:200px;">
        ${returnAddressLines.join('<br>')}
      </div>
      <div style="text-align:right;">
        ${settings?.company_logo_url ? `<img src="${settings.company_logo_url}" alt="Logo" style="height:40px;object-fit:contain;display:block;margin-left:auto;" />` : ''}
      </div>
    </div>

    <!-- Bill-to block: positioned ~2in from top of physical page for #10 window envelope -->
    <!-- Page top margin is 0.5in. We need ~2in from physical top, so ~1.5in from content top. -->
    <div style="margin-top:1.4in;margin-bottom:0.4in;">
      <div style="min-height:1in;padding-left:4px;">
        <p style="font-size:14px;font-weight:700;color:#111827;line-height:1.4;margin-bottom:2px;">${billName}</p>
        ${billLine1 ? `<p style="font-size:13px;color:#374151;line-height:1.5;">${billLine1}</p>` : ''}
        ${billLine2 ? `<p style="font-size:13px;color:#374151;line-height:1.5;">${billLine2}</p>` : ''}
        ${billCityLine ? `<p style="font-size:13px;color:#374151;line-height:1.5;">${billCityLine}</p>` : ''}
      </div>
    </div>

    <!-- Invoice header strip -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;border-bottom:3px solid ${statusColor};margin-bottom:24px;">
      <div>
        <h1 style="font-size:32px;font-weight:800;color:#111827;letter-spacing:-0.5px;margin-bottom:3px;">INVOICE</h1>
        <p style="font-size:14px;color:#6b7280;font-weight:500;">#${invoice.invoice_number}</p>
        ${invoice.invoice_title ? `<p style="font-size:12px;color:#9ca3af;margin-top:2px;">${invoice.invoice_title}</p>` : ''}
        <div style="margin-top:8px;display:inline-block;padding:3px 10px;background:${statusColor}20;border-radius:20px;border:1px solid ${statusColor}40;">
          <span style="font-size:10px;font-weight:700;color:${statusColor};text-transform:uppercase;letter-spacing:0.08em;">${statusLabel}</span>
        </div>
      </div>
      <div>
        <table style="border-collapse:collapse;text-align:right;">
          <tr>
            <td style="font-size:12px;color:#6b7280;padding:3px 0 3px 16px;">Invoice #</td>
            <td style="font-size:12px;font-weight:600;color:#111827;padding:3px 0;padding-left:12px;">${invoice.invoice_number}</td>
          </tr>
          <tr>
            <td style="font-size:12px;color:#6b7280;padding:3px 0 3px 16px;">Date Issued</td>
            <td style="font-size:12px;color:#374151;padding:3px 0;padding-left:12px;">${new Date(invoice.invoice_date).toLocaleDateString()}</td>
          </tr>
          ${invoice.due_date ? `
          <tr>
            <td style="font-size:12px;color:#6b7280;padding:3px 0 3px 16px;">Due Date</td>
            <td style="font-size:12px;color:#374151;padding:3px 0;padding-left:12px;">${new Date(invoice.due_date).toLocaleDateString()}</td>
          </tr>
          ` : ''}
          ${invoice.payment_terms ? `
          <tr>
            <td style="font-size:12px;color:#6b7280;padding:3px 0 3px 16px;">Terms</td>
            <td style="font-size:12px;color:#374151;padding:3px 0;padding-left:12px;">${formatPaymentTerms(invoice.payment_terms)}</td>
          </tr>
          ` : ''}
        </table>
      </div>
    </div>

    ${invoice.notes ? `
    <div style="margin-bottom:24px;padding:12px 16px;background:#fef3c7;border-left:4px solid #f59e0b;border-radius:4px;">
      <p style="font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;">Notes</p>
      <p style="font-size:12px;color:#78350f;line-height:1.6;white-space:pre-wrap;">${invoice.notes}</p>
    </div>
    ` : ''}

    <!-- Line Items -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:4px;">
      <thead>
        <tr style="background:#f9fafb;border-bottom:2px solid #e5e7eb;">
          <th style="text-align:left;padding:10px 12px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;">Description</th>
          <th style="text-align:center;padding:10px 12px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;width:60px;">Qty</th>
          <th style="text-align:right;padding:10px 12px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;width:110px;">Unit Price</th>
          <th style="text-align:right;padding:10px 12px;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;width:110px;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHTML || `<tr><td colspan="4" style="padding:20px;text-align:center;color:#9ca3af;font-size:13px;">No line items</td></tr>`}
      </tbody>
    </table>

    <!-- Totals -->
    <div style="display:flex;justify-content:flex-end;margin-top:8px;margin-bottom:8px;">
      <div style="width:260px;">
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;color:#6b7280;">
          <span>Subtotal</span><span>$${fmt(invoice.subtotal)}</span>
        </div>
        ${invoice.tax_amount > 0 ? `
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;color:#6b7280;">
          <span>Tax${invoice.tax_rate > 0 ? ` (${(invoice.tax_rate <= 1 ? invoice.tax_rate * 100 : invoice.tax_rate).toFixed(2)}%)` : ''}</span><span>$${fmt(invoice.tax_amount)}</span>
        </div>
        ` : ''}
        <div style="display:flex;justify-content:space-between;padding:10px 0;margin-top:4px;border-top:2px solid #3b82f6;font-size:17px;font-weight:800;color:#111827;">
          <span>Total</span><span style="color:#3b82f6;">$${fmt(invoice.total)}</span>
        </div>
        ${invoice.amount_paid > 0 ? `
        <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;color:#10b981;">
          <span>Amount Paid</span><span>-$${fmt(invoice.amount_paid)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:10px 0;border-top:2px solid #ef4444;font-size:17px;font-weight:800;color:#ef4444;">
          <span>Balance Due</span><span>$${fmt(invoice.amount_due)}</span>
        </div>
        ` : ''}
      </div>
    </div>

    ${paymentsHTML}

    ${settings?.default_invoice_terms_and_conditions ? `
    <div style="margin-top:32px;padding:16px;border:1px solid #e5e7eb;border-radius:6px;background:#f9fafb;">
      <p style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Terms &amp; Conditions</p>
      <p style="font-size:11px;color:#6b7280;line-height:1.6;white-space:pre-wrap;">${settings.default_invoice_terms_and_conditions}</p>
    </div>
    ` : ''}

    <!-- Footer -->
    <div style="margin-top:40px;padding-top:16px;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="font-size:12px;color:#9ca3af;">Thank you for your business!</p>
      ${settings?.company_name ? `<p style="font-size:11px;color:#d1d5db;margin-top:4px;">${settings.company_name}</p>` : ''}
    </div>
  </div>

  <script>
    window.onload = function() {};
  </script>
</body>
</html>`;
}
