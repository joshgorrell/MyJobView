export interface PrintableInvoice {
  invoice_number: string;
  invoice_title?: string | null;
  invoice_date: string;
  due_date?: string | null;
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  amount_paid: number;
  amount_due: number;
  billing_name?: string | null;
  billing_address_line1?: string | null;
  billing_address_line2?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_zip?: string | null;
  contact_name?: string | null;
  contact_address?: string | null;
  contact_city_state_zip?: string | null;
}

export interface PrintableLineItem {
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  notes?: string | null;
  notes_visible_on_invoice?: boolean;
}

export interface PrintablePayment {
  payment_date: string;
  payment_method: string;
  amount: number;
}

export interface PrintableCompanyInfo {
  company_name?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  phone?: string | null;
  email?: string | null;
  logo_url?: string | null;
}

export function buildPortalInvoicePrintHTML(
  invoice: PrintableInvoice,
  lineItems: PrintableLineItem[],
  payments: PrintablePayment[],
  company: PrintableCompanyInfo,
): string {
  const fmt = (n: number) =>
    (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const statusColors: Record<string, string> = {
    draft: '#6b7280',
    sent: '#3b82f6',
    partial: '#f59e0b',
    paid: '#10b981',
    overdue: '#ef4444',
  };
  const statusColor = statusColors[invoice.status] || '#6b7280';
  const statusLabel = invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1);

  const billName = invoice.billing_name || invoice.contact_name || '';
  const billLine1 = invoice.billing_address_line1 || invoice.contact_address || '';
  const billLine2 = invoice.billing_address_line2 || '';
  const billCityLine = invoice.billing_city
    ? [invoice.billing_city, invoice.billing_state, invoice.billing_zip].filter(Boolean).join(', ')
    : invoice.contact_city_state_zip || '';

  const returnLines: string[] = [];
  if (company.company_name) returnLines.push(`<strong>${company.company_name}</strong>`);
  if (company.address_line1) returnLines.push(company.address_line1);
  if (company.address_line2) returnLines.push(company.address_line2);
  const cityStateZip = [company.city, company.state, company.zip].filter(Boolean).join(', ');
  if (cityStateZip) returnLines.push(cityStateZip);
  if (company.phone) returnLines.push(company.phone);
  else if (company.email) returnLines.push(company.email);

  const itemsHTML = lineItems.map(item => `
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

  const paymentsHTML = payments.length > 0 ? `
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
          ${payments.map(p => `
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

  const remittanceHTML = invoice.amount_due > 0 ? `
    <div style="margin-top:36px;page-break-inside:avoid;">
      <div style="border-top:1px dashed #d1d5db;padding-top:20px;">
        <p style="font-size:10px;color:#9ca3af;text-align:center;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.1em;">Detach and return with payment</p>
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
          <div style="font-size:12px;color:#374151;line-height:1.6;">
            ${returnLines.join('<br>')}
          </div>
          <div style="text-align:right;">
            <p style="font-size:11px;color:#6b7280;margin-bottom:2px;">Invoice #${invoice.invoice_number}</p>
            ${invoice.due_date ? `<p style="font-size:11px;color:#6b7280;margin-bottom:6px;">Due: ${new Date(invoice.due_date).toLocaleDateString()}</p>` : ''}
            <p style="font-size:16px;font-weight:800;color:#111827;">Amount Due: $${fmt(invoice.amount_due)}</p>
          </div>
        </div>
      </div>
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

    <!-- Return address block -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0;">
      <div style="font-size:11px;color:#374151;line-height:1.6;min-width:200px;">
        ${returnLines.join('<br>')}
      </div>
      <div style="text-align:right;">
        ${company.logo_url ? `<img src="${company.logo_url}" alt="Logo" style="height:40px;object-fit:contain;display:block;margin-left:auto;" />` : ''}
      </div>
    </div>

    <!-- Bill-to block (window envelope positioning) -->
    <div style="margin-top:1.4in;margin-bottom:0.4in;">
      <div style="min-height:1in;padding-left:4px;">
        ${billName ? `<p style="font-size:14px;font-weight:700;color:#111827;line-height:1.4;margin-bottom:2px;">${billName}</p>` : ''}
        ${billLine1 ? `<p style="font-size:13px;color:#374151;line-height:1.5;">${billLine1}</p>` : ''}
        ${billLine2 ? `<p style="font-size:13px;color:#374151;line-height:1.5;">${billLine2}</p>` : ''}
        ${billCityLine ? `<p style="font-size:13px;color:#374151;line-height:1.5;">${billCityLine}</p>` : ''}
      </div>
    </div>

    <!-- Invoice header -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;border-bottom:3px solid ${statusColor};margin-bottom:24px;">
      <div>
        <h1 style="font-size:32px;font-weight:800;color:#111827;letter-spacing:-0.5px;margin-bottom:3px;">INVOICE</h1>
        <p style="font-size:14px;color:#6b7280;font-weight:500;">#${invoice.invoice_number}</p>
        ${invoice.invoice_title ? `<p style="font-size:12px;color:#9ca3af;margin-top:2px;">${invoice.invoice_title}</p>` : ''}
        <div style="margin-top:8px;display:inline-block;padding:3px 10px;background:${statusColor}20;border-radius:20px;border:1px solid ${statusColor}40;">
          <span style="font-size:10px;font-weight:700;color:${statusColor};text-transform:uppercase;letter-spacing:0.08em;">${statusLabel}</span>
        </div>
      </div>
      <div style="text-align:right;">
        <table style="font-size:12px;color:#6b7280;border-collapse:collapse;">
          <tr>
            <td style="padding:2px 12px 2px 0;text-align:right;font-weight:600;">Invoice Date:</td>
            <td style="padding:2px 0;color:#111827;">${new Date(invoice.invoice_date).toLocaleDateString()}</td>
          </tr>
          ${invoice.due_date ? `
          <tr>
            <td style="padding:2px 12px 2px 0;text-align:right;font-weight:600;">Due Date:</td>
            <td style="padding:2px 0;color:#111827;">${new Date(invoice.due_date).toLocaleDateString()}</td>
          </tr>` : ''}
          <tr>
            <td style="padding:8px 12px 2px 0;text-align:right;font-weight:700;font-size:13px;color:#111827;">Amount Due:</td>
            <td style="padding:8px 0 2px;font-size:16px;font-weight:800;color:${statusColor};">$${fmt(invoice.amount_due)}</td>
          </tr>
        </table>
      </div>
    </div>

    <!-- Line items -->
    ${lineItems.length > 0 ? `
    <table style="width:100%;border-collapse:collapse;margin-bottom:0;">
      <thead>
        <tr style="background:#f9fafb;border-bottom:2px solid #e5e7eb;">
          <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Description</th>
          <th style="padding:10px 12px;text-align:center;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Qty</th>
          <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Unit Price</th>
          <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;">Amount</th>
        </tr>
      </thead>
      <tbody>${itemsHTML}</tbody>
    </table>
    ` : ''}

    <!-- Totals -->
    <div style="margin-top:20px;display:flex;justify-content:flex-end;">
      <table style="font-size:13px;color:#374151;border-collapse:collapse;min-width:260px;">
        <tr>
          <td style="padding:5px 16px 5px 0;text-align:right;color:#6b7280;">Subtotal</td>
          <td style="padding:5px 0;text-align:right;font-weight:600;">$${fmt(invoice.subtotal)}</td>
        </tr>
        ${invoice.tax > 0 ? `
        <tr>
          <td style="padding:5px 16px 5px 0;text-align:right;color:#6b7280;">Tax</td>
          <td style="padding:5px 0;text-align:right;font-weight:600;">$${fmt(invoice.tax)}</td>
        </tr>` : ''}
        <tr style="border-top:2px solid #e5e7eb;">
          <td style="padding:10px 16px 5px 0;text-align:right;font-weight:700;font-size:14px;">Total</td>
          <td style="padding:10px 0 5px;text-align:right;font-weight:800;font-size:16px;color:#111827;">$${fmt(invoice.total)}</td>
        </tr>
        ${invoice.amount_paid > 0 ? `
        <tr>
          <td style="padding:5px 16px 5px 0;text-align:right;color:#10b981;">Amount Paid</td>
          <td style="padding:5px 0;text-align:right;font-weight:600;color:#10b981;">-$${fmt(invoice.amount_paid)}</td>
        </tr>
        <tr style="border-top:2px solid #e5e7eb;">
          <td style="padding:10px 16px 5px 0;text-align:right;font-weight:700;font-size:14px;">Balance Due</td>
          <td style="padding:10px 0 5px;text-align:right;font-weight:800;font-size:16px;color:${statusColor};">$${fmt(invoice.amount_due)}</td>
        </tr>` : ''}
      </table>
    </div>

    ${paymentsHTML}

    <!-- Make check payable notice -->
    ${invoice.amount_due > 0 ? `
    <div style="margin-top:24px;padding:14px 16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:12px;color:#1e40af;">
      <strong>Paying by check?</strong> Make checks payable to <strong>${company.company_name || 'us'}</strong> and mail to the address shown above.
    </div>` : ''}

    ${remittanceHTML}
  </div>
</body>
</html>`;
}

export function openInvoicePrint(html: string): void {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}
