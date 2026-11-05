import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { InvoiceAssignmentPicker } from './InvoiceAssignmentPicker';
import { useInvoiceAssignmentEmployees } from '../../lib/useInvoiceAssignmentEmployees';
import type { InvoiceAssignments, InvoiceKind } from '../../lib/invoiceAssignmentModel';

const empty: InvoiceAssignments = { salesRep: null, designer: null, manager: null };

interface Props {
  invoiceId: string;
  salesOrderId: string | null;
  status: string;
  canManage: boolean;
}

/**
 * Staff attribution editor for standalone invoices. Project attribution remains
 * on the sales order; this never writes project assignment or commission records.
 */
export function InvoiceAssignmentEditor({ invoiceId, salesOrderId, status, canManage }: Props) {
  const [kind, setKind] = useState<InvoiceKind | null>(null);
  const [assignments, setAssignments] = useState<InvoiceAssignments>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [hasWorkOrder, setHasWorkOrder] = useState(false);
  const { employees, loading: loadingEmployees, error: employeeError } = useInvoiceAssignmentEmployees([
    assignments.salesRep, assignments.manager,
  ]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setNotice(null);
    setKind(null);
    setAssignments(empty);
    if (salesOrderId) {
      setLoading(false);
      return () => { active = false; };
    }
    async function load() {
      const [assignmentResult, linksResult] = await Promise.all([
        supabase.from('invoice_staff_assignments')
          .select('invoice_kind,sales_rep_id,service_manager_id').eq('invoice_id', invoiceId).maybeSingle(),
        supabase.from('invoice_line_items').select('id, invoice_line_item_sources(source_type)').eq('invoice_id', invoiceId),
      ]);
      if (!active) return;
      if (assignmentResult.error || linksResult.error) {
        setError(assignmentResult.error?.message || linksResult.error?.message || 'Unable to load assignments');
      } else {
        const linked = (linksResult.data || []).some(line => {
          const sources = line.invoice_line_item_sources as unknown as Array<{ source_type: string }> | null;
          return (sources || []).some(source => source.source_type === 'work_order' || source.source_type.startsWith('work_order_'));
        });
        setHasWorkOrder(linked);
        const row = assignmentResult.data;
        setKind(linked ? 'service' : (row?.invoice_kind as InvoiceKind | undefined) || null);
        setAssignments({
          salesRep: row?.sales_rep_id || null,
          designer: null,
          manager: row?.service_manager_id || null,
        });
      }
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [invoiceId, salesOrderId]);

  if (salesOrderId) return null; // No misleading project data: must come from sales order.
  if (!canManage) return null;
  if (loading) return <p className="text-sm text-gray-500">Loading invoice assignments…</p>;

  const isDraft = status === 'draft';
  const save = async () => {
    if (!kind || !isDraft || saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    const { error: saveError } = await supabase.from('invoice_staff_assignments').upsert({
      invoice_id: invoiceId,
      invoice_kind: kind,
      sales_rep_id: assignments.salesRep,
      service_manager_id: kind === 'service' ? assignments.manager : null,
    }, { onConflict: 'invoice_id' });
    if (saveError) setError(saveError.message);
    else setNotice('Invoice assignments saved.');
    setSaving(false);
  };

  return (
    <div className="space-y-3">
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {employeeError && <p role="alert" className="text-sm text-red-700">{employeeError}</p>}
      {notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
      {!kind && isDraft && (
        <label className="block text-sm font-medium text-gray-700">
          Standalone invoice type
          <select className="mt-1 block min-h-11 w-full rounded-lg border border-gray-300 px-3"
            value="" onChange={event => {
              setKind(event.target.value as InvoiceKind);
              setAssignments(empty);
              setNotice(null);
            }}>
            <option value="">Select invoice type</option>
            <option value="service">Service</option>
            <option value="retail">Retail</option>
          </select>
        </label>
      )}
      {kind && (
        <>
          <InvoiceAssignmentPicker kind={kind} value={assignments} employees={employees}
            disabled={!isDraft || loadingEmployees || !!employeeError || saving}
            onChange={isDraft ? next => { setAssignments(next); setNotice(null); } : undefined} />
          {isDraft && (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void save()} disabled={saving || loadingEmployees || !!employeeError}
                className="min-h-11 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                {saving ? 'Saving…' : 'Save Assignments'}
              </button>
              {!hasWorkOrder && (
                <span className="text-xs text-gray-500">Invoice type is saved with these assignments.</span>
              )}
            </div>
          )}
        </>
      )}
      {!kind && !isDraft && (
        <p className="text-xs text-gray-500">No staff attribution was recorded for this invoice.</p>
      )}
    </div>
  );
}
