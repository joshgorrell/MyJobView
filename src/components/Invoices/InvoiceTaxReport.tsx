import { useState, useEffect } from 'react';
import { X, Printer, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  getTaxApplicability,
  getEnvironmentDisplayName,
  getProjectTypeDisplayName,
  type TaxEnvironment,
  type TaxProjectType,
} from '../../lib/taxCalculations';

interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  item_type?: 'labor' | 'material' | null;
  is_taxable?: boolean;
  tax_amount?: number;
  sort_order?: number;
}

interface InvoiceRecord {
  id: string;
  invoice_number?: string;
  invoice_title?: string;
  invoice_date: string;
  status: string;
  invoice_type?: string;
  subtotal: number;
  tax_amount: number;
  total: number;
  tax_environment?: string;
  tax_project_type?: string;
  line_items?: InvoiceLineItem[];
}

interface InvoiceTaxReportProps {
  /** Single invoice ID — shows one-invoice breakdown */
  invoiceId?: string;
  /** Sales order ID — shows all invoices aggregated */
  salesOrderId?: string;
  taxRate: number;
  taxEnvironment: TaxEnvironment;
  taxProjectType: TaxProjectType;
  onClose: () => void;
}

function fmt(n: number) {
  return Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtSigned(n: number) {
  return (n < 0 ? '-$' : '$') + fmt(n);
}

export function InvoiceTaxReport({
  invoiceId,
  salesOrderId,
  taxRate,
  taxEnvironment,
  taxProjectType,
  onClose,
}: InvoiceTaxReportProps) {
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const taxInfo = getTaxApplicability(taxEnvironment, taxProjectType);
  const isSOLevel = !invoiceId && !!salesOrderId;

  useEffect(() => {
    load();
  }, [invoiceId, salesOrderId]);

  async function load() {
    setLoading(true);
    try {
      let query = supabase
        .from('invoices')
        .select('id, invoice_number, invoice_title, invoice_date, status, invoice_type, subtotal, tax_amount, total, tax_environment, tax_project_type')
        .neq('status', 'void')
        .order('invoice_date', { ascending: true });

      if (invoiceId) {
        query = query.eq('id', invoiceId);
      } else if (salesOrderId) {
        query = query.eq('sales_order_id', salesOrderId);
      } else {
        setLoading(false);
        return;
      }

      const { data: invData, error } = await query;
      if (error) throw error;

      const ids = (invData || []).map(i => i.id);
      let lineItemsMap: Record<string, InvoiceLineItem[]> = {};

      if (ids.length > 0) {
        const { data: liData } = await supabase
          .from('invoice_line_items')
          .select('id, invoice_id, description, quantity, unit_price, amount, item_type, is_taxable, tax_amount, sort_order')
          .in('invoice_id', ids)
          .order('sort_order', { ascending: true });

        (liData || []).forEach((li: any) => {
          if (!lineItemsMap[li.invoice_id]) lineItemsMap[li.invoice_id] = [];
          lineItemsMap[li.invoice_id].push(li);
        });
      }

      const records: InvoiceRecord[] = (invData || []).map(inv => ({
        ...inv,
        line_items: lineItemsMap[inv.id] || [],
      }));

      setInvoices(records);
      if (!isSOLevel && records.length === 1) {
        setExpandedIds(new Set([records[0].id]));
      }
    } catch (err) {
      console.error('Error loading invoice tax report:', err);
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Compute per-invoice tax breakdown from line items (or fall back to stored totals)
  function computeBreakdown(inv: InvoiceRecord) {
    const items = inv.line_items || [];
    const hasTypedItems = items.some(i => i.item_type === 'labor' || i.item_type === 'material');

    if (hasTypedItems) {
      let laborSubtotal = 0;
      let materialSubtotal = 0;
      let laborTax = 0;
      let materialTax = 0;

      for (const item of items) {
        const amt = item.amount ?? (item.quantity * item.unit_price);
        if (item.item_type === 'labor') {
          laborSubtotal += amt;
          laborTax += item.tax_amount ?? (item.is_taxable ? Math.abs(amt) * taxRate * (amt < 0 ? -1 : 1) : 0);
        } else {
          materialSubtotal += amt;
          materialTax += item.tax_amount ?? (item.is_taxable ? Math.abs(amt) * taxRate * (amt < 0 ? -1 : 1) : 0);
        }
      }
      return { laborSubtotal, materialSubtotal, laborTax, materialTax, hasDetail: true };
    }

    // Legacy: no item_type — show stored totals only
    return { laborSubtotal: null, materialSubtotal: null, laborTax: null, materialTax: null, hasDetail: false };
  }

  // SO-level aggregates
  const totals = invoices.reduce(
    (acc, inv) => {
      acc.subtotal += inv.subtotal ?? 0;
      acc.tax += inv.tax_amount ?? 0;
      acc.total += inv.total ?? 0;
      const bd = computeBreakdown(inv);
      if (bd.hasDetail) {
        acc.laborSubtotal += bd.laborSubtotal!;
        acc.materialSubtotal += bd.materialSubtotal!;
        acc.laborTax += bd.laborTax!;
        acc.materialTax += bd.materialTax!;
        acc.hasAnyDetail = true;
      }
      return acc;
    },
    { subtotal: 0, tax: 0, total: 0, laborSubtotal: 0, materialSubtotal: 0, laborTax: 0, materialTax: 0, hasAnyDetail: false }
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 sm:p-4 print:static print:bg-white">
      <div className="bg-gray-900 sm:rounded-xl shadow-2xl max-w-2xl w-full sm:my-8 border border-gray-700 flex flex-col max-h-[92dvh] sm:max-h-[88vh] print:bg-white print:border-0 print:max-h-none print:shadow-none">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 shrink-0 print:border-gray-300">
          <div>
            <h2 className="text-lg font-bold text-white print:text-gray-900">
              {isSOLevel ? 'Sales Order Tax Report' : 'Invoice Tax Breakdown'}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5 print:text-gray-500">
              {getEnvironmentDisplayName(taxEnvironment)} &middot; {getProjectTypeDisplayName(taxProjectType)} &middot; {(taxRate * 100).toFixed(4)}% tax rate
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs font-medium transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>
            <button onClick={onClose} className="p-2 hover:bg-gray-700 rounded-lg transition-colors">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4 print:overflow-visible">

          {loading ? (
            <div className="py-12 text-center">
              <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-400 text-sm">Loading...</p>
            </div>
          ) : invoices.length === 0 ? (
            <div className="py-12 text-center">
              <FileText className="w-10 h-10 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">No invoices found.</p>
            </div>
          ) : (
            <>
              {/* Tax rules summary */}
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 print:bg-gray-50 print:border-gray-200">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 print:text-gray-500">
                  Tax Rules Applied
                </p>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${taxInfo.partsTaxable ? 'bg-green-400' : 'bg-gray-500'}`} />
                    <span className="text-gray-300 print:text-gray-700">
                      Materials: <span className="font-medium text-white print:text-gray-900">{taxInfo.partsTaxable ? 'Taxable' : 'Not Taxable'}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${taxInfo.laborTaxable ? 'bg-green-400' : 'bg-gray-500'}`} />
                    <span className="text-gray-300 print:text-gray-700">
                      Labor: <span className="font-medium text-white print:text-gray-900">{taxInfo.laborTaxable ? 'Taxable' : 'Not Taxable'}</span>
                    </span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2 italic print:text-gray-400">{taxInfo.explanation}</p>
              </div>

              {/* Per-invoice rows */}
              {invoices.map(inv => {
                const bd = computeBreakdown(inv);
                const isExpanded = expandedIds.has(inv.id);
                const isCM = inv.invoice_type === 'credit_memo';

                return (
                  <div key={inv.id} className="border border-gray-700 rounded-lg overflow-hidden print:border-gray-300">
                    {/* Invoice header row */}
                    <button
                      type="button"
                      onClick={() => toggleExpand(inv.id)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-gray-800/70 hover:bg-gray-800 transition-colors text-left print:bg-gray-50 print:cursor-default"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className={`w-4 h-4 shrink-0 ${isCM ? 'text-red-400' : 'text-blue-400'}`} />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white print:text-gray-900 truncate">
                            {inv.invoice_number ? `#${inv.invoice_number} — ` : ''}{inv.invoice_title || 'Invoice'}
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(inv.invoice_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            {' '}&middot; {inv.status}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right">
                          <p className="text-xs text-gray-500">Tax</p>
                          <p className={`text-sm font-bold ${isCM ? 'text-red-400' : 'text-white'}`}>
                            {isCM ? '-' : ''}${fmt(inv.tax_amount ?? 0)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-500">Total</p>
                          <p className={`text-sm font-bold ${isCM ? 'text-red-400' : 'text-green-400'}`}>
                            {isCM ? '-' : ''}${fmt(inv.total ?? 0)}
                          </p>
                        </div>
                        <span className="print:hidden">
                          {isExpanded
                            ? <ChevronUp className="w-4 h-4 text-gray-500" />
                            : <ChevronDown className="w-4 h-4 text-gray-500" />
                          }
                        </span>
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {(isExpanded || !isSOLevel) && (
                      <div className="border-t border-gray-700 print:border-gray-200">
                        {bd.hasDetail ? (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-gray-900/60 print:bg-gray-100">
                                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 print:text-gray-500">Type</th>
                                <th className="text-right px-4 py-2 text-xs font-semibold text-gray-400 print:text-gray-500">Subtotal</th>
                                <th className="text-right px-4 py-2 text-xs font-semibold text-gray-400 print:text-gray-500">Taxable?</th>
                                <th className="text-right px-4 py-2 text-xs font-semibold text-gray-400 print:text-gray-500">Tax</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="border-t border-gray-800 print:border-gray-200">
                                <td className="px-4 py-2 text-gray-300 print:text-gray-700">Labor</td>
                                <td className="px-4 py-2 text-right text-gray-300 print:text-gray-700 tabular-nums">
                                  {fmtSigned(bd.laborSubtotal!)}
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${taxInfo.laborTaxable ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-500'}`}>
                                    {taxInfo.laborTaxable ? 'Yes' : 'No'}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-right text-gray-300 print:text-gray-700 tabular-nums">
                                  {fmtSigned(bd.laborTax!)}
                                </td>
                              </tr>
                              <tr className="border-t border-gray-800 print:border-gray-200">
                                <td className="px-4 py-2 text-gray-300 print:text-gray-700">Materials</td>
                                <td className="px-4 py-2 text-right text-gray-300 print:text-gray-700 tabular-nums">
                                  {fmtSigned(bd.materialSubtotal!)}
                                </td>
                                <td className="px-4 py-2 text-right">
                                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${taxInfo.partsTaxable ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-500'}`}>
                                    {taxInfo.partsTaxable ? 'Yes' : 'No'}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-right text-gray-300 print:text-gray-700 tabular-nums">
                                  {fmtSigned(bd.materialTax!)}
                                </td>
                              </tr>
                              <tr className="border-t-2 border-gray-700 bg-gray-900/40 print:border-gray-300 print:bg-gray-50">
                                <td className="px-4 py-2.5 font-semibold text-white print:text-gray-900" colSpan={3}>Total</td>
                                <td className="px-4 py-2.5 text-right font-bold text-white print:text-gray-900 tabular-nums">
                                  {fmtSigned((bd.laborTax! + bd.materialTax!))}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        ) : (
                          <div className="px-4 py-3 text-xs text-gray-500 italic">
                            This invoice was created before detailed labor/material tracking was enabled. Only the stored tax total is available.
                            <div className="mt-2 flex items-center justify-between text-sm not-italic">
                              <span className="text-gray-400">Stored tax amount</span>
                              <span className="font-semibold text-white print:text-gray-900">${fmt(inv.tax_amount ?? 0)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* SO-level aggregate totals */}
              {isSOLevel && invoices.length > 1 && (
                <div className="border-t-2 border-gray-600 pt-4 print:border-gray-400">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 print:text-gray-500">
                    Sales Order Totals
                  </p>
                  <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-4 space-y-2 text-sm print:bg-gray-50 print:border-gray-200">
                    {totals.hasAnyDetail && (
                      <>
                        <div className="flex justify-between text-gray-400 print:text-gray-600">
                          <span>Labor subtotal</span>
                          <span className="tabular-nums">{fmtSigned(totals.laborSubtotal)}</span>
                        </div>
                        <div className="flex justify-between text-gray-400 print:text-gray-600">
                          <span>Materials subtotal</span>
                          <span className="tabular-nums">{fmtSigned(totals.materialSubtotal)}</span>
                        </div>
                        <div className="flex justify-between text-gray-400 print:text-gray-600 border-t border-gray-700 pt-2 print:border-gray-200">
                          <span>Labor tax ({taxInfo.laborTaxable ? `${(taxRate * 100).toFixed(2)}%` : 'not taxed'})</span>
                          <span className="tabular-nums">{fmtSigned(totals.laborTax)}</span>
                        </div>
                        <div className="flex justify-between text-gray-400 print:text-gray-600">
                          <span>Materials tax ({taxInfo.partsTaxable ? `${(taxRate * 100).toFixed(2)}%` : 'not taxed'})</span>
                          <span className="tabular-nums">{fmtSigned(totals.materialTax)}</span>
                        </div>
                      </>
                    )}
                    <div className={`flex justify-between border-t border-gray-700 pt-2 print:border-gray-200 ${totals.hasAnyDetail ? 'mt-2' : ''}`}>
                      <span className="font-semibold text-white print:text-gray-900">Total invoiced subtotal</span>
                      <span className="tabular-nums font-semibold text-white print:text-gray-900">${fmt(totals.subtotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold text-white print:text-gray-900">Total sales tax collected</span>
                      <span className="tabular-nums font-bold text-green-400 print:text-green-700">${fmt(totals.tax)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold text-white print:text-gray-900">Total billed (incl. tax)</span>
                      <span className="tabular-nums font-bold text-green-400 print:text-green-700">${fmt(totals.total)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Single-invoice totals */}
              {!isSOLevel && invoices.length === 1 && (() => {
                const inv = invoices[0];
                return (
                  <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-4 space-y-2 text-sm print:bg-gray-50 print:border-gray-200">
                    <div className="flex justify-between text-gray-400 print:text-gray-600">
                      <span>Pre-tax subtotal</span>
                      <span className="tabular-nums">${fmt(inv.subtotal ?? 0)}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-white print:text-gray-900 border-t border-gray-700 pt-2 print:border-gray-200">
                      <span>Sales tax</span>
                      <span className="tabular-nums">${fmt(inv.tax_amount ?? 0)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-green-400 print:text-green-700">
                      <span className="text-white print:text-gray-900">Invoice Total</span>
                      <span className="tabular-nums">${fmt(inv.total ?? 0)}</span>
                    </div>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
