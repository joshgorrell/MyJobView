import { useState, useEffect } from 'react';
import { DollarSign, Plus, Search, CheckCircle, AlertCircle, Clock, Download, RefreshCw, Mail, Wrench, X, Send, Loader2, Eye, BarChart2, ExternalLink } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { CreateInvoiceModal } from './CreateInvoiceModal';
import { CreateInvoiceFromWorkOrderModal } from './CreateInvoiceFromWorkOrderModal';
import ConvertToRecurringModal from './ConvertToRecurringModal';
import { RecordPaymentModal } from './RecordPaymentModal';
import { InvoiceDetailModal } from './InvoiceDetailModal';
import { SelectCustomerModal } from './SelectCustomerModal';
import { ApplyBulkPaymentModal } from './ApplyBulkPaymentModal';
import { InvoiceStats } from './InvoiceStats';
import { ContactQuickViewModal } from '../Shared/ContactQuickViewModal';

interface Invoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  status: string;
  total: number;
  amount_paid: number;
  amount_due: number;
  customer_name: string;
  customer_email: string | null;
  contact_id: string | null;
  project_number: string | null;
}

interface InvoiceOpenStats {
  invoice_id: string;
  open_count: number;
  last_opened_at: string | null;
}

type ActiveTab = 'invoices' | 'stats';

interface InvoicesViewProps {
  onNavigateToContact?: (contactId: string) => void;
  contactIdFilter?: string;
  onClearContactFilter?: () => void;
}

export function InvoicesView({ onNavigateToContact, contactIdFilter, onClearContactFilter }: InvoicesViewProps = {}) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('invoices');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [openStats, setOpenStats] = useState<Record<string, InvoiceOpenStats>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateFromWorkOrderModal, setShowCreateFromWorkOrderModal] = useState(false);
  const [convertingInvoice, setConvertingInvoice] = useState<Invoice | null>(null);
  const [recordingPaymentInvoice, setRecordingPaymentInvoice] = useState<Invoice | null>(null);
  const [sendingInvoice, setSendingInvoice] = useState<string | null>(null);
  const [confirmSendInvoice, setConfirmSendInvoice] = useState<Invoice | null>(null);
  const [sendEmailOverride, setSendEmailOverride] = useState('');
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [viewingInvoiceId, setViewingInvoiceId] = useState<string | null>(null);
  const [showSelectCustomer, setShowSelectCustomer] = useState(false);
  const [bulkPaymentContact, setBulkPaymentContact] = useState<{ id: string; name: string } | null>(null);
  const [quickViewContactId, setQuickViewContactId] = useState<string | null>(null);

  useEffect(() => {
    loadInvoices();
    loadOpenStats();
  }, []);

  async function loadInvoices() {
    try {
      const { data, error } = await supabase
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
          contact_id,
          project_id,
          contacts:contact_id (
            id,
            first_name,
            last_name,
            contact_name,
            email,
            full_name
          ),
          projects:project_id (
            project_number
          )
        `)
        .order('invoice_date', { ascending: false });

      if (error) throw error;

      const formattedInvoices = (data || []).map((invoice: any) => ({
        ...invoice,
        customer_name: invoice.contacts?.full_name || invoice.contacts?.contact_name || `${invoice.contacts?.first_name || ''} ${invoice.contacts?.last_name || ''}`.trim() || 'Unknown',
        customer_email: invoice.contacts?.email || null,
        contact_id: invoice.contact_id || null,
        project_number: invoice.projects?.project_number || null,
      }));

      setInvoices(formattedInvoices);
    } catch (error) {
      console.error('Error loading invoices:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadOpenStats() {
    try {
      const { data, error } = await supabase
        .from('invoice_opens')
        .select('invoice_id, opened_at');

      if (error) throw error;

      const statsMap: Record<string, InvoiceOpenStats> = {};
      for (const row of data || []) {
        const existing = statsMap[row.invoice_id];
        if (!existing) {
          statsMap[row.invoice_id] = {
            invoice_id: row.invoice_id,
            open_count: 1,
            last_opened_at: row.opened_at,
          };
        } else {
          existing.open_count += 1;
          if (!existing.last_opened_at || row.opened_at > existing.last_opened_at) {
            existing.last_opened_at = row.opened_at;
          }
        }
      }
      setOpenStats(statsMap);
    } catch (error) {
      console.error('Error loading invoice open stats:', error);
    }
  }

  const filteredInvoices = invoices.filter(invoice => {
    const matchesSearch =
      invoice.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (invoice.project_number && invoice.project_number.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || invoice.status === statusFilter;
    const matchesContact = !contactIdFilter || invoice.contact_id === contactIdFilter;

    return matchesSearch && matchesStatus && matchesContact;
  });

  function handleSendInvoice(invoice: Invoice) {
    setConfirmSendInvoice(invoice);
    setSendEmailOverride(invoice.customer_email || '');
  }

  async function confirmAndSend() {
    if (!confirmSendInvoice) return;
    const invoiceId = confirmSendInvoice.id;
    const invoiceNumber = confirmSendInvoice.invoice_number;
    setConfirmSendInvoice(null);
    setSendingInvoice(invoiceId);
    try {
      const body: Record<string, string> = { invoiceId };
      const trimmed = sendEmailOverride.trim();
      if (trimmed && trimmed !== confirmSendInvoice.customer_email) {
        body.overrideEmail = trimmed;
      }
      const { error } = await supabase.functions.invoke('send-invoice-email', { body });
      if (error) throw error;
      setSendSuccess(invoiceNumber);
      setTimeout(() => setSendSuccess(null), 4000);
      loadInvoices();
    } catch (error) {
      console.error('Error sending invoice:', error);
    } finally {
      setSendingInvoice(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-300">Loading invoices...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white">Invoices</h2>
          <p className="text-sm sm:text-base text-gray-300">Manage customer invoices and payments</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSelectCustomer(true)}
            className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 active:bg-green-800 flex items-center justify-center gap-2 text-sm sm:text-base transition-colors touch-manipulation"
          >
            <DollarSign className="w-4 h-4" />
            <span className="hidden sm:inline">Apply Payment</span>
            <span className="sm:hidden">Payment</span>
          </button>
          <button
            onClick={() => setShowCreateFromWorkOrderModal(true)}
            className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 active:bg-teal-800 flex items-center justify-center gap-2 text-sm sm:text-base transition-colors touch-manipulation"
          >
            <Wrench className="w-4 h-4" />
            <span className="hidden sm:inline">From Work Order</span>
            <span className="sm:hidden">Work Order</span>
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex-1 sm:flex-none px-3 sm:px-4 py-2.5 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 active:bg-blue-800 flex items-center justify-center gap-2 text-sm sm:text-base transition-colors touch-manipulation"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Create Invoice</span>
            <span className="sm:hidden">New</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-600">
        <button
          onClick={() => setActiveTab('invoices')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'invoices'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          Invoices
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'stats'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          <BarChart2 className="w-4 h-4" />
          Stats
        </button>
      </div>

      {activeTab === 'stats' ? (
        <InvoiceStats />
      ) : (
        <>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search invoices..."
                  className="w-full pl-9 sm:pl-10 pr-4 py-2.5 sm:py-2 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="partial">Partially Paid</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>
            {contactIdFilter && (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                <span className="text-xs text-amber-700 font-medium flex-1">Filtered by contact</span>
                <button
                  onClick={onClearContactFilter}
                  className="text-amber-500 hover:text-amber-700 transition-colors"
                  title="Clear filter"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {filteredInvoices.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
              <DollarSign className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {searchTerm || statusFilter !== 'all' ? 'No Matching Invoices' : 'No Invoices Yet'}
              </h3>
              <p className="text-gray-600 mb-6">
                {searchTerm || statusFilter !== 'all'
                  ? 'Try adjusting your search or filters'
                  : 'Create your first invoice to get started'}
              </p>
              {!searchTerm && statusFilter === 'all' && (
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Create Invoice
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Mobile card view */}
              <div className="sm:hidden space-y-3">
                {filteredInvoices.map((invoice) => (
                  <div
                    key={invoice.id}
                    className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 cursor-pointer hover:border-blue-300 hover:shadow-md transition-all"
                    onClick={() => setViewingInvoiceId(invoice.id)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{invoice.invoice_number}</p>
                        {invoice.contact_id ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); setQuickViewContactId(invoice.contact_id!); }}
                            className="text-sm text-blue-600 hover:text-blue-800 hover:underline text-left font-medium"
                          >
                            {invoice.customer_name}
                          </button>
                        ) : (
                          <p className="text-sm text-gray-600">{invoice.customer_name}</p>
                        )}
                      </div>
                      <StatusBadge status={invoice.status} />
                    </div>
                    <div className="flex items-center justify-between text-sm mb-3">
                      <span className="text-gray-500">{new Date(invoice.invoice_date).toLocaleDateString()}</span>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">${(invoice.total ?? 0).toFixed(2)}</p>
                        {invoice.amount_due > 0 && (
                          <p className="text-xs text-orange-600">Due: ${(invoice.amount_due ?? 0).toFixed(2)}</p>
                        )}
                      </div>
                    </div>
                    {openStats[invoice.id] && (
                      <div className="mb-3">
                        <OpenedCell stats={openStats[invoice.id]} />
                      </div>
                    )}
                    <div className="flex items-center justify-end gap-1 pt-2 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                      {invoice.status !== 'paid' && (
                        <button onClick={(e) => { e.stopPropagation(); setRecordingPaymentInvoice(invoice); }} className="p-2 text-green-600 hover:bg-green-50 rounded-lg touch-manipulation" aria-label="Record Payment">
                          <DollarSign className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); handleSendInvoice(invoice); }} disabled={sendingInvoice === invoice.id} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50 touch-manipulation" aria-label="Send Invoice Email">
                        {sendingInvoice === invoice.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setConvertingInvoice(invoice); }} className="p-2 text-teal-600 hover:bg-teal-50 rounded-lg touch-manipulation" aria-label="Convert to Recurring">
                        <RefreshCw className="w-4 h-4" />
                      </button>
                      <button onClick={(e) => e.stopPropagation()} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg touch-manipulation" aria-label="Download PDF">
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table view */}
              <div className="hidden sm:block bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                        <th className="hidden lg:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                        <th className="hidden lg:table-cell px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Due</th>
                        <th className="hidden md:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Opened</th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {filteredInvoices.map((invoice) => (
                        <tr
                          key={invoice.id}
                          className="hover:bg-blue-50 cursor-pointer transition-colors"
                          onClick={() => setViewingInvoiceId(invoice.id)}
                        >
                          <td className="px-6 py-4">
                            <div>
                              <p className="text-sm font-medium text-gray-900">{invoice.invoice_number}</p>
                              {invoice.project_number && (
                                <p className="text-xs text-gray-500">{invoice.project_number}</p>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                            {invoice.contact_id ? (
                              <button
                                onClick={() => setQuickViewContactId(invoice.contact_id!)}
                                className="text-sm text-blue-600 hover:text-blue-800 hover:underline text-left font-medium"
                              >
                                {invoice.customer_name}
                              </button>
                            ) : (
                              <p className="text-sm text-gray-900">{invoice.customer_name}</p>
                            )}
                          </td>
                          <td className="hidden lg:table-cell px-6 py-4">
                            <div>
                              <p className="text-sm text-gray-900">{new Date(invoice.invoice_date).toLocaleDateString()}</p>
                              {invoice.due_date && (
                                <p className="text-xs text-gray-500">Due: {new Date(invoice.due_date).toLocaleDateString()}</p>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <StatusBadge status={invoice.status} />
                          </td>
                          <td className="px-6 py-4 text-right">
                            <p className="text-sm font-medium text-gray-900">${(invoice.total ?? 0).toFixed(2)}</p>
                          </td>
                          <td className="hidden lg:table-cell px-6 py-4 text-right">
                            <p className="text-sm font-medium text-orange-600">${(invoice.amount_due ?? 0).toFixed(2)}</p>
                          </td>
                          <td className="hidden md:table-cell px-6 py-4">
                            <OpenedCell stats={openStats[invoice.id] || null} />
                          </td>
                          <td className="px-4 sm:px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center gap-1 sm:gap-2">
                              {invoice.status !== 'paid' && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setRecordingPaymentInvoice(invoice); }}
                                  className="p-2 sm:p-2.5 text-green-600 hover:text-green-900 hover:bg-green-50 active:bg-green-100 rounded-lg transition-colors touch-manipulation"
                                  title="Record Payment"
                                >
                                  <DollarSign className="w-4 h-4 sm:w-5 sm:h-5" />
                                </button>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); handleSendInvoice(invoice); }}
                                disabled={sendingInvoice === invoice.id}
                                className="p-2 sm:p-2.5 text-blue-600 hover:text-blue-900 hover:bg-blue-50 active:bg-blue-100 rounded-lg transition-colors disabled:opacity-50 touch-manipulation"
                                title="Resend Invoice Email"
                              >
                                {sendingInvoice === invoice.id
                                  ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                                  : <Mail className="w-4 h-4 sm:w-5 sm:h-5" />
                                }
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setConvertingInvoice(invoice); }}
                                className="p-2 sm:p-2.5 text-teal-600 hover:text-teal-900 hover:bg-teal-50 active:bg-teal-100 rounded-lg transition-colors touch-manipulation"
                                title="Convert to Recurring"
                              >
                                <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5" />
                              </button>
                              <button
                                onClick={(e) => e.stopPropagation()}
                                className="p-2 sm:p-2.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 active:bg-gray-200 rounded-lg transition-colors touch-manipulation"
                                title="Download PDF"
                              >
                                <Download className="w-4 h-4 sm:w-5 sm:h-5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {showCreateModal && (
        <CreateInvoiceModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={(invoiceId: string) => {
            setShowCreateModal(false);
            loadInvoices();
            setViewingInvoiceId(invoiceId);
          }}
        />
      )}

      {showCreateFromWorkOrderModal && (
        <CreateInvoiceFromWorkOrderModal
          onClose={() => setShowCreateFromWorkOrderModal(false)}
          onSuccess={(invoiceId: string) => {
            setShowCreateFromWorkOrderModal(false);
            loadInvoices();
            setViewingInvoiceId(invoiceId);
          }}
        />
      )}

      {convertingInvoice && (
        <ConvertToRecurringModal
          invoice={convertingInvoice}
          onClose={() => setConvertingInvoice(null)}
          onConverted={() => {
            setConvertingInvoice(null);
            loadInvoices();
          }}
        />
      )}

      {recordingPaymentInvoice && (
        <RecordPaymentModal
          invoice={recordingPaymentInvoice}
          onClose={() => setRecordingPaymentInvoice(null)}
          onSuccess={() => {
            setRecordingPaymentInvoice(null);
            loadInvoices();
          }}
        />
      )}

      {/* Send Invoice Modal with editable email */}
      {confirmSendInvoice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <Mail className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Send Invoice</h3>
                  <p className="text-sm text-gray-500">{confirmSendInvoice.invoice_number}</p>
                </div>
              </div>
              <button
                onClick={() => setConfirmSendInvoice(null)}
                className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Invoice <span className="font-medium text-gray-900">{confirmSendInvoice.invoice_number}</span> for <span className="font-medium text-gray-900">{confirmSendInvoice.customer_name}</span>. Confirm or update the recipient email below.
            </p>

            <div className="mb-5">
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Recipient Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  value={sendEmailOverride}
                  onChange={(e) => setSendEmailOverride(e.target.value)}
                  placeholder="customer@example.com"
                  className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              {!confirmSendInvoice.customer_email && (
                <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  No email on file for this customer
                </p>
              )}
              {confirmSendInvoice.customer_email && sendEmailOverride.trim() !== confirmSendInvoice.customer_email && sendEmailOverride.trim() !== '' && (
                <p className="text-xs text-blue-600 mt-1.5">Sending to a different address than on file</p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setConfirmSendInvoice(null)}
                className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmAndSend}
                disabled={!sendEmailOverride.trim()}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Send className="w-4 h-4" />
                Send Email
              </button>
            </div>
          </div>
        </div>
      )}

      {sendSuccess && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-green-600 text-white px-5 py-3 rounded-xl shadow-lg animate-in slide-in-from-bottom-4">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm font-medium">Invoice {sendSuccess} sent successfully</span>
        </div>
      )}

      {viewingInvoiceId && (
        <InvoiceDetailModal
          invoiceId={viewingInvoiceId}
          onClose={() => setViewingInvoiceId(null)}
          onPaymentRecorded={() => { setViewingInvoiceId(null); loadInvoices(); }}
        />
      )}

      {showSelectCustomer && (
        <SelectCustomerModal
          onClose={() => setShowSelectCustomer(false)}
          onSelect={(contactId, contactName) => {
            setShowSelectCustomer(false);
            setBulkPaymentContact({ id: contactId, name: contactName });
          }}
        />
      )}

      {bulkPaymentContact && (
        <ApplyBulkPaymentModal
          contactId={bulkPaymentContact.id}
          contactName={bulkPaymentContact.name}
          onClose={() => setBulkPaymentContact(null)}
          onSuccess={() => { setBulkPaymentContact(null); loadInvoices(); }}
        />
      )}
      {quickViewContactId && (
        <ContactQuickViewModal
          contactId={quickViewContactId}
          onClose={() => setQuickViewContactId(null)}
          onNavigateToContact={onNavigateToContact}
        />
      )}
    </div>
  );
}

function OpenedCell({ stats }: { stats: InvoiceOpenStats | null }) {
  if (!stats || stats.open_count === 0) {
    return (
      <div className="flex items-center gap-1.5 text-gray-400">
        <Eye className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="text-xs">Not opened</span>
      </div>
    );
  }

  const lastOpened = stats.last_opened_at ? new Date(stats.last_opened_at) : null;
  const now = new Date();
  let relativeLabel = '';
  if (lastOpened) {
    const diffMs = now.getTime() - lastOpened.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffMins < 60) {
      relativeLabel = diffMins <= 1 ? 'Just now' : `${diffMins}m ago`;
    } else if (diffHours < 24) {
      relativeLabel = `${diffHours}h ago`;
    } else if (diffDays === 1) {
      relativeLabel = 'Yesterday';
    } else if (diffDays < 7) {
      relativeLabel = `${diffDays}d ago`;
    } else {
      relativeLabel = lastOpened.toLocaleDateString();
    }
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5">
        <Eye className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
        <span className="text-xs font-medium text-blue-700">
          {stats.open_count} {stats.open_count === 1 ? 'open' : 'opens'}
        </span>
      </div>
      {relativeLabel && (
        <span className="text-xs text-gray-400 pl-5">Last: {relativeLabel}</span>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs = {
    draft: { icon: <Clock className="w-3 h-3" />, label: 'Draft', className: 'bg-gray-100 text-gray-700' },
    sent: { icon: <Clock className="w-3 h-3" />, label: 'Sent', className: 'bg-blue-100 text-blue-700' },
    partial: { icon: <AlertCircle className="w-3 h-3" />, label: 'Partial', className: 'bg-yellow-100 text-yellow-700' },
    paid: { icon: <CheckCircle className="w-3 h-3" />, label: 'Paid', className: 'bg-green-100 text-green-700' },
    overdue: { icon: <AlertCircle className="w-3 h-3" />, label: 'Overdue', className: 'bg-red-100 text-red-700' },
  };

  const config = configs[status as keyof typeof configs] || configs.draft;

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${config.className}`}>
      {config.icon}
      {config.label}
    </span>
  );
}
