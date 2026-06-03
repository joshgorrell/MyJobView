import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

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

    const { invoiceId, billingProgressHtml } = await req.json();

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
          phone,
          address,
          city,
          state,
          zip
        ),
        invoice_line_items (
          id,
          description,
          quantity,
          unit_price,
          amount
        ),
        payments (
          id,
          amount,
          payment_date,
          payment_method
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

    const { data: settings } = await supabaseClient
      .from('company_settings')
      .select('*')
      .maybeSingle();

    const { data: coLinks } = await supabaseClient
      .from('invoice_change_order_links')
      .select('change_order_id, amount_billed, fully_billed')
      .eq('invoice_id', invoiceId);

    const hasPartialCO = (coLinks || []).some((link: any) => link.fully_billed === false);

    let html = generateInvoiceHTML(invoice, settings, hasPartialCO);
    if (billingProgressHtml) {
      html = html.replace('</body>', billingProgressHtml + '</body>');
    }

    return new Response(html, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/html',
      },
    });

  } catch (error) {
    console.error('PDF generation error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function generateInvoiceHTML(invoice: any, settings: any, hasPartialCO = false): string {
  const contact = invoice.contacts;
  const items = invoice.invoice_line_items || [];
  const payments = invoice.payments || [];

  const customerName = contact?.contact_name || 
    `${contact?.first_name || ''} ${contact?.last_name || ''}`.trim() || 
    'Valued Customer';

  const customerAddress = contact?.address ? 
    `${contact.address}<br>${contact.city}, ${contact.state} ${contact.zip}` : 
    '';

  const statusColors = {
    draft: '#6b7280',
    sent: '#3b82f6',
    partial: '#f59e0b',
    paid: '#10b981',
    overdue: '#ef4444',
    cancelled: '#6b7280',
  };

  const statusColor = statusColors[invoice.status as keyof typeof statusColors] || '#6b7280';

  const itemsHTML = items.map((item: any) => `
    <tr style="border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 12px; font-size: 13px; color: #374151;">
        ${item.description}
      </td>
      <td style="text-align: center; padding: 12px; font-size: 13px; color: #374151;">${item.quantity}</td>
      <td style="text-align: right; padding: 12px; font-size: 13px; color: #374151;">$${item.unit_price.toFixed(2)}</td>
      <td style="text-align: right; padding: 12px; font-size: 13px; color: #374151; font-weight: 500;">$${item.amount.toFixed(2)}</td>
    </tr>
  `).join('');

  const partialBillingNoteHTML = hasPartialCO ? `
    <div style="margin-top: 12px; padding: 10px 14px; background-color: #fafafa; border: 1px solid #e5e7eb; border-radius: 6px; display: inline-block;">
      <p style="margin: 0; font-size: 12px; color: #9ca3af; font-style: italic;">This invoice reflects a partial billing. Additional charges may follow.</p>
    </div>
  ` : '';

  const paymentsHTML = payments.length > 0 ? `
    <div style="margin-top: 30px; padding: 20px; background-color: #f0fdf4; border: 1px solid #86efac; border-radius: 8px;">
      <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #166534; font-weight: 600;">Payment History</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 2px solid #86efac;">
            <th style="text-align: left; padding: 8px; font-size: 12px; color: #166534; font-weight: 600;">Date</th>
            <th style="text-align: left; padding: 8px; font-size: 12px; color: #166534; font-weight: 600;">Method</th>
            <th style="text-align: right; padding: 8px; font-size: 12px; color: #166534; font-weight: 600;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${payments.map((payment: any) => `
            <tr>
              <td style="padding: 8px; font-size: 13px; color: #166534;">${new Date(payment.payment_date).toLocaleDateString()}</td>
              <td style="padding: 8px; font-size: 13px; color: #166534;">${payment.payment_method}</td>
              <td style="text-align: right; padding: 8px; font-size: 13px; color: #166534; font-weight: 500;">$${payment.amount.toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  ` : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Invoice ${invoice.invoice_number}</title>
      <style>
        @media print {
          body { margin: 0; }
          .page-break { page-break-before: always; }
        }
      </style>
    </head>
    <body style="font-family: Arial, sans-serif; margin: 0; padding: 40px; background: white; color: #1f2937;">
      <div style="max-width: 800px; margin: 0 auto;">
        
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 40px; padding-bottom: 20px; border-bottom: 3px solid ${statusColor};">
          <div>
            <h1 style="margin: 0 0 8px 0; font-size: 32px; color: #1f2937;">INVOICE</h1>
            <p style="margin: 0; font-size: 18px; color: #6b7280; font-weight: 500;">#${invoice.invoice_number}</p>
            <div style="margin-top: 12px; display: inline-block; padding: 6px 12px; background-color: ${statusColor}20; border-radius: 20px;">
              <span style="font-size: 13px; font-weight: 600; color: ${statusColor}; text-transform: uppercase;">${invoice.status}</span>
            </div>
          </div>
          <div style="text-align: right;">
            <h2 style="margin: 0 0 4px 0; font-size: 20px; color: #1f2937;">${settings?.company_name || 'Your Company'}</h2>
            ${settings?.company_address ? `<p style="margin: 2px 0; font-size: 13px; color: #6b7280;">${settings.company_address}</p>` : ''}
            ${settings?.company_phone ? `<p style="margin: 2px 0; font-size: 13px; color: #6b7280;">Phone: ${settings.company_phone}</p>` : ''}
            ${settings?.company_email ? `<p style="margin: 2px 0; font-size: 13px; color: #6b7280;">Email: ${settings.company_email}</p>` : ''}
          </div>
        </div>

        <!-- Customer Info -->
        <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <div>
              <h3 style="margin: 0 0 12px 0; font-size: 14px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Bill To</h3>
              <p style="margin: 0; font-size: 16px; font-weight: 600; color: #1f2937;">${customerName}</p>
              ${customerAddress ? `<p style="margin: 8px 0 0 0; font-size: 13px; color: #6b7280;">${customerAddress}</p>` : ''}
              ${contact?.email ? `<p style="margin: 4px 0 0 0; font-size: 13px; color: #6b7280;">${contact.email}</p>` : ''}
              ${contact?.phone ? `<p style="margin: 4px 0 0 0; font-size: 13px; color: #6b7280;">${contact.phone}</p>` : ''}
            </div>
            <div>
              <h3 style="margin: 0 0 12px 0; font-size: 14px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px;">Invoice Details</h3>
              <p style="margin: 0 0 6px 0; font-size: 13px; color: #374151;"><strong>Invoice Date:</strong> ${new Date(invoice.invoice_date).toLocaleDateString()}</p>
              <p style="margin: 0 0 6px 0; font-size: 13px; color: #374151;"><strong>Due Date:</strong> ${new Date(invoice.due_date).toLocaleDateString()}</p>
              ${invoice.project_id ? `<p style="margin: 0 0 6px 0; font-size: 13px; color: #374151;"><strong>Project:</strong> Linked</p>` : ''}
            </div>
          </div>
        </div>

        ${invoice.notes ? `
          <div style="margin-bottom: 30px; padding: 16px; background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 4px;">
            <h3 style="margin: 0 0 8px 0; font-size: 14px; color: #92400e; font-weight: 600;">Notes</h3>
            <p style="margin: 0; font-size: 13px; color: #78350f; white-space: pre-wrap;">${invoice.notes}</p>
          </div>
        ` : ''}

        <!-- Line Items -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
          <thead>
            <tr style="background-color: #f9fafb;">
              <th style="text-align: left; padding: 12px; font-size: 12px; color: #6b7280; font-weight: 600; border-bottom: 2px solid #e5e7eb;">Description</th>
              <th style="text-align: center; padding: 12px; font-size: 12px; color: #6b7280; font-weight: 600; width: 80px; border-bottom: 2px solid #e5e7eb;">Qty</th>
              <th style="text-align: right; padding: 12px; font-size: 12px; color: #6b7280; font-weight: 600; width: 100px; border-bottom: 2px solid #e5e7eb;">Price</th>
              <th style="text-align: right; padding: 12px; font-size: 12px; color: #6b7280; font-weight: 600; width: 100px; border-bottom: 2px solid #e5e7eb;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>

        ${partialBillingNoteHTML}

        <!-- Totals -->
        <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #e5e7eb;">
          <div style="display: flex; justify-content: flex-end;">
            <div style="width: 350px;">
              <div style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 15px; color: #374151;">
                <span>Subtotal:</span>
                <span style="font-weight: 500;">$${invoice.subtotal.toFixed(2)}</span>
              </div>
              ${invoice.tax_amount > 0 ? `
                <div style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 15px; color: #374151;">
                  <span>Tax:</span>
                  <span style="font-weight: 500;">$${invoice.tax_amount.toFixed(2)}</span>
                </div>
              ` : ''}
              <div style="display: flex; justify-content: space-between; padding: 12px 0; margin-top: 8px; border-top: 2px solid #3b82f6; font-size: 18px; font-weight: 700; color: #1f2937;">
                <span>Total:</span>
                <span style="color: #3b82f6;">$${invoice.total.toFixed(2)}</span>
              </div>
              ${invoice.amount_paid > 0 ? `
                <div style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 15px; color: #10b981;">
                  <span>Amount Paid:</span>
                  <span style="font-weight: 500;">-$${invoice.amount_paid.toFixed(2)}</span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 12px 0; margin-top: 8px; border-top: 2px solid #ef4444; font-size: 18px; font-weight: 700; color: #ef4444;">
                  <span>Amount Due:</span>
                  <span>$${invoice.amount_due.toFixed(2)}</span>
                </div>
              ` : ''}
            </div>
          </div>
        </div>

        ${paymentsHTML}

        <!-- Payment Instructions -->
        ${invoice.amount_due > 0 ? `
          <div style="margin-top: 40px; padding: 20px; background-color: #eff6ff; border: 1px solid #93c5fd; border-radius: 8px;">
            <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #1e40af; font-weight: 600;">Payment Instructions</h3>
            <p style="margin: 0; font-size: 13px; color: #1e40af; line-height: 1.6;">
              Please make payment by ${new Date(invoice.due_date).toLocaleDateString()}.<br>
              ${settings?.payment_instructions || 'Contact us for payment options.'}
            </p>
          </div>
        ` : ''}

        <!-- Footer -->
        <div style="margin-top: 50px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #9ca3af; font-size: 11px;">
          <p style="margin: 0;">Thank you for your business!</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
