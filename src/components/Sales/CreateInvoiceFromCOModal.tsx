import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { X, Check, DollarSign, FileText, Save, AlertCircle, ShieldAlert, CheckCircle, XCircle } from 'lucide-react';
import type { SalesOrderFull, ChangeOrderSummary } from './SalesOrderDetail';
import { getTaxApplicability, getEnvironmentDisplayName, getProjectTypeDisplayName, type TaxEnvironment, type TaxProjectType } from '../../lib/taxCalculations';

interface COLineItem {
  id: string;
  product_name: string;
  product_description: string;
  item_type: string;
  new_quantity: number;
  new_unit_price: number;
  new_total: number;
  labor_hours: number;
  labor_rate: number;
  labor_total: number;
  is_taxable: boolean;
  change_amount: number;
}

interface CreateInvoiceFromCOModalProps {
  order: SalesOrderFull;
  changeOrders: ChangeOrderSummary[];
  onClose: () => void;
  onSuccess: (invoiceId: string) => void;
}

function normalizePaymentTerms(terms: string | undefined | null): string {
  if (!terms) return '';
  const map: Record<string, string> = {
    'net 10': 'net_10',
    'net 15': 'net_15',
    'net 30': 'net_30',
    'net 45': 'net_45',
    'net 60': 'net_60',
    'due on receipt': 'due_on_receipt',
    'cod': 'due_on_receipt',
    'cash on delivery': 'due_on_receipt',
  };
  return map[terms.toLowerCase().trim()] || terms;
}

export function CreateInvoiceFromCOModal({ order, changeOrders, onClose, onSuccess }: CreateInvoiceFromCOModalProps) {
  const { profile } = useAuth();
  const [selectedCOs, setSelectedCOs] = useState<Set<string>>(new Set());
  const [lineItems, setLineItems] = useState<Record<string, COLineItem[]>>({});
  const [loadingItems, setLoadingItems] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showTaxConfirmation, setShowTaxConfirmation] = useState(false);
  const [checkingFirstInvoice, setCheckingFirstInvoice] = useState(false);

  useEffect(() => {
    if (changeOrders.length === 1) {
      setSelectedCOs(new Set([changeOrders[0].id]));
      loadLineItems(changeOrders[0].id);
    }
  }, []);

  async function loadLineItems(coId: string) {
    if (lineItems[coId]) return;
    setLoadingItems(true);
    try {
      const { data, error } = await supabase
        .from('change_order_line_items')
        .select('*')
        .eq('change_order_id', coId)
        .order('sort_order');

      if (error) throw error;
      setLineItems(prev => ({ ...prev, [coId]: data || [] }));
    } catch (error) {
      console.error('Error loading line items:', error);
    } finally {
      setLoadingItems(false);
    }
  }

  function toggleCO(coId: string) {
    const next = new Set(selectedCOs);
    if (next.has(coId)) {
      next.delete(coId);
    } else {
      next.add(coId);
      loadLineItems(coId);
    }
    setSelectedCOs(next);
  }

  function getSelectedLineItems(): { coId: string; coNumber: string; items: COLineItem[] }[] {
    return changeOrders
      .filter(co => selectedCOs.has(co.id))
      .map(co => ({
        coId: co.id,
        coNumber: co.change_order_number,
        items: lineItems[co.id] || []
      }));
  }

  function calculateTotals() {
    const selected = getSelectedLineItems();
    let subtotal = 0;
    let taxableAmount = 0;

    selected.forEach(group => {
      group.items.forEach(item => {
        const materialTotal = item.new_total || 0;
        const laborTotal = item.labor_total || 0;
        const total = materialTotal + laborTotal;
        subtotal += total;
        if (item.is_taxable) taxableAmount += total;
      });
    });

    const taxRate = order.contact?.tax_rate || 0.0935;
    const tax = taxableAmount * taxRate;
    return { subtotal, tax, total: subtotal + tax, taxRate };
  }

  async function handleCreateClick() {
    if (selectedCOs.size === 0) return;

    setCheckingFirstInvoice(true);
    try {
      const { count } = await supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('sales_order_id', order.id);

      if ((count ?? 0) === 0) {
        setShowTaxConfirmation(true);
      } else {
        await handleSubmit();
      }
    } catch {
      await handleSubmit();
    } finally {
      setCheckingFirstInvoice(false);
    }
  }

  async function handleSubmit() {
    if (selectedCOs.size === 0) return;
    setSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const totals = calculateTotals();
      const selected = getSelectedLineItems();
      const coNumbers = selected.map(s => s.coNumber).join(', ');

      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          company_id: profile?.company_id,
          contact_id: order.contact?.id || order.contact_id,
          project_id: order.project?.id || order.project_id,
          sales_order_id: order.id,
          invoice_date: invoiceDate,
          due_date: dueDate || null,
          status: 'draft',
          subtotal: totals.subtotal,
          tax_amount: totals.tax,
          total: totals.total,
          amount_paid: 0,
          amount_due: totals.total,
          notes: invoiceNotes || null,
          invoice_title: `Change Order Invoice - ${coNumbers}`,
          source_type: 'change_order',
          includes_change_orders: true,
          tax_environment: order.proposal?.tax_environment || 'residential',
          tax_project_type: order.proposal?.tax_project_type || 'general_installation_repair',
          payment_terms: normalizePaymentTerms(order.contact?.default_payment_terms) || normalizePaymentTerms(order.payment_terms) || null,
          created_by: user.id,
          created_by_name: profile?.full_name || null
        })
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      let sortOrder = 0;
      const allLineItems: any[] = [];
      const allLinks: any[] = [];

      for (const group of selected) {
        const items = group.items;
        let coTotalBilled = 0;

        for (const item of items) {
          const materialTotal = item.new_total || 0;
          const laborTotal = item.labor_total || 0;
          const amount = materialTotal + laborTotal;
          coTotalBilled += amount;

          allLineItems.push({
            invoice_id: invoiceData.id,
            description: item.product_name + (item.labor_hours > 0 ? ` (incl. ${item.labor_hours}h labor)` : ''),
            quantity: item.new_quantity || 1,
            unit_price: item.new_unit_price || amount,
            amount: amount,
            is_taxable: item.is_taxable,
            source_type: 'change_order',
            notes: item.product_description || null,
            sort_order: sortOrder++,
          });
        }

        const co = changeOrders.find(c => c.id === group.coId);
        const fullCOAmount = Math.abs(co?.change_amount || coTotalBilled);

        allLinks.push({
          company_id: profile?.company_id,
          invoice_id: invoiceData.id,
          change_order_id: group.coId,
          amount_billed: coTotalBilled,
          fully_billed: coTotalBilled >= fullCOAmount,
        });
      }

      if (allLineItems.length > 0) {
        const { error: itemsError } = await supabase
          .from('invoice_line_items')
          .insert(allLineItems);
        if (itemsError) throw itemsError;
      }

      if (allLinks.length > 0) {
        const { error: linksError } = await supabase
          .from('invoice_change_order_links')
          .insert(allLinks);
        if (linksError) throw linksError;

        for (const link of allLinks) {
          const co = changeOrders.find(c => c.id === link.change_order_id);
          const coTotal = co ? Math.abs(co.change_amount) + (co.tax_amount || 0) : link.amount_billed;
          const previousBilled = co?.amount_billed || 0;
          const newAmountBilled = previousBilled + link.amount_billed;
          let newStatus: string;
          if (newAmountBilled <= 0) {
            newStatus = 'unbilled';
          } else if (coTotal > 0 && newAmountBilled >= coTotal - 0.01) {
            newStatus = 'fully_billed';
          } else {
            newStatus = 'partially_billed';
          }
          await supabase
            .from('change_orders')
            .update({ amount_billed: newAmountBilled, billing_status: newStatus })
            .eq('id', link.change_order_id);
        }
      }

      onSuccess(invoiceData.id);
    } catch (error) {
      console.error('Error creating invoice:', error);
      alert('Failed to create invoice. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const totals = calculateTotals();
  const selected = getSelectedLineItems();

  const taxEnv = (order.proposal?.tax_environment || 'residential') as TaxEnvironment;
  const taxProjType = (order.proposal?.tax_project_type || 'general_installation_repair') as TaxProjectType;
  const taxInfo = getTaxApplicability(taxEnv, taxProjType);
  const customerTaxRate = order.contact?.tax_rate;
  const customerTaxRateDisplay = customerTaxRate !== undefined && customerTaxRate !== null
    ? `${(customerTaxRate * 100).toFixed(4)}%`
    : '9.35% (default)';

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-gray-800 rounded-xl shadow-2xl max-w-3xl w-full my-8 border border-gray-700">
        <div className="flex items-center justify-between p-5 border-b border-gray-700">
          <div>
            <h2 className="text-xl font-bold text-white">Invoice from Change Orders</h2>
            <p className="text-sm text-gray-400 mt-0.5">SO #{order.order_number} - {order.contact?.full_name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-700 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
          <div>
            <h3 className="text-sm font-medium text-gray-300 mb-3">Select Change Orders to Invoice</h3>
            <div className="space-y-2">
              {changeOrders.map(co => {
                const isSelected = selectedCOs.has(co.id);
                return (
                  <button
                    key={co.id}
                    onClick={() => toggleCO(co.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      isSelected
                        ? 'bg-blue-600/10 border-blue-500/50'
                        : 'bg-gray-900/50 border-gray-700/50 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                          isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-600'
                        }`}>
                          {isSelected && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-mono text-gray-400">{co.change_order_number}</span>
                            <span className="text-sm text-white font-medium">{co.title}</span>
                          </div>
                          {co.billing_status === 'partially_billed' && (
                            <div className="text-xs text-amber-400 mt-0.5">
                              Partially billed (${(co.amount_billed || 0).toFixed(2)} of ${Math.abs(co.change_amount).toFixed(2)})
                            </div>
                          )}
                        </div>
                      </div>
                      <span className={`text-sm font-semibold ${co.change_amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {co.change_amount >= 0 ? '+' : ''}${co.change_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {selected.length > 0 && selected.some(g => g.items.length > 0) && (
            <div>
              <h3 className="text-sm font-medium text-gray-300 mb-3">Line Items Preview</h3>
              <div className="bg-gray-900/50 rounded-lg border border-gray-700/50 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700/50">
                      <th className="text-left p-3 text-gray-500 font-medium">Item</th>
                      <th className="text-right p-3 text-gray-500 font-medium w-16">Qty</th>
                      <th className="text-right p-3 text-gray-500 font-medium w-24">Price</th>
                      <th className="text-right p-3 text-gray-500 font-medium w-24">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.map(group => (
                      group.items.map((item, idx) => (
                        <tr key={`${group.coId}-${idx}`} className="border-b border-gray-700/30">
                          <td className="p-3">
                            <div className="text-white">{item.product_name}</div>
                            <div className="text-xs text-gray-500">{group.coNumber}</div>
                          </td>
                          <td className="p-3 text-right text-gray-300">{item.new_quantity}</td>
                          <td className="p-3 text-right text-gray-300">${(item.new_unit_price || 0).toFixed(2)}</td>
                          <td className="p-3 text-right text-white font-medium">
                            ${((item.new_total || 0) + (item.labor_total || 0)).toFixed(2)}
                          </td>
                        </tr>
                      ))
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Invoice Date</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={e => setInvoiceDate(e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Notes</label>
            <textarea
              value={invoiceNotes}
              onChange={e => setInvoiceNotes(e.target.value)}
              rows={2}
              placeholder="Optional invoice notes..."
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>

          {selectedCOs.size > 0 && (
            <div className="bg-gray-900/50 rounded-lg border border-gray-700/50 p-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Subtotal</span>
                  <span className="text-white">${totals.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Tax ({(totals.taxRate * 100).toFixed(2)}%)</span>
                  <span className="text-white">${totals.tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-gray-700">
                  <span className="text-white font-semibold">Total</span>
                  <span className="text-xl font-bold text-green-400">${totals.total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-5 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-400 hover:text-white transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleCreateClick}
            disabled={submitting || checkingFirstInvoice || selectedCOs.size === 0}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            <Save className="w-4 h-4" />
            {checkingFirstInvoice ? 'Checking...' : submitting ? 'Creating...' : 'Create Invoice'}
          </button>
        </div>
      </div>

      {/* Tax settings confirmation modal for first invoice */}
      {showTaxConfirmation && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-60 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-gray-200">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Confirm Tax Settings</h3>
                  <p className="text-sm text-gray-500">This is the first invoice for this sales order</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-700">
                Once this invoice is created, the tax settings below will be <span className="font-semibold text-gray-900">permanently locked</span> for all future invoices on this sales order. Please verify they are correct before proceeding.
              </p>

              <div className="bg-gray-50 border border-gray-200 rounded-lg divide-y divide-gray-200">
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-medium text-gray-600">Environment</span>
                  <span className="text-sm font-semibold text-gray-900">{getEnvironmentDisplayName(taxEnv)}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-medium text-gray-600">Project Type</span>
                  <span className="text-sm font-semibold text-gray-900">{getProjectTypeDisplayName(taxProjType)}</span>
                </div>
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm font-medium text-gray-600">Customer Tax Rate</span>
                  <span className="text-sm font-semibold text-gray-900">{customerTaxRateDisplay}</span>
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tax applicability under these settings</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    {taxInfo.partsTaxable
                      ? <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                      : <XCircle className="w-4 h-4 text-gray-400 shrink-0" />
                    }
                    <span className="text-sm text-gray-700">Parts/Materials: <span className="font-medium">{taxInfo.partsTaxable ? 'Taxable' : 'Not Taxable'}</span></span>
                  </div>
                  <div className="flex items-center gap-2">
                    {taxInfo.laborTaxable
                      ? <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                      : <XCircle className="w-4 h-4 text-gray-400 shrink-0" />
                    }
                    <span className="text-sm text-gray-700">Labor: <span className="font-medium">{taxInfo.laborTaxable ? 'Taxable' : 'Not Taxable'}</span></span>
                  </div>
                  <p className="text-xs text-gray-500 italic mt-2">{taxInfo.explanation}</p>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                <p className="text-xs text-amber-800">
                  <span className="font-semibold">Need to change these?</span> Close this modal, go back to the proposal's Tax settings tab before creating an invoice.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between p-5 border-t border-gray-200">
              <button
                onClick={() => setShowTaxConfirmation(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Go Back and Edit
              </button>
              <button
                onClick={() => {
                  setShowTaxConfirmation(false);
                  handleSubmit();
                }}
                disabled={submitting}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                {submitting ? 'Creating...' : 'Confirm and Create Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
