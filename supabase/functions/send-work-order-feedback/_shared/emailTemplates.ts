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

  const { data } = await supabase
    .from('company_settings')
    .select('company_name, company_email, company_phone, company_address, company_logo_url')
    .maybeSingle();

  return data || {
    company_name: 'Your Company',
    company_email: 'noreply@example.com',
    company_phone: '',
    company_address: '',
    company_logo_url: ''
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

export function wrapInEmailLayout(
  content: string,
  companyName: string,
  companyEmail: string,
  headerColor = '#3b82f6',
  logoUrl = ''
): string {
  const headerContent = logoUrl
    ? `<img src="${logoUrl}" alt="${companyName}" style="max-height: 64px; max-width: 240px; object-fit: contain; display: block; margin: 0 auto 12px auto;" />`
    : `<h1 style="color: white; margin: 0; font-size: 24px; font-weight: 700;">${companyName}</h1>`;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
        .header { background-color: ${headerColor}; padding: 30px; text-align: center; }
        .header h1 { color: white; margin: 0; font-size: 24px; }
        .content { padding: 30px; }
        .footer { padding: 20px; background-color: #1f2937; text-align: center; }
        .footer p { color: #9ca3af; margin: 5px 0; font-size: 12px; }
        a { color: ${headerColor}; text-decoration: none; }
        .button { display: inline-block; background-color: ${headerColor}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          ${headerContent}
        </div>
        <div class="content">
          ${content}
        </div>
        <div class="footer">
          <p>${companyName}</p>
          ${companyEmail ? `<p>${companyEmail}</p>` : ''}
        </div>
      </div>
    </body>
    </html>
  `;
}