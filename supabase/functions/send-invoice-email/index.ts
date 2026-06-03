import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { getEmailTemplate, getCompanySettings, replacePlaceholders, convertTextToHtml, wrapInEmailLayout, generateDepositRequestEmail, generatePORequestEmail } from '../_shared/emailTemplates.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// Helper function to build standard invoice email
async function buildStandardInvoiceEmail(
  template: any,
  invoice: any,
  customerName: string,
  settings: any,
  invoiceUrl: string,
  isOverdue: boolean,
  customMessage?: string
) {
  let subject: string;
  let emailBody: string;
  const dueDate = new Date(invoice.due_date);

  if (template) {
    const placeholders = {
      customer_name: customerName,
      company_name: settings.company_name,
      invoice_number: invoice.invoice_number,
      invoice_date: new Date(invoice.invoice_date).toLocaleDateString(),
      amount_due: `$${invoice.amount_due.toFixed(2)}`,
      due_date: dueDate.toLocaleDateString(),
      portal_link: invoiceUrl,
      company_phone: settings.company_phone || '',
      company_email: settings.company_email || '',
      company_address: settings.company_address || '',
    };

    subject = replacePlaceholders(template.subject, placeholders);
    const bodyText = replacePlaceholders(template.body, placeholders);
    const bodyHtml = convertTextToHtml(bodyText);

    if (customMessage) {
      emailBody = `
        <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin-bottom: 20px;">
          <p style="margin: 0; color: #1e40af; font-size: 14px;"><strong>Special Message:</strong> ${customMessage}</p>
        </div>
        ${bodyHtml}
      `;
    } else {
      emailBody = bodyHtml;
    }

    if (isOverdue) {
      emailBody = `
        <div style="background-color: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin-bottom: 20px;">
          <p style="margin: 0; color: #991b1b; font-weight: 600;">⚠️ This invoice is past due. Please submit payment as soon as possible.</p>
        </div>
        ${emailBody}
      `;
      subject = `OVERDUE: ${subject}`;
    }
  } else {
    subject = `${isOverdue ? 'OVERDUE: ' : ''}Invoice #${invoice.invoice_number} from ${settings.company_name}`;
    emailBody = `
      <p>Dear ${customerName},</p>
      ${isOverdue ? `
        <div style="background-color: #fee2e2; border-left: 4px solid #ef4444; padding: 15px; margin-bottom: 20px;">
          <p style="margin: 0; color: #991b1b; font-weight: 600;">⚠️ This invoice is past due. Please submit payment as soon as possible.</p>
        </div>
      ` : `
        <p>Thank you for your business. Please find your invoice <strong>#${invoice.invoice_number}</strong> below.</p>
      `}
      ${customMessage ? `
        <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin-bottom: 20px;">
          <p style="margin: 0; color: #1e40af; font-size: 14px;">${customMessage}</p>
        </div>
      ` : ''}
      <div style="background-color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #e5e7eb;">
        <h3 style="margin-top: 0; color: #1f2937;">Invoice Details</h3>
        <table style="width: 100%; font-size: 14px;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Invoice Number:</td>
            <td style="padding: 8px 0; color: #1f2937; font-weight: 600;">#${invoice.invoice_number}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Invoice Date:</td>
            <td style="padding: 8px 0; color: #1f2937; font-weight: 600;">${new Date(invoice.invoice_date).toLocaleDateString()}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Due Date:</td>
            <td style="padding: 8px 0; color: ${isOverdue ? '#ef4444' : '#1f2937'}; font-weight: 600;">${dueDate.toLocaleDateString()}</td>
          </tr>
          <tr style="border-top: 2px solid #e5e7eb;">
            <td style="padding: 12px 0 0 0; color: #6b7280; font-size: 16px;">Total Amount:</td>
            <td style="padding: 12px 0 0 0; color: #3b82f6; font-weight: 700; font-size: 18px;">$${invoice.total.toFixed(2)}</td>
          </tr>
          ${invoice.amount_paid > 0 ? `
            <tr>
              <td style="padding: 8px 0; color: #10b981;">Amount Paid:</td>
              <td style="padding: 8px 0; color: #10b981; font-weight: 600;">-$${invoice.amount_paid.toFixed(2)}</td>
            </tr>
            <tr style="border-top: 2px solid #e5e7eb;">
              <td style="padding: 12px 0 0 0; color: #ef4444; font-size: 16px; font-weight: 600;">Amount Due:</td>
              <td style="padding: 12px 0 0 0; color: #ef4444; font-weight: 700; font-size: 18px;">$${invoice.amount_due.toFixed(2)}</td>
            </tr>
          ` : ''}
        </table>
      </div>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${invoiceUrl}" class="button">View & Pay Invoice</a>
      </div>
    `;
  }

  return { subject, emailBody };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    const { invoiceId, customMessage, proposalId, skipDuplicateCheck, isDepositInvoice, isPOInvoice, overrideEmail, billingProgressHtml } = await req.json();

    if (!invoiceId) {
      return new Response(JSON.stringify({ error: 'Invoice ID required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: invoice, error: invoiceError } = await supabaseClient
      .from('invoices')
      .select(`
        *,
        contacts:contact_id (
          contact_name,
          first_name,
          last_name,
          email,
          full_name
        )
      `)
      .eq('id', invoiceId)
      .maybeSingle();

    if (invoiceError || !invoice) {
      return new Response(JSON.stringify({ error: 'Invoice not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const settings = await getCompanySettings(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const customerEmail = overrideEmail?.trim() || invoice.contacts?.email;
    if (!customerEmail) {
      return new Response(JSON.stringify({ error: 'Customer email not found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const customerName = invoice.contacts?.full_name ||
      invoice.contacts?.contact_name ||
      `${invoice.contacts?.first_name || ''} ${invoice.contacts?.last_name || ''}`.trim() ||
      'Valued Customer';

    // Check for duplicate notifications if proposalId is provided
    if (proposalId && !skipDuplicateCheck) {
      const { data: recentNotification } = await supabaseClient.rpc(
        'check_duplicate_notification',
        {
          p_proposal_id: proposalId,
          p_notification_type: 'deposit_invoice_sent',
          p_hours_window: 24
        }
      );

      if (recentNotification === true) {
        return new Response(
          JSON.stringify({
            error: 'Duplicate notification',
            message: 'An invoice email was already sent for this proposal within the last 24 hours. Set skipDuplicateCheck=true to send anyway.'
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const portalUrl = settings.portal_url || `${Deno.env.get('SUPABASE_URL')}/portal`;
    const invoiceUrl = `${portalUrl}/invoices/${invoice.id}`;

    const dueDate = new Date(invoice.due_date);
    const isOverdue = dueDate < new Date() && invoice.amount_due > 0;

    let subject: string;
    let emailContent: string;

    // Check if this is a deposit invoice and we should use the beautiful template
    if (isDepositInvoice && proposalId) {
      // Get proposal data for deposit email
      const { data: proposal } = await supabaseClient
        .from('proposals')
        .select('proposal_number, total_amount')
        .eq('id', proposalId)
        .maybeSingle();

      if (proposal) {
        const depositPercentage = proposal.total_amount > 0
          ? Math.round((invoice.amount_due / proposal.total_amount) * 100)
          : 0;

        const emailData = generateDepositRequestEmail({
          customerName,
          proposalNumber: proposal.proposal_number,
          totalAmount: proposal.total_amount,
          depositAmount: invoice.amount_due,
          depositPercentage,
          portalUrl: invoiceUrl,
          companyName: settings.company_name,
          companyEmail: settings.company_email,
          companyPhone: settings.company_phone,
          companyLogoUrl: settings.company_logo_url || '',
        });

        subject = emailData.subject;
        emailContent = emailData.html;
      } else {
        // Fallback if proposal not found
        const template = await getEmailTemplate(
          'invoice_sent',
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );
        const { subject: stdSubject, emailBody } = await buildStandardInvoiceEmail(template, invoice, customerName, settings, invoiceUrl, isOverdue, customMessage);
        subject = stdSubject;
        emailContent = wrapInEmailLayout(emailBody, settings.company_name, settings.company_email, isOverdue ? '#ef4444' : '#3b82f6', settings.company_logo_url || '', settings.offices || []);
      }
    } else if (isPOInvoice && proposalId) {
      // Get proposal data for PO email
      const { data: proposal } = await supabaseClient
        .from('proposals')
        .select('proposal_number, total_amount')
        .eq('id', proposalId)
        .maybeSingle();

      if (proposal) {
        const emailData = generatePORequestEmail({
          customerName,
          proposalNumber: proposal.proposal_number,
          totalAmount: proposal.total_amount,
          portalUrl: `${portalUrl}/proposals/${proposalId}`,
          companyName: settings.company_name,
          companyEmail: settings.company_email,
          companyPhone: settings.company_phone,
          companyLogoUrl: settings.company_logo_url || '',
        });

        subject = emailData.subject;
        emailContent = emailData.html;
      } else {
        // Fallback if proposal not found
        const template = await getEmailTemplate(
          'invoice_sent',
          Deno.env.get('SUPABASE_URL') ?? '',
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );
        const { subject: stdSubject, emailBody } = await buildStandardInvoiceEmail(template, invoice, customerName, settings, invoiceUrl, isOverdue, customMessage);
        subject = stdSubject;
        emailContent = wrapInEmailLayout(emailBody, settings.company_name, settings.company_email, isOverdue ? '#ef4444' : '#3b82f6', settings.company_logo_url || '', settings.offices || []);
      }
    } else {
      // Standard invoice email
      const template = await getEmailTemplate(
        'invoice_sent',
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      const { subject: stdSubject, emailBody } = await buildStandardInvoiceEmail(template, invoice, customerName, settings, invoiceUrl, isOverdue, customMessage);
      subject = stdSubject;
      emailContent = wrapInEmailLayout(emailBody, settings.company_name, settings.company_email, isOverdue ? '#ef4444' : '#3b82f6', settings.company_logo_url || '');
    }

    if (billingProgressHtml) {
      const billingSection = `
        <div style="margin-top:32px;padding:0;">
          <div style="border-top:2px solid #e5e7eb;padding-top:24px;">
            ${billingProgressHtml}
          </div>
        </div>
      `;
      emailContent = emailContent.replace('</body>', billingSection + '</body>');
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.log('Email would be sent to:', customerEmail);
      return new Response(
        JSON.stringify({ success: true, message: 'Email simulation (no API key)' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: settings.from_address,
        to: customerEmail,
        reply_to: settings.reply_to_email,
        subject: subject,
        html: emailContent,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error('Email send failed:', errorText);
      throw new Error('Failed to send email');
    }

    if (invoice.status === 'draft') {
      await supabaseClient
        .from('invoices')
        .update({
          status: 'sent',
        })
        .eq('id', invoiceId);
    }

    // Record notification if proposalId is provided
    if (proposalId) {
      await supabaseClient.rpc('record_proposal_notification', {
        p_proposal_id: proposalId,
        p_notification_type: 'deposit_invoice_sent',
        p_recipient_email: customerEmail,
        p_recipient_name: customerName,
        p_method: 'email',
        p_metadata: {
          invoice_id: invoiceId,
          invoice_number: invoice.invoice_number,
          amount: invoice.amount_due
        }
      });
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Email error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
