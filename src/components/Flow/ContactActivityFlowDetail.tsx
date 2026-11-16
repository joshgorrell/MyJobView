import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { ServiceRequestFlowDetail } from './ServiceRequestFlowDetail';

// Read the existing log; do not duplicate contact notes into permanent Flow snapshots.
export function ContactActivityFlowDetail({ logId }: { logId: string }) {
  const [entry, setEntry] = useState<{ notes: string; service_request_id: string | null; work_order_id: string | null } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setEntry(null);
    setError('');
    void supabase.from('customer_contact_log').select('notes,service_request_id,work_order_id').eq('id', logId).maybeSingle().then(({ data, error: failure }) => {
      if (!active) return;
      if (failure || !data) setError('Contact activity is unavailable.');
      else setEntry(data);
    });
    return () => { active = false; };
  }, [logId]);
  if (error) return <p>{error}</p>;
  if (!entry) return <p>Loading contact activity…</p>;
  return <div className="space-y-2">
    <p className="whitespace-pre-wrap"><strong>Contact note:</strong> {entry.notes}</p>
    {entry.service_request_id ? <ServiceRequestFlowDetail requestId={entry.service_request_id} /> : entry.work_order_id && <a className="text-info hover:underline" href={`?tab=work_orders&workOrderId=${encodeURIComponent(entry.work_order_id)}`}>Open work order ↗</a>}
  </div>;
}
