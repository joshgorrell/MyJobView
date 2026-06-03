import { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, AlertCircle, DollarSign, Calendar, Package, Info } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmModal from '../ui/ConfirmModal';

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  is_taxable: boolean;
  source_type: 'manual' | 'proposal_line_item' | 'change_order_line_item';
  source_id?: string;
  unitPriceInput: string;
}

interface ChangeOrder {
  id: string;
  change_order_number: string;
  description: string;
  total_impact: number;
  amount_billed: number;
  billing_status: string;
}

interface CreateProgressInvoiceModalProps {
  proposalId: string;
  salesOrderId: string;
  contactId: string;
  onClose: () => void;
  onSuccess: (invoiceId: string) => void;
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function parseCurrency(str: string): number {
  return parseFloat(str.replace(/[^0-9.-]/g, '')) || 0;
}

export default function CreateProgressInvoiceModal({
  proposalId,
  salesOrderId,
  contactId,
  onClose,
  onSuccess
}: CreateProgressInvoiceModalProps) {
  const { profile } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  const [invoiceTitle, setInvoiceTitle] = useState('');
  const [invoiceType, setInvoiceType] = useState<'progress' | 'final' | 'manual'>('progress');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('net_30');
  const [notes, setNotes] = useState('');

  const [lineItems, setLineItems] = useState<LineItem[]>([
    {
      id: crypto.randomUUID(),
      description: '',
      quantity: 1,
      unit_price: 0,
      amount: 0,
      is_taxable: true,
      source_type: 'manual',
      unitPriceInput: ''
    }
  ]);

  const [availableChangeOrders, setAvailableChangeOrders] = useState<ChangeOrder[]>([]);
  const [selectedChangeOrders, setSelectedChangeOrders] = useState<Record<string, number>>({});
  const [coAmountInputs, setCoAmountInputs] = useState<Record<string, string>>({});

  const [taxRate, setTaxRate] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);

  const [taxInclusiveMode, setTaxInclusiveMode] = useState(false);
  const [targetTotalInput, setTargetTotalInput] = useState('');
  const targetTotalRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadInitialData(); }, []);
  useEffect(() => { calculateDueDate(); }, [invoiceDate, paymentTerms]);
  useEffect(() => {
    if (!taxInclusiveMode) calculateTotals();
  }, [lineItems, selectedChangeOrders, taxRate, taxInclusiveMode]);
  useEffect(() => { validateInvoiceAmount(); }, [lineItems, selectedChangeOrders, taxAmount]);

  async function loadInitialData() {
    setLoading(true);
    try {
      const { data: contact } = await supabase
        .from('contacts')
        .select('tax_rate')
        .eq('id', contactId)
        .single();
      // tax_rate is stored as a decimal (e.g. 0.0935); display and compute as percentage here
      setTaxRate((contact?.tax_rate ?? 0.0935) * 100);

      const { data: changeOrders } = await supabase
        .from('change_orders')
        .select('id, change_order_number, description, new_contract_total, original_contract_amount, amount_billed, billing_status')
        .eq('sales_order_id', salesOrderId)
        .eq('approval_status', 'approved')
        .neq('billing_status', 'fully_billed');

      const formattedCOs = (changeOrders || []).map(co => ({
        id: co.id,
        change_order_number: co.change_order_number,
        description: co.description,
        total_impact: co.new_contract_total - co.original_contract_amount,
        amount_billed: co.amount_billed || 0,
        billing_status: co.billing_status
      }));
      setAvailableChangeOrders(formattedCOs);
    } catch (error) {
      console.error('Error loading initial data:', error);
    } finally {
      setLoading(false);
    }
  }

  function calculateDueDate() {
    if (!invoiceDate) return;
    const date = new Date(invoiceDate);
    switch (paymentTerms) {
      case 'due_on_receipt': setDueDate(invoiceDate); break;
      case 'net_10': date.setDate(date.getDate() + 10); setDueDate(date.toISOString().split('T')[0]); break;
      case 'net_30': date.setDate(date.getDate() + 30); setDueDate(date.toISOString().split('T')[0]); break;
      case 'net_45': date.setDate(date.getDate() + 45); setDueDate(date.toISOString().split('T')[0]); break;
      case 'net_60': date.setDate(date.getDate() + 60); setDueDate(date.toISOString().split('T')[0]); break;
      default: date.setDate(date.getDate() + 30); setDueDate(date.toISOString().split('T')[0]);
    }
  }

  function calculateTotals() {
    const lineItemsSubtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    const changeOrdersSubtotal = Object.values(selectedChangeOrders).reduce((sum, a) => sum + a, 0);
    const taxableAmount = lineItems
      .filter(i => i.is_taxable)
      .reduce((sum, i) => sum + i.quantity * i.unit_price, 0) + changeOrdersSubtotal;
    setTaxAmount(taxableAmount * (taxRate / 100));
  }

  function applyTargetTotal() {
    const target = parseCurrency(targetTotalInput);
    if (!target || target <= 0) return;
    if (taxRate > 0) {
      const allTaxable = lineItems.every(i => i.is_taxable);
      if (allTaxable) {
        const subtotal = target / (1 + taxRate / 100);
        const tax = target - subtotal;
        setTaxAmount(parseFloat(tax.toFixed(2)));
        if (lineItems.length === 1) {
          const updatedPrice = parseFloat(subtotal.toFixed(2));
          setLineItems([{
            ...lineItems[0],
            unit_price: updatedPrice,
            amount: updatedPrice,
            quantity: 1,
            unitPriceInput: updatedPrice.toFixed(2)
          }]);
        } else {
          const ratio = subtotal / lineItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);
          setLineItems(lineItems.map(item => {
            const newPrice = parseFloat((item.unit_price * ratio).toFixed(4));
            return { ...item, unit_price: newPrice, amount: newPrice * item.quantity, unitPriceInput: newPrice.toFixed(2) };
          }));
        }
      } else {
        const nonTaxableTotal = lineItems.filter(i => !i.is_taxable).reduce((s, i) => s + i.quantity * i.unit_price, 0);
        const taxableSubtotal = (target - nonTaxableTotal) / (1 + taxRate / 100);
        const tax = taxableSubtotal * (taxRate / 100);
        setTaxAmount(parseFloat(tax.toFixed(2)));
      }
    } else {
      const subtotal = target;
      setTaxAmount(0);
      if (lineItems.length === 1) {
        setLineItems([{
          ...lineItems[0],
          unit_price: subtotal,
          amount: subtotal,
          quantity: 1,
          unitPriceInput: subtotal.toFixed(2)
        }]);
      }
    }
  }

  async function validateInvoiceAmount() {
    const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0) +
      Object.values(selectedChangeOrders).reduce((sum, a) => sum + a, 0);
    const total = subtotal + taxAmount;
    if (total === 0) return;
    try {
      const { data } = await supabase.rpc('validate_invoice_amount', {
        p_sales_order_id: salesOrderId,
        p_new_invoice_amount: total
      });
      setValidationResult(data);
    } catch (e) {
      console.error('Validation error:', e);
    }
  }

  function addLineItem() {
    setLineItems([...lineItems, {
      id: crypto.randomUUID(),
      description: '',
      quantity: 1,
      unit_price: 0,
      amount: 0,
      is_taxable: true,
      source_type: 'manual',
      unitPriceInput: ''
    }]);
  }

  function updateLineItem(id: string, field: keyof LineItem, value: any) {
    setLineItems(lineItems.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: value };
      if (field === 'quantity' || field === 'unit_price') {
        updated.amount = updated.quantity * updated.unit_price;
      }
      return updated;
    }));
  }

  function removeLineItem(id: string) {
    if (lineItems.length === 1) return;
    setLineItems(lineItems.filter(i => i.id !== id));
  }

  function toggleChangeOrder(coId: string, amount: number) {
    setSelectedChangeOrders(prev => {
      const updated = { ...prev };
      if (updated[coId] !== undefined) {
        delete updated[coId];
        setCoAmountInputs(p => { const n = { ...p }; delete n[coId]; return n; });
      } else {
        updated[coId] = amount;
        setCoAmountInputs(p => ({ ...p, [coId]: amount.toFixed(2) }));
      }
      return updated;
    });
  }

  async function handleSubmit() {
    if (!invoiceTitle.trim()) { alert('Please enter an invoice title'); return; }
    const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0) +
      Object.values(selectedChangeOrders).reduce((sum, a) => sum + a, 0);
    const total = subtotal + taxAmount;
    if (subtotal === 0) { alert('Please add at least one line item'); return; }

    if (validationResult && !validationResult.valid) {
      setConfirmModal({
        title: 'Exceeds Remaining Balance',
        message: `This invoice (${fmt(total)}) would exceed the remaining balance by ${fmt(validationResult.would_exceed_by)}. Continue?`,
        onConfirm: async () => {
          setConfirmModal(null);
          await doSubmit();
        }
      });
      return;
    }

    await doSubmit();
  }

  async function doSubmit() {
    setSubmitting(true);
    try {
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          company_id: profile?.company_id,
          sales_order_id: salesOrderId,
          proposal_id: proposalId,
          contact_id: contactId,
          invoice_title: invoiceTitle,
          source_type: invoiceType,
          invoice_date: invoiceDate,
          due_date: dueDate,
          subtotal: parseFloat(subtotal.toFixed(2)),
          tax_amount: parseFloat(taxAmount.toFixed(2)),
          total: parseFloat(total.toFixed(2)),
          amount_paid: 0,
          amount_due: parseFloat(total.toFixed(2)),
          status: 'sent',
          payment_terms: paymentTerms,
          notes,
          billed_from_proposal: lineItems.some(i => i.source_type === 'proposal_line_item'),
          includes_change_orders: Object.keys(selectedChangeOrders).length > 0,
          created_by: profile?.id,
          created_by_name: profile?.full_name
        })
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      const lineItemsToInsert = lineItems
        .filter(item => item.description.trim() && item.quantity * item.unit_price > 0)
        .map((item, index) => ({
          invoice_id: invoice.id,
          description: item.description,
          quantity: item.quantity,
          unit_price: parseFloat(item.unit_price.toFixed(2)),
          amount: parseFloat((item.quantity * item.unit_price).toFixed(2)),
          sort_order: index
        }));

      if (lineItemsToInsert.length > 0) {
        const { error: liErr } = await supabase.from('invoice_line_items').insert(lineItemsToInsert);
        if (liErr) throw liErr;
      }

      if (Object.keys(selectedChangeOrders).length > 0) {
        const coLinks = Object.entries(selectedChangeOrders).map(([coId, amount]) => ({
          company_id: profile?.company_id,
          invoice_id: invoice.id,
          change_order_id: coId,
          amount_billed: parseFloat(amount.toFixed(2)),
          fully_billed: false
        }));
        const { error: coErr } = await supabase.from('invoice_change_order_links').insert(coLinks);
        if (coErr) throw coErr;
      }

      onSuccess(invoice.id);
      onClose();
    } catch (error) {
      console.error('Error creating invoice:', error);
      alert('Failed to create invoice. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0) +
    Object.values(selectedChangeOrders).reduce((sum, a) => sum + a, 0);
  const total = subtotal + taxAmount;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Create Progress Invoice</h2>
            <p className="text-sm text-gray-500 mt-0.5">Step {step} of 3</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Loading...</p>
          </div>
        ) : (
          <div className="p-6">

            {/* Step 1: Invoice Details */}
            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                    Invoice Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={invoiceTitle}
                    onChange={e => setInvoiceTitle(e.target.value)}
                    placeholder="e.g., July Progress Billing, Phase 2 Completion"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                  />
                  <p className="text-xs text-gray-400 mt-1">This title will appear on the invoice for the customer.</p>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Invoice Type</label>
                    <select
                      value={invoiceType}
                      onChange={e => setInvoiceType(e.target.value as any)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                      <option value="progress">Progress</option>
                      <option value="final">Final</option>
                      <option value="manual">Custom</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      Invoice Date
                    </label>
                    <input
                      type="date"
                      value={invoiceDate}
                      onChange={e => setInvoiceDate(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      Due Date
                    </label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={e => setDueDate(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Payment Terms</label>
                  <select
                    value={paymentTerms}
                    onChange={e => setPaymentTerms(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    <option value="due_on_receipt">Due on Receipt</option>
                    <option value="net_10">Net 10</option>
                    <option value="net_30">Net 30</option>
                    <option value="net_45">Net 45</option>
                    <option value="net_60">Net 60</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Notes (Optional)</label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Any additional notes or instructions for this invoice"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm resize-none"
                  />
                </div>
              </div>
            )}

            {/* Step 2: Line Items */}
            {step === 2 && (
              <div className="space-y-6">

                {/* Tax-Inclusive Quick Entry */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-blue-900 mb-1">Bill a specific total amount</p>
                      <p className="text-xs text-blue-700 mb-3">
                        Enter the total dollar amount you want the customer to pay (tax included). The subtotal and tax will be calculated automatically at {taxRate}%.
                      </p>
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-semibold text-sm">$</span>
                          <input
                            ref={targetTotalRef}
                            type="text"
                            value={targetTotalInput}
                            onChange={e => setTargetTotalInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') applyTargetTotal(); }}
                            placeholder="2,500.00"
                            className="pl-7 pr-3 py-2 border border-blue-300 rounded-lg text-sm w-40 focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                          />
                        </div>
                        <button
                          onClick={applyTargetTotal}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors"
                        >
                          Apply
                        </button>
                        {targetTotalInput && (() => {
                          const target = parseCurrency(targetTotalInput);
                          if (target > 0 && taxRate > 0) {
                            const sub = target / (1 + taxRate / 100);
                            const tax = target - sub;
                            return (
                              <span className="text-xs text-blue-700">
                                → Subtotal: {fmt(sub)} + Tax: {fmt(tax)}
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Manual Line Items */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-900">Line Items</h3>
                    <button
                      onClick={addLineItem}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1.5 text-sm font-medium"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Line Item
                    </button>
                  </div>

                  <div className="space-y-3">
                    {lineItems.map((item) => (
                      <div key={item.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                        <div className="flex items-start gap-3">
                          <div className="flex-1 grid grid-cols-12 gap-3">
                            <div className="col-span-5">
                              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                              <input
                                type="text"
                                value={item.description}
                                onChange={e => updateLineItem(item.id, 'description', e.target.value)}
                                placeholder="Item description"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-blue-500"
                              />
                            </div>

                            <div className="col-span-2">
                              <label className="block text-xs font-medium text-gray-600 mb-1">Quantity</label>
                              <input
                                type="number"
                                value={item.quantity}
                                onChange={e => updateLineItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                                min="0"
                                step="0.01"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-blue-500"
                              />
                            </div>

                            <div className="col-span-2">
                              <label className="block text-xs font-medium text-gray-600 mb-1">Unit Price</label>
                              <div className="relative">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                                <input
                                  type="text"
                                  value={item.unitPriceInput}
                                  onChange={e => {
                                    const raw = e.target.value.replace(/[^0-9.]/g, '');
                                    updateLineItem(item.id, 'unitPriceInput', raw);
                                    const num = parseFloat(raw) || 0;
                                    updateLineItem(item.id, 'unit_price', num);
                                  }}
                                  onBlur={e => {
                                    const num = parseFloat(e.target.value.replace(/[^0-9.]/g, '')) || 0;
                                    updateLineItem(item.id, 'unitPriceInput', num > 0 ? num.toFixed(2) : '');
                                    updateLineItem(item.id, 'unit_price', num);
                                  }}
                                  placeholder="0.00"
                                  className="w-full pl-6 pr-2 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-blue-500"
                                />
                              </div>
                            </div>

                            <div className="col-span-2">
                              <label className="block text-xs font-medium text-gray-600 mb-1">Amount</label>
                              <div className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-semibold text-gray-800">
                                {fmt(item.quantity * item.unit_price)}
                              </div>
                            </div>

                            <div className="col-span-1 flex items-end pb-0.5">
                              <label className="flex flex-col items-center gap-1 text-xs text-gray-600 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={item.is_taxable}
                                  onChange={e => updateLineItem(item.id, 'is_taxable', e.target.checked)}
                                  className="rounded"
                                />
                                Tax
                              </label>
                            </div>
                          </div>

                          {lineItems.length > 1 && (
                            <button
                              onClick={() => removeLineItem(item.id)}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors mt-5"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Change Orders */}
                {availableChangeOrders.length > 0 && (
                  <div className="border-t border-gray-200 pt-5">
                    <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <Package className="w-4 h-4" />
                      Include Change Orders
                    </h3>
                    <div className="space-y-2">
                      {availableChangeOrders.map(co => {
                        const remaining = co.total_impact - co.amount_billed;
                        const isSelected = selectedChangeOrders[co.id] !== undefined;
                        return (
                          <div key={co.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={e => toggleChangeOrder(co.id, e.target.checked ? remaining : 0)}
                                className="mt-1"
                              />
                              <div className="flex-1">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="font-semibold text-gray-900 text-sm">{co.change_order_number}</p>
                                    <p className="text-xs text-gray-500 mt-0.5">{co.description}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-xs text-gray-500">Available</p>
                                    <p className="font-bold text-gray-900 text-sm">{fmt(remaining)}</p>
                                  </div>
                                </div>
                                {isSelected && (
                                  <div className="mt-3 flex items-center gap-3">
                                    <label className="text-sm font-medium text-gray-700">Amount to Bill:</label>
                                    <div className="relative">
                                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                                      <input
                                        type="text"
                                        value={coAmountInputs[co.id] ?? ''}
                                        onChange={e => {
                                          const raw = e.target.value.replace(/[^0-9.]/g, '');
                                          setCoAmountInputs(p => ({ ...p, [co.id]: raw }));
                                          const num = parseFloat(raw) || 0;
                                          if (num <= remaining) {
                                            setSelectedChangeOrders(p => ({ ...p, [co.id]: num }));
                                          }
                                        }}
                                        onBlur={e => {
                                          const num = Math.min(parseCurrency(e.target.value), remaining);
                                          setCoAmountInputs(p => ({ ...p, [co.id]: num.toFixed(2) }));
                                          setSelectedChangeOrders(p => ({ ...p, [co.id]: num }));
                                        }}
                                        className="pl-6 pr-2 py-1.5 border border-gray-300 rounded-lg text-sm w-36 focus:ring-1 focus:ring-blue-500"
                                      />
                                    </div>
                                    <span className="text-xs text-gray-400">Max: {fmt(remaining)}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Live Totals Preview */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <div className="flex justify-end">
                    <div className="w-64 space-y-2">
                      <div className="flex justify-between text-sm text-gray-600">
                        <span>Subtotal</span>
                        <span>{fmt(subtotal)}</span>
                      </div>
                      {taxRate > 0 && (
                        <div className="flex justify-between text-sm text-gray-600">
                          <span>Tax ({taxRate}%)</span>
                          <span>{fmt(taxAmount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-base font-bold text-gray-900 pt-2 border-t-2 border-gray-300">
                        <span>Total</span>
                        <span className="text-blue-600 text-lg">{fmt(total)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Review */}
            {step === 3 && (
              <div className="space-y-5">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <h3 className="font-semibold text-blue-900 mb-3">Invoice Summary</h3>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-blue-700">Title:</span>
                      <span className="font-semibold text-blue-900">{invoiceTitle}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-700">Type:</span>
                      <span className="font-semibold text-blue-900 capitalize">{invoiceType}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-700">Date:</span>
                      <span className="font-semibold text-blue-900">{new Date(invoiceDate).toLocaleDateString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-700">Due:</span>
                      <span className="font-semibold text-blue-900">{dueDate ? new Date(dueDate).toLocaleDateString() : '—'}</span>
                    </div>
                  </div>
                </div>

                {validationResult && !validationResult.valid && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-red-900">Warning: Exceeds remaining balance</p>
                      <p className="text-xs text-red-700 mt-0.5">
                        {fmt(total)} would exceed the remaining contract balance by {fmt(validationResult.would_exceed_by)}.
                      </p>
                    </div>
                  </div>
                )}

                {validationResult && (
                  <div className="bg-white border border-gray-200 rounded-xl p-4">
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2 text-sm">
                      <DollarSign className="w-4 h-4 text-gray-500" />
                      Contract Summary
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between text-gray-600">
                        <span>Original Contract</span>
                        <span className="font-medium">{fmt(validationResult.proposal_total)}</span>
                      </div>
                      <div className="flex justify-between text-gray-600">
                        <span>Approved Change Orders</span>
                        <span className="font-medium">{fmt(validationResult.change_orders_total)}</span>
                      </div>
                      <div className="flex justify-between font-semibold text-gray-900 border-t border-gray-200 pt-2">
                        <span>Total Contract Value</span>
                        <span>{fmt(validationResult.contract_total)}</span>
                      </div>
                      <div className="flex justify-between text-gray-600">
                        <span>Already Billed</span>
                        <span className="font-medium">{fmt(validationResult.billed_total)}</span>
                      </div>
                      <div className="flex justify-between text-blue-600">
                        <span>This Invoice</span>
                        <span className="font-semibold">{fmt(total)}</span>
                      </div>
                      <div className={`flex justify-between font-bold border-t border-gray-200 pt-2 ${validationResult.remaining_balance - total < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        <span>Remaining After</span>
                        <span>{fmt(validationResult.remaining_balance - total)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Invoice Totals */}
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <h3 className="font-semibold text-gray-900 mb-3 text-sm">Invoice Totals</h3>
                  <div className="space-y-2">
                    {lineItems.filter(i => i.description.trim() && i.quantity * i.unit_price > 0).map(item => (
                      <div key={item.id} className="flex justify-between text-sm text-gray-600">
                        <span>{item.description} (x{item.quantity})</span>
                        <span>{fmt(item.quantity * item.unit_price)}</span>
                      </div>
                    ))}
                    {Object.entries(selectedChangeOrders).map(([coId, amount]) => {
                      const co = availableChangeOrders.find(c => c.id === coId);
                      return (
                        <div key={coId} className="flex justify-between text-sm text-gray-600">
                          <span>{co?.change_order_number} (Change Order)</span>
                          <span>{fmt(amount)}</span>
                        </div>
                      );
                    })}
                    <div className="flex justify-between text-sm text-gray-600 border-t border-gray-100 pt-2">
                      <span>Subtotal</span>
                      <span className="font-medium">{fmt(subtotal)}</span>
                    </div>
                    {taxRate > 0 && (
                      <div className="flex justify-between text-sm text-gray-600">
                        <span>Tax ({taxRate}%)</span>
                        <span className="font-medium">{fmt(taxAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t-2 border-gray-300 pt-2">
                      <span className="font-bold text-gray-900 text-base">Total</span>
                      <span className="font-bold text-2xl text-blue-600">{fmt(total)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center justify-between pt-5 border-t border-gray-200 mt-5">
              {step > 1 ? (
                <button
                  onClick={() => setStep(step - 1)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
                >
                  Back
                </button>
              ) : (
                <button
                  onClick={onClose}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
                >
                  Cancel
                </button>
              )}

              {step < 3 ? (
                <button
                  onClick={() => setStep(step + 1)}
                  disabled={step === 1 && !invoiceTitle.trim()}
                  className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-semibold"
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={submitting || subtotal === 0}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-semibold"
                >
                  {submitting ? (
                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Creating...</>
                  ) : (
                    <><DollarSign className="w-4 h-4" />Create Invoice</>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!confirmModal}
        title={confirmModal?.title || ''}
        message={confirmModal?.message || ''}
        variant="warning"
        onConfirm={() => confirmModal?.onConfirm()}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}
