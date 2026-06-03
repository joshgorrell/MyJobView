import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// Returns base64-encoded UTF-8 string from text (for use as email attachment)
function textToBase64(text: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function buildTermsHtml(params: {
  companyName: string;
  customerName: string;
  proposalNumber: string;
  contractContent: string;
}): string {
  const { companyName, customerName, proposalNumber, contractContent } = params;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Terms & Conditions — ${proposalNumber}</title>
<style>
  @page { margin: 0.9in 0.8in; size: letter; }
  body { font-family: Georgia, serif; font-size: 11pt; color: #1a1a1a; line-height: 1.6; margin: 0; padding: 0; }
  .header { border-bottom: 2px solid #1a1a1a; padding-bottom: 12px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; }
  .company { font-size: 16pt; font-weight: bold; }
  .doc-title { font-size: 13pt; font-weight: bold; text-align: right; }
  .meta { font-size: 9pt; color: #555; text-align: right; margin-top: 2px; }
  .content { white-space: pre-wrap; }
  .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #ccc; font-size: 8.5pt; color: #777; text-align: center; }
</style>
</head>
<body>
  <div class="header">
    <div class="company">${companyName}</div>
    <div>
      <div class="doc-title">Terms &amp; Conditions</div>
      <div class="meta">Proposal #${proposalNumber} &bull; Prepared for ${customerName}</div>
    </div>
  </div>
  <div class="content">${contractContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
  <div class="footer">${companyName} &bull; Proposal #${proposalNumber}</div>
</body>
</html>`;
}

function buildPaymentScheduleHtml(params: {
  companyName: string;
  customerName: string;
  proposalNumber: string;
  proposalTotal: number;
  depositType: string;
  depositPercent: number | null;
  depositAmount: number | null;
  depositAmountDue: number | null;
  balancePaymentTerms: string | null;
  progressBillingType: string | null;
  progressInvoiceTerms: string | null;
  billingPhases: Array<{ phase_order: number; title: string; amount_type: string; amount: number; notes: string | null }>;
}): string {
  const {
    companyName, customerName, proposalNumber, proposalTotal,
    depositType, depositPercent, depositAmount, depositAmountDue,
    balancePaymentTerms, progressBillingType, progressInvoiceTerms,
    billingPhases,
  } = params;

  const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  let scheduleRows = '';

  if (depositType === 'custom' && billingPhases.length > 0) {
    for (const phase of billingPhases) {
      const amt = phase.amount_type === 'percentage'
        ? proposalTotal * (phase.amount / 100)
        : phase.amount;
      const label = phase.amount_type === 'percentage'
        ? `${phase.amount}% of contract total`
        : 'Fixed amount';
      scheduleRows += `
        <tr>
          <td>${phase.title}</td>
          <td>${label}</td>
          <td class="money">${fmt(amt)}</td>
          <td>${phase.notes || ''}</td>
        </tr>`;
    }
  } else {
    // Standard deposit + balance
    const depositAmt = depositAmountDue ?? depositAmount ?? (depositPercent ? proposalTotal * (depositPercent / 100) : 0);
    const balanceAmt = proposalTotal - depositAmt;

    if (depositType !== 'none' && depositAmt > 0) {
      const depositLabel = depositType === 'percentage'
        ? `${depositPercent}% deposit at acceptance`
        : depositType === 'parts_total'
        ? 'Parts total at acceptance'
        : 'Deposit at acceptance';
      scheduleRows += `
        <tr>
          <td>${depositLabel}</td>
          <td>Due at acceptance</td>
          <td class="money">${fmt(depositAmt)}</td>
          <td></td>
        </tr>`;
    }

    if (progressBillingType && progressBillingType !== 'none') {
      const terms = progressInvoiceTerms?.replace('_', ' ').toUpperCase() || 'Net 10';
      scheduleRows += `
        <tr>
          <td>Progress billing during project</td>
          <td>${progressBillingType === 'monthly' ? 'Monthly invoices' : 'Per-milestone invoices'} (${terms})</td>
          <td class="money">—</td>
          <td></td>
        </tr>`;
    }

    const balanceTerms = balancePaymentTerms || 'Upon project completion';
    scheduleRows += `
      <tr>
        <td>Balance due</td>
        <td>${balanceTerms}</td>
        <td class="money">${fmt(Math.max(0, balanceAmt))}</td>
        <td></td>
      </tr>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Payment Schedule — ${proposalNumber}</title>
<style>
  @page { margin: 0.9in 0.8in; size: letter; }
  body { font-family: Arial, sans-serif; font-size: 11pt; color: #1a1a1a; line-height: 1.5; margin: 0; padding: 0; }
  .header { border-bottom: 2px solid #1a1a1a; padding-bottom: 12px; margin-bottom: 28px; display: flex; justify-content: space-between; align-items: flex-end; }
  .company { font-size: 16pt; font-weight: bold; }
  .doc-title { font-size: 13pt; font-weight: bold; text-align: right; }
  .meta { font-size: 9pt; color: #555; text-align: right; margin-top: 2px; }
  h2 { font-size: 12pt; margin: 0 0 16px 0; color: #333; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
  th { background: #1a1a1a; color: #fff; padding: 8px 12px; text-align: left; font-size: 10pt; }
  td { padding: 9px 12px; border-bottom: 1px solid #e0e0e0; font-size: 10pt; vertical-align: top; }
  tr:last-child td { border-bottom: none; font-weight: bold; }
  .money { text-align: right; white-space: nowrap; }
  .total-row td { background: #f5f5f5; border-top: 2px solid #1a1a1a; }
  .note { font-size: 9pt; color: #666; margin-top: 8px; }
  .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #ccc; font-size: 8.5pt; color: #777; text-align: center; }
</style>
</head>
<body>
  <div class="header">
    <div class="company">${companyName}</div>
    <div>
      <div class="doc-title">Payment Schedule</div>
      <div class="meta">Proposal #${proposalNumber} &bull; Prepared for ${customerName}</div>
    </div>
  </div>

  <h2>Contract Total: ${fmt(proposalTotal)}</h2>

  <table>
    <thead>
      <tr>
        <th>Milestone</th>
        <th>Terms</th>
        <th class="money">Amount</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>
      ${scheduleRows}
    </tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="2"><strong>Contract Total</strong></td>
        <td class="money"><strong>${fmt(proposalTotal)}</strong></td>
        <td></td>
      </tr>
    </tfoot>
  </table>

  <p class="note">This payment schedule is part of Proposal #${proposalNumber}. All amounts are subject to the terms and conditions of the agreement.</p>
  <div class="footer">${companyName} &bull; Proposal #${proposalNumber}</div>
</body>
</html>`;
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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { proposalId } = await req.json();
    if (!proposalId) {
      return new Response(JSON.stringify({ error: 'proposalId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load proposal with contact and settings
    const { data: proposal, error: proposalError } = await supabase
      .from('proposals')
      .select(`
        id, proposal_number, title, total,
        contacts:contact_id ( contact_name, first_name, last_name ),
        proposal_settings (
          contract_id, deposit_type, deposit_percent, deposit_amount,
          balance_payment_terms, progress_billing_type, progress_invoice_terms
        )
      `)
      .eq('id', proposalId)
      .maybeSingle();

    if (proposalError || !proposal) {
      return new Response(JSON.stringify({ error: 'Proposal not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: settings } = await supabase
      .from('company_settings')
      .select('company_name')
      .maybeSingle();

    const companyName = settings?.company_name || 'Your Company';
    const customerName = proposal.contacts?.contact_name ||
      `${proposal.contacts?.first_name || ''} ${proposal.contacts?.last_name || ''}`.trim() ||
      'Valued Customer';
    const proposalNumber = proposal.proposal_number;
    const proposalTotal = Number(proposal.total) || 0;

    const ps = Array.isArray(proposal.proposal_settings)
      ? proposal.proposal_settings[0]
      : proposal.proposal_settings;

    // Fetch contract terms if linked
    let termsBase64: string | null = null;
    let termsAvailable = false;
    if (ps?.contract_id) {
      const { data: contract } = await supabase
        .from('contracts')
        .select('content')
        .eq('id', ps.contract_id)
        .maybeSingle();

      if (contract?.content) {
        termsAvailable = true;
        const html = buildTermsHtml({
          companyName,
          customerName,
          proposalNumber,
          contractContent: contract.content,
        });
        termsBase64 = textToBase64(html);
      }
    }

    // Fetch billing phases for payment schedule
    const { data: billingPhases } = await supabase
      .from('proposal_billing_phases')
      .select('phase_order, title, amount_type, amount, notes')
      .eq('proposal_id', proposalId)
      .order('phase_order', { ascending: true });

    const depositType = ps?.deposit_type || 'percentage';
    const hasPaymentSchedule = depositType !== 'none' || (billingPhases && billingPhases.length > 0);

    let paymentScheduleBase64: string | null = null;
    if (hasPaymentSchedule) {
      // Fetch deposit_amount_due from proposal itself
      const { data: fullProposal } = await supabase
        .from('proposals')
        .select('deposit_amount_due')
        .eq('id', proposalId)
        .maybeSingle();

      const html = buildPaymentScheduleHtml({
        companyName,
        customerName,
        proposalNumber,
        proposalTotal,
        depositType,
        depositPercent: ps?.deposit_percent ?? null,
        depositAmount: ps?.deposit_amount ?? null,
        depositAmountDue: fullProposal?.deposit_amount_due ?? null,
        balancePaymentTerms: ps?.balance_payment_terms ?? null,
        progressBillingType: ps?.progress_billing_type ?? null,
        progressInvoiceTerms: ps?.progress_invoice_terms ?? null,
        billingPhases: billingPhases || [],
      });
      paymentScheduleBase64 = textToBase64(html);
    }

    // Check for financing PDFs uploaded to this proposal
    const { data: financingFiles } = await supabase
      .from('file_attachments')
      .select('id, file_name, storage_path, file_type')
      .eq('context_type', 'proposal')
      .eq('context_id', proposalId)
      .ilike('file_type', '%pdf%')
      .ilike('file_name', '%financ%');

    const financingAvailable = (financingFiles?.length ?? 0) > 0;
    const financingFiles_ = financingFiles || [];

    return new Response(
      JSON.stringify({
        termsAvailable,
        termsBase64,
        paymentScheduleAvailable: hasPaymentSchedule,
        paymentScheduleBase64,
        financingAvailable,
        financingFiles: financingFiles_.map(f => ({
          id: f.id,
          name: f.file_name,
          storagePath: f.storage_path,
        })),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('generate-proposal-documents error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
