// Shared by the browser agreement and the Edge Function blank form.
export interface SecurityDealerBranding {
  company_name?: string | null;
  company_logo_url?: string | null;
  company_email?: string | null;
  website?: string | null;
  phone?: string | null;
  address?: string | null;
  print_accent_color?: string | null;
}
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function securityAgreementBranding(dealer?: SecurityDealerBranding | null) {
  const color = /^#[0-9a-f]{6}$/i.test(dealer?.print_accent_color || '') ? dealer!.print_accent_color! : '#334155';
  const rgb = color.slice(1).match(/../g)!.map(h => parseInt(h, 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  const ink = luminance > 0.179 ? '#111111' : '#ffffff';
  // Only HTTPS logo sources are allowed. Escape attributes as well as text.
  const logo = /^https:\/\/[^\s]+$/i.test(dealer?.company_logo_url || '') ? dealer!.company_logo_url! : null;
  const name = dealer?.company_name?.trim() || 'Security Monitoring Provider';
  const contacts = [dealer?.phone, dealer?.company_email, dealer?.website].filter(v => v?.trim());
  return {
    css: `.dealer-header{text-align:center;border-bottom:3px solid ${color};padding-bottom:12px;margin-bottom:18px;break-inside:avoid}.dealer-logo{display:block;max-width:240px;height:64px;object-fit:contain;margin:0 auto 8px}.dealer-name{font-size:16pt;font-weight:bold;color:#111}.dealer-contact{font-size:9pt;color:#333;overflow-wrap:anywhere}.dealer-header h1{font-size:20pt;color:#111;margin:12px 0 6px}.section-header,.emergency-contact-header{background:${color};color:${ink}}h2{color:#111;border-bottom:2px solid ${color};padding-bottom:4px}`,
    header: `${logo ? `<img class="dealer-logo" src="${esc(logo)}" alt="${esc(name)} logo" onerror="this.style.display='none'">` : ''}<div class="dealer-name">${esc(name)}</div>${dealer?.address ? `<div class="dealer-contact">${esc(dealer.address)}</div>` : ''}${contacts.length ? `<div class="dealer-contact">${contacts.map(esc).join(' · ')}</div>` : ''}<h1>Security Monitoring Agreement</h1>`,
  };
}
