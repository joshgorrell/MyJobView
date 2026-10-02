import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]!));
}
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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: authHeader } },
        auth: {
          persistSession: false,
        },
      }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let contract: any;
    if (!contractId) {
      if (req.method !== 'POST') return new Response(JSON.stringify({error:'Choose a template and services'}), {status:400,headers:{...corsHeaders,'Content-Type':'application/json'}});
      const payload = await req.json();
      const {data,error} = await supabaseClient.rpc('staff_security_onboarding', {p_action:'print_form',p_id:null,p_payload:payload});
      if (error) return new Response(JSON.stringify({error:error.message}), {status:403,headers:{...corsHeaders,'Content-Type':'application/json'}});
      contract = data;
    } else {
      const {data:review,error} = await supabaseClient.rpc('staff_security_onboarding', {p_action:'get',p_id:contractId});
      if (error) return new Response(JSON.stringify({error:'Security onboarding permission required'}), {status:403,headers:{...corsHeaders,'Content-Type':'application/json'}});
      contract = review.document;
    }

    const termsText = (contract.template?.contract_terms || 'Terms and conditions unavailable.').replaceAll('[term]', `${contract.term_months || ''} months`);

    const annualBase = Math.max(0, Number(contract.monthly_price || 0) - Number(contract.mail_invoice_fee || 0)) * 12;
    const annualDiscount = contract.dealer?.annual_discount_type === 'percentage'
      ? Math.round(annualBase * Number(contract.dealer.annual_discount_percentage || 0)) / 100
      : Math.min(annualBase, Number(contract.dealer?.annual_discount_flat_amount || 0));
    const annualTotal = annualBase - annualDiscount + Number(contract.mail_invoice_fee || 0) * 12;
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Security Monitoring Contract - ${escapeHtml(contract.contract_number || 'Assigned when entered online')}</title>
<style>
  @page {
    size: letter;
    margin: 0.5in;
  }
  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }
  html, body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11pt;
    line-height: 1.4;
    color: #000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @media screen {
    body {
      background: #e5e7eb;
      padding: 20px;
    }
    .page {
      background: white;
      max-width: 8.5in;
      margin: 0 auto 20px;
      padding: 0.75in;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
  }
  @media print {
    body { background: white; }
    .page {
      page-break-after: always;
    }
    .page:last-child {
      page-break-after: auto;
    }
    .no-print { display: none !important; }
    .field-group, .emergency-contact {
      page-break-inside: avoid;
    }
    .section-header {
      page-break-after: avoid;
    }
    .signature-block {
      page-break-inside: avoid;
    }
  }

  .page {
    position: relative;
  }

  .print-btn {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 1000;
    background: #2563eb;
    color: white;
    border: none;
    padding: 12px 24px;
    font-size: 14px;
    font-weight: bold;
    border-radius: 6px;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  }
  .print-btn:hover { background: #1d4ed8; }

  .header {
    text-align: center;
    margin-bottom: 24px;
    padding-bottom: 12px;
    border-bottom: 3px solid #2563eb;
  }
  .header h1 {
    font-size: 22pt;
    color: #2563eb;
    margin-bottom: 6px;
  }
  .header .contract-number {
    font-size: 13pt;
    color: #555;
    margin-bottom: 3px;
  }
  .header .template-name {
    font-size: 11pt;
    color: #777;
  }

  .section {
    margin-bottom: 20px;
  }
  .section-header {
    background: #2563eb;
    color: white;
    padding: 8px 14px;
    font-size: 13pt;
    font-weight: bold;
    margin-bottom: 12px;
    border-radius: 4px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .field-group {
    margin-bottom: 12px;
  }
  .field-label {
    font-weight: bold;
    margin-bottom: 4px;
    color: #333;
    font-size: 10pt;
  }
  .field-value {
    padding: 6px 8px;
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    min-height: 32px;
    font-size: 11pt;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .field-input {
    border-bottom: 1px solid #000;
    min-height: 32px;
    margin-top: 4px;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .grid-thirds {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 12px;
  }
  .full-width {
    grid-column: 1 / -1;
  }

  .emergency-contact {
    border: 2px solid #d1d5db;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 12px;
    background: #f9fafb;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .emergency-contact-header {
    background: #2563eb;
    color: white;
    padding: 5px 10px;
    border-radius: 4px;
    margin-bottom: 10px;
    font-weight: bold;
    font-size: 11pt;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .checkbox-field {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }
  .checkbox {
    width: 18px;
    height: 18px;
    border: 2px solid #000;
    display: inline-block;
    flex-shrink: 0;
    border-radius: 2px;
  }
  .note {
    background: #fef3c7;
    border-left: 4px solid #f59e0b;
    padding: 10px 12px;
    margin-top: 10px;
    margin-bottom: 10px;
    font-size: 10pt;
    color: #78350f;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .terms {
    font-size: 9pt;
    line-height: 1.55;
    color: #333;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    margin-top: 12px;
    padding: 12px;
    border: 1px solid #d1d5db;
    border-radius: 4px;
  }
  .signature-block {
    margin-top: 30px;
  }
  .signature-line {
    border-bottom: 2px solid #000;
    margin-top: 50px;
    margin-bottom: 6px;
  }
  .signature-label {
    font-size: 10pt;
    color: #555;
  }
  .footer {
    margin-top: 30px;
    padding-top: 15px;
    border-top: 2px solid #e5e7eb;
    text-align: center;
    font-size: 9pt;
    color: #666;
  }
  .account-type-row {
    display: flex;
    gap: 30px;
    margin-top: 8px;
  }
  @media print {
    body { background: white; font-size: 10pt; }
    .header { margin-bottom: 12px; padding-bottom: 8px; }
    .header h1 { font-size: 18pt; }
    .section { margin-bottom: 8px; }
    .section-header { padding: 6px 10px; font-size: 11pt; margin-bottom: 8px; }
    .field-group { margin-bottom: 8px; }
    .field-input { min-height: 28px; }
    .field-value { min-height: 28px; background: white; }
    .grid, .grid-thirds { gap: 8px; }
    .emergency-contact { padding: 8px; margin-bottom: 6px; background: white; }
    .emergency-contact .field-group { margin-bottom: 4px; }
    .emergency-contact .field-label { margin-bottom: 2px; }
    .emergency-contact .field-input { min-height: 24px; }
    .emergency-contact-header { padding: 4px 8px; margin-bottom: 4px; font-size: 10pt; }
    .note { padding: 8px 10px; margin: 6px 0; font-size: 9pt; }
    .checkbox-field { margin-top: 6px; }
    .signature-block { margin-top: 20px; }
  }
</style>
</head>
<body>

<button class="print-btn no-print" onclick="window.print()">Print Form</button>

<div class="page">
  <div class="header">
    <h1>Security Monitoring Contract</h1>
    <div class="contract-number">Contract Number: ${escapeHtml(contract.contract_number || 'Assigned when entered online')}</div>
    <div class="template-name">${escapeHtml(contract.dealer?.company_name || '')} ${escapeHtml(contract.dealer?.company_email || '')}</div>
    <div class="template-name">${escapeHtml(contract.template?.name || 'Standard Contract')}</div>
  </div>

  <p style="margin-bottom:16px">Complete this form by hand and return it to our staff. We will enter your information through web onboarding. Printing this form does not create an account or complete onboarding.</p>
  <div class="section">
    <div class="section-header">Customer Information</div>
    <div class="grid">
      <div class="field-group full-width">
        <div class="field-label">Full Name</div>
        <div class="field-value">${escapeHtml(contract.personalInfo?.full_name || contract.contact?.full_name || '')}</div>
      </div>
      <div class="field-group">
        <div class="field-label">Email Address</div>
        <div class="field-value">${escapeHtml(contract.personalInfo?.email || contract.contact?.email || '')}</div>
      </div>
      <div class="field-group">
        <div class="field-label">Phone Number</div>
        <div class="field-value">${escapeHtml(contract.personalInfo?.phone || contract.contact?.phone || '')}</div>
      </div>
    </div>
    <div class="field-group">
      <div class="field-label">Account Type (Check One)</div>
      <div class="account-type-row">
        <div class="checkbox-field">
          <span class="checkbox"></span>
          <span>Residential</span>
        </div>
        <div class="checkbox-field">
          <span class="checkbox"></span>
          <span>Commercial</span>
        </div>
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

  <div class="section">
    <div class="section-header">Monitoring</div>
    <div class="checkbox-field">
      <span class="checkbox"></span>
      <span>Yes, this system calls a monitoring center when the alarm goes off</span>
      <span class="checkbox"></span><span>No</span>
    </div>
    <div class="grid" style="margin-top:10px">
      <div class="field-group"><div class="field-label">Monitoring Account Number (if applicable)</div><div class="field-input"></div></div>
      <div class="field-group"><div class="field-label">Installation Date</div><div class="field-input"></div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-header">Account Services (Check All That Apply)</div>
    <div class="grid-thirds">
      <div class="checkbox-field">
        <span class="checkbox"></span>
        <span>Dial-Up</span>
      </div>
      <div class="checkbox-field">
        <span class="checkbox"></span>
        <span>Telguard</span>
      </div>
      <div class="checkbox-field">
        <span class="checkbox"></span>
        <span>Alarmnet</span>
      </div>
      <div class="checkbox-field">
        <span class="checkbox"></span>
        <span>Alarm.com</span>
      </div>
      <div class="checkbox-field">
        <span class="checkbox"></span>
        <span>Video / CCTV</span>
      </div>
      <div class="checkbox-field">
        <span class="checkbox"></span>
        <span>Access Control</span>
      </div>
    </div>
    <div class="field-group" style="margin-top:12px"><div class="field-label">Service Account Numbers (label each service)</div><div class="field-input"></div><div class="field-input"></div></div>
  </div>
</div>

<div class="page">
  <div class="section">
    <div class="section-header">Emergency Call List (Minimum 2 Contacts Required)</div>
    <div class="note">
      <strong>Important:</strong> In the event of an alarm, the monitoring station will call these contacts in the order listed. Each contact must have a unique password/codeword for verification. Attach additional contacts in priority order if needed (up to 10 total).
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
    </div>`).join('')}
  </div>
</div>

<div class="page">
  <div class="section">
    <div class="section-header">Payment Information</div>
    <div class="note">
      Monthly monitoring fee: $${Number(contract.monthly_price || 0).toFixed(2)}<br>
      Initial term: ${escapeHtml(contract.term_months)} months. Renewal: ${escapeHtml(contract.renewal_term_months)} month(s). Cancellation notice: ${escapeHtml(contract.cancellation_notice_days)} days.<br>
      Services: ${escapeHtml((contract.services || []).map((s:any) => s.name).join(', '))}
    </div>
    <div class="field-group"><div class="field-label">Billing Frequency (Check One)</div>
      <div class="checkbox-field"><span class="checkbox"></span><span>Monthly</span></div>
      ${contract.dealer?.annual_billing_enabled ? `<div class="checkbox-field"><span class="checkbox"></span><span>Annual</span></div><p>Annual discount: ${escapeHtml(contract.dealer.annual_discount_type === 'percentage' ? `${contract.dealer.annual_discount_percentage || 0}%` : `$${Number(contract.dealer.annual_discount_flat_amount || 0).toFixed(2)}`)}. Annual monitoring total before tax: $${annualTotal.toFixed(2)}.</p>` : ''}
    </div>
    ${contract.billing_mode === 'mail' ? `<p class="note">Admin-approved mailed invoices. The monthly price above includes the $${Number(contract.mail_invoice_fee || 0).toFixed(2)} mailing fee.</p>` : `
    <div class="field-group" style="margin-top: 16px;">
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
    <div class="field-group" style="margin-top: 16px;">
      <div class="field-label">Last 4 Digits of Card/Account (For records only)</div>
      <div class="field-input"></div>
    </div>
    <p class="note">Staff will securely enroll and verify your selected payment method when entering this form. Last four digits alone do not enroll a payment method. Do not write full card or bank account numbers on this form.</p>
    <div class="field-label">Recurring Payment Authorization</div>
    <p class="terms">${escapeHtml(contract.autopay_authorization || '')}</p>
    <div class="checkbox-field"><span class="checkbox"></span><span>I agree to this recurring-payment authorization.</span></div>`}
  </div>

  <div class="section">
    <div class="section-header">Terms and Conditions</div>
    <div class="terms">${escapeHtml(termsText)}</div>
  </div>
</div>

<div class="page">
  <div class="section">
    <div class="section-header">Customer Acknowledgment and Signature</div>
    <div class="field-label" style="margin-top: 20px;">
      By signing below, I acknowledge that I have read and agree to the terms and conditions of this security monitoring agreement. I confirm that the information provided above is accurate and complete.
    </div>
    <div class="signature-block">
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

  <div class="footer">
    <p>For office use only - Staff will enter this information into the system</p>
    <p style="margin-top: 6px;">Contract Number: ${escapeHtml(contract.contract_number || 'Assigned when entered online')} | Blank form for handwritten completion</p>
  </div>
</div>

<script>
  window.onload = function() { setTimeout(function() { window.print(); }, 500); };
</script>
</body>
</html>`;

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
