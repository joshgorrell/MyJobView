import { useState, useEffect } from 'react';
import { X, Package, Printer, EyeOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { SalesOrderFull, ChangeOrderSummary } from './SalesOrderDetail';

interface ChangeOrderProductReportModalProps {
  co: ChangeOrderSummary;
  order: SalesOrderFull;
  onClose: () => void;
}

interface LineItem {
  id: string;
  product_name: string;
  sku: string | null;
  action_type: 'add' | 'remove' | 'modify_quantity' | 'modify_price' | 'modify_labor' | 'modify_modifiers';
  item_type: string | null;
  new_quantity: number;
  new_unit_price: number;
  new_total: number;
  change_amount: number;
  install_location: string | null;
  labor_hours: number | null;
  labor_rate: number | null;
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
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 8pt; font-weight: 600; text-transform: uppercase; }
  .badge-green { background: #dcfce7; color: #166534; }
  .badge-amber { background: #fef3c7; color: #92400e; }
  .badge-blue { background: #dbeafe; color: #1e40af; }
  .badge-gray { background: #f1f5f9; color: #475569; }
  .badge-red { background: #fee2e2; color: #991b1b; }
  .removed-row td { opacity: 0.6; text-decoration: line-through; }
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
  const html = '<!DOCTYPE html>' + clone.outerHTML;
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = '${title.replace(/[^a-z0-9]/gi, '_')}.html';
  a.click();
  URL.revokeObjectURL(url);
}
<\/script>
</body></html>`;
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
  }
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  transferred: 'Transferred',
};

export function ChangeOrderProductReportModal({ co, order, onClose }: ChangeOrderProductReportModalProps) {
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('change_order_line_items')
          .select('id, product_name, sku, action_type, item_type, new_quantity, new_unit_price, new_total, change_amount, install_location, labor_hours, labor_rate')
          .eq('change_order_id', co.id)
          .order('created_at');
        setLineItems((data || []) as LineItem[]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [co.id]);

  const fmt = (v: number) => '$' + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtQty = (v: number) => Number.isInteger(v) ? String(v) : v.toFixed(2);

  const allItems = lineItems.filter(i => i.action_type !== 'modify_modifiers' || (i.change_amount !== 0));
  const displayItems = showRemoved ? allItems : allItems.filter(i => i.action_type !== 'remove');

  const partsTotal = allItems
    .filter(i => i.item_type !== 'labor')
    .reduce((s, i) => s + (i.change_amount || 0), 0);
  const laborTotal = allItems
    .filter(i => i.item_type === 'labor')
    .reduce((s, i) => s + (i.change_amount || 0), 0);
  const netTotal = partsTotal + laborTotal;

  async function printReport() {
    setPrinting(true);
    const w = window.open('', '_blank');
    if (w) { w.document.write(loadingPageHtml('Building Product Report...')); w.document.close(); }
    try {
      const { data: orgData } = await supabase
        .from('organizations')
        .select('name, logo_url')
        .limit(1)
        .maybeSingle();

      const orgName = orgData?.name || '';
      const orgLogo = orgData?.logo_url || '';

      const allReportItems = lineItems.filter(i => i.action_type !== 'modify_modifiers' || (i.change_amount !== 0));
      const items = showRemoved ? allReportItems : allReportItems.filter(i => i.action_type !== 'remove');
      const partsNetAll = allReportItems.filter(i => i.item_type !== 'labor').reduce((s, i) => s + (i.change_amount || 0), 0);
      const laborNetAll = allReportItems.filter(i => i.item_type === 'labor').reduce((s, i) => s + (i.change_amount || 0), 0);
      const netAll = partsNetAll + laborNetAll;

      const statusLabel = STATUS_LABELS[co.status] || co.status;

      let rows = '';
      items.forEach((item) => {
        const isRemoved = item.action_type === 'remove';
        const isLabor = item.item_type === 'labor';

        let qty = '';
        let unitPrice = '';
        let total = '';

        if (item.action_type === 'modify_labor') {
          qty = item.labor_hours != null ? fmtQty(item.labor_hours) + ' hrs' : '—';
          unitPrice = item.labor_rate != null ? fmt(item.labor_rate) + '/hr' : '—';
          total = fmt(item.change_amount || 0);
        } else if (isRemoved) {
          qty = fmtQty(item.new_quantity || 0);
          unitPrice = fmt(item.new_unit_price || 0);
          total = fmt(Math.abs(item.change_amount || 0));
        } else {
          qty = fmtQty(item.new_quantity || 0);
          unitPrice = fmt(item.new_unit_price || 0);
          total = fmt(item.new_total || Math.abs(item.change_amount || 0));
        }

        const actionBadge = item.action_type === 'add'
          ? `<span class="badge badge-green">Added</span>`
          : item.action_type === 'remove'
            ? `<span class="badge badge-red">Removed</span>`
            : `<span class="badge badge-blue">Modified</span>`;

        const typeBadge = `<span class="badge ${isLabor ? 'badge-amber' : 'badge-gray'}">${isLabor ? 'Labor' : 'Material'}</span>`;

        rows += `<tr class="${isRemoved ? 'removed-row' : ''}">
          <td>${item.product_name || '—'}</td>
          <td>${item.sku || '—'}</td>
          <td class="text-center">${actionBadge}</td>
          <td class="text-center">${typeBadge}</td>
          <td class="text-center">${qty}</td>
          <td class="text-right">${unitPrice}</td>
          <td class="text-right">${total}</td>
          <td>${item.install_location || '—'}</td>
        </tr>`;
      });

      const partsItems = allReportItems.filter(i => i.item_type !== 'labor');
      const laborItems = allReportItems.filter(i => i.item_type === 'labor');
      const partsNet = partsNetAll;
      const laborNet = laborNetAll;
      const net = netAll;

      const logoHtml = orgLogo
        ? `<img src="${orgLogo}" style="height:48px;object-fit:contain;margin-bottom:8px;" />`
        : '';

      const html = `
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px;">
          <div>${logoHtml}<div style="font-size:10pt;color:#64748b;">${orgName}</div></div>
        </div>
        <div class="header">
          <h1>Change Order Product List</h1>
          <div class="subtitle">CO #${co.change_order_number} — ${order.contact?.full_name || ''}${order.contact?.company_name ? ' | ' + order.contact.company_name : ''}</div>
          ${co.title ? `<div class="subtitle">${co.title}</div>` : ''}
        </div>
        <div class="meta-grid">
          <div class="meta-item"><div class="meta-label">Sales Order</div><div class="meta-value">SO #${order.order_number}</div></div>
          <div class="meta-item"><div class="meta-label">Status</div><div class="meta-value">${statusLabel}</div></div>
          <div class="meta-item"><div class="meta-label">Report Date</div><div class="meta-value">${new Date().toLocaleDateString()}</div></div>
        </div>

        <h2 class="section-title">Products &amp; Services (${items.length} item${items.length !== 1 ? 's' : ''})</h2>
        ${items.length > 0 ? `
        <table>
          <thead><tr><th>Description</th><th>SKU</th><th class="text-center">Action</th><th class="text-center">Type</th><th class="text-center">Qty</th><th class="text-right">Unit Price</th><th class="text-right">Total</th><th>Location</th></tr></thead>
          <tbody>
            ${rows}
          </tbody>
        </table>` : '<p style="color:#999;font-style:italic;padding:12px 0">No items found on this change order.</p>'}

        <div style="display:grid;grid-template-columns:1fr auto;gap:16px;margin-top:24px;align-items:start;">
          <div style="font-size:9pt;color:#64748b;">
            ${allReportItems.filter(i => i.action_type === 'add').length} added &bull;
            ${allReportItems.filter(i => i.action_type === 'remove').length} removed &bull;
            ${allReportItems.filter(i => i.action_type.startsWith('modify')).length} modified
          </div>
          <div style="background:#f0fdf4;border:2px solid #16a34a;border-radius:8px;padding:16px;min-width:220px;">
            ${partsItems.length > 0 ? `<div style="display:flex;justify-content:space-between;font-size:9pt;color:#64748b;margin-bottom:4px;"><span>Parts</span><span style="color:${partsNet >= 0 ? '#16a34a' : '#dc2626'}">${partsNet >= 0 ? '+' : ''}${fmt(partsNet)}</span></div>` : ''}
            ${laborItems.length > 0 ? `<div style="display:flex;justify-content:space-between;font-size:9pt;color:#64748b;margin-bottom:8px;"><span>Labor</span><span style="color:${laborNet >= 0 ? '#16a34a' : '#dc2626'}">${laborNet >= 0 ? '+' : ''}${fmt(laborNet)}</span></div>` : ''}
            <div style="display:flex;justify-content:space-between;align-items:baseline;border-top:1px solid #bbf7d0;padding-top:8px;">
              <span style="font-size:9pt;color:#64748b;text-transform:uppercase;font-weight:600;letter-spacing:0.5px;">CO Net Total</span>
              <span style="font-size:18pt;font-weight:700;color:${net >= 0 ? '#15803d' : '#dc2626'};">${net >= 0 ? '+' : ''}${fmt(net)}</span>
            </div>
          </div>
        </div>

        <p style="font-size:8pt;color:#999;margin-top:40px;">Generated ${new Date().toLocaleString()}</p>
      `;

      openReport(`CO Product List — ${co.change_order_number}`, html, w);
    } catch (err) {
      console.error('Error:', err);
      if (w) { w.document.open(); w.document.write(errorPageHtml(String(err))); w.document.close(); }
    } finally {
      setPrinting(false);
    }
  }

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-700 text-gray-300',
    pending_approval: 'bg-amber-900/40 text-amber-300',
    approved: 'bg-green-900/40 text-green-300',
    rejected: 'bg-red-900/40 text-red-300',
    transferred: 'bg-blue-900/40 text-blue-300',
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-900/40 rounded-lg flex items-center justify-center">
              <Package className="w-4 h-4 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-white">Product Report</h2>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[co.status] || 'bg-gray-700 text-gray-300'}`}>
                  {STATUS_LABELS[co.status] || co.status}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                CO #{co.change_order_number}{co.title ? ` — ${co.title}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={printReport}
              disabled={printing || loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {printing
                ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <Printer className="w-3.5 h-3.5" />
              }
              Print / Save PDF
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {!loading && allItems.length > 0 && (
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs text-gray-500">
                {displayItems.length} item{displayItems.length !== 1 ? 's' : ''} shown
                {!showRemoved && allItems.filter(i => i.action_type === 'remove').length > 0 && (
                  <span className="ml-1 text-gray-600">
                    ({allItems.filter(i => i.action_type === 'remove').length} removed hidden)
                  </span>
                )}
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none group">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={showRemoved}
                    onChange={e => setShowRemoved(e.target.checked)}
                    className="sr-only"
                  />
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                    showRemoved ? 'bg-red-600 border-red-600' : 'bg-transparent border-gray-600 group-hover:border-gray-400'
                  }`}>
                    {showRemoved && (
                      <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                </div>
                <span className="flex items-center gap-1 text-xs text-gray-400 group-hover:text-gray-300 transition-colors">
                  <EyeOff className="w-3 h-3" />
                  Show removed items
                </span>
              </label>
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : displayItems.length === 0 ? (
            <div className="text-center py-16 text-gray-500 text-sm">
              {allItems.length === 0 ? 'No items found on this change order.' : 'No net items to display. Check "Show removed items" to see all changes.'}
            </div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700">
                    <th className="text-left text-xs text-gray-500 uppercase tracking-wide pb-2 font-medium">Description</th>
                    <th className="text-left text-xs text-gray-500 uppercase tracking-wide pb-2 font-medium">SKU</th>
                    <th className="text-center text-xs text-gray-500 uppercase tracking-wide pb-2 font-medium">Action</th>
                    <th className="text-center text-xs text-gray-500 uppercase tracking-wide pb-2 font-medium">Type</th>
                    <th className="text-center text-xs text-gray-500 uppercase tracking-wide pb-2 font-medium">Qty</th>
                    <th className="text-right text-xs text-gray-500 uppercase tracking-wide pb-2 font-medium">Unit Price</th>
                    <th className="text-right text-xs text-gray-500 uppercase tracking-wide pb-2 font-medium">Total</th>
                    <th className="text-left text-xs text-gray-500 uppercase tracking-wide pb-2 font-medium">Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {displayItems.map((item) => {
                    const isRemoved = item.action_type === 'remove';
                    const isLabor = item.item_type === 'labor';

                    let qty = '';
                    let unitPrice = '';
                    let total = '';

                    if (item.action_type === 'modify_labor') {
                      qty = item.labor_hours != null ? fmtQty(item.labor_hours) + ' hrs' : '—';
                      unitPrice = item.labor_rate != null ? fmt(item.labor_rate) + '/hr' : '—';
                      total = fmt(item.change_amount || 0);
                    } else if (isRemoved) {
                      qty = fmtQty(item.new_quantity || 0);
                      unitPrice = fmt(item.new_unit_price || 0);
                      total = fmt(Math.abs(item.change_amount || 0));
                    } else {
                      qty = fmtQty(item.new_quantity || 0);
                      unitPrice = fmt(item.new_unit_price || 0);
                      total = fmt(item.new_total || Math.abs(item.change_amount || 0));
                    }

                    const actionBadge = item.action_type === 'add'
                      ? <span className="px-1.5 py-0.5 text-xs rounded font-medium bg-green-900/40 text-green-300">Added</span>
                      : item.action_type === 'remove'
                        ? <span className="px-1.5 py-0.5 text-xs rounded font-medium bg-red-900/40 text-red-300">Removed</span>
                        : <span className="px-1.5 py-0.5 text-xs rounded font-medium bg-blue-900/40 text-blue-300">Modified</span>;

                    const typeBadge = isLabor
                      ? <span className="px-1.5 py-0.5 text-xs rounded font-medium bg-amber-900/40 text-amber-300">Labor</span>
                      : <span className="px-1.5 py-0.5 text-xs rounded font-medium bg-gray-700 text-gray-300">Material</span>;

                    return (
                      <tr key={item.id} className={isRemoved ? 'opacity-50' : ''}>
                        <td className={`py-2.5 pr-3 text-gray-200 font-medium ${isRemoved ? 'line-through text-gray-500' : ''}`}>
                          {item.product_name || '—'}
                        </td>
                        <td className="py-2.5 pr-3 text-gray-400 text-xs font-mono">{item.sku || '—'}</td>
                        <td className="py-2.5 text-center">{actionBadge}</td>
                        <td className="py-2.5 text-center">{typeBadge}</td>
                        <td className="py-2.5 text-center text-gray-300">{qty}</td>
                        <td className="py-2.5 text-right text-gray-300">{unitPrice}</td>
                        <td className={`py-2.5 text-right font-medium ${isRemoved ? 'text-red-400' : 'text-gray-200'}`}>{total}</td>
                        <td className="py-2.5 text-gray-400 text-xs">{item.install_location || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Totals footer */}
              <div className="mt-4 flex justify-end">
                <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-4 min-w-[220px]">
                  {displayItems.filter(i => i.item_type !== 'labor').length > 0 && (
                    <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                      <span>Parts</span>
                      <span className={partsTotal >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {partsTotal >= 0 ? '+' : ''}{fmt(partsTotal)}
                      </span>
                    </div>
                  )}
                  {displayItems.filter(i => i.item_type === 'labor').length > 0 && (
                    <div className="flex justify-between text-xs text-gray-400 mb-2">
                      <span>Labor</span>
                      <span className={laborTotal >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {laborTotal >= 0 ? '+' : ''}{fmt(laborTotal)}
                      </span>
                    </div>
                  )}
                  <div className="border-t border-gray-600 pt-2 flex justify-between items-baseline">
                    <span className="text-xs text-gray-500 uppercase tracking-wide font-semibold">CO Net Total</span>
                    <span className={`text-lg font-bold ${netTotal >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {netTotal >= 0 ? '+' : ''}{fmt(netTotal)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-3 text-xs text-gray-600 flex gap-3">
                <span>{allItems.filter(i => i.action_type === 'add').length} added</span>
                <span>{allItems.filter(i => i.action_type === 'remove').length} removed</span>
                <span>{allItems.filter(i => i.action_type.startsWith('modify')).length} modified</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
