import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const url = new URL(req.url);
    const contractId = url.searchParams.get('contractId');

    if (!contractId) {
      return new Response(JSON.stringify({ error: 'Contract ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
        },
      }
    );

    const { data: contract, error: contractError } = await supabaseClient
      .from('security_contracts')
      .select(`
        *,
        contact:contacts(*),
        template:security_contract_templates(*)
      `)
      .eq('id', contractId)
      .maybeSingle();

    if (contractError || !contract) {
      return new Response(JSON.stringify({ error: 'Contract not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Security Monitoring Contract - ${contract.contract_number}</title>
        <style>
          @page {
            size: letter;
            margin: 0.75in;
          }
          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }
          body {
            font-family: Arial, sans-serif;
            font-size: 11pt;
            line-height: 1.4;
            color: #000;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 15px;
            border-bottom: 3px solid #2563eb;
          }
          .header h1 {
            font-size: 24pt;
            color: #2563eb;
            margin-bottom: 8px;
          }
          .header .contract-number {
            font-size: 14pt;
            color: #666;
            margin-bottom: 4px;
          }
          .header .template-name {
            font-size: 12pt;
            color: #888;
          }
          .section {
            margin-bottom: 25px;
            page-break-inside: avoid;
          }
          .section-header {
            background: #2563eb;
            color: white;
            padding: 10px 15px;
            font-size: 14pt;
            font-weight: bold;
            margin-bottom: 15px;
            border-radius: 4px;
          }
          .field-group {
            margin-bottom: 15px;
          }
          .field-label {
            font-weight: bold;
            margin-bottom: 5px;
            color: #333;
          }
          .field-value {
            padding: 8px;
            background: #f9fafb;
            border: 1px solid #d1d5db;
            border-radius: 4px;
            min-height: 35px;
          }
          .field-input {
            border-bottom: 1px solid #000;
            min-height: 35px;
            margin-top: 5px;
          }
          .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
          }
          .grid-thirds {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 15px;
          }
          .full-width {
            grid-column: 1 / -1;
          }
          .emergency-contact {
            border: 2px solid #e5e7eb;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 15px;
            background: #fafafa;
          }
          .emergency-contact-header {
            background: #2563eb;
            color: white;
            padding: 6px 12px;
            border-radius: 4px;
            margin-bottom: 12px;
            font-weight: bold;
          }
          .checkbox-field {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-top: 10px;
          }
          .checkbox {
            width: 20px;
            height: 20px;
            border: 2px solid #000;
            display: inline-block;
          }
          .note {
            background: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 12px;
            margin-top: 15px;
            font-size: 10pt;
            color: #78350f;
          }
          .signature-section {
            margin-top: 40px;
            page-break-before: always;
          }
          .signature-line {
            border-bottom: 2px solid #000;
            margin-top: 60px;
            margin-bottom: 8px;
          }
          .signature-label {
            font-size: 10pt;
            color: #666;
          }
          .terms {
            font-size: 9pt;
            line-height: 1.6;
            color: #333;
            margin-top: 20px;
            padding: 15px;
            border: 1px solid #d1d5db;
            border-radius: 4px;
          }
          .page-break {
            page-break-after: always;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Security Monitoring Contract</h1>
          <div class="contract-number">Contract Number: ${contract.contract_number}</div>
          <div class="template-name">${contract.template?.name || 'Standard Contract'}</div>
        </div>

        <div class="section">
          <div class="section-header">Customer Information</div>
          <div class="grid">
            <div class="field-group full-width">
              <div class="field-label">Full Name</div>
              <div class="field-value">${contract.contact?.full_name || ''}</div>
            </div>
            <div class="field-group">
              <div class="field-label">Email Address</div>
              <div class="field-value">${contract.contact?.email || ''}</div>
            </div>
            <div class="field-group">
              <div class="field-label">Phone Number</div>
              <div class="field-value">${contract.contact?.phone || ''}</div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-header">Property Address (Where System is Installed)</div>
          <div class="field-group">
            <div class="field-label">Street Address</div>
            <div class="field-input"></div>
          </div>
          <div class="grid-thirds">
            <div class="field-group">
              <div class="field-label">City</div>
              <div class="field-input"></div>
            </div>
            <div class="field-group">
              <div class="field-label">State</div>
              <div class="field-input"></div>
            </div>
            <div class="field-group">
              <div class="field-label">ZIP Code</div>
              <div class="field-input"></div>
            </div>
          </div>
        </div>

        <div class="page-break"></div>

        <div class="section">
          <div class="section-header">Emergency Call List (Minimum 2 Contacts Required)</div>
          <div class="note">
            <strong>Important:</strong> In the event of an alarm, the monitoring station will call these contacts in the order listed.
            Each contact must have a unique password/codeword for verification.
          </div>

          ${[1, 2, 3, 4].map(num => `
            <div class="emergency-contact">
              <div class="emergency-contact-header">Contact ${num} - Priority ${num}</div>
              <div class="grid">
                <div class="field-group">
                  <div class="field-label">Full Name</div>
                  <div class="field-input"></div>
                </div>
                <div class="field-group">
                  <div class="field-label">Phone Number</div>
                  <div class="field-input"></div>
                </div>
                <div class="field-group full-width">
                  <div class="field-label">Password / Codeword (Must be unique)</div>
                  <div class="field-input"></div>
                </div>
              </div>
              <div class="checkbox-field">
                <span class="checkbox"></span>
                <span>This contact can authorize entry to the property</span>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="page-break"></div>

        <div class="section">
          <div class="section-header">Payment Information</div>
          <div class="note">
            Monthly monitoring fee: $${(contract.monthly_price || 0).toFixed(2)}<br>
            An invoice will be generated monthly and automatically charged to your payment method on file.
          </div>

          <div class="field-group" style="margin-top: 20px;">
            <div class="field-label">Payment Method (Check One)</div>
            <div class="checkbox-field">
              <span class="checkbox"></span>
              <span>Credit Card (Visa, Mastercard, Amex)</span>
            </div>
            <div class="checkbox-field">
              <span class="checkbox"></span>
              <span>ACH / Bank Account (Direct bank transfer)</span>
            </div>
          </div>

          <div class="field-group" style="margin-top: 20px;">
            <div class="field-label">Last 4 Digits of Card/Account (For records only)</div>
            <div class="field-input"></div>
          </div>
        </div>

        <div class="signature-section">
          <div class="section-header">Terms and Conditions</div>
          <div class="terms">
            ${contract.template?.content || 'Standard terms and conditions apply.'}
          </div>

          <div style="margin-top: 50px;">
            <div class="field-label">By signing below, I acknowledge that I have read and agree to the terms and conditions of this security monitoring agreement.</div>

            <div class="grid" style="margin-top: 40px;">
              <div>
                <div class="signature-line"></div>
                <div class="signature-label">Customer Signature</div>
              </div>
              <div>
                <div class="signature-line"></div>
                <div class="signature-label">Date</div>
              </div>
            </div>

            <div class="grid" style="margin-top: 40px;">
              <div>
                <div class="signature-line"></div>
                <div class="signature-label">Printed Name</div>
              </div>
              <div>
                <div class="signature-line"></div>
                <div class="signature-label">Email Address</div>
              </div>
            </div>
          </div>
        </div>

        <div style="margin-top: 50px; padding-top: 20px; border-top: 2px solid #e5e7eb; text-align: center; font-size: 9pt; color: #666;">
          <p>For office use only - Staff will enter this information into the system</p>
          <p style="margin-top: 8px;">Contract Number: ${contract.contract_number} | Date Created: ${new Date(contract.created_at).toLocaleDateString()}</p>
        </div>
      </body>
      </html>
    `;

    return new Response(html, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/html',
      },
    });

  } catch (error) {
    console.error('Error generating blank contract form:', error);
    return new Response(JSON.stringify({
      error: 'Failed to generate blank contract form',
      details: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});