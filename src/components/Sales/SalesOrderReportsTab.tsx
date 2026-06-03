import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  FileText, Printer, Loader2, BarChart3, Clock, Wrench, ListChecks,
  DollarSign, Layers, CheckSquare, Square, Receipt, Package, TrendingUp,
  CreditCard, Users, ChevronDown, ChevronUp, PieChart
} from 'lucide-react';
import { getTaxApplicability, type TaxEnvironment, type TaxProjectType } from '../../lib/taxCalculations';
import type { SalesOrderFull, ChangeOrderSummary } from './SalesOrderDetail';
import ClassSummaryReport from '../Proposals/ClassSummaryReport';

interface SalesOrderReportsTabProps {
  order: SalesOrderFull;
  changeOrders: ChangeOrderSummary[];
}

type ReportSection = 'financial' | 'contracts' | 'change_orders' | 'payments' | 'commissions' | 'project_stats' | 'product_list' | 'project_reports';

export function SalesOrderReportsTab({ order, changeOrders }: SalesOrderReportsTabProps) {
  const [generatingReport, setGeneratingReport] = useState<string | null>(null);
  const [selectedCOs, setSelectedCOs] = useState<Set<string>>(new Set());
  const [expandedSection, setExpandedSection] = useState<ReportSection | null>('financial');
  const [showClassReport, setShowClassReport] = useState(false);
  const [classReportRooms, setClassReportRooms] = useState<any[]>([]);
  const [loadingClassReport, setLoadingClassReport] = useState(false);

  async function openClassReport() {
    if (!order.proposal_id) return;
    setLoadingClassReport(true);
    try {
      const { data: roomsData } = await supabase
        .from('proposal_rooms')
        .select('id, name, description, sort_order')
        .eq('proposal_id', order.proposal_id)
        .order('sort_order');

      const rooms = roomsData || [];
      const roomsWithItems = await Promise.all(rooms.map(async (room: any) => {
        const { data: items } = await supabase
          .from('proposal_line_items')
          .select('id, description, quantity, unit, unit_price, line_total, class_id, parent_item_id, is_hidden')
          .eq('room_id', room.id)
          .order('sort_order');
        return { ...room, line_items: items || [] };
      }));

      setClassReportRooms(roomsWithItems);
      setShowClassReport(true);
    } catch (err) {
      console.error('Error loading class report data:', err);
    } finally {
      setLoadingClassReport(false);
    }
  }

  const approvedCOs = changeOrders.filter(co => co.status === 'approved');
  const billableCOs = approvedCOs.filter(co => co.is_billable !== false);

  function toggleSection(s: ReportSection) {
    setExpandedSection(prev => prev === s ? null : s);
  }

  function toggleCO(id: string) {
    setSelectedCOs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAllCOs() {
    if (selectedCOs.size === changeOrders.length) setSelectedCOs(new Set());
    else setSelectedCOs(new Set(changeOrders.map(co => co.id)));
  }

  async function callEdgeFunction(slug: string, body: Record<string, unknown>, reportKey: string) {
    const w = window.open('', '_blank');
    if (w) { w.document.write(loadingPageHtml('Generating report...')); w.document.close(); }
    setGeneratingReport(reportKey);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${slug}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: 'Unknown error' })); throw new Error(err.error || 'Failed to generate report'); }
      const html = await res.text();
      if (w) { w.document.open(); w.document.write(html); w.document.close(); }
    } catch (err) {
      console.error('Report error:', err);
      if (w) { w.document.open(); w.document.write(errorPageHtml(String(err))); w.document.close(); }
      else { alert('Failed to generate report. Please try again.'); }
    } finally {
      setGeneratingReport(null);
    }
  }

  // ─── 1. FINANCIAL SUMMARY ─────────────────────────────────────────────────
  async function generateFinancialSummary() {
    const w = window.open('', '_blank');
    if (w) { w.document.write(loadingPageHtml('Building Financial Summary...')); w.document.close(); }
    setGeneratingReport('financial_summary');
    try {
      const [invoiceRes, coRes] = await Promise.all([
        supabase.from('invoices').select('id, invoice_number, invoice_title, invoice_date, total, amount_paid, amount_due, status').eq('sales_order_id', order.id).order('invoice_date', { ascending: true }),
        supabase.from('change_orders').select('id, change_order_number, title, type, status, is_billable, show_on_report, change_amount, tax_amount, new_contract_total, approval_date, notes, notes_public').eq('sales_order_id', order.id).order('created_at', { ascending: true }),
      ]);

      const invoices = invoiceRes.data || [];
      const cos = coRes.data || [];
      const approvedBillable = cos.filter(c => c.status === 'approved' && c.is_billable !== false);
      const approvedNonBillable = cos.filter(c => c.status === 'approved' && c.is_billable === false && c.show_on_report !== false);
      const visibleCOs = cos.filter(c => !(c.is_billable === false && c.show_on_report === false));

      const originalContract = order.contract_total || 0;
      const coChangeTotal = approvedBillable.reduce((s, c) => s + (c.change_amount || 0), 0);
      const coTaxTotal = approvedBillable.reduce((s, c) => s + (c.tax_amount || 0), 0);
      const currentContractTotal = originalContract + coChangeTotal + coTaxTotal;
      const totalInvoiced = invoices.reduce((s, i) => s + (i.total || 0), 0);
      const totalPaid = invoices.reduce((s, i) => s + (i.amount_paid || 0), 0);
      const totalDue = invoices.reduce((s, i) => s + (i.amount_due || 0), 0);
      const remainingToInvoice = Math.max(0, currentContractTotal - totalInvoiced);

      const fmt = (v: number) => '$' + v.toLocaleString(undefined, { minimumFractionDigits: 2 });

      let coRows = '';
      visibleCOs.forEach(co => {
        const isBillable = co.is_billable !== false;
        const badge = co.status === 'approved' ? (isBillable ? `<span class="badge badge-green">Approved</span>` : `<span class="badge badge-gray">Non-Billable</span>`) : co.status === 'pending_approval' ? `<span class="badge badge-amber">Pending</span>` : `<span class="badge badge-red">${co.status.replace(/_/g,' ')}</span>`;
        coRows += `<tr>
          <td>${co.change_order_number}</td>
          <td>${co.title}${co.notes && co.notes_public ? `<div style="font-size:10pt;color:#6b7280;margin-top:2px;font-style:italic;">${co.notes}</div>` : ''}</td>
          <td style="text-transform:capitalize">${co.type}</td>
          <td>${badge}</td>
          <td class="text-right" style="${co.change_amount >= 0 ? 'color:#16a34a' : 'color:#dc2626'}">${co.change_amount >= 0 ? '+' : ''}${fmt(co.change_amount || 0)}</td>
          <td class="text-right">${(co.tax_amount || 0) > 0 ? fmt(co.tax_amount) : '—'}</td>
          <td class="text-right">${isBillable && co.status === 'approved' ? fmt((co.change_amount || 0) + (co.tax_amount || 0)) : '—'}</td>
        </tr>`;
      });

      let invRows = '';
      invoices.forEach(inv => {
        const badge = inv.status === 'paid' ? `<span class="badge badge-green">Paid</span>` : inv.status === 'partial' ? `<span class="badge badge-amber">Partial</span>` : `<span class="badge badge-gray">Open</span>`;
        invRows += `<tr>
          <td>${inv.invoice_number || '—'}</td>
          <td>${inv.invoice_title || '—'}</td>
          <td>${inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString() : '—'}</td>
          <td>${badge}</td>
          <td class="text-right">${fmt(inv.total || 0)}</td>
          <td class="text-right" style="color:#16a34a">${fmt(inv.amount_paid || 0)}</td>
          <td class="text-right" style="${(inv.amount_due || 0) > 0 ? 'color:#d97706' : ''}">${fmt(inv.amount_due || 0)}</td>
        </tr>`;
      });

      const html = `
        <div class="header">
          <h1>Financial Summary</h1>
          <div class="subtitle">SO #${order.order_number} — ${order.contact?.full_name || ''}${order.contact?.company_name ? ' | ' + order.contact.company_name : ''}</div>
        </div>
        <div class="meta-grid">
          <div class="meta-item"><div class="meta-label">Sales Order</div><div class="meta-value">#${order.order_number}</div></div>
          <div class="meta-item"><div class="meta-label">Customer</div><div class="meta-value">${order.contact?.full_name || '—'}</div></div>
          <div class="meta-item"><div class="meta-label">Report Date</div><div class="meta-value">${new Date().toLocaleDateString()}</div></div>
        </div>

        <h2 class="section-title">Contract Totals</h2>
        <table>
          <tbody>
            <tr><td>Original Contract Amount</td><td class="text-right">${fmt(originalContract)}</td></tr>
            ${approvedBillable.length > 0 ? `<tr><td>Approved Change Orders (${approvedBillable.length} billable)</td><td class="text-right" style="${coChangeTotal >= 0 ? 'color:#16a34a' : 'color:#dc2626'}">${coChangeTotal >= 0 ? '+' : ''}${fmt(coChangeTotal)}</td></tr>` : ''}
            ${coTaxTotal > 0 ? `<tr><td>Change Order Tax</td><td class="text-right">+${fmt(coTaxTotal)}</td></tr>` : ''}
            ${approvedNonBillable.length > 0 ? `<tr><td style="color:#94a3b8">Non-Billable COs (${approvedNonBillable.length}) — internal only</td><td class="text-right" style="color:#94a3b8">—</td></tr>` : ''}
            <tr class="total-row"><td><strong>Current Contract Total</strong></td><td class="text-right"><strong>${fmt(currentContractTotal)}</strong></td></tr>
          </tbody>
        </table>

        ${visibleCOs.length > 0 ? `
        <h2 class="section-title">Change Orders</h2>
        <table>
          <thead><tr><th>CO #</th><th>Title</th><th>Type</th><th>Status</th><th class="text-right">Change</th><th class="text-right">Tax</th><th class="text-right">Net Impact</th></tr></thead>
          <tbody>${coRows || '<tr><td colspan="7" class="text-center" style="color:#999">No change orders</td></tr>'}</tbody>
        </table>` : ''}

        <h2 class="section-title">Billing & Payments</h2>
        <table>
          <tbody>
            <tr><td>Total Invoiced</td><td class="text-right">${fmt(totalInvoiced)}</td></tr>
            <tr><td>Total Payments Received</td><td class="text-right" style="color:#16a34a">${fmt(totalPaid)}</td></tr>
            <tr><td>Outstanding Balance Due</td><td class="text-right" style="${totalDue > 0 ? 'color:#d97706;font-weight:700' : ''}">${fmt(totalDue)}</td></tr>
            <tr><td>Remaining to Invoice</td><td class="text-right">${fmt(remainingToInvoice)}</td></tr>
          </tbody>
        </table>

        ${invoices.length > 0 ? `
        <h2 class="section-title">Invoice Detail</h2>
        <table>
          <thead><tr><th>Invoice #</th><th>Title</th><th>Date</th><th>Status</th><th class="text-right">Total</th><th class="text-right">Paid</th><th class="text-right">Due</th></tr></thead>
          <tbody>
            ${invRows}
            <tr class="total-row"><td colspan="4"><strong>Totals</strong></td><td class="text-right"><strong>${fmt(totalInvoiced)}</strong></td><td class="text-right" style="color:#16a34a"><strong>${fmt(totalPaid)}</strong></td><td class="text-right" style="${totalDue > 0 ? 'color:#d97706' : ''}"><strong>${fmt(totalDue)}</strong></td></tr>
          </tbody>
        </table>` : ''}

        <p style="font-size:8pt;color:#999;margin-top:40px;">Generated ${new Date().toLocaleString()}</p>
      `;

      openReport(`Financial Summary — SO #${order.order_number}`, html, w);
    } catch (err) {
      console.error('Error:', err);
      if (w) { w.document.open(); w.document.write(errorPageHtml(String(err))); w.document.close(); }
    } finally {
      setGeneratingReport(null);
    }
  }

  // ─── 4. PAYMENT HISTORY ───────────────────────────────────────────────────
  async function generatePaymentHistory() {
    const w = window.open('', '_blank');
    if (w) { w.document.write(loadingPageHtml('Building Payment History...')); w.document.close(); }
    setGeneratingReport('payment_history');
    try {
      const [invoiceRes, paymentRes] = await Promise.all([
        supabase.from('invoices').select('id, invoice_number, invoice_title, invoice_date, subtotal, tax_amount, total, amount_paid, amount_due, status').eq('sales_order_id', order.id).order('invoice_date', { ascending: true }),
        supabase.from('invoice_payments').select('id, invoice_id, amount, payment_date, payment_method, reference_number, notes').eq('sales_order_id', order.id).order('payment_date', { ascending: true }),
      ]);

      const invoices = invoiceRes.data || [];
      const payments = paymentRes.data || [];

      const originalContract = order.contract_total || 0;
      const coTotal = billableCOs.reduce((s, c) => s + (c.change_amount || 0) + (c.tax_amount || 0), 0);
      const currentContractTotal = originalContract + coTotal;
      const totalInvoiced = invoices.reduce((s, i) => s + (i.total || 0), 0);
      const totalPaid = invoices.reduce((s, i) => s + (i.amount_paid || 0), 0);
      const totalDue = invoices.reduce((s, i) => s + (i.amount_due || 0), 0);

      const fmt = (v: number) => '$' + v.toLocaleString(undefined, { minimumFractionDigits: 2 });

      let invRows = '';
      invoices.forEach(inv => {
        const pct = inv.total > 0 ? Math.round((inv.amount_paid / inv.total) * 100) : 0;
        const badge = inv.status === 'paid' ? `<span class="badge badge-green">Paid</span>` : inv.status === 'partial' ? `<span class="badge badge-amber">Partial</span>` : `<span class="badge badge-gray">Open</span>`;
        invRows += `<tr>
          <td>${inv.invoice_number || '—'}</td>
          <td>${inv.invoice_title || '—'}</td>
          <td>${inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString() : '—'}</td>
          <td>${badge}</td>
          <td class="text-right">${fmt(inv.total || 0)}</td>
          <td class="text-right" style="color:#16a34a">${fmt(inv.amount_paid || 0)}</td>
          <td class="text-right" style="${(inv.amount_due || 0) > 0 ? 'color:#d97706' : ''}">${fmt(inv.amount_due || 0)}</td>
          <td class="text-right">${pct}%</td>
        </tr>`;
      });

      let payRows = '';
      payments.forEach(p => {
        payRows += `<tr>
          <td>${p.payment_date ? new Date(p.payment_date).toLocaleDateString() : '—'}</td>
          <td class="text-right" style="color:#16a34a;font-weight:600">${fmt(p.amount || 0)}</td>
          <td style="text-transform:capitalize">${(p.payment_method || '—').replace(/_/g, ' ')}</td>
          <td>${p.reference_number || '—'}</td>
          <td>${p.notes || ''}</td>
        </tr>`;
      });

      const html = `
        <div class="header">
          <h1>Payment History</h1>
          <div class="subtitle">SO #${order.order_number} — ${order.contact?.full_name || ''}${order.contact?.company_name ? ' | ' + order.contact.company_name : ''}</div>
        </div>
        <div class="meta-grid">
          <div class="meta-item"><div class="meta-label">Customer</div><div class="meta-value">${order.contact?.full_name || '—'}</div></div>
          <div class="meta-item"><div class="meta-label">Report Date</div><div class="meta-value">${new Date().toLocaleDateString()}</div></div>
          <div class="meta-item"><div class="meta-label">Payment Terms</div><div class="meta-value">${order.payment_terms || '—'}</div></div>
        </div>

        <h2 class="section-title">Account Summary</h2>
        <table>
          <tbody>
            <tr><td>Current Contract Total</td><td class="text-right"><strong>${fmt(currentContractTotal)}</strong></td></tr>
            <tr><td>Total Invoiced</td><td class="text-right">${fmt(totalInvoiced)}</td></tr>
            <tr><td>Total Paid</td><td class="text-right" style="color:#16a34a;font-weight:700">${fmt(totalPaid)}</td></tr>
            <tr class="total-row"><td><strong>Outstanding Balance</strong></td><td class="text-right" style="${totalDue > 0 ? 'color:#d97706' : 'color:#16a34a'}"><strong>${fmt(totalDue)}</strong></td></tr>
          </tbody>
        </table>

        ${invoices.length > 0 ? `
        <h2 class="section-title">Invoices</h2>
        <table>
          <thead><tr><th>Invoice #</th><th>Title</th><th>Date</th><th>Status</th><th class="text-right">Total</th><th class="text-right">Paid</th><th class="text-right">Due</th><th class="text-right">Collected</th></tr></thead>
          <tbody>
            ${invRows}
            <tr class="total-row"><td colspan="4"><strong>Totals</strong></td><td class="text-right"><strong>${fmt(totalInvoiced)}</strong></td><td class="text-right" style="color:#16a34a"><strong>${fmt(totalPaid)}</strong></td><td class="text-right" style="${totalDue > 0 ? 'color:#d97706' : ''}"><strong>${fmt(totalDue)}</strong></td><td></td></tr>
          </tbody>
        </table>` : '<p style="color:#999;font-style:italic;padding:12px 0">No invoices issued yet.</p>'}

        ${payments.length > 0 ? `
        <h2 class="section-title">Payment Transactions</h2>
        <table>
          <thead><tr><th>Date</th><th class="text-right">Amount</th><th>Method</th><th>Reference</th><th>Notes</th></tr></thead>
          <tbody>
            ${payRows}
            <tr class="total-row"><td><strong>Total Received</strong></td><td class="text-right" style="color:#16a34a"><strong>${fmt(totalPaid)}</strong></td><td colspan="3"></td></tr>
          </tbody>
        </table>` : '<p style="color:#999;font-style:italic;padding:12px 0">No payments recorded yet.</p>'}

        <p style="font-size:8pt;color:#999;margin-top:40px;">Generated ${new Date().toLocaleString()}</p>
      `;

      openReport(`Payment History — SO #${order.order_number}`, html, w);
    } catch (err) {
      console.error('Error:', err);
      if (w) { w.document.open(); w.document.write(errorPageHtml(String(err))); w.document.close(); }
    } finally {
      setGeneratingReport(null);
    }
  }

  // ─── 7. PRODUCT LIST ──────────────────────────────────────────────────────
  async function generateProductList() {
    const w = window.open('', '_blank');
    if (w) { w.document.write(loadingPageHtml('Building Product List...')); w.document.close(); }
    setGeneratingReport('product_list');
    try {
      const [itemsRes, roomsRes, coItemsRes] = await Promise.all([
        order.proposal_id ? supabase.from('proposal_line_items').select('id, description, quantity, unit_price, line_total, item_type, room_id, sku').eq('proposal_id', order.proposal_id).order('created_at') : Promise.resolve({ data: [] }),
        order.proposal_id ? supabase.from('proposal_rooms').select('id, name').eq('proposal_id', order.proposal_id) : Promise.resolve({ data: [] }),
        supabase.from('change_order_line_items').select('id, change_order_id, product_name, new_quantity, new_unit_price, change_amount, action_type, item_type, install_location, sku').in('change_order_id', approvedCOs.filter(c => c.is_billable !== false).map(c => c.id)),
      ]);

      const items = itemsRes.data || [];
      const rooms = roomsRes.data || [];
      const coItems = coItemsRes.data || [];

      const roomMap = new Map((rooms).map((r: any) => [r.id, r.name]));
      const coMap = new Map(approvedCOs.map(c => [c.id, c.change_order_number]));

      const fmt = (v: number) => '$' + v.toLocaleString(undefined, { minimumFractionDigits: 2 });
      const fmtQty = (v: number) => Number.isInteger(v) ? String(v) : v.toFixed(2);

      let proposalRows = '';
      const proposalTotal = items.reduce((s: number, i: any) => s + (i.line_total || 0), 0);
      items.forEach((item: any) => {
        proposalRows += `<tr>
          <td>${roomMap.get(item.room_id) || '—'}</td>
          <td>${item.description || '—'}</td>
          <td>${item.sku || '—'}</td>
          <td class="text-center"><span class="badge ${item.item_type === 'labor' ? 'badge-amber' : 'badge-blue'}">${item.item_type === 'labor' ? 'Labor' : 'Material'}</span></td>
          <td class="text-center">${fmtQty(item.quantity || 0)}</td>
          <td class="text-right">${fmt(item.unit_price || 0)}</td>
          <td class="text-right">${fmt(item.line_total || 0)}</td>
        </tr>`;
      });

      let coRows = '';
      const addedItems = coItems.filter((i: any) => i.action_type === 'add');
      const removedItems = coItems.filter((i: any) => i.action_type === 'remove');
      const coNetTotal = coItems.reduce((s: number, i: any) => s + (i.change_amount || 0), 0);

      coItems.forEach((item: any) => {
        const actionBadge = item.action_type === 'add' ? `<span class="badge badge-green">Add</span>` : item.action_type === 'remove' ? `<span class="badge badge-red">Remove</span>` : `<span class="badge badge-blue">Modify</span>`;
        coRows += `<tr>
          <td>${coMap.get(item.change_order_id) || '—'}</td>
          <td>${item.product_name || '—'}</td>
          <td>${item.sku || '—'}</td>
          <td>${actionBadge}</td>
          <td class="text-center"><span class="badge ${item.item_type === 'labor' ? 'badge-amber' : 'badge-blue'}">${item.item_type === 'labor' ? 'Labor' : 'Material'}</span></td>
          <td class="text-center">${fmtQty(item.new_quantity || 0)}</td>
          <td class="text-right">${fmt(item.new_unit_price || 0)}</td>
          <td class="text-right" style="${(item.change_amount || 0) >= 0 ? 'color:#16a34a' : 'color:#dc2626'}">${(item.change_amount || 0) >= 0 ? '+' : ''}${fmt(item.change_amount || 0)}</td>
          <td>${item.install_location || '—'}</td>
        </tr>`;
      });

      const grandTotal = proposalTotal + coNetTotal;

      const html = `
        <div class="header">
          <h1>Product List</h1>
          <div class="subtitle">SO #${order.order_number} — ${order.contact?.full_name || ''}${order.contact?.company_name ? ' | ' + order.contact.company_name : ''}</div>
          <div class="subtitle">Includes original sales order + all approved billable change orders</div>
        </div>
        <div class="meta-grid">
          <div class="meta-item"><div class="meta-label">Proposal</div><div class="meta-value">#${order.proposal?.proposal_number || '—'}</div></div>
          <div class="meta-item"><div class="meta-label">Approved COs</div><div class="meta-value">${approvedCOs.length}</div></div>
          <div class="meta-item"><div class="meta-label">Report Date</div><div class="meta-value">${new Date().toLocaleDateString()}</div></div>
        </div>

        <h2 class="section-title">Original Sales Order Items (${items.length} items)</h2>
        ${items.length > 0 ? `
        <table>
          <thead><tr><th>Area</th><th>Description</th><th>SKU</th><th class="text-center">Type</th><th class="text-center">Qty</th><th class="text-right">Unit Price</th><th class="text-right">Total</th></tr></thead>
          <tbody>
            ${proposalRows}
            <tr class="total-row"><td colspan="6"><strong>Subtotal</strong></td><td class="text-right"><strong>${fmt(proposalTotal)}</strong></td></tr>
          </tbody>
        </table>` : '<p style="color:#999;font-style:italic;padding:12px 0">No original proposal items found.</p>'}

        ${coItems.length > 0 ? `
        <h2 class="section-title">Change Order Items (${approvedCOs.filter(c => c.is_billable !== false).length} approved billable COs)</h2>
        <table>
          <thead><tr><th>CO #</th><th>Product</th><th>SKU</th><th>Action</th><th class="text-center">Type</th><th class="text-center">Qty</th><th class="text-right">Unit Price</th><th class="text-right">Impact</th><th>Location</th></tr></thead>
          <tbody>
            ${coRows}
            <tr class="total-row"><td colspan="7"><strong>CO Net Impact</strong></td><td class="text-right" style="${coNetTotal >= 0 ? 'color:#16a34a' : 'color:#dc2626'}"><strong>${coNetTotal >= 0 ? '+' : ''}${fmt(coNetTotal)}</strong></td><td></td></tr>
          </tbody>
        </table>
        <div style="margin-top:8px;padding:4px;font-size:9pt;color:#64748b">Added: ${addedItems.length} items &bull; Removed: ${removedItems.length} items</div>` : ''}

        <div style="background:#f0fdf4;border:2px solid #16a34a;border-radius:8px;padding:16px;margin-top:24px;text-align:right">
          <div style="font-size:9pt;color:#64748b;margin-bottom:4px;">COMBINED CONTRACT TOTAL (excl. tax)</div>
          <div style="font-size:20pt;font-weight:700;color:#15803d;">${fmt(grandTotal)}</div>
        </div>

        <p style="font-size:8pt;color:#999;margin-top:40px;">Generated ${new Date().toLocaleString()}</p>
      `;

      openReport(`Product List — SO #${order.order_number}`, html, w);
    } catch (err) {
      console.error('Error:', err);
      if (w) { w.document.open(); w.document.write(errorPageHtml(String(err))); w.document.close(); }
    } finally {
      setGeneratingReport(null);
    }
  }

  // ─── PROJECT REPORTS (existing) ───────────────────────────────────────────
  async function generateJobTimeReport() {
    const w = window.open('', '_blank');
    if (w) { w.document.write(loadingPageHtml('Building Job Time Report...')); w.document.close(); }
    setGeneratingReport('job_time');
    try {
      const { data: wos } = await supabase.from('work_orders').select('id, work_order_number, title, type, status, estimated_hours, actual_hours, technician:profiles!work_orders_assigned_to_fkey(full_name), labor_phase:labor_phases(name)').eq('project_id', order.project_id).order('created_at', { ascending: true });
      const woIds = (wos || []).map(w => w.id);
      let completions: any[] = [];
      if (woIds.length > 0) {
        const { data: woTasks } = await supabase.from('work_order_tasks').select('id, work_order_id, title').in('work_order_id', woIds);
        const wtIds = (woTasks || []).map(t => t.id);
        if (wtIds.length > 0) {
          const { data: comps } = await supabase.from('work_order_task_completions').select('id, work_order_task_id, actual_hours, completed_at, notes, technician:profiles!work_order_task_completions_technician_id_fkey(full_name)').in('work_order_task_id', wtIds).order('completed_at', { ascending: true });
          const taskWOMap: Record<string, string> = {};
          const taskTitleMap: Record<string, string> = {};
          (woTasks || []).forEach(t => { taskWOMap[t.id] = t.work_order_id; taskTitleMap[t.id] = t.title; });
          completions = (comps || []).map(c => ({ ...c, work_order_id: taskWOMap[c.work_order_task_id], task_title: taskTitleMap[c.work_order_task_id] }));
        }
      }
      const woMap: Record<string, any> = {};
      (wos || []).forEach(w => { woMap[w.id] = w; });
      const totalEst = (wos || []).reduce((s, w) => s + (w.estimated_hours || 0), 0);
      const totalActual = completions.reduce((s, c) => s + (c.actual_hours || 0), 0);
      let rows = '';
      completions.forEach(c => {
        const wo = woMap[c.work_order_id];
        rows += `<tr><td>${c.technician?.full_name || 'Unknown'}</td><td>${wo?.work_order_number || '-'}</td><td>${c.task_title || '-'}</td><td>${c.completed_at ? new Date(c.completed_at).toLocaleDateString() : '-'}</td><td class="text-right">${(c.actual_hours || 0).toFixed(1)}</td><td>${c.notes || ''}</td></tr>`;
      });
      const html = `<div class="header"><h1>Job Time Report</h1><div class="subtitle">SO #${order.order_number} - ${order.contact?.full_name || ''} ${order.contact?.company_name ? '| ' + order.contact.company_name : ''}</div></div><div class="meta-grid"><div class="meta-item"><div class="meta-label">Project</div><div class="meta-value">#${order.project?.project_number || 'N/A'}</div></div><div class="meta-item"><div class="meta-label">Estimated Hours</div><div class="meta-value">${totalEst.toFixed(1)}</div></div><div class="meta-item"><div class="meta-label">Actual Hours</div><div class="meta-value">${totalActual.toFixed(1)}</div></div></div><table><thead><tr><th>Technician</th><th>Work Order</th><th>Task</th><th>Date</th><th class="text-right">Hours</th><th>Notes</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="text-center" style="color:#999">No time entries recorded</td></tr>'}${rows ? `<tr class="total-row"><td colspan="4"><strong>Total</strong></td><td class="text-right"><strong>${totalActual.toFixed(1)}</strong></td><td></td></tr>` : ''}</tbody></table><p style="font-size:8pt;color:#999;margin-top:40px;">Generated ${new Date().toLocaleString()}</p>`;
      openReport('Job Time Report', html, w);
    } catch (err) {
      console.error('Error:', err);
      if (w) { w.document.open(); w.document.write(errorPageHtml(String(err))); w.document.close(); }
    } finally { setGeneratingReport(null); }
  }

  async function generateWorkOrdersSummary() {
    const w = window.open('', '_blank');
    if (w) { w.document.write(loadingPageHtml('Building Work Orders Summary...')); w.document.close(); }
    setGeneratingReport('work_orders');
    try {
      const { data: wos } = await supabase.from('work_orders').select('id, work_order_number, title, type, status, priority, start_date, target_completion_date, estimated_hours, actual_hours, technician:profiles!work_orders_assigned_to_fkey(full_name), labor_phase:labor_phases(name)').eq('project_id', order.project_id).order('created_at', { ascending: true });
      const data = wos || [];
      const totalEst = data.reduce((s, w) => s + (w.estimated_hours || 0), 0);
      const totalActual = data.reduce((s, w) => s + (w.actual_hours || 0), 0);
      const completed = data.filter(w => w.status === 'completed').length;
      let rows = '';
      data.forEach(wo => {
        const badge = wo.status === 'completed' ? 'badge-green' : wo.status === 'in_progress' ? 'badge-blue' : wo.status === 'on_hold' ? 'badge-amber' : wo.status === 'cancelled' ? 'badge-red' : 'badge-gray';
        rows += `<tr><td>${wo.work_order_number}</td><td>${wo.title}</td><td><span class="badge ${badge}">${wo.status.replace(/_/g, ' ')}</span></td><td style="text-transform:capitalize">${wo.type}</td><td>${wo.technician?.full_name || '-'}</td><td>${wo.labor_phase?.name || '-'}</td><td class="text-right">${(wo.estimated_hours || 0).toFixed(1)}</td><td class="text-right">${(wo.actual_hours || 0).toFixed(1)}</td><td>${wo.start_date ? new Date(wo.start_date).toLocaleDateString() : '-'}</td><td>${wo.target_completion_date ? new Date(wo.target_completion_date).toLocaleDateString() : '-'}</td></tr>`;
      });
      const html = `<div class="header"><h1>Work Orders Summary</h1><div class="subtitle">SO #${order.order_number} - ${order.contact?.full_name || ''} ${order.contact?.company_name ? '| ' + order.contact.company_name : ''}</div></div><div class="summary-box"><div class="summary-grid"><div class="summary-stat"><div class="value">${data.length}</div><div class="label">Total Work Orders</div></div><div class="summary-stat"><div class="value">${completed}</div><div class="label">Completed</div></div><div class="summary-stat"><div class="value">${totalEst.toFixed(1)}</div><div class="label">Estimated Hours</div></div><div class="summary-stat"><div class="value">${totalActual.toFixed(1)}</div><div class="label">Actual Hours</div></div></div></div><table><thead><tr><th>WO #</th><th>Title</th><th>Status</th><th>Type</th><th>Technician</th><th>Phase</th><th class="text-right">Est Hrs</th><th class="text-right">Act Hrs</th><th>Start</th><th>Target</th></tr></thead><tbody>${rows || '<tr><td colspan="10" class="text-center" style="color:#999">No work orders</td></tr>'}${rows ? `<tr class="total-row"><td colspan="6"><strong>Totals</strong></td><td class="text-right"><strong>${totalEst.toFixed(1)}</strong></td><td class="text-right"><strong>${totalActual.toFixed(1)}</strong></td><td colspan="2"></td></tr>` : ''}</tbody></table><p style="font-size:8pt;color:#999;margin-top:40px;">Generated ${new Date().toLocaleString()}</p>`;
      openReport('Work Orders Summary', html, w);
    } catch (err) {
      console.error('Error:', err);
      if (w) { w.document.open(); w.document.write(errorPageHtml(String(err))); w.document.close(); }
    } finally { setGeneratingReport(null); }
  }

  async function generateLaborPhaseReport() {
    const w = window.open('', '_blank');
    if (w) { w.document.write(loadingPageHtml('Building Labor Phase Report...')); w.document.close(); }
    setGeneratingReport('labor_phase');
    try {
      const { data: tasks } = await supabase.from('project_tasks').select('id, title, estimated_hours, status, labor_phase:labor_phases(id, name)').eq('project_id', order.project_id).order('sort_order', { ascending: true });
      const taskIds = (tasks || []).map(t => t.id);
      let completionHours: Record<string, number> = {};
      if (taskIds.length > 0) {
        const { data: woTasks } = await supabase.from('work_order_tasks').select('id, project_task_id').in('project_task_id', taskIds);
        const wtIds = (woTasks || []).map(t => t.id);
        if (wtIds.length > 0) {
          const { data: comps } = await supabase.from('work_order_task_completions').select('work_order_task_id, actual_hours').in('work_order_task_id', wtIds);
          const taskMap: Record<string, string> = {};
          (woTasks || []).forEach(t => { if (t.project_task_id) taskMap[t.id] = t.project_task_id; });
          (comps || []).forEach(c => { const ptId = taskMap[c.work_order_task_id]; if (ptId) completionHours[ptId] = (completionHours[ptId] || 0) + (c.actual_hours || 0); });
        }
      }
      const phases: Record<string, { name: string; tasks: number; completed: number; estHours: number; actHours: number }> = {};
      (tasks || []).forEach(t => {
        const phaseName = t.labor_phase?.name || 'Unassigned';
        const phaseId = t.labor_phase?.id || 'none';
        if (!phases[phaseId]) phases[phaseId] = { name: phaseName, tasks: 0, completed: 0, estHours: 0, actHours: 0 };
        phases[phaseId].tasks++;
        if (t.status === 'completed') phases[phaseId].completed++;
        phases[phaseId].estHours += t.estimated_hours || 0;
        phases[phaseId].actHours += completionHours[t.id] || 0;
      });
      const phaseList = Object.values(phases);
      const totalEst = phaseList.reduce((s, p) => s + p.estHours, 0);
      const totalAct = phaseList.reduce((s, p) => s + p.actHours, 0);
      const totalTasks = phaseList.reduce((s, p) => s + p.tasks, 0);
      const totalCompleted = phaseList.reduce((s, p) => s + p.completed, 0);
      let rows = '';
      phaseList.forEach(p => {
        const pct = p.tasks > 0 ? Math.round((p.completed / p.tasks) * 100) : 0;
        const variance = p.actHours - p.estHours;
        rows += `<tr><td><strong>${p.name}</strong></td><td class="text-center">${p.tasks}</td><td class="text-center">${p.completed}</td><td class="text-center">${pct}%</td><td class="text-right">${p.estHours.toFixed(1)}</td><td class="text-right">${p.actHours.toFixed(1)}</td><td class="text-right" style="${variance > 0 ? 'color:#dc2626' : 'color:#16a34a'}">${variance >= 0 ? '+' : ''}${variance.toFixed(1)}</td></tr>`;
      });
      const html = `<div class="header"><h1>Labor Phase Breakdown</h1><div class="subtitle">SO #${order.order_number} - ${order.contact?.full_name || ''}</div></div><div class="summary-box"><div class="summary-grid"><div class="summary-stat"><div class="value">${phaseList.length}</div><div class="label">Labor Phases</div></div><div class="summary-stat"><div class="value">${totalCompleted}/${totalTasks}</div><div class="label">Tasks Complete</div></div><div class="summary-stat"><div class="value">${totalEst.toFixed(1)}</div><div class="label">Estimated Hours</div></div><div class="summary-stat"><div class="value">${totalAct.toFixed(1)}</div><div class="label">Actual Hours</div></div></div></div><table><thead><tr><th>Phase</th><th class="text-center">Tasks</th><th class="text-center">Done</th><th class="text-center">%</th><th class="text-right">Est Hrs</th><th class="text-right">Act Hrs</th><th class="text-right">Variance</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="text-center" style="color:#999">No tasks with labor phases</td></tr>'}${rows ? `<tr class="total-row"><td><strong>Totals</strong></td><td class="text-center"><strong>${totalTasks}</strong></td><td class="text-center"><strong>${totalCompleted}</strong></td><td class="text-center"><strong>${totalTasks > 0 ? Math.round((totalCompleted/totalTasks)*100) : 0}%</strong></td><td class="text-right"><strong>${totalEst.toFixed(1)}</strong></td><td class="text-right"><strong>${totalAct.toFixed(1)}</strong></td><td class="text-right"><strong>${(totalAct - totalEst) >= 0 ? '+' : ''}${(totalAct - totalEst).toFixed(1)}</strong></td></tr>` : ''}</tbody></table><p style="font-size:8pt;color:#999;margin-top:40px;">Generated ${new Date().toLocaleString()}</p>`;
      openReport('Labor Phase Breakdown', html, w);
    } catch (err) {
      console.error('Error:', err);
      if (w) { w.document.open(); w.document.write(errorPageHtml(String(err))); w.document.close(); }
    } finally { setGeneratingReport(null); }
  }

  async function generateProjectTasksChecklist() {
    const w = window.open('', '_blank');
    if (w) { w.document.write(loadingPageHtml('Building Project Tasks Checklist...')); w.document.close(); }
    setGeneratingReport('tasks_checklist');
    try {
      const { data: tasks } = await supabase.from('project_tasks').select('id, title, description, estimated_hours, status, labor_phase:labor_phases(name)').eq('project_id', order.project_id).order('sort_order', { ascending: true });
      const grouped: Record<string, any[]> = {};
      (tasks || []).forEach(t => { const phase = t.labor_phase?.name || 'General'; if (!grouped[phase]) grouped[phase] = []; grouped[phase].push(t); });
      let content = '';
      Object.entries(grouped).forEach(([phase, phaseTasks]) => {
        content += `<h2 class="section-title">${phase}</h2>`;
        phaseTasks.forEach(t => { content += `<div class="checklist-item"><div class="checkbox"></div><div style="flex:1"><div style="font-weight:600;font-size:11pt;">${t.title}</div>${t.description ? `<div style="font-size:9pt;color:#64748b;margin-top:2px;">${t.description}</div>` : ''}</div><div style="font-size:9pt;color:#64748b;white-space:nowrap;">${(t.estimated_hours || 0).toFixed(1)} hrs</div></div>`; });
      });
      if (!content) content = '<p style="text-align:center;color:#999;padding:40px;">No project tasks found.</p>';
      const html = `<div class="header"><h1>Project Tasks Checklist</h1><div class="subtitle">SO #${order.order_number} - ${order.contact?.full_name || ''}</div><div class="subtitle">Project #${order.project?.project_number || 'N/A'}</div></div><div class="meta-grid" style="grid-template-columns:1fr 1fr;"><div class="meta-item"><div class="meta-label">Total Tasks</div><div class="meta-value">${(tasks || []).length}</div></div><div class="meta-item"><div class="meta-label">Total Estimated Hours</div><div class="meta-value">${(tasks || []).reduce((s, t) => s + (t.estimated_hours || 0), 0).toFixed(1)}</div></div></div>${content}<div style="margin-top:40px;border-top:1px solid #e2e8f0;padding-top:16px;"><div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;font-size:9pt;"><div><div style="border-bottom:1px solid #94a3b8;padding-bottom:24px;margin-bottom:4px;"></div>Technician Signature</div><div><div style="border-bottom:1px solid #94a3b8;padding-bottom:24px;margin-bottom:4px;"></div>Date</div></div></div><p style="font-size:8pt;color:#999;margin-top:20px;">Generated ${new Date().toLocaleString()}</p>`;
      openReport('Project Tasks Checklist', html, w);
    } catch (err) {
      console.error('Error:', err);
      if (w) { w.document.open(); w.document.write(errorPageHtml(String(err))); w.document.close(); }
    } finally { setGeneratingReport(null); }
  }

  async function generateProfitabilityReport() {
    const w = window.open('', '_blank');
    if (w) { w.document.write(loadingPageHtml('Building Profitability Report...')); w.document.close(); }
    setGeneratingReport('profitability');
    try {
      const [woResult, invoiceResult, coResult, taskResult] = await Promise.all([
        supabase.from('work_orders').select('id, estimated_hours, actual_hours, type, status').eq('project_id', order.project_id),
        supabase.from('invoices').select('id, total, amount_paid, status').eq('sales_order_id', order.id),
        supabase.from('change_orders').select('id, change_amount, tax_amount, status').eq('sales_order_id', order.id).eq('status', 'approved'),
        supabase.from('project_tasks').select('id, estimated_hours').eq('project_id', order.project_id),
      ]);
      const wos = woResult.data || [];
      const invoices = invoiceResult.data || [];
      const cos = coResult.data || [];
      const tasks = taskResult.data || [];
      const originalContract = order.contract_total || 0;
      const coTotal = cos.reduce((s, c) => s + (c.change_amount || 0), 0);
      const coTax = cos.reduce((s, c) => s + (c.tax_amount || 0), 0);
      const totalRevenue = originalContract + coTotal;
      const totalInvoiced = invoices.reduce((s, i) => s + (i.total || 0), 0);
      const totalPaid = invoices.reduce((s, i) => s + (i.amount_paid || 0), 0);
      const estHours = tasks.reduce((s, t) => s + (t.estimated_hours || 0), 0);
      const actualHours = wos.reduce((s, w) => s + (w.actual_hours || 0), 0);
      const hoursVariance = actualHours - estHours;
      const completedWOs = wos.filter(w => w.status === 'completed').length;
      const fmt = (v: number) => '$' + v.toLocaleString(undefined, { minimumFractionDigits: 2 });
      const html = `<div class="header"><h1>Project Profitability Report</h1><div class="subtitle">SO #${order.order_number} - ${order.contact?.full_name || ''} ${order.contact?.company_name ? '| ' + order.contact.company_name : ''}</div></div><div class="meta-grid"><div class="meta-item"><div class="meta-label">Project</div><div class="meta-value">#${order.project?.project_number || 'N/A'}</div></div><div class="meta-item"><div class="meta-label">Proposal</div><div class="meta-value">#${order.proposal?.proposal_number || 'N/A'}</div></div><div class="meta-item"><div class="meta-label">Report Date</div><div class="meta-value">${new Date().toLocaleDateString()}</div></div></div><h2 class="section-title">Revenue</h2><table><tbody><tr><td>Original Contract</td><td class="text-right">${fmt(originalContract)}</td></tr>${cos.length > 0 ? `<tr><td>Approved Change Orders (${cos.length})</td><td class="text-right" style="${coTotal >= 0 ? 'color:#16a34a' : 'color:#dc2626'}">${coTotal >= 0 ? '+' : ''}${fmt(Math.abs(coTotal))}</td></tr>` : ''}${coTax > 0 ? `<tr><td>Change Order Tax</td><td class="text-right">${fmt(coTax)}</td></tr>` : ''}<tr class="total-row"><td><strong>Total Contract Revenue</strong></td><td class="text-right"><strong>${fmt(totalRevenue)}</strong></td></tr></tbody></table><h2 class="section-title">Billing Status</h2><table><tbody><tr><td>Total Invoiced</td><td class="text-right">${fmt(totalInvoiced)}</td></tr><tr><td>Total Paid</td><td class="text-right" style="color:#16a34a">${fmt(totalPaid)}</td></tr><tr><td>Outstanding</td><td class="text-right" style="${(totalInvoiced - totalPaid) > 0 ? 'color:#d97706' : ''}">${fmt(totalInvoiced - totalPaid)}</td></tr><tr><td>Remaining to Invoice</td><td class="text-right">${fmt(Math.max(0, totalRevenue - totalInvoiced))}</td></tr></tbody></table><h2 class="section-title">Labor</h2><table><tbody><tr><td>Total Work Orders</td><td class="text-right">${wos.length}</td></tr><tr><td>Completed Work Orders</td><td class="text-right">${completedWOs}</td></tr><tr><td>Estimated Hours</td><td class="text-right">${estHours.toFixed(1)}</td></tr><tr><td>Actual Hours Tracked</td><td class="text-right">${actualHours.toFixed(1)}</td></tr><tr style="${hoursVariance > 0 ? 'color:#dc2626' : 'color:#16a34a'}"><td>Hours Variance</td><td class="text-right">${hoursVariance >= 0 ? '+' : ''}${hoursVariance.toFixed(1)}</td></tr>${estHours > 0 ? `<tr><td>Revenue per Estimated Hour</td><td class="text-right">${fmt(totalRevenue / estHours)}/hr</td></tr>` : ''}${actualHours > 0 ? `<tr><td>Revenue per Actual Hour</td><td class="text-right">${fmt(totalRevenue / actualHours)}/hr</td></tr>` : ''}</tbody></table><p style="font-size:8pt;color:#999;margin-top:40px;">Generated ${new Date().toLocaleString()}</p>`;
      openReport('Project Profitability Report', html, w);
    } catch (err) {
      console.error('Error:', err);
      if (w) { w.document.open(); w.document.write(errorPageHtml(String(err))); w.document.close(); }
    } finally { setGeneratingReport(null); }
  }

  async function generateSalesTaxReport() {
    if (!order.proposal_id) { alert('No proposal linked to this sales order.'); return; }
    const w = window.open('', '_blank');
    if (w) { w.document.write(loadingPageHtml('Building Sales Tax Report...')); w.document.close(); }
    setGeneratingReport('sales_tax');
    try {
      const [proposalRes, itemsRes, roomsRes, settingsRes] = await Promise.all([
        supabase.from('proposals').select('*, contacts:contacts!proposals_contact_id_fkey(zip_code)').eq('id', order.proposal_id).maybeSingle(),
        supabase.from('proposal_line_items').select('*').eq('proposal_id', order.proposal_id).order('created_at'),
        supabase.from('proposal_rooms').select('id, name').eq('proposal_id', order.proposal_id),
        supabase.from('proposal_settings').select('discount_percent, project_management_percent, project_design_percent, system_design_percent, credit_card_fee_percent, misc_parts_percent, custom_modifier_1_percent, custom_modifier_2_percent, custom_modifier_1_label, custom_modifier_2_label').eq('proposal_id', order.proposal_id).maybeSingle(),
      ]);
      const proposal = proposalRes.data;
      const items = itemsRes.data || [];
      const rooms = roomsRes.data || [];
      const settings = settingsRes.data;
      let taxRate = 0;
      if (proposal?.contacts?.zip_code) {
        const { data: jd } = await supabase.from('tax_jurisdictions').select('combined_rate').eq('zip_code', proposal.contacts.zip_code).eq('is_active', true).order('effective_date', { ascending: false }).limit(1).maybeSingle();
        if (jd) taxRate = jd.combined_rate;
      }
      if (taxRate === 0) {
        const { data: def } = await supabase.from('tax_jurisdictions').select('combined_rate').eq('is_default', true).eq('is_active', true).limit(1).maybeSingle();
        if (def) taxRate = def.combined_rate;
      }
      const taxEnv = (proposal?.tax_environment || 'residential') as TaxEnvironment;
      const taxType = (proposal?.tax_project_type || 'general_installation_repair') as TaxProjectType;
      const applicability = getTaxApplicability(taxEnv, taxType);
      let discountPct = settings?.discount_percent || 0;
      let projMgmtPct = settings?.project_management_percent || 0;
      let projDesignPct = settings?.project_design_percent || 0;
      const sysDsnPct = settings?.system_design_percent || 0;
      const ccFeePct = settings?.credit_card_fee_percent || 0;
      const miscPct = settings?.misc_parts_percent || 0;
      const mod1Pct = settings?.custom_modifier_1_percent || 0;
      const mod2Pct = settings?.custom_modifier_2_percent || 0;
      if ((proposal?.discount_percent || 0) > 0) discountPct = proposal.discount_percent;
      if ((proposal?.project_management_percent || 0) > 0) projMgmtPct = proposal.project_management_percent;
      if ((proposal?.project_design_percent || 0) > 0) projDesignPct = proposal.project_design_percent;
      const netModPct = -discountPct + projMgmtPct + projDesignPct + sysDsnPct + ccFeePct + miscPct + mod1Pct + mod2Pct;
      const roomMap = new Map(rooms.map(r => [r.id, r.name]));
      const lineData = items.map((item: any) => {
        const lineTotal = item.line_total || 0;
        let partsTotal: number, laborTotal: number;
        if (item.item_type === 'labor') { partsTotal = 0; laborTotal = item.labor_total || lineTotal; } else { partsTotal = lineTotal; laborTotal = item.labor_total || 0; }
        const modParts = partsTotal * (1 + netModPct / 100);
        const modLabor = laborTotal * (1 + netModPct / 100);
        const partsTax = applicability.partsTaxable ? modParts * taxRate : 0;
        const laborTax = applicability.laborTaxable ? modLabor * taxRate : 0;
        return { room: roomMap.get(item.room_id) || 'Unassigned', description: item.description || '', itemType: item.item_type || 'part', partsTotal: modParts, laborTotal: modLabor, partsTaxable: applicability.partsTaxable, laborTaxable: applicability.laborTaxable, partsTax, laborTax, totalTax: partsTax + laborTax };
      });
      const totalPartsTax = lineData.reduce((s: number, i: any) => s + i.partsTax, 0);
      const totalLaborTax = lineData.reduce((s: number, i: any) => s + i.laborTax, 0);
      const grandTax = totalPartsTax + totalLaborTax;
      const totalParts = lineData.reduce((s: number, i: any) => s + i.partsTotal, 0);
      const totalLabor = lineData.reduce((s: number, i: any) => s + i.laborTotal, 0);
      const fmt = (v: number) => '$' + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const check = (taxable: boolean) => taxable ? `<span style="color:#16a34a;font-weight:700;">&#10003;</span>` : `<span style="color:#94a3b8;">&#10007;</span>`;
      let rows = '';
      lineData.forEach((item: any) => { rows += `<tr><td>${item.room}</td><td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.description}</td><td class="text-center"><span class="badge ${item.itemType === 'labor' ? 'badge-amber' : 'badge-blue'}">${item.itemType === 'labor' ? 'Labor' : 'Material'}</span></td><td class="text-right">${fmt(item.partsTotal)}</td><td class="text-center">${check(item.partsTaxable)}</td><td class="text-right" style="color:#059669;font-weight:600;">${fmt(item.partsTax)}</td><td class="text-right">${fmt(item.laborTotal)}</td><td class="text-center">${check(item.laborTaxable)}</td><td class="text-right" style="color:#059669;font-weight:600;">${fmt(item.laborTax)}</td><td class="text-right" style="color:#0284c7;font-weight:700;">${fmt(item.totalTax)}</td></tr>`; });
      const envLabel = taxEnv === 'residential' ? 'Residential' : 'Commercial';
      const typeLabel = taxType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const html = `<div class="header"><h1>Sales Tax Report</h1><div class="subtitle">SO #${order.order_number} — ${order.contact?.full_name || ''}${order.contact?.company_name ? ' | ' + order.contact.company_name : ''}</div></div><div class="info-box"><div class="info-grid"><div><div class="info-label">Tax Environment</div><div class="info-value">${envLabel}</div></div><div><div class="info-label">Project Type</div><div class="info-value">${typeLabel}</div></div><div><div class="info-label">Tax Rate</div><div class="info-value tax-rate">${(taxRate * 100).toFixed(3)}%</div></div><div><div class="info-label">Materials Taxable</div><div class="info-value ${applicability.partsTaxable ? 'taxable-yes' : 'taxable-no'}">${applicability.partsTaxable ? 'Yes' : 'No'}</div></div><div><div class="info-label">Labor Taxable</div><div class="info-value ${applicability.laborTaxable ? 'taxable-yes' : 'taxable-no'}">${applicability.laborTaxable ? 'Yes' : 'No'}</div></div></div><p class="info-note">${applicability.explanation}${netModPct !== 0 ? ' Amounts include modifiers; tax calculated on final modified amounts.' : ''}</p></div><table><thead><tr><th>Area</th><th>Description</th><th class="text-center">Type</th><th class="text-right">Materials</th><th class="text-center">Tax?</th><th class="text-right">Mat. Tax</th><th class="text-right">Labor</th><th class="text-center">Tax?</th><th class="text-right">Labor Tax</th><th class="text-right">Total Tax</th></tr></thead><tbody>${rows || '<tr><td colspan="10" class="text-center" style="color:#999">No line items found</td></tr>'}<tr class="total-row"><td colspan="3"><strong>Totals</strong></td><td class="text-right"><strong>${fmt(totalParts)}</strong></td><td></td><td class="text-right" style="color:#059669;"><strong>${fmt(totalPartsTax)}</strong></td><td class="text-right"><strong>${fmt(totalLabor)}</strong></td><td></td><td class="text-right" style="color:#059669;"><strong>${fmt(totalLaborTax)}</strong></td><td class="text-right" style="color:#0284c7;font-size:12pt;"><strong>${fmt(grandTax)}</strong></td></tr></tbody></table><div class="tax-summary"><div class="tax-summary-item"><div class="tax-summary-label">Materials Tax</div><div class="tax-summary-value" style="color:#059669;">${fmt(totalPartsTax)}</div></div><div class="tax-summary-item"><div class="tax-summary-label">Labor Tax</div><div class="tax-summary-value" style="color:#d97706;">${fmt(totalLaborTax)}</div></div><div class="tax-summary-item tax-summary-total"><div class="tax-summary-label">Total Sales Tax</div><div class="tax-summary-value" style="color:#0284c7;font-size:20pt;">${fmt(grandTax)}</div></div></div><p style="font-size:8pt;color:#999;margin-top:32px;">Generated ${new Date().toLocaleString()} &bull; Proposal #${order.proposal?.proposal_number || 'N/A'}</p>`;
      const fullHtml = `<!DOCTYPE html><html><head><title>Sales Tax Report - SO #${order.order_number}</title><style>@page{margin:0.75in;size:letter}*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;color:#1a1a1a;font-size:11pt;line-height:1.5;padding:24px}.header{border-bottom:2px solid #0891b2;padding-bottom:16px;margin-bottom:24px}.header h1{font-size:18pt;color:#0c4a6e}.header .subtitle{font-size:10pt;color:#666;margin-top:4px}.info-box{background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:16px;margin-bottom:24px}.info-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:12px}.info-label{font-size:8pt;color:#64748b;text-transform:uppercase;font-weight:600;letter-spacing:.5px}.info-value{font-size:11pt;font-weight:600;color:#1e293b}.tax-rate{color:#059669;font-size:14pt}.taxable-yes{color:#16a34a}.taxable-no{color:#dc2626}.info-note{font-size:9pt;color:#475569;font-style:italic;border-top:1px solid #cbd5e1;padding-top:8px;margin-top:8px}table{width:100%;border-collapse:collapse;margin-bottom:24px;font-size:9pt}th{background:#f1f5f9;padding:7px 10px;text-align:left;font-size:8pt;text-transform:uppercase;letter-spacing:.5px;color:#64748b;border-bottom:2px solid #e2e8f0}td{padding:7px 10px;border-bottom:1px solid #e2e8f0}tr:nth-child(even)td{background:#fafafa}.total-row td{font-weight:700;border-top:2px solid #cbd5e1;background:#f1f5f9!important}.text-right{text-align:right}.text-center{text-align:center}.badge{display:inline-block;padding:2px 7px;border-radius:4px;font-size:7.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.3px}.badge-blue{background:#dbeafe;color:#1e40af}.badge-amber{background:#fef3c7;color:#92400e}.tax-summary{display:grid;grid-template-columns:1fr 1fr 1.5fr;gap:16px;margin-top:24px}.tax-summary-item{text-align:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px}.tax-summary-total{background:#ecfeff;border:2px solid #0891b2}.tax-summary-label{font-size:9pt;color:#64748b;text-transform:uppercase;font-weight:600;letter-spacing:.5px;margin-bottom:4px}.tax-summary-value{font-size:16pt;font-weight:700}.toolbar{position:sticky;top:0;background:linear-gradient(135deg,#0c4a6e,#0891b2);padding:12px 20px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 2px 8px rgba(0,0,0,.2);z-index:100}.toolbar-title{color:#fff;font-size:14px;font-weight:600}.toolbar-btns{display:flex;gap:10px}.btn{padding:8px 18px;font-size:13px;font-weight:600;border:none;border-radius:6px;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:6px}.btn-print{background:#fff;color:#0c4a6e}.btn-download{background:#0369a1;color:#fff;border:1px solid rgba(255,255,255,.3)}.btn-print:hover{background:#f0f9ff}.btn-download:hover{background:#075985}.page-content{padding:24px}@media print{.toolbar{display:none!important}body{-webkit-print-color-adjust:exact;print-color-adjust:exact;padding:0}}</style></head><body><div class="toolbar"><span class="toolbar-title">Sales Tax Report — SO #${order.order_number}</span><div class="toolbar-btns"><button class="btn btn-download" onclick="downloadHtml()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Download</button><button class="btn btn-print" onclick="window.print()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Print / PDF</button></div></div><div class="page-content">${html}</div><script>function downloadHtml(){const clone=document.documentElement.cloneNode(true);const toolbar=clone.querySelector('.toolbar');if(toolbar)toolbar.remove();const scripts=clone.querySelectorAll('script');scripts.forEach(s=>s.remove());const blob=new Blob(['<!DOCTYPE html>'+clone.outerHTML],{type:'text/html'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='Sales_Tax_Report_SO_${order.order_number}.html';a.click();URL.revokeObjectURL(a.href);}<\/script></body></html>`;
      if (w) { w.document.open(); w.document.write(fullHtml); w.document.close(); }
    } catch (err) {
      console.error('Error generating sales tax report:', err);
      if (w) { w.document.open(); w.document.write(errorPageHtml(String(err))); w.document.close(); }
    } finally { setGeneratingReport(null); }
  }

  // ─── UI ───────────────────────────────────────────────────────────────────

  const sections: { key: ReportSection; label: string; icon: typeof FileText; description: string }[] = [
    { key: 'financial', label: 'Financial Summary', icon: BarChart3, description: 'Contract totals, all change orders, payments, and balance due' },
    { key: 'contracts', label: 'Original Sales Order', icon: FileText, description: 'Original approved proposal document and combined sales order view' },
    { key: 'change_orders', label: 'Change Orders', icon: Layers, description: 'Print individual or all change orders' },
    { key: 'payments', label: 'Payment History', icon: CreditCard, description: 'Current balance, all invoices, and all payments received' },
    { key: 'commissions', label: 'Commissions', icon: Users, description: 'Commission breakdown by employee and role' },
    { key: 'project_stats', label: 'Project Stats', icon: TrendingUp, description: 'Labor performance, hours variance, and revenue metrics' },
    { key: 'product_list', label: 'Product List', icon: Package, description: 'All products from original order and approved change orders combined' },
    { key: 'project_reports', label: 'Project Reports', icon: Wrench, description: 'Work orders, job time, labor phases, and task checklists' },
  ];

  return (
    <>
    <div className="space-y-3">
      {sections.map(({ key, label, icon: Icon, description }) => {
        const isOpen = expandedSection === key;
        return (
          <div key={key} className="rounded-xl border border-gray-700/50 overflow-hidden bg-gray-900/40">
            <button
              onClick={() => toggleSection(key)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-800/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gray-800 border border-gray-700/50 flex items-center justify-center shrink-0">
                  <Icon className="w-4.5 h-4.5 text-gray-400" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-semibold text-white">{label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{description}</div>
                </div>
              </div>
              {isOpen ? <ChevronUp className="w-4 h-4 text-gray-500 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />}
            </button>

            {isOpen && (
              <div className="px-5 pb-5 pt-1 border-t border-gray-700/40 bg-gray-900/20">

                {/* 1. FINANCIAL SUMMARY */}
                {key === 'financial' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                    <ReportCard
                      icon={BarChart3}
                      title="Financial Summary"
                      description="Original contract, all change orders, payments received, and current balance due."
                      loading={generatingReport === 'financial_summary'}
                      disabled={!!generatingReport}
                      onGenerate={generateFinancialSummary}
                    />
                    <ReportCard
                      icon={Receipt}
                      title="Sales Tax Report"
                      description="Line-item tax breakdown — materials vs. labor taxability by environment and project type."
                      loading={generatingReport === 'sales_tax'}
                      disabled={!!generatingReport || !order.proposal_id}
                      onGenerate={generateSalesTaxReport}
                    />
                  </div>
                )}

                {/* 2. CONTRACTS */}
                {key === 'contracts' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                    <ReportCard
                      icon={FileText}
                      title="Original Proposal"
                      description="The original approved proposal document with all rooms, line items, and pricing."
                      loading={generatingReport === 'proposal'}
                      disabled={!!generatingReport || !order.proposal_id}
                      onGenerate={() => callEdgeFunction('generate-proposal-pdf', { proposalId: order.proposal_id }, 'proposal')}
                    />
                    <ReportCard
                      icon={BarChart3}
                      title="Combined Sales Order"
                      description="Original proposal plus all approved change orders combined into one unified order view."
                      loading={generatingReport === 'sales_report'}
                      disabled={!!generatingReport}
                      onGenerate={() => callEdgeFunction('generate-sales-order-report', { salesOrderId: order.id }, 'sales_report')}
                    />
                    <ReportCard
                      icon={PieChart}
                      title="Class Report"
                      description="Breakdown of all line items grouped by class with totals and percentage contribution."
                      loading={loadingClassReport}
                      disabled={loadingClassReport || !order.proposal_id}
                      onGenerate={openClassReport}
                    />
                  </div>
                )}

                {/* 3. CHANGE ORDERS */}
                {key === 'change_orders' && (
                  <div className="pt-3 space-y-4">
                    {changeOrders.length === 0 ? (
                      <p className="text-sm text-gray-500 py-4 text-center">No change orders on this sales order.</p>
                    ) : (
                      <>
                        <div className="bg-gray-800/50 rounded-lg border border-gray-700/40 p-4">
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-sm text-gray-400">Select change orders to print</p>
                            <button onClick={toggleAllCOs} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
                              {selectedCOs.size === changeOrders.length ? 'Deselect All' : 'Select All'}
                            </button>
                          </div>
                          <div className="space-y-1.5 mb-4 max-h-52 overflow-y-auto">
                            {changeOrders.map(co => (
                              <button
                                key={co.id}
                                onClick={() => toggleCO(co.id)}
                                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${selectedCOs.has(co.id) ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-gray-800/50 border border-transparent hover:border-gray-600'}`}
                              >
                                {selectedCOs.has(co.id) ? <CheckSquare className="w-4 h-4 text-blue-400 shrink-0" /> : <Square className="w-4 h-4 text-gray-600 shrink-0" />}
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm font-mono text-white">{co.change_order_number}</span>
                                  <span className="text-sm text-gray-400 ml-2 truncate">{co.title}</span>
                                  {co.is_billable === false && <span className="ml-2 text-xs text-gray-500">(non-billable)</span>}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className={`text-xs px-2 py-0.5 rounded-full border ${
                                    co.status === 'approved' ? 'bg-green-500/10 text-green-400 border-green-500/30' :
                                    co.status === 'pending_approval' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' :
                                    'bg-gray-500/10 text-gray-400 border-gray-500/30'
                                  }`}>{co.status.replace(/_/g,' ')}</span>
                                  <span className={`text-sm font-medium ${co.change_amount >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {co.change_amount >= 0 ? '+' : ''}${Math.abs(co.change_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </span>
                                </div>
                              </button>
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => callEdgeFunction('generate-change-order-report', { changeOrderIds: Array.from(selectedCOs), salesOrderId: order.id }, 'co_selected')}
                              disabled={selectedCOs.size === 0 || !!generatingReport}
                              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {generatingReport === 'co_selected' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                              Print Selected ({selectedCOs.size})
                            </button>
                            <button
                              onClick={() => callEdgeFunction('generate-change-order-report', { changeOrderIds: changeOrders.map(co => co.id), salesOrderId: order.id }, 'co_all')}
                              disabled={!!generatingReport}
                              className="flex items-center gap-2 px-4 py-2 bg-gray-700 text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-40"
                            >
                              {generatingReport === 'co_all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                              Print All ({changeOrders.length})
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* 4. PAYMENT HISTORY */}
                {key === 'payments' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                    <ReportCard
                      icon={CreditCard}
                      title="Payment History"
                      description="Current contract total, all invoices, and a full log of every payment received."
                      loading={generatingReport === 'payment_history'}
                      disabled={!!generatingReport}
                      onGenerate={generatePaymentHistory}
                    />
                  </div>
                )}

                {/* 5. COMMISSIONS */}
                {key === 'commissions' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                    <ReportCard
                      icon={Users}
                      title="Commission Report"
                      description="Commission breakdown by employee, role type, and status across all approved invoices."
                      loading={generatingReport === 'commissions_report'}
                      disabled={!!generatingReport}
                      onGenerate={() => callEdgeFunction('generate-sales-order-report', { salesOrderId: order.id, reportType: 'commissions' }, 'commissions_report')}
                    />
                  </div>
                )}

                {/* 6. PROJECT STATS */}
                {key === 'project_stats' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-3">
                    <ReportCard
                      icon={TrendingUp}
                      title="Profitability Report"
                      description="Revenue vs labor analysis with billing status, hours variance, and per-hour revenue metrics."
                      loading={generatingReport === 'profitability'}
                      disabled={!!generatingReport || !order.project_id}
                      onGenerate={generateProfitabilityReport}
                    />
                    <ReportCard
                      icon={Layers}
                      title="Labor Phase Breakdown"
                      description="Hours breakdown by labor phase with estimated vs actual comparison and variance."
                      loading={generatingReport === 'labor_phase'}
                      disabled={!!generatingReport || !order.project_id}
                      onGenerate={generateLaborPhaseReport}
                    />
                  </div>
                )}

                {/* 7. PRODUCT LIST */}
                {key === 'product_list' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                    <ReportCard
                      icon={Package}
                      title="Product List"
                      description="All products from the original order plus approved billable change orders — quantities, pricing, and locations."
                      loading={generatingReport === 'product_list'}
                      disabled={!!generatingReport}
                      onGenerate={generateProductList}
                    />
                  </div>
                )}

                {/* PROJECT REPORTS */}
                {key === 'project_reports' && (
                  !order.project_id ? (
                    <p className="text-sm text-gray-500 py-4 text-center">No project linked to this sales order.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-3">
                      <ReportCard
                        icon={Clock}
                        title="Job Time Report"
                        description="Detailed time entries by technician, work order, and task with hours breakdown."
                        loading={generatingReport === 'job_time'}
                        disabled={!!generatingReport}
                        onGenerate={generateJobTimeReport}
                      />
                      <ReportCard
                        icon={Wrench}
                        title="Work Orders Summary"
                        description="All work orders with status, assigned technicians, estimated vs actual hours."
                        loading={generatingReport === 'work_orders'}
                        disabled={!!generatingReport}
                        onGenerate={generateWorkOrdersSummary}
                      />
                      <ReportCard
                        icon={ListChecks}
                        title="Project Tasks Checklist"
                        description="Printable checklist with task descriptions, hours, and signature lines for field use."
                        loading={generatingReport === 'tasks_checklist'}
                        disabled={!!generatingReport}
                        onGenerate={generateProjectTasksChecklist}
                      />
                    </div>
                  )
                )}

              </div>
            )}
          </div>
        );
      })}
    </div>

    {showClassReport && order.proposal_id && (
      <ClassSummaryReport
        proposalId={order.proposal_id}
        rooms={classReportRooms}
        onClose={() => setShowClassReport(false)}
      />
    )}
    </>
  );
}

function ReportCard({ icon: Icon, title, description, loading, disabled, onGenerate }: {
  icon: typeof FileText;
  title: string;
  description: string;
  loading: boolean;
  disabled: boolean;
  onGenerate: () => void;
}) {
  return (
    <div className="bg-gray-900/50 rounded-lg border border-gray-700/50 p-4 flex flex-col">
      <div className="flex items-start gap-3 mb-3 flex-1">
        <div className="w-9 h-9 rounded-lg bg-gray-700/50 flex items-center justify-center shrink-0">
          <Icon className="w-4.5 h-4.5 text-gray-400" />
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white mb-1">{title}</h4>
          <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
        </div>
      </div>
      <button
        onClick={onGenerate}
        disabled={disabled}
        className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-gray-700 text-gray-200 text-sm font-medium rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
        Generate
      </button>
    </div>
  );
}

function loadingPageHtml(message: string): string {
  return `<!DOCTYPE html><html><head><title>Loading...</title><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;}.spinner{width:48px;height:48px;border:4px solid #334155;border-top-color:#3b82f6;border-radius:50%;animation:spin 0.8s linear infinite;margin-bottom:20px;}@keyframes spin{to{transform:rotate(360deg)}}.msg{font-size:15px;color:#94a3b8;}</style></head><body><div style="text-align:center"><div class="spinner"></div><div class="msg">${message}</div></div></body></html>`;
}

function errorPageHtml(message: string): string {
  return `<!DOCTYPE html><html><head><title>Report Error</title><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;}.box{background:#1e293b;border:1px solid #ef4444;border-radius:12px;padding:32px;max-width:500px;text-align:center;}h1{color:#ef4444;font-size:18px;margin-bottom:12px;}p{color:#94a3b8;font-size:13px;line-height:1.6;}button{margin-top:20px;padding:10px 20px;background:#ef4444;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:14px;}</style></head><body><div class="box"><h1>Report Failed</h1><p>${message}</p><button onclick="window.close()">Close</button></div></body></html>`;
}

function openReport(title: string, bodyHtml: string, w?: Window | null) {
  const html = `<!DOCTYPE html>
<html><head><title>${title}</title><style>
  @page { margin: 0.75in; size: letter; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1a1a1a; font-size: 11pt; line-height: 1.5; }
  .toolbar { position: sticky; top: 0; background: linear-gradient(135deg, #1e3a8a, #2563eb); padding: 12px 20px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 2px 8px rgba(0,0,0,0.2); z-index: 100; margin-bottom: 0; }
  .toolbar-title { color: #fff; font-size: 14px; font-weight: 600; }
  .toolbar-btns { display: flex; gap: 10px; }
  .btn { padding: 8px 18px; font-size: 13px; font-weight: 600; border: none; border-radius: 6px; cursor: pointer; font-family: inherit; display: inline-flex; align-items: center; gap: 6px; }
  .btn-print { background: #fff; color: #1e3a8a; }
  .btn-download { background: #1d4ed8; color: #fff; border: 1px solid rgba(255,255,255,0.3); }
  .btn-print:hover { background: #eff6ff; }
  .btn-download:hover { background: #1e40af; }
  .content { padding: 28px; }
  .header { border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 24px; }
  .header h1 { font-size: 18pt; color: #1e3a5f; }
  .header .subtitle { font-size: 10pt; color: #666; margin-top: 4px; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-bottom: 24px; padding: 12px; background: #f8fafc; border-radius: 6px; }
  .meta-item { font-size: 9pt; }
  .meta-label { color: #64748b; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; }
  .meta-value { color: #1e293b; font-size: 11pt; font-weight: 500; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { background: #f1f5f9; padding: 8px 12px; text-align: left; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; border-bottom: 2px solid #e2e8f0; }
  td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; font-size: 10pt; }
  tr:nth-child(even) { background: #fafafa; }
  .section-title { font-size: 13pt; color: #1e3a5f; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; margin: 24px 0 16px; }
  .total-row td { font-weight: 700; border-top: 2px solid #cbd5e1; background: #f1f5f9; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .checklist-item { display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid #e2e8f0; }
  .checkbox { width: 18px; height: 18px; border: 2px solid #94a3b8; border-radius: 3px; flex-shrink: 0; margin-top: 2px; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 8pt; font-weight: 600; text-transform: uppercase; }
  .badge-green { background: #dcfce7; color: #166534; }
  .badge-amber { background: #fef3c7; color: #92400e; }
  .badge-blue { background: #dbeafe; color: #1e40af; }
  .badge-gray { background: #f1f5f9; color: #475569; }
  .badge-red { background: #fee2e2; color: #991b1b; }
  .summary-box { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 16px; margin: 20px 0; }
  .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
  .summary-stat { text-align: center; }
  .summary-stat .value { font-size: 18pt; font-weight: 700; color: #0369a1; }
  .summary-stat .label { font-size: 8pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
  @media print {
    .toolbar { display: none !important; }
    body { padding: 0; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style></head><body>
<div class="toolbar">
  <span class="toolbar-title">${title}</span>
  <div class="toolbar-btns">
    <button class="btn btn-download" onclick="downloadHtml()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      Download
    </button>
    <button class="btn btn-print" onclick="window.print()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
      Print / PDF
    </button>
  </div>
</div>
<div class="content">
${bodyHtml}
</div>
<script>
function downloadHtml() {
  const clone = document.documentElement.cloneNode(true);
  const toolbar = clone.querySelector('.toolbar');
  if (toolbar) toolbar.remove();
  const scripts = clone.querySelectorAll('script');
  scripts.forEach(s => s.remove());
  const blob = new Blob(['<!DOCTYPE html>' + clone.outerHTML], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '${title.replace(/[^a-z0-9]/gi, '_')}.html';
  a.click();
  URL.revokeObjectURL(a.href);
}
<\/script>
</body></html>`;

  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
  } else {
    const nw = window.open('', '_blank');
    if (nw) { nw.document.write(html); nw.document.close(); }
  }
}
