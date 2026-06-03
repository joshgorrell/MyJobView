import { useState, useEffect } from 'react';
import { X, Printer, FileText, List } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { ChangeOrderSummary, SalesOrderFull } from './SalesOrderDetail';

interface OrgBranding {
  name: string;
  logo_url: string | null;
  header_logo_url: string | null;
}

interface CompanyInfo {
  company_name: string | null;
  from_email: string | null;
}

interface CompanyOffice {
  office_name: string;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

interface COLineItem {
  id: string;
  action_type: 'add' | 'remove' | 'modify_quantity' | 'modify_price' | 'modify_labor' | 'modify_modifiers';
  product_name: string;
  product_description: string | null;
  room_name: string | null;
  original_quantity: number | null;
  original_unit_price: number | null;
  original_total: number | null;
  original_labor_total: number | null;
  new_quantity: number;
  new_unit_price: number;
  new_total: number;
  new_labor_total: number;
  change_amount: number;
  item_type: string | null;
  labor_hours: number | null;
  labor_rate: number | null;
  remove_scope: 'parts_only' | 'parts_and_labor' | null;
  modifier_adjustments: Array<{ label: string; field: string; old_value: number; new_value: number }> | null;
  sort_order: number;
}

interface Props {
  co: ChangeOrderSummary;
  order: SalesOrderFull;
  onClose: () => void;
}

type ReportMode = 'detailed' | 'summary';

export function ChangeOrderReportModal({ co, order, onClose }: Props) {
  const [mode, setMode] = useState<ReportMode>('detailed');
  const [lineItems, setLineItems] = useState<COLineItem[]>([]);
  const [org, setOrg] = useState<OrgBranding | null>(null);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [office, setOffice] = useState<CompanyOffice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [lineItemsRes, orgRes, companyRes, officeRes] = await Promise.all([
          supabase
            .from('change_order_line_items')
            .select('id, action_type, product_name, product_description, room_name, original_quantity, original_unit_price, original_total, original_labor_total, new_quantity, new_unit_price, new_total, new_labor_total, change_amount, item_type, labor_hours, labor_rate, remove_scope, modifier_adjustments, sort_order')
            .eq('change_order_id', co.id)
            .order('sort_order'),
          supabase.from('organizations').select('name, logo_url, header_logo_url').limit(1).maybeSingle(),
          supabase.from('company_settings').select('company_name, from_email').limit(1).maybeSingle(),
          supabase.from('company_offices').select('office_name, phone, address_line1, address_line2, city, state, zip').order('display_order').limit(1).maybeSingle(),
        ]);
        setLineItems((lineItemsRes.data || []) as COLineItem[]);
        setOrg(orgRes.data as OrgBranding | null);
        setCompany(companyRes.data as CompanyInfo | null);
        setOffice(officeRes.data as CompanyOffice | null);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [co.id]);

  function fmt(n: number) {
    return '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtSigned(n: number) {
    const prefix = n >= 0 ? '+' : '−';
    return prefix + fmt(n);
  }

  function getDisplayItems() {
    if (mode === 'summary') {
      return lineItems.filter(item => item.action_type === 'add');
    }
    return lineItems.filter(item => {
      if (item.action_type === 'modify_modifiers') return false;
      const isModify = item.action_type === 'modify_quantity' || item.action_type === 'modify_price' || item.action_type === 'modify_labor';
      if (isModify && item.change_amount === 0) return false;
      return true;
    });
  }

  function buildBreakdown(items: COLineItem[]) {
    let partsTotal = 0;
    let laborTotal = 0;

    for (const item of items) {
      if (mode === 'summary') {
        partsTotal += item.new_total || 0;
        laborTotal += item.new_labor_total || 0;
      } else {
        const isRemove = item.action_type === 'remove';
        if (isRemove) {
          if (item.remove_scope === 'parts_only') {
            partsTotal += item.change_amount || 0;
          } else {
            const partChange = -(item.original_total || 0);
            const laborChange = -(item.original_labor_total || 0);
            partsTotal += partChange;
            laborTotal += laborChange;
          }
        } else if (item.action_type === 'modify_labor') {
          laborTotal += item.change_amount || 0;
        } else {
          const isAdd = item.action_type === 'add';
          if (isAdd) {
            partsTotal += item.new_total || 0;
            laborTotal += item.new_labor_total || 0;
          } else {
            partsTotal += item.change_amount || 0;
          }
        }
      }
    }

    return { partsTotal, laborTotal };
  }

  function print() {
    const displayItems = getDisplayItems();
    const { partsTotal, laborTotal } = buildBreakdown(displayItems);

    const logoSrc = org?.header_logo_url || org?.logo_url;
    const orgName = company?.company_name || org?.name || '';
    const coDate = new Date(co.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const customerName = order.contact?.full_name || '';
    const projectName = order.project?.name || '';
    const soNumber = order.order_number;
    const taxAmount = co.tax_amount || 0;
    const coTotal = co.change_amount + taxAmount;

    let addressHtml = '';
    if (office) {
      const parts = [
        office.address_line1,
        office.address_line2,
        [office.city, office.state, office.zip].filter(Boolean).join(', '),
      ].filter(Boolean);
      addressHtml = parts.join('<br>');
    }

    const statusMap: Record<string, string> = {
      draft: 'Draft',
      pending_approval: 'Pending Approval',
      approved: 'Approved',
      rejected: 'Rejected',
      completed: 'Completed',
      transferred: 'Transferred',
    };
    const statusLabel = statusMap[co.status] || co.status;
    const statusColor = co.status === 'approved' ? '#15803d' : co.status === 'rejected' ? '#b91c1c' : co.status === 'pending_approval' ? '#b45309' : '#374151';

    const sections: { label: string; color: string; items: COLineItem[] }[] =
      mode === 'summary'
        ? [{ label: 'Items Added', color: '#15803d', items: displayItems }]
        : [
            { label: 'Additions', color: '#15803d', items: displayItems.filter(i => i.action_type === 'add') },
            { label: 'Removals', color: '#b91c1c', items: displayItems.filter(i => i.action_type === 'remove') },
            {
              label: 'Modifications',
              color: '#b45309',
              items: displayItems.filter(i => i.action_type === 'modify_quantity' || i.action_type === 'modify_price' || i.action_type === 'modify_labor'),
            },
          ].filter(s => s.items.length > 0);

    function itemRowHtml(item: COLineItem) {
      const isAdd = item.action_type === 'add';
      const isRemove = item.action_type === 'remove';
      const isModifyLabor = item.action_type === 'modify_labor';

      let qtyDisplay = '';
      let unitPriceDisplay = '';
      let totalDisplay = '';
      let changeDisplay = '';

      if (isAdd) {
        qtyDisplay = String(item.new_quantity);
        unitPriceDisplay = fmt(item.new_unit_price);
        totalDisplay = fmt(item.new_total);
        changeDisplay = `<span style="color:#15803d">${fmtSigned(item.change_amount)}</span>`;
      } else if (isRemove) {
        qtyDisplay = String(item.original_quantity ?? '—');
        unitPriceDisplay = fmt(item.original_unit_price ?? 0);
        totalDisplay = fmt(item.original_total ?? 0);
        changeDisplay = `<span style="color:#b91c1c">${fmtSigned(item.change_amount)}</span>`;
      } else if (isModifyLabor) {
        qtyDisplay = item.labor_hours != null ? `${item.labor_hours}h` : '—';
        unitPriceDisplay = item.labor_rate != null ? `${fmt(item.labor_rate)}/hr` : '—';
        totalDisplay = fmt(item.new_labor_total);
        changeDisplay = `<span style="color:${item.change_amount >= 0 ? '#15803d' : '#b91c1c'}">${fmtSigned(item.change_amount)}</span>`;
      } else {
        qtyDisplay = `${item.original_quantity ?? '—'} → ${item.new_quantity}`;
        unitPriceDisplay = `${fmt(item.original_unit_price ?? 0)} → ${fmt(item.new_unit_price)}`;
        totalDisplay = fmt(item.new_total);
        changeDisplay = `<span style="color:${item.change_amount >= 0 ? '#15803d' : '#b91c1c'}">${fmtSigned(item.change_amount)}</span>`;
      }

      const laborNote = isAdd && item.new_labor_total > 0
        ? `<div style="font-size:11px;color:#6b7280;margin-top:2px;">Includes ${fmt(item.new_labor_total)} labor</div>`
        : isRemove && item.remove_scope === 'parts_only' && item.original_labor_total && item.original_labor_total > 0
        ? `<div style="font-size:11px;color:#6b7280;margin-top:2px;">Labor retained on project</div>`
        : '';

      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
            <div style="font-weight:500;color:#111;">${item.product_name || '—'}</div>
            ${item.room_name ? `<div style="font-size:11px;color:#6b7280;margin-top:2px;">${item.room_name}</div>` : ''}
            ${laborNote}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;vertical-align:top;white-space:nowrap;">${qtyDisplay}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;vertical-align:top;white-space:nowrap;">${unitPriceDisplay}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;vertical-align:top;white-space:nowrap;">${totalDisplay}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;vertical-align:top;white-space:nowrap;font-weight:600;">${changeDisplay}</td>
        </tr>`;
    }

    const sectionsHtml = sections.map(section => `
      <tr>
        <td colspan="5" style="padding:12px 12px 6px;background:#f9fafb;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:${section.color};">${section.label}</div>
        </td>
      </tr>
      ${section.items.map(itemRowHtml).join('')}
    `).join('');

    const summaryNote = mode === 'summary'
      ? `<p style="margin:20px 0 0;font-size:11px;color:#9ca3af;font-style:italic;">
           This summary reflects additions only. See the detailed report for the full scope of changes.
         </p>`
      : '';

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${mode === 'summary' ? 'Summary' : 'Detailed'} Report — Change Order ${co.change_order_number}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;background:#fff;padding:40px;}
    table{width:100%;border-collapse:collapse;}
    @media print{
      body{padding:20px;}
      .no-print{display:none;}
    }
  </style>
</head>
<body>

  <!-- Header -->
  <table style="margin-bottom:28px;">
    <tr>
      <td style="vertical-align:top;width:50%;">
        ${logoSrc
          ? `<img src="${logoSrc}" alt="${orgName}" style="max-height:56px;max-width:200px;object-fit:contain;display:block;margin-bottom:10px;">`
          : `<div style="font-size:22px;font-weight:700;color:#111;margin-bottom:10px;">${orgName}</div>`
        }
        ${orgName && logoSrc ? `<div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:4px;">${orgName}</div>` : ''}
        ${addressHtml ? `<div style="font-size:12px;color:#6b7280;line-height:1.6;">${addressHtml}</div>` : ''}
        ${office?.phone ? `<div style="font-size:12px;color:#6b7280;margin-top:4px;">${office.phone}</div>` : ''}
        ${company?.from_email ? `<div style="font-size:12px;color:#6b7280;">${company.from_email}</div>` : ''}
      </td>
      <td style="vertical-align:top;text-align:right;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;margin-bottom:4px;">
          ${mode === 'summary' ? 'Change Order Summary' : 'Change Order — Detailed Report'}
        </div>
        <div style="font-size:26px;font-weight:800;color:#111;letter-spacing:-.5px;">${co.change_order_number}</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px;">${coDate}</div>
        <div style="margin-top:8px;">
          <span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;background:${statusColor}18;color:${statusColor};border:1px solid ${statusColor}44;">
            ${statusLabel}
          </span>
        </div>
      </td>
    </tr>
  </table>

  <!-- Divider -->
  <div style="height:2px;background:linear-gradient(to right,#1e40af,#3b82f6,transparent);margin-bottom:20px;border-radius:1px;"></div>

  <!-- Project Info Bar -->
  <table style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:28px;">
    <tr>
      <td style="padding:12px 16px;border-right:1px solid #e2e8f0;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:3px;">Customer</div>
        <div style="font-size:13px;font-weight:600;color:#1e293b;">${customerName}</div>
      </td>
      ${projectName ? `
      <td style="padding:12px 16px;border-right:1px solid #e2e8f0;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:3px;">Project</div>
        <div style="font-size:13px;font-weight:600;color:#1e293b;">${projectName}</div>
      </td>` : ''}
      <td style="padding:12px 16px;border-right:1px solid #e2e8f0;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:3px;">Sales Order</div>
        <div style="font-size:13px;font-weight:600;color:#1e293b;">#${soNumber}</div>
      </td>
      <td style="padding:12px 16px;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:3px;">Description</div>
        <div style="font-size:13px;font-weight:600;color:#1e293b;">${co.title}</div>
      </td>
    </tr>
  </table>

  <!-- Line Items Table -->
  <table>
    <thead>
      <tr style="background:#1e40af;">
        <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#fff;">Description</th>
        <th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#fff;">Qty</th>
        <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#fff;">Unit Price</th>
        <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#fff;">Total</th>
        <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#fff;">Change</th>
      </tr>
    </thead>
    <tbody>
      ${sectionsHtml || `<tr><td colspan="5" style="padding:24px;text-align:center;color:#9ca3af;font-size:13px;">No items to display.</td></tr>`}
    </tbody>
  </table>

  <!-- Cost Breakdown -->
  <table style="margin-top:28px;">
    <tr>
      <td style="width:55%;vertical-align:top;">
        ${co.description ? `
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:6px;">Change Order Notes</div>
          <div style="font-size:12px;color:#374151;line-height:1.6;">${co.description}</div>
        </div>` : ''}
      </td>
      <td style="vertical-align:top;padding-left:24px;">
        <table style="width:100%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:10px 16px;font-size:12px;color:#374151;border-bottom:1px solid #e2e8f0;">Parts Subtotal</td>
            <td style="padding:10px 16px;font-size:12px;color:#374151;text-align:right;border-bottom:1px solid #e2e8f0;font-weight:600;">${partsTotal < 0 ? '−' : ''}${fmt(partsTotal)}</td>
          </tr>
          ${laborTotal !== 0 ? `
          <tr>
            <td style="padding:10px 16px;font-size:12px;color:#374151;border-bottom:1px solid #e2e8f0;">Labor Subtotal</td>
            <td style="padding:10px 16px;font-size:12px;color:#374151;text-align:right;border-bottom:1px solid #e2e8f0;font-weight:600;">${laborTotal < 0 ? '−' : ''}${fmt(laborTotal)}</td>
          </tr>` : ''}
          ${taxAmount !== 0 ? `
          <tr>
            <td style="padding:10px 16px;font-size:12px;color:#374151;border-bottom:1px solid #e2e8f0;">Tax</td>
            <td style="padding:10px 16px;font-size:12px;color:#374151;text-align:right;border-bottom:1px solid #e2e8f0;font-weight:600;">${fmt(taxAmount)}</td>
          </tr>` : ''}
          <tr style="background:#1e40af;">
            <td style="padding:12px 16px;font-size:13px;font-weight:700;color:#fff;">Change Order Total</td>
            <td style="padding:12px 16px;font-size:15px;font-weight:800;color:#fff;text-align:right;">${fmtSigned(coTotal)}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  ${summaryNote}

  <!-- Footer -->
  <div style="margin-top:40px;padding-top:16px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;">
    <div style="font-size:11px;color:#9ca3af;">${orgName}</div>
    <div style="font-size:11px;color:#9ca3af;">${co.change_order_number} &bull; Generated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
  </div>

</body>
</html>`;

    const win = window.open('', '_blank', 'width=960,height=750');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 350);
  }

  const displayItems = getDisplayItems();
  const { partsTotal, laborTotal } = buildBreakdown(displayItems);
  const taxAmount = co.tax_amount || 0;
  const coTotal = co.change_amount + taxAmount;

  const addedItems = displayItems.filter(i => i.action_type === 'add');
  const removedItems = displayItems.filter(i => i.action_type === 'remove');
  const modifiedItems = displayItems.filter(i =>
    i.action_type === 'modify_quantity' || i.action_type === 'modify_price' || i.action_type === 'modify_labor'
  );

  function PreviewRow({ item }: { item: COLineItem }) {
    const isAdd = item.action_type === 'add';
    const isRemove = item.action_type === 'remove';
    const isModifyLabor = item.action_type === 'modify_labor';

    const amountColor = item.change_amount > 0 ? 'text-green-600' : item.change_amount < 0 ? 'text-red-600' : 'text-gray-600';
    const prefix = item.change_amount > 0 ? '+' : item.change_amount < 0 ? '−' : '';

    let qtyDisplay = '';
    let unitDisplay = '';
    let totalDisplay = '';

    if (isAdd) {
      qtyDisplay = String(item.new_quantity);
      unitDisplay = fmt(item.new_unit_price);
      totalDisplay = fmt(item.new_total);
    } else if (isRemove) {
      qtyDisplay = String(item.original_quantity ?? '—');
      unitDisplay = fmt(item.original_unit_price ?? 0);
      totalDisplay = fmt(item.original_total ?? 0);
    } else if (isModifyLabor) {
      qtyDisplay = item.labor_hours != null ? `${item.labor_hours}h` : '—';
      unitDisplay = item.labor_rate != null ? `${fmt(item.labor_rate)}/hr` : '—';
      totalDisplay = fmt(item.new_labor_total);
    } else {
      qtyDisplay = `${item.original_quantity ?? '—'} → ${item.new_quantity}`;
      unitDisplay = `${fmt(item.original_unit_price ?? 0)} → ${fmt(item.new_unit_price)}`;
      totalDisplay = fmt(item.new_total);
    }

    return (
      <tr className="border-b border-gray-100">
        <td className="py-2.5 px-3 text-sm">
          <div className="font-medium text-gray-900">{item.product_name || '—'}</div>
          {item.room_name && <div className="text-xs text-gray-400 mt-0.5">{item.room_name}</div>}
          {isAdd && item.new_labor_total > 0 && (
            <div className="text-xs text-gray-400 mt-0.5">+ {fmt(item.new_labor_total)} labor</div>
          )}
        </td>
        <td className="py-2.5 px-3 text-sm text-center text-gray-600 whitespace-nowrap">{qtyDisplay}</td>
        <td className="py-2.5 px-3 text-sm text-right text-gray-600 whitespace-nowrap">{unitDisplay}</td>
        <td className="py-2.5 px-3 text-sm text-right text-gray-700 font-medium whitespace-nowrap">{totalDisplay}</td>
        <td className={`py-2.5 px-3 text-sm text-right font-semibold whitespace-nowrap ${amountColor}`}>
          {prefix}{fmt(item.change_amount)}
        </td>
      </tr>
    );
  }

  function SectionTable({ label, color, items }: { label: string; color: string; items: COLineItem[] }) {
    if (items.length === 0) return null;
    return (
      <>
        <tr>
          <td colSpan={5} className={`px-3 py-2 text-xs font-bold uppercase tracking-widest ${color}`}>
            {label}
          </td>
        </tr>
        {items.map(item => <PreviewRow key={item.id} item={item} />)}
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0 bg-gray-50">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-blue-600" />
            <div>
              <h2 className="text-base font-semibold text-gray-900">Change Order Report</h2>
              <p className="text-xs text-gray-500">{co.change_order_number} &bull; {co.title}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={print}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Printer className="w-4 h-4" />
              Print / Save PDF
            </button>
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="px-5 py-3 border-b border-gray-200 flex-shrink-0">
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg w-fit">
            <button
              onClick={() => setMode('detailed')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                mode === 'detailed' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              Detailed
            </button>
            <button
              onClick={() => setMode('summary')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                mode === 'summary' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Summary
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            {mode === 'detailed'
              ? 'Shows all additions, removals, and modifications with full cost breakdown.'
              : 'Shows only added items with cost breakdown.'}
          </p>
        </div>

        {/* Preview Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="p-5 space-y-5">

              {/* Header Preview */}
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-bold text-gray-900">{company?.company_name || org?.name || 'Your Company'}</div>
                  {office && (
                    <div className="text-xs text-gray-500 mt-1 leading-relaxed">
                      {[office.address_line1, office.address_line2, [office.city, office.state, office.zip].filter(Boolean).join(', ')].filter(Boolean).join(', ')}
                      {office.phone && <><br />{office.phone}</>}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold uppercase tracking-wider text-gray-400">
                    {mode === 'summary' ? 'Change Order Summary' : 'Change Order — Detailed'}
                  </div>
                  <div className="text-2xl font-extrabold text-gray-900 mt-0.5">{co.change_order_number}</div>
                  <div className="text-xs text-gray-400">{new Date(co.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
                </div>
              </div>

              {/* Divider */}
              <div className="h-0.5 bg-gradient-to-r from-blue-700 via-blue-400 to-transparent rounded" />

              {/* Info Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-200 rounded-lg overflow-hidden border border-gray-200">
                <div className="bg-gray-50 px-3 py-2.5">
                  <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Customer</div>
                  <div className="text-sm font-semibold text-gray-800">{order.contact?.full_name || '—'}</div>
                </div>
                {order.project?.name && (
                  <div className="bg-gray-50 px-3 py-2.5">
                    <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Project</div>
                    <div className="text-sm font-semibold text-gray-800">{order.project.name}</div>
                  </div>
                )}
                <div className="bg-gray-50 px-3 py-2.5">
                  <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Sales Order</div>
                  <div className="text-sm font-semibold text-gray-800">#{order.order_number}</div>
                </div>
                <div className="bg-gray-50 px-3 py-2.5">
                  <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Description</div>
                  <div className="text-sm font-semibold text-gray-800 truncate">{co.title}</div>
                </div>
              </div>

              {/* Line Items */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-blue-700 text-white">
                      <th className="py-2.5 px-3 text-left text-xs font-bold uppercase tracking-wider">Description</th>
                      <th className="py-2.5 px-3 text-center text-xs font-bold uppercase tracking-wider">Qty</th>
                      <th className="py-2.5 px-3 text-right text-xs font-bold uppercase tracking-wider">Unit Price</th>
                      <th className="py-2.5 px-3 text-right text-xs font-bold uppercase tracking-wider">Total</th>
                      <th className="py-2.5 px-3 text-right text-xs font-bold uppercase tracking-wider">Change</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {displayItems.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-10 text-center text-sm text-gray-400">No items to display.</td>
                      </tr>
                    ) : mode === 'summary' ? (
                      displayItems.map(item => <PreviewRow key={item.id} item={item} />)
                    ) : (
                      <>
                        <SectionTable label="Additions" color="text-green-700 bg-green-50" items={addedItems} />
                        <SectionTable label="Removals" color="text-red-700 bg-red-50" items={removedItems} />
                        <SectionTable label="Modifications" color="text-amber-700 bg-amber-50" items={modifiedItems} />
                      </>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Cost Breakdown */}
              <div className="flex justify-end">
                <div className="w-64 border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-50">
                    <div className="flex justify-between items-center px-4 py-2.5 border-b border-gray-200">
                      <span className="text-sm text-gray-600">Parts Subtotal</span>
                      <span className="text-sm font-semibold text-gray-900">{partsTotal < 0 ? '−' : ''}{fmt(partsTotal)}</span>
                    </div>
                    {laborTotal !== 0 && (
                      <div className="flex justify-between items-center px-4 py-2.5 border-b border-gray-200">
                        <span className="text-sm text-gray-600">Labor Subtotal</span>
                        <span className="text-sm font-semibold text-gray-900">{laborTotal < 0 ? '−' : ''}{fmt(laborTotal)}</span>
                      </div>
                    )}
                    {taxAmount !== 0 && (
                      <div className="flex justify-between items-center px-4 py-2.5 border-b border-gray-200">
                        <span className="text-sm text-gray-600">Tax</span>
                        <span className="text-sm font-semibold text-gray-900">{fmt(taxAmount)}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between items-center px-4 py-3 bg-blue-700">
                    <span className="text-sm font-bold text-white">Change Order Total</span>
                    <span className={`text-base font-extrabold ${coTotal >= 0 ? 'text-green-200' : 'text-red-200'}`}>
                      {fmtSigned(coTotal)}
                    </span>
                  </div>
                </div>
              </div>

              {mode === 'summary' && (
                <p className="text-xs text-gray-400 italic text-right">
                  This summary reflects additions only. See the detailed report for the full scope of changes.
                </p>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
