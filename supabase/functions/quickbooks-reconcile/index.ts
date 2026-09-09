import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import {
  corsHeaders,
  getSupabaseAdmin,
  getConnection,
  qboRequest,
} from '../_shared/qbo-client.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401);

    const authClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const { data: profile } = await authClient
      .from('profiles')
      .select('organization_id, role')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile?.organization_id) return jsonResponse({ error: 'No organization found' }, 403);
    if (profile.role !== 'admin') return jsonResponse({ error: 'Only administrators can reconcile QuickBooks' }, 403);

    const supabase = getSupabaseAdmin();
    const connection = await getConnection(supabase, profile.organization_id);
    if (!connection) return jsonResponse({ error: 'QuickBooks not connected' }, 400);

    const [customersResult, invoicesResult, paymentsResult] = await Promise.all([
      qboRequest(supabase, connection, 'GET', 'query?query=select%20*%20from%20Customer%20STARTPOSITION%201%20MAXRESULTS%201000'),
      qboRequest(supabase, connection, 'GET', 'query?query=select%20*%20from%20Invoice%20STARTPOSITION%201%20MAXRESULTS%201000'),
      qboRequest(supabase, connection, 'GET', 'query?query=select%20*%20from%20Payment%20STARTPOSITION%201%20MAXRESULTS%201000'),
    ]);

    if (!customersResult.ok || !invoicesResult.ok || !paymentsResult.ok) {
      await markReconciliationError(supabase, connection.id, 'One or more QuickBooks datasets could not be read');
      return jsonResponse({ error: 'Reconciliation could not read all QuickBooks data' }, 502);
    }

    const qboCustomers = customersResult.data?.QueryResponse?.Customer || [];
    const qboInvoices = invoicesResult.data?.QueryResponse?.Invoice || [];
    const qboPayments = paymentsResult.data?.QueryResponse?.Payment || [];

    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, contact_name, email, phone, qbo_customer_id')
      .eq('organization_id', profile.organization_id);
    const { data: localInvoices } = await supabase
      .from('invoices')
      .select('id, invoice_number, contact_id, total, amount_due, amount_paid, status, qbo_invoice_id')
      .eq('organization_id', profile.organization_id);
    const { data: localPayments } = await supabase
      .from('payments')
      .select('id, invoice_id, amount, payment_date, qbo_payment_id')
      .eq('organization_id', profile.organization_id);

    const discrepancies: Array<Record<string, unknown>> = [];
    const mappedCustomers = new Set((contacts || []).map(contact => contact.qbo_customer_id).filter(Boolean));
    const mappedInvoices = new Set((localInvoices || []).map(invoice => invoice.qbo_invoice_id).filter(Boolean));
    const mappedPayments = new Set((localPayments || []).map(payment => payment.qbo_payment_id).filter(Boolean));

    for (const customer of qboCustomers) {
      if (!mappedCustomers.has(String(customer.Id))) {
        discrepancies.push({
          entity_type: 'customer',
          qbo_id: String(customer.Id),
          discrepancy_type: 'missing_in_mjv',
          qbo_value: publicCustomerValue(customer),
        });
      }
    }
    for (const contact of contacts || []) {
      if (!contact.qbo_customer_id) {
        discrepancies.push({
          entity_type: 'customer',
          local_id: contact.id,
          discrepancy_type: 'missing_in_qbo',
          local_value: { contact_name: contact.contact_name, email: contact.email, phone: contact.phone },
        });
      }
    }

    const qboInvoiceById = new Map(qboInvoices.map(invoice => [String(invoice.Id), invoice]));
    for (const invoice of localInvoices || []) {
      if (!invoice.qbo_invoice_id) {
        discrepancies.push({ entity_type: 'invoice', local_id: invoice.id, discrepancy_type: 'missing_in_qbo', local_value: invoiceValue(invoice) });
        continue;
      }
      const qboInvoice = qboInvoiceById.get(invoice.qbo_invoice_id);
      if (!qboInvoice) {
        discrepancies.push({ entity_type: 'invoice', local_id: invoice.id, qbo_id: invoice.qbo_invoice_id, discrepancy_type: 'missing_in_qbo', local_value: invoiceValue(invoice) });
        continue;
      }
      const qboTotal = Number(qboInvoice.TotalAmt || 0);
      const qboDue = Number(qboInvoice.Balance || 0);
      const qboPaid = Math.max(0, qboTotal - qboDue);
      const qboStatus = qboDue <= 0 ? 'paid' : qboPaid > 0 ? 'partial' : 'sent';
      if (qboTotal !== Number(invoice.total || 0) || qboDue !== Number(invoice.amount_due || 0) || qboStatus !== invoice.status) {
        discrepancies.push({
          entity_type: 'invoice',
          local_id: invoice.id,
          qbo_id: invoice.qbo_invoice_id,
          discrepancy_type: 'accounting_value_mismatch',
          local_value: invoiceValue(invoice),
          qbo_value: { total: qboTotal, amount_due: qboDue, amount_paid: qboPaid, status: qboStatus },
        });
      }
    }

    for (const payment of qboPayments) {
      if (!mappedPayments.has(String(payment.Id))) {
        discrepancies.push({
          entity_type: 'payment',
          qbo_id: String(payment.Id),
          discrepancy_type: 'missing_in_mjv',
          qbo_value: { amount: Number(payment.TotalAmt || 0), payment_date: payment.TxnDate, invoice_ids: linkedInvoiceIds(payment) },
        });
      }
    }
    for (const payment of localPayments || []) {
      if (!payment.qbo_payment_id) {
        discrepancies.push({
          entity_type: 'payment',
          local_id: payment.id,
          discrepancy_type: 'missing_in_qbo',
          local_value: { amount: Number(payment.amount || 0), payment_date: payment.payment_date, invoice_id: payment.invoice_id },
        });
      }
    }

    if (discrepancies.length > 0) {
      await supabase.from('qbo_reconciliation_results').insert(
        discrepancies.map(discrepancy => ({ organization_id: profile.organization_id, ...discrepancy }))
      );
    }

    const completedAt = new Date().toISOString();
    await supabase
      .from('quickbooks_settings')
      .update({ last_reconciliation_at: completedAt, sync_health: 'healthy', last_error: null })
      .eq('id', connection.id);

    return jsonResponse({
      success: true,
      readOnly: true,
      completedAt,
      counts: {
        qboCustomers: qboCustomers.length,
        mjvContacts: contacts?.length || 0,
        mappedCustomers: mappedCustomers.size,
        unmatchedCustomers: discrepancies.filter(item => item.entity_type === 'customer').length,
        qboInvoices: qboInvoices.length,
        mjvInvoices: localInvoices?.length || 0,
        qboPayments: qboPayments.length,
        mjvPayments: localPayments?.length || 0,
        discrepancies: discrepancies.length,
      },
      discrepancies,
    });
  } catch (error) {
    console.error('QBO reconciliation error:', error);
    return jsonResponse({ error: 'Reconciliation failed' }, 500);
  }
});

function publicCustomerValue(customer: any): Record<string, unknown> {
  return {
    display_name: customer.DisplayName || null,
    email: customer.PrimaryEmailAddr?.Address || null,
    phone: customer.PrimaryPhone?.FreeFormNumber || null,
    active: customer.Active !== false,
  };
}

function invoiceValue(invoice: any): Record<string, unknown> {
  return {
    invoice_number: invoice.invoice_number,
    total: Number(invoice.total || 0),
    amount_paid: Number(invoice.amount_paid || 0),
    amount_due: Number(invoice.amount_due || 0),
    status: invoice.status,
  };
}

function linkedInvoiceIds(payment: any): string[] {
  return (payment.Line || []).flatMap((line: any) => (line.LinkedTxn || [])
    .filter((transaction: any) => transaction.TxnType === 'Invoice')
    .map((transaction: any) => String(transaction.TxnId)));
}

async function markReconciliationError(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  connectionId: string,
  message: string
): Promise<void> {
  await supabase
    .from('quickbooks_settings')
    .update({ sync_health: 'error', last_error: { type: 'reconciliation', message, at: new Date().toISOString() } })
    .eq('id', connectionId);
}

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
