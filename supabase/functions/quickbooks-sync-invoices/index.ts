import {pushInvoice} from '../_shared/qbo-invoice-push.ts';
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

    // Retry pending QBO voids before pulling from QBO
    await retryPendingVoids(supabase, connection, profile.organization_id);

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
      .select('id, total, amount_paid, amount_due, status, qbo_void_pending')
      .eq('organization_id', organizationId)
      .eq('qbo_invoice_id', qboId)
      .maybeSingle();

    if (!localInvoice) {
      await logSyncOperation(supabase, organizationId, 'from_quickbooks', 'stage', 'invoice', null, qboId, 'success', null, { reason: 'No local invoice match' });
      return { success: true };
    }

    // MJV void is authoritative: never un-void a voided MJV invoice
    if (['draft','void'].includes(localInvoice.status)) {
      await logSyncOperation(supabase, organizationId, 'from_quickbooks', 'skip', 'invoice', localInvoice.id, qboId, 'success', null, { reason: 'MJV void is authoritative, skipping inbound update' });
      return { success: true };
    }

    // QBO owns these fields — always authoritative
    const total = Number(qboInvoice.TotalAmt || 0);
    const amountDue = Number(qboInvoice.Balance || 0);
    const amountPaid = Math.max(0, total - amountDue);
    const status = amountDue <= 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'submitted';

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
function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Retry pending QBO voids: find MJV-voided invoices with qbo_void_pending = true
 * and attempt to void them in QBO. MJV void is authoritative.
 */
async function retryPendingVoids(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  connection: any,
  organizationId: string
): Promise<void> {
  try {
    const { data: pendingVoids } = await supabase
      .from('invoices')
      .select('id, invoice_number, qbo_invoice_id')
      .eq('organization_id', organizationId)
      .eq('qbo_void_pending', true)
      .not('qbo_invoice_id', 'is', null);

    if (!pendingVoids || pendingVoids.length === 0) return;

    for (const inv of pendingVoids) {
      try {
        const mapping = await getEntityMapping(supabase, organizationId, 'invoice', inv.id);
        if (!mapping) {
          await logSyncOperation(supabase, organizationId, 'to_quickbooks', 'void_retry', 'invoice', inv.id, inv.qbo_invoice_id, 'failed', 'No entity mapping found');
          continue;
        }

        const voidResult = await qboRequest(supabase, connection, 'POST', `invoice?operation=void`, {
          Id: mapping.qbo_id,
          SyncToken: mapping.qbo_sync_token,
        });

        if (voidResult.ok) {
          await supabase
            .from('invoices')
            .update({ qbo_void_pending: false })
            .eq('id', inv.id);
          await logSyncOperation(supabase, organizationId, 'to_quickbooks', 'void', 'invoice', inv.id, inv.qbo_invoice_id, 'success');
        } else {
          // SyncToken mismatch — re-fetch and retry once
          if (voidResult.status === 400 && voidResult.data?.Fault?.Error?.[0]?.code === '3200') {
            const fetchResult = await qboRequest(supabase, connection, 'GET', `invoice/${mapping.qbo_id}?minorversion=40`);
            if (fetchResult.ok && fetchResult.data?.Invoice) {
              const retryResult = await qboRequest(supabase, connection, 'POST', `invoice?operation=void`, {
                Id: mapping.qbo_id,
                SyncToken: fetchResult.data.Invoice.SyncToken,
              });
              if (retryResult.ok) {
                await supabase
                  .from('invoices')
                  .update({ qbo_void_pending: false })
                  .eq('id', inv.id);
                await logSyncOperation(supabase, organizationId, 'to_quickbooks', 'void', 'invoice', inv.id, inv.qbo_invoice_id, 'success');
                continue;
              }
            }
          }
          await logSyncOperation(supabase, organizationId, 'to_quickbooks', 'void_retry', 'invoice', inv.id, inv.qbo_invoice_id, 'failed', voidResult.data?.Fault?.Error?.[0]?.Message || 'QBO void failed');
        }
      } catch (err: any) {
        await logSyncOperation(supabase, organizationId, 'to_quickbooks', 'void_retry', 'invoice', inv.id, inv.qbo_invoice_id, 'failed', err.message);
      }
    }
  } catch (error: any) {
    console.error('Error retrying pending voids:', error);
  }
}
