import type { SecurityAgreementDocument, SecurityDraftForm } from './securityOnboarding';

export function escapeAgreementText(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

// Templates may be plain text or legacy HTML. Display readable text without executing
// template markup, handlers, links, external resources or scripts.
export function readableAgreementTerms(terms: string): string {
  if (!/<[a-z][\s\S]*>/i.test(terms)) return terms;
  const parsed = new DOMParser().parseFromString(terms, 'text/html');
  parsed.querySelectorAll('script,style,iframe,object,embed,template,svg,math,link,meta,img').forEach(n => n.remove());
  parsed.querySelectorAll('br').forEach(n => n.replaceWith('\n'));
  parsed.querySelectorAll('p,div,h1,h2,h3,h4,h5,h6,li,tr,section').forEach(n => n.append('\n\n'));
  return parsed.body.textContent?.trim() || '';
}

export function securityAgreementHtml(document: SecurityAgreementDocument, termsText: string,
  form?: Pick<SecurityDraftForm, 'personalInfo' | 'propertyInfo'>, signature?: string | null, signedAt?: string | null,
  billingPreference?: 'monthly' | 'annual'): string {
  const esc = escapeAgreementText;
  const personal = document.personalInfo || form?.personalInfo;
  const property = document.propertyInfo || form?.propertyInfo;
  const money = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v) || 0);
  const signed = !!signedAt && !!signature;
  const safeSignature = signature && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature) ? signature : null;
  const billing = document.billingPreference || billingPreference || 'monthly';
  const annualSubtotal = Number(document.monthly_price) * 12;
  const discountableSubtotal = annualSubtotal - (Number(document.mail_invoice_fee) || 0) * 12;
  const annualDiscount = document.dealer?.annual_discount_type === 'percentage'
    ? Math.round(discountableSubtotal * (Number(document.dealer.annual_discount_percentage) / 100) * 100) / 100
    : Math.min(Number(document.dealer?.annual_discount_flat_amount) || 0, discountableSubtotal);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${esc(document.contract_number)} — Security agreement</title><style>
    @page{size:letter;margin:0.7in}body{font-family:Arial,sans-serif;color:#111;line-height:1.5;max-width:800px;margin:30px auto;padding:0 20px}
    h1{font-size:22px}h2{font-size:17px;margin-top:24px}p,td,th{font-size:11pt}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:8px;border-bottom:1px solid #ddd}
    .terms{white-space:pre-wrap;font-size:11pt;overflow-wrap:anywhere}.signature{max-width:260px;max-height:100px}h2,thead{break-after:avoid}tr,.sign{break-inside:avoid}
    @media print{body{max-width:none;margin:0;padding:0}}</style></head><body>
    <h1>${esc(document.dealer?.company_name || 'Security monitoring')} — Security agreement</h1>
    <p>Agreement ${esc(document.contract_number)} · ${signed ? 'Signed copy' : 'For review — unsigned'}</p>
    <p>Customer: ${esc(personal?.full_name || 'To be completed')}<br>Email: ${esc(personal?.email)}<br>Phone: ${esc(personal?.phone)}</p>
    <p>Service address: ${esc(property?.address_line1 || 'To be completed')}, ${esc(property?.city)} ${esc(property?.state)} ${esc(property?.zip_code)}</p>
    <h2>Services and billing</h2><table><thead><tr><th>Service</th><th>Monthly price</th></tr></thead><tbody>
    ${(document.services || []).map(s => `<tr><td>${esc(s.name)}</td><td>${money(s.monthly_price)}</td></tr>`).join('')}
    <tr><th>Total</th><td>${money(document.monthly_price)}/month</td></tr></tbody></table>
    <p>Initial term: ${esc(document.term_months)} months.<br>Billing preference: ${billing === 'annual' ? 'Annual' : 'Monthly'}.
    ${billing === 'annual' ? `<br>Annual subtotal: ${money(annualSubtotal)}. Discount: ${money(annualDiscount)}. Annual billing amount: ${money(annualSubtotal - annualDiscount)}.` : ''}</p>
    <p>${document.billing_mode === 'mail' ? `Admin-approved mailed invoices. The monthly total includes a ${money(document.mail_invoice_fee)} mailed-invoice fee.` : 'Automatic recurring payments are required for security monitoring.'}
    ${document.payment_display ? `<br>Payment method: ${esc(document.payment_display)}.` : ''}</p>
    ${document.autopay_authorization ? `<h2>Recurring payment authorization</h2><p>${esc(document.autopay_authorization)}</p>` : ''}
    <p>Review the terms below for renewal, cancellation and payment obligations.${document.dealer?.company_email ? ` Contact: ${esc(document.dealer.company_email)}.` : ''}</p>
    <h2>Terms and conditions</h2><div class="terms">${esc(termsText)}</div>
    ${signed && safeSignature ? `<div class="sign"><h2>Customer signature</h2><img class="signature" src="${safeSignature}" alt="Customer signature"><p>Signed: ${esc(new Date(signedAt!).toLocaleString())}</p></div>` : ''}
    </body></html>`;
}

export function downloadSecurityAgreement(html: string, number: string) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${number.replace(/[^a-z0-9_-]/gi, '-')}-agreement.html`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function printSecurityAgreement(html: string) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) throw new Error('Please allow popups to print your agreement.');
  printWindow.document.open(); printWindow.document.write(html); printWindow.document.close();
  printWindow.focus();
  // Wait for embedded signature decoding and fonts before opening the print dialog.
  const images = Array.from(printWindow.document.images);
  void Promise.all(images.map(i => i.decode().catch(() => undefined))).then(() => printWindow.print());
}
