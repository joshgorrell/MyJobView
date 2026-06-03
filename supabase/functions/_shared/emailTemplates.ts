import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

export async function getEmailTemplate(templateType: string, supabaseUrl: string, supabaseKey: string) {
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('email_templates')
    .select('subject, body')
    .eq('template_type', templateType)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) {
    console.error(`Failed to load email template: ${templateType}`, error);
    return null;
  }

  return data;
}

export async function getCompanySettings(supabaseUrl: string, supabaseKey: string) {
  const supabase = createClient(supabaseUrl, supabaseKey);

  const [settingsRes, officesRes] = await Promise.all([
    supabase
      .from('company_settings')
      .select('company_name, company_email, company_logo_url, from_email, from_name, reply_to_email, app_url, portal_url')
      .maybeSingle(),
    supabase
      .from('company_offices')
      .select('office_name, phone')
      .not('phone', 'is', null)
      .neq('phone', '')
      .order('display_order'),
  ]);

  const offices: { office_name: string; phone: string }[] = officesRes.data || [];
  const s = settingsRes.data;
  const companyName = s?.company_name || 'Electronic Life';

  const fromEmail = s?.from_email || s?.company_email || 'noreply@electroniclife.com';
  const fromName = s?.from_name || companyName;

  return {
    company_name: companyName,
    company_email: s?.company_email || s?.from_email || '',
    company_logo_url: s?.company_logo_url || 'https://bqtsuzvuvqvgidipbsis.supabase.co/storage/v1/object/public/company_logo/logo-1770649712721.png',
    from_email: fromEmail,
    from_name: fromName,
    from_address: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
    reply_to_email: s?.reply_to_email || fromEmail,
    app_url: s?.app_url || null,
    portal_url: s?.portal_url || null,
    offices,
  };
}

export function replacePlaceholders(text: string, placeholders: Record<string, string>): string {
  let result = text;

  for (const [key, value] of Object.entries(placeholders)) {
    const placeholder = `{{${key}}}`;
    result = result.split(placeholder).join(value || '');
  }

  return result;
}

export function convertTextToHtml(text: string): string {
  let html = text;

  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/^• (.+)$/gm, '<li>$1</li>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/^☐ (.+)$/gm, '<li style="list-style-type: none;">☐ $1</li>');
  html = html.replace(/^✓ (.+)$/gm, '<li style="list-style-type: none;">✓ $1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul style="margin: 10px 0; padding-left: 20px;">$&</ul>');
  html = html.replace(/\n\n/g, '</p><p style="margin: 15px 0; line-height: 1.6;">');
  html = '<p style="margin: 15px 0; line-height: 1.6;">' + html + '</p>';

  return html;
}

const EL_LOGO_FALLBACK = 'https://bqtsuzvuvqvgidipbsis.supabase.co/storage/v1/object/public/company_logo/logo-1770649712721.png';

export function wrapInEmailLayout(
  content: string,
  companyName: string,
  companyEmail: string,
  headerColor = '#0e7490',
  logoUrl = '',
  offices: { office_name: string; phone: string }[] = []
): string {
  const resolvedLogoUrl = logoUrl || EL_LOGO_FALLBACK;

  const phonesHtml = offices.length > 0
    ? `<table cellpadding="0" cellspacing="0" style="margin:10px auto 0 auto;border-collapse:collapse;">
        ${offices.map(o =>
          `<tr>
            <td style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;padding:3px 12px 3px 0;text-align:right;white-space:nowrap;">${o.office_name}</td>
            <td style="color:#94a3b8;font-size:12px;padding:3px 0;text-align:left;white-space:nowrap;">${o.phone}</td>
          </tr>`
        ).join('')}
      </table>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
      <tr><td style="background:#111827;border-radius:16px 16px 0 0;padding:32px 40px 28px;text-align:center;border-bottom:3px solid ${headerColor};">
        <img src="${resolvedLogoUrl}" alt="${companyName}" style="max-height:64px;max-width:220px;object-fit:contain;display:block;margin:0 auto;" />
      </td></tr>
      <tr><td style="background:#ffffff;padding:40px 40px 32px;color:#374151;font-size:16px;line-height:1.7;">
        ${content}
      </td></tr>
      <tr><td style="background:#1e293b;border-radius:0 0 16px 16px;padding:28px 40px;text-align:center;border-top:1px solid #334155;">
        <img src="${resolvedLogoUrl}" alt="${companyName}" style="max-height:36px;max-width:140px;object-fit:contain;display:block;margin:0 auto 12px auto;opacity:0.85;" />
        <p style="color:#06b6d4;font-size:14px;font-weight:700;margin:0 0 4px 0;letter-spacing:0.3px;">${companyName}</p>
        ${companyEmail ? `<p style="color:#94a3b8;font-size:13px;margin:0 0 2px 0;">${companyEmail}</p>` : ''}
        ${phonesHtml}
        <p style="color:#475569;font-size:12px;margin:12px 0 0 0;line-height:1.6;">You received this email because you recently worked with us.<br>Thank you for your business.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// Beautiful PO Request Email Template with Purple Gradient
export function generatePORequestEmail(params: {
  customerName: string;
  proposalNumber: string;
  totalAmount: number;
  portalUrl: string;
  companyName: string;
  companyEmail: string;
  companyPhone?: string;
  companyLogoUrl?: string;
}): { subject: string; html: string } {
  const subject = `Purchase Order Required - Proposal ${params.proposalNumber}`;

  const logoBlock = params.companyLogoUrl
    ? `<img src="${params.companyLogoUrl}" alt="${params.companyName}" style="max-height: 60px; max-width: 200px; object-fit: contain; display: block; margin: 0 auto 16px auto;" />`
    : '';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; background-color: #f3f4f6;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
              <!-- Purple Gradient Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%); padding: 48px 32px; text-align: center;">
                  ${logoBlock}
                  <h1 style="color: #ffffff; margin: 0 0 12px 0; font-size: 32px; font-weight: 700; letter-spacing: -0.5px;">Purchase Order Required</h1>
                  <p style="color: #e9d5ff; margin: 0; font-size: 16px;">Proposal ${params.proposalNumber}</p>
                </td>
              </tr>

              <!-- Main Content -->
              <tr>
                <td style="padding: 40px 32px;">
                  <p style="color: #111827; font-size: 18px; margin: 0 0 24px 0; line-height: 1.6;">
                    Hi ${params.customerName},
                  </p>

                  <p style="color: #374151; font-size: 16px; margin: 0 0 24px 0; line-height: 1.7;">
                    Great news! Your proposal has been approved and we're ready to move forward. The next step is to provide us with your company's Purchase Order (PO).
                  </p>

                  <!-- Proposal Amount Box -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%); border-radius: 12px; padding: 24px; margin: 0 0 32px 0;">
                    <tr>
                      <td>
                        <p style="color: #6b7280; font-size: 14px; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Total Project Amount</p>
                        <p style="color: #111827; font-size: 36px; font-weight: 700; margin: 0; letter-spacing: -1px;">$${params.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </td>
                    </tr>
                  </table>

                  <!-- Instructions -->
                  <div style="background-color: #faf5ff; border-left: 4px solid #a855f7; padding: 20px; border-radius: 8px; margin: 0 0 32px 0;">
                    <h3 style="color: #7c3aed; font-size: 16px; margin: 0 0 12px 0; font-weight: 600;">How to Submit Your PO:</h3>
                    <ol style="color: #6b7280; font-size: 15px; margin: 0; padding-left: 20px; line-height: 1.8;">
                      <li style="margin-bottom: 8px;">Upload your PO document through the customer portal</li>
                      <li style="margin-bottom: 8px;">Email it directly to ${params.companyEmail}</li>
                      <li style="margin-bottom: 8px;">Fax it to us${params.companyPhone ? ` at ${params.companyPhone}` : ''}</li>
                    </ol>
                  </div>

                  <!-- CTA Button -->
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" style="padding: 8px 0 32px 0;">
                        <a href="${params.portalUrl}" style="display: inline-block; background: linear-gradient(135deg, #8b5cf6 0%, #a855f7 100%); color: #ffffff; text-decoration: none; padding: 18px 48px; border-radius: 12px; font-weight: 600; font-size: 18px; box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);">
                          Upload Purchase Order
                        </a>
                      </td>
                    </tr>
                  </table>

                  <p style="color: #6b7280; font-size: 15px; margin: 0 0 16px 0; line-height: 1.7;">
                    Once we receive your PO, we'll schedule the project and get started right away!
                  </p>

                  <p style="color: #374151; font-size: 15px; margin: 0; line-height: 1.7;">
                    If you have any questions, please don't hesitate to reach out.
                  </p>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color: #111827; padding: 32px; text-align: center;">
                  <p style="color: #ffffff; font-size: 16px; font-weight: 600; margin: 0 0 8px 0;">${params.companyName}</p>
                  <p style="color: #9ca3af; font-size: 14px; margin: 0 0 4px 0;">${params.companyEmail}</p>
                  ${params.companyPhone ? `<p style="color: #9ca3af; font-size: 14px; margin: 0;">${params.companyPhone}</p>` : ''}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  return { subject, html };
}

// Beautiful Deposit Payment Email Template with Green Gradient
export function generateDepositRequestEmail(params: {
  customerName: string;
  proposalNumber: string;
  totalAmount: number;
  depositAmount: number;
  depositPercentage?: number;
  portalUrl: string;
  companyName: string;
  companyEmail: string;
  companyPhone?: string;
  companyLogoUrl?: string;
}): { subject: string; html: string } {
  const subject = `Deposit Payment Required - Proposal ${params.proposalNumber}`;

  const logoBlock = params.companyLogoUrl
    ? `<img src="${params.companyLogoUrl}" alt="${params.companyName}" style="max-height: 60px; max-width: 200px; object-fit: contain; display: block; margin: 0 auto 16px auto;" />`
    : '';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; background-color: #f3f4f6;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
        <tr>
          <td align="center">
            <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
              <!-- Green Gradient Header -->
              <tr>
                <td style="background: linear-gradient(135deg, #059669 0%, #10b981 50%, #34d399 100%); padding: 48px 32px; text-align: center;">
                  ${logoBlock}
                  <h1 style="color: #ffffff; margin: 0 0 12px 0; font-size: 32px; font-weight: 700; letter-spacing: -0.5px;">Deposit Payment Required</h1>
                  <p style="color: #d1fae5; margin: 0; font-size: 16px;">Proposal ${params.proposalNumber}</p>
                </td>
              </tr>

              <!-- Main Content -->
              <tr>
                <td style="padding: 40px 32px;">
                  <p style="color: #111827; font-size: 18px; margin: 0 0 24px 0; line-height: 1.6;">
                    Hi ${params.customerName},
                  </p>

                  <p style="color: #374151; font-size: 16px; margin: 0 0 24px 0; line-height: 1.7;">
                    Congratulations! Your proposal has been approved. To secure your project and begin scheduling, we require a deposit payment.
                  </p>

                  <!-- Payment Amount Boxes -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin: 0 0 32px 0;">
                    <tr>
                      <td width="48%" style="vertical-align: top;">
                        <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-radius: 12px; padding: 20px;">
                          <tr>
                            <td>
                              <p style="color: #065f46; font-size: 13px; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Deposit Required${params.depositPercentage ? ` (${params.depositPercentage}%)` : ''}</p>
                              <p style="color: #047857; font-size: 32px; font-weight: 700; margin: 0; letter-spacing: -1px;">$${params.depositAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </td>
                          </tr>
                        </table>
                      </td>
                      <td width="4%"></td>
                      <td width="48%" style="vertical-align: top;">
                        <table width="100%" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%); border-radius: 12px; padding: 20px;">
                          <tr>
                            <td>
                              <p style="color: #6b7280; font-size: 13px; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Total Project</p>
                              <p style="color: #111827; font-size: 32px; font-weight: 700; margin: 0; letter-spacing: -1px;">$${params.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>

                  <!-- Payment Options -->
                  <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 20px; border-radius: 8px; margin: 0 0 32px 0;">
                    <h3 style="color: #065f46; font-size: 16px; margin: 0 0 12px 0; font-weight: 600;">Payment Options:</h3>
                    <ul style="color: #6b7280; font-size: 15px; margin: 0; padding-left: 20px; line-height: 1.8;">
                      <li style="margin-bottom: 8px;"><strong style="color: #047857;">Online Payment:</strong> Pay securely through the customer portal</li>
                      <li style="margin-bottom: 8px;"><strong style="color: #047857;">Check:</strong> Mail to our office address</li>
                      <li style="margin-bottom: 8px;"><strong style="color: #047857;">Wire Transfer:</strong> Contact us for banking details</li>
                      <li><strong style="color: #047857;">Credit Card:</strong> Call us at ${params.companyPhone || 'our office'}</li>
                    </ul>
                  </div>

                  <!-- CTA Button -->
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="center" style="padding: 8px 0 32px 0;">
                        <a href="${params.portalUrl}" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #34d399 100%); color: #ffffff; text-decoration: none; padding: 18px 48px; border-radius: 12px; font-weight: 600; font-size: 18px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);">
                          Pay Deposit Now
                        </a>
                      </td>
                    </tr>
                  </table>

                  <!-- Security Note -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; border-radius: 8px; padding: 16px; margin: 0 0 24px 0;">
                    <tr>
                      <td>
                        <p style="color: #6b7280; font-size: 13px; margin: 0; text-align: center; line-height: 1.6;">
                          🔒 Your payment is secure and encrypted. We never store your complete payment information.
                        </p>
                      </td>
                    </tr>
                  </table>

                  <p style="color: #6b7280; font-size: 15px; margin: 0 0 16px 0; line-height: 1.7;">
                    Once we receive your deposit, we'll schedule your project and send you a confirmation with the next steps.
                  </p>

                  <p style="color: #374151; font-size: 15px; margin: 0; line-height: 1.7;">
                    Questions about payment? We're here to help!
                  </p>
                </td>
              </tr>

              <!-- Footer -->
              <tr>
                <td style="background-color: #111827; padding: 32px; text-align: center;">
                  <p style="color: #ffffff; font-size: 16px; font-weight: 600; margin: 0 0 8px 0;">${params.companyName}</p>
                  <p style="color: #9ca3af; font-size: 14px; margin: 0 0 4px 0;">${params.companyEmail}</p>
                  ${params.companyPhone ? `<p style="color: #9ca3af; font-size: 14px; margin: 0;">${params.companyPhone}</p>` : ''}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  return { subject, html };
}
