import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { getCompanySettings, wrapInEmailLayout } from '../_shared/emailTemplates.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

function formatPaymentMethod(method: string): string {
  const methods: Record<string, string> = {
    cash: 'Cash',
    check: 'Check',
    credit_card: 'Credit Card',
    debit_card: 'Debit Card',
    ach: 'ACH / Bank Transfer',
    wire: 'Wire Transfer',
    other: 'Other',
  };
  return methods[method] || method;
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

    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();

    const settings = await getCompanySettings(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const portalUrl = settings.portal_url || '';

    // ── Bulk mode ──────────────────────────────────────────────────────────────
    if (body.bulkMode) {
      const {
        contactId,
        contactEmail,
        contactName,
        totalPaid,
        paymentMethod,
        paymentDate,
        referenceNumber,
        bulkSummary,
        customMessage,
      } = body;

      if (!contactEmail) {
        return new Response(
          JSON.stringify({ success: true, message: 'No email address available' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const customerName = contactName || 'Valued Customer';
      const overallRemainingBalance = bulkSummary.reduce(
        (s: number, row: any) => s + (row.newBalance || 0),
        0
      );
      const allPaidInFull = overallRemainingBalance <= 0.005;

      const invoiceRows = (bulkSummary as any[])
        .map(row => `
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 10px 12px; color: #111827; font-weight: 600; font-size: 14px;">#${row.invoiceNumber}</td>
            <td style="padding: 10px 12px; color: #15803d; font-weight: 700; font-size: 14px; text-align: right;">−$${Number(row.amountApplied).toFixed(2)}</td>
            <td style="padding: 10px 12px; text-align: right; font-size: 14px;">
              ${row.newBalance <= 0.005
                ? '<span style="color:#15803d;font-weight:700;">$0.00 ✓</span>'
                : `<span style="color:#b91c1c;font-weight:600;">$${Number(row.newBalance).toFixed(2)}</span>`
              }
            </td>
          </tr>
        `)
        .join('');

      const subject = `Payment Receipt — $${Number(totalPaid).toFixed(2)} Applied`;

      const emailBody = `
        ${customMessage ? `
          <div style="background-color: #f0fdf4; border-left: 4px solid #22c55e; padding: 15px; margin-bottom: 20px;">
            <p style="margin: 0; color: #15803d; font-size: 14px;">${customMessage}</p>
          </div>
        ` : ''}

        <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px;">Dear ${customerName},</p>
        <p style="margin: 0 0 20px 0; color: #374151;">We have received your payment of <strong>$${Number(totalPaid).toFixed(2)}</strong>. Here is how it was applied:</p>

        <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
          <h3 style="margin: 0 0 6px 0; color: #111827; font-size: 16px;">Payment Details</h3>
          <table style="width: 100%; font-size: 14px; border-collapse: collapse; margin-bottom: 4px;">
            <tr>
              <td style="padding: 5px 0; color: #6b7280;">Payment Date:</td>
              <td style="padding: 5px 0; color: #111827; font-weight: 600; text-align: right;">${new Date(paymentDate).toLocaleDateString()}</td>
            </tr>
            <tr>
              <td style="padding: 5px 0; color: #6b7280;">Payment Method:</td>
              <td style="padding: 5px 0; color: #111827; font-weight: 600; text-align: right;">${formatPaymentMethod(paymentMethod)}</td>
            </tr>
            ${referenceNumber ? `
            <tr>
              <td style="padding: 5px 0; color: #6b7280;">Reference #:</td>
              <td style="padding: 5px 0; color: #111827; font-weight: 600; text-align: right;">${referenceNumber}</td>
            </tr>
            ` : ''}
          </table>
        </div>

        <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin-bottom: 20px;">
          <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
            <thead>
              <tr style="background: #f9fafb; border-bottom: 1px solid #e5e7eb;">
                <th style="padding: 10px 12px; text-align: left; font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Invoice</th>
                <th style="padding: 10px 12px; text-align: right; font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Applied</th>
                <th style="padding: 10px 12px; text-align: right; font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Balance</th>
              </tr>
            </thead>
            <tbody>
              ${invoiceRows}
            </tbody>
            <tfoot>
              <tr style="background: #f9fafb; border-top: 2px solid #e5e7eb;">
                <td style="padding: 12px; font-weight: 700; color: #111827; font-size: 14px;">Total</td>
                <td style="padding: 12px; font-weight: 700; color: #15803d; font-size: 15px; text-align: right;">−$${Number(totalPaid).toFixed(2)}</td>
                <td style="padding: 12px; font-weight: 700; font-size: 15px; text-align: right; color: ${allPaidInFull ? '#15803d' : '#b91c1c'};">$${overallRemainingBalance.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        ${allPaidInFull ? `
          <div style="background: #f0fdf4; border: 2px solid #22c55e; border-radius: 8px; padding: 16px; text-align: center; margin-bottom: 20px;">
            <p style="margin: 0; color: #15803d; font-size: 16px; font-weight: 700;">All invoices paid in full — Thank You!</p>
          </div>
        ` : `
          <p style="color: #b91c1c; font-weight: 600; margin-bottom: 20px;">Remaining balance across all invoices: $${overallRemainingBalance.toFixed(2)}</p>
        `}

        ${portalUrl ? `
          <div style="text-align: center; margin: 28px 0;">
            <a href="${portalUrl}/invoices" style="display: inline-block; padding: 13px 30px; background-color: #10b981; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">View Invoices in Portal</a>
          </div>
          <p style="font-size: 13px; color: #6b7280; text-align: center;">You can view and download all invoices from your portal at any time.</p>
        ` : ''}
      `;

      const emailContent = wrapInEmailLayout(emailBody, settings.company_name, settings.company_email, '#10b981', settings.company_logo_url || '', settings.offices || []);

      const resendApiKey = Deno.env.get('RESEND_API_KEY');
      if (!resendApiKey) {
        console.log('Bulk receipt would be sent to:', contactEmail);
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
          to: contactEmail,
          reply_to: settings.reply_to_email,
          subject,
          html: emailContent,
        }),
      });

      if (!emailResponse.ok) {
        const errText = await emailResponse.text();
        console.error('Bulk receipt email failed:', errText);
        throw new Error('Failed to send email');
      }

      await serviceClient.from('activity_feed').insert({
        type: 'payment_receipt_sent',
        title: 'Bulk Payment Receipt Sent',
        description: `Bulk payment receipt sent to ${contactEmail} — $${Number(totalPaid).toFixed(2)} applied to ${(bulkSummary as any[]).length} invoice(s)`,
        related_id: contactId,
        metadata: {
          contact_id: contactId,
          total_paid: totalPaid,
          invoice_count: (bulkSummary as any[]).length,
          email: contactEmail,
          bulk: true,
        },
      }).catch(() => {});

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Single payment mode (original behaviour) ───────────────────────────────
    const { paymentId, includePdf, customMessage } = body;

    if (!paymentId) {
      return new Response(JSON.stringify({ error: 'Payment ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: payment, error: paymentError } = await serviceClient
      .from('payments')
      .select(`
        *,
        invoice:invoices (
          id,
          invoice_number,
          invoice_date,
          due_date,
          total,
          amount_paid,
          amount_due,
          status,
          contact:contacts (
            id,
            email,
            first_name,
            last_name,
            full_name,
            contact_name
          )
        )
      `)
      .eq('id', paymentId)
      .maybeSingle();

    if (paymentError) throw paymentError;
    if (!payment) throw new Error('Payment not found');

    const contact = payment.invoice?.contact;
    const customerEmail = contact?.email;

    if (!customerEmail) {
      return new Response(
        JSON.stringify({ success: true, message: 'No email address available' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const invoicePortalUrl = portalUrl ? `${portalUrl}/invoices/${payment.invoice.id}` : '';
    const customerName = contact.full_name || contact.contact_name ||
      `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Valued Customer';

    const previousBalance = (payment.invoice.amount_paid - payment.amount) + payment.invoice.amount_due;
    const newBalance = payment.invoice.amount_due;
    const isPaidInFull = newBalance <= 0;

    const subject = `Payment Receipt - Invoice #${payment.invoice.invoice_number}`;

    const emailBody = `
      ${customMessage ? `
        <div style="background-color: #f0fdf4; border-left: 4px solid #22c55e; padding: 15px; margin-bottom: 20px;">
          <p style="margin: 0; color: #15803d; font-size: 14px;">${customMessage}</p>
        </div>
      ` : ''}
      <p style="margin: 0 0 20px 0; color: #374151; font-size: 16px;">Dear ${customerName},</p>
      <p style="margin: 0 0 20px 0; color: #374151;">We have received your payment. Here is your receipt:</p>

      <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
        <h3 style="margin: 0 0 16px 0; color: #111827; font-size: 16px;">Payment Details</h3>
        <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
          <tr>
            <td style="padding: 6px 0; color: #6b7280;">Invoice Number:</td>
            <td style="padding: 6px 0; color: #111827; font-weight: 600; text-align: right;">#${payment.invoice.invoice_number}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #6b7280;">Payment Date:</td>
            <td style="padding: 6px 0; color: #111827; font-weight: 600; text-align: right;">${new Date(payment.payment_date).toLocaleDateString()}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #6b7280;">Payment Method:</td>
            <td style="padding: 6px 0; color: #111827; font-weight: 600; text-align: right;">${formatPaymentMethod(payment.payment_method)}</td>
          </tr>
          ${payment.reference_number ? `
          <tr>
            <td style="padding: 6px 0; color: #6b7280;">Reference #:</td>
            <td style="padding: 6px 0; color: #111827; font-weight: 600; text-align: right;">${payment.reference_number}</td>
          </tr>
          ` : ''}
        </table>
      </div>

      <div style="background: #fef9c3; border: 1px solid #fbbf24; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
        <h3 style="margin: 0 0 14px 0; color: #78350f; font-size: 15px;">Balance Summary</h3>
        <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
          <tr>
            <td style="padding: 5px 0; color: #92400e;">Previous Balance:</td>
            <td style="padding: 5px 0; color: #92400e; font-weight: 600; text-align: right;">$${previousBalance.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding: 5px 0; color: #15803d; font-weight: 700; font-size: 16px;">Payment Received:</td>
            <td style="padding: 5px 0; color: #15803d; font-weight: 700; font-size: 16px; text-align: right;">−$${payment.amount.toFixed(2)}</td>
          </tr>
          <tr style="border-top: 2px solid #fbbf24;">
            <td style="padding: 10px 0 4px 0; color: ${isPaidInFull ? '#15803d' : '#b91c1c'}; font-weight: 700; font-size: 16px;">New Balance:</td>
            <td style="padding: 10px 0 4px 0; color: ${isPaidInFull ? '#15803d' : '#b91c1c'}; font-weight: 700; font-size: 18px; text-align: right;">$${newBalance.toFixed(2)}</td>
          </tr>
        </table>
      </div>

      ${isPaidInFull ? `
        <div style="background: #f0fdf4; border: 2px solid #22c55e; border-radius: 8px; padding: 16px; text-align: center; margin-bottom: 20px;">
          <p style="margin: 0; color: #15803d; font-size: 16px; font-weight: 700;">Invoice Paid in Full — Thank You!</p>
        </div>
      ` : `
        <p style="color: #b91c1c; font-weight: 600; margin-bottom: 20px;">Remaining Balance: $${newBalance.toFixed(2)}</p>
      `}

      ${invoicePortalUrl ? `
        <div style="text-align: center; margin: 28px 0;">
          <a href="${invoicePortalUrl}" style="display: inline-block; padding: 13px 30px; background-color: #10b981; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 15px;">View Invoice in Portal</a>
        </div>
        <p style="font-size: 13px; color: #6b7280; text-align: center;">You can also download a PDF copy from your portal at any time.</p>
      ` : ''}
    `;

    const emailContent = wrapInEmailLayout(emailBody, settings.company_name, settings.company_email, '#10b981', settings.company_logo_url || '', settings.offices || []);

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.log('Email would be sent to:', customerEmail, '| includePdf:', includePdf);
      return new Response(
        JSON.stringify({ success: true, message: 'Email simulation (no API key)' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const emailPayload: Record<string, any> = {
      from: settings.from_address,
      to: customerEmail,
      reply_to: settings.reply_to_email,
      subject,
      html: emailContent,
    };

    if (includePdf) {
      try {
        const pdfResponse = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-invoice-pdf`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({ invoiceId: payment.invoice.id }),
          }
        );

        if (pdfResponse.ok) {
          const pdfBuffer = await pdfResponse.arrayBuffer();
          const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfBuffer)));
          emailPayload.attachments = [{
            filename: `Invoice-${payment.invoice.invoice_number}.pdf`,
            content: pdfBase64,
            type: 'application/pdf',
          }];
        } else {
          console.warn('PDF generation failed, sending without attachment');
        }
      } catch (pdfErr) {
        console.warn('PDF attachment error:', pdfErr);
      }
    }

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailPayload),
    });

    if (!emailResponse.ok) {
      const errText = await emailResponse.text();
      console.error('Email send failed:', errText);
      throw new Error('Failed to send email');
    }

    await serviceClient.from('activity_feed').insert({
      type: 'payment_receipt_sent',
      title: 'Payment Receipt Sent',
      description: `Payment receipt sent to ${customerEmail} for invoice #${payment.invoice.invoice_number}`,
      related_id: payment.invoice.id,
      metadata: {
        payment_id: paymentId,
        invoice_id: payment.invoice.id,
        amount: payment.amount,
        email: customerEmail,
        included_pdf: includePdf || false,
      },
    }).catch(() => {});

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error sending payment receipt:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
