import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import {
  corsHeaders,
  getSupabaseAdmin,
  getConnection,
  qboRequest,
  createSyncRun,
  completeSyncRun,
  logSyncOperation,
  upsertEntityMapping,
  getEntityMapping,
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
      .select('organization_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.organization_id) return jsonResponse({ error: 'No organization found' }, 403);

    const supabase = getSupabaseAdmin();
    const connection = await getConnection(supabase, profile.organization_id);
    if (!connection) return jsonResponse({ error: 'QuickBooks not connected' }, 400);

    const body = await req.json().catch(() => ({}));
    const invoiceId = body.invoiceId as string | undefined;
    const runId = await createSyncRun(supabase, profile.organization_id, body.runType === 'manual' ? 'manual' : 'scheduled', 'invoice');

    if (body.action === 'push' && invoiceId) {
      const result = await pushInvoice(supabase, connection, profile.organization_id, invoiceId);
      if (runId) await completeSyncRun(supabase, runId, result.success ? 'completed' : 'failed', result.success ? 1 : 0, result.error);
      return jsonResponse(result, result.success ? 200 : 500);
    }

    const result = await qboRequest(
      supabase,
      connection,
      'GET',
      'query?query=select%20*%20from%20Invoice%20STARTPOSITION%201%20MAXRESULTS%201000'
    );

    if (!result.ok) {
      if (runId) await completeSyncRun(supabase, runId, 'failed', 0, 'Failed to fetch invoices');
      return jsonResponse({ error: 'Failed to fetch invoices from QuickBooks' }, 500);
    }

    const invoices = result.data?.QueryResponse?.Invoice || [];
    let synced = 0;
    let failed = 0;

    for (const invoice of invoices) {
      const syncResult = await syncInvoice(supabase, profile.organization_id, invoice);
      if (syncResult.success) synced++;
      else failed++;
    }

    await supabase
      .from('quickbooks_settings')
      .update({
        last_synced_at: new Date().toISOString(),
        last_invoice_sync_at: new Date().toISOString(),
        sync_health: failed > 0 ? 'degraded' : 'healthy',
        invoice_sync_status: failed > 0 ? 'error' : 'idle',
      })
      .eq('id', connection.id);

    if (runId) {
      await completeSyncRun(
        supabase,
        runId,
        failed > 0 ? 'failed' : 'completed',
        synced,
        failed > 0 ? `${failed} invoice records failed` : null
      );
    }

    return jsonResponse({ success: true, total: invoices.length, synced, failed });
  } catch (error: any) {
    console.error('Invoice sync error:', error);
    return jsonResponse({ error: 'Invoice sync failed' }, 500);
  }
});

/**
 * Inbound sync: QBO → MJV
 * QBO owns accounting totals, balance, payment status. These always win on inbound.
 * MJV owns workflow fields (descriptions, job references, internal status) — not overwritten.
 */
async function syncInvoice(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  organizationId: string,
  qboInvoice: any
): Promise<{ success: boolean; error?: string }> {
  try {
    const qboId = String(qboInvoice.Id);
    const { data: localInvoice } = await supabase
      .from('invoices')
      .select('id, total, amount_paid, amount_due, status')
      .eq('organization_id', organizationId)
      .eq('qbo_invoice_id', qboId)
      .maybeSingle();

    if (!localInvoice) {
      await logSyncOperation(supabase, organizationId, 'from_quickbooks', 'stage', 'invoice', null, qboId, 'success', null, { reason: 'No local invoice match' });
      return { success: true };
    }

    // QBO owns these fields — always authoritative
    const total = Number(qboInvoice.TotalAmt || 0);
    const amountDue = Number(qboInvoice.Balance || 0);
    const amountPaid = Math.max(0, total - amountDue);
    const status = amountDue <= 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'sent';

    const { error } = await supabase
      .from('invoices')
      .update({ total, amount_paid: amountPaid, amount_due: amountDue, status })
      .eq('id', localInvoice.id)
      .eq('organization_id', organizationId);

    if (error) throw error;

    await upsertEntityMapping(supabase, organizationId, 'invoice', localInvoice.id, qboId, qboInvoice.SyncToken);
    await logSyncOperation(supabase, organizationId, 'from_quickbooks', 'update', 'invoice', localInvoice.id, qboId, 'success');
    return { success: true };
  } catch (error: any) {
    await logSyncOperation(supabase, organizationId, 'from_quickbooks', 'update', 'invoice', null, String(qboInvoice.Id), 'failed', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Outbound push: MJV → QBO
 * If the invoice already has a QBO mapping, UPDATE the existing QBO invoice
 * using its stored SyncToken (not create a new one).
 * If no mapping exists, CREATE a new QBO invoice.
 *
 * Field ownership:
 * - MJV sends: CustomerRef, TxnDate, DueDate, Line items (descriptions, amounts)
 * - QBO owns: TotalAmt, Balance, payment status — we never send these
 */
async function pushInvoice(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  connection: any,
  organizationId: string,
  invoiceId: string
): Promise<{ success: boolean; qbo_invoice_id?: string; error?: string }> {
  const { data: invoice } = await supabase
    .from('invoices')
    .select('*, contacts(*), invoice_line_items(*)')
    .eq('id', invoiceId)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (!invoice) return { success: false, error: 'Invoice not found' };
  if (!invoice.contacts?.qbo_customer_id) return { success: false, error: 'Contact is not linked to QuickBooks' };

  const lineItems = (invoice.invoice_line_items || []).map((item: any, index: number) => ({
    DetailType: 'SalesItemLineDetail',
    Description: item.description,
    Amount: item.amount,
    SalesItemLineDetail: { Qty: item.quantity, UnitPrice: item.unit_price },
    LineNum: index + 1,
  }));

  // Check if this invoice is already mapped to a QBO invoice
  const existingMapping = await getEntityMapping(supabase, organizationId, 'invoice', invoiceId);

  if (existingMapping) {
    // UPDATE existing QBO invoice — include SyncToken for optimistic concurrency
    const payload = {
      Id: existingMapping.qbo_id,
      SyncToken: existingMapping.qbo_sync_token,
      CustomerRef: { value: invoice.contacts.qbo_customer_id },
      TxnDate: invoice.invoice_date,
      DueDate: invoice.due_date,
      Line: lineItems,
      sparse: true,
    };

    const result = await qboRequest(supabase, connection, 'POST', 'invoice', payload);
    if (!result.ok || !result.data?.Invoice?.Id) {
      // SyncToken mismatch — re-fetch and retry once
      if (result.status === 400 && result.data?.Fault?.Error?.[0]?.code === '3200') {
        const fetchResult = await qboRequest(supabase, connection, 'GET', `invoice/${existingMapping.qbo_id}?minorversion=40`);
        if (fetchResult.ok && fetchResult.data?.Invoice) {
          const currentSyncToken = fetchResult.data.Invoice.SyncToken;
          const retryPayload = { ...payload, SyncToken: currentSyncToken };
          const retryResult = await qboRequest(supabase, connection, 'POST', 'invoice', retryPayload);
          if (retryResult.ok && retryResult.data?.Invoice?.Id) {
            const qboId = String(retryResult.data.Invoice.Id);
            await supabase
              .from('invoices')
              .update({ qbo_invoice_id: qboId, synced_at: new Date().toISOString() })
              .eq('id', invoiceId)
              .eq('organization_id', organizationId);

            await upsertEntityMapping(supabase, organizationId, 'invoice', invoiceId, qboId, retryResult.data.Invoice.SyncToken);
            await logSyncOperation(supabase, organizationId, 'to_quickbooks', 'update', 'invoice', invoiceId, qboId, 'success');
            return { success: true, qbo_invoice_id: qboId };
          }
        }
      }

      await logSyncOperation(supabase, organizationId, 'to_quickbooks', 'update', 'invoice', invoiceId, existingMapping.qbo_id, 'failed', 'QBO invoice update failed');
      return { success: false, error: 'Failed to update invoice in QuickBooks' };
    }

    const qboId = String(result.data.Invoice.Id);
    // QBO owns totals/balance — read them back from the response
    const total = Number(result.data.Invoice.TotalAmt || 0);
    const amountDue = Number(result.data.Invoice.Balance || 0);
    const amountPaid = Math.max(0, total - amountDue);
    const status = amountDue <= 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'sent';

    await supabase
      .from('invoices')
      .update({ qbo_invoice_id: qboId, synced_at: new Date().toISOString(), total, amount_paid: amountPaid, amount_due: amountDue, status })
      .eq('id', invoiceId)
      .eq('organization_id', organizationId);

    await upsertEntityMapping(supabase, organizationId, 'invoice', invoiceId, qboId, result.data.Invoice.SyncToken);
    await logSyncOperation(supabase, organizationId, 'to_quickbooks', 'update', 'invoice', invoiceId, qboId, 'success');
    return { success: true, qbo_invoice_id: qboId };
  }

  // CREATE new QBO invoice
  const payload = {
    CustomerRef: { value: invoice.contacts.qbo_customer_id },
    TxnDate: invoice.invoice_date,
    DueDate: invoice.due_date,
    Line: lineItems,
  };

  const result = await qboRequest(supabase, connection, 'POST', 'invoice', payload);
  if (!result.ok || !result.data?.Invoice?.Id) {
    return { success: false, error: 'Failed to create invoice in QuickBooks' };
  }

  const qboId = String(result.data.Invoice.Id);
  const total = Number(result.data.Invoice.TotalAmt || 0);
  const amountDue = Number(result.data.Invoice.Balance || 0);
  const amountPaid = Math.max(0, total - amountDue);
  const status = amountDue <= 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'sent';

  await supabase
    .from('invoices')
    .update({ qbo_invoice_id: qboId, synced_at: new Date().toISOString(), total, amount_paid: amountPaid, amount_due: amountDue, status })
    .eq('id', invoiceId)
    .eq('organization_id', organizationId);

  await upsertEntityMapping(supabase, organizationId, 'invoice', invoiceId, qboId, result.data.Invoice.SyncToken);
  await logSyncOperation(supabase, organizationId, 'to_quickbooks', 'create', 'invoice', invoiceId, qboId, 'success');
  return { success: true, qbo_invoice_id: qboId };
}

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
