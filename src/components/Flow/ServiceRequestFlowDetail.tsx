import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type ContactActivity = { id: string; notes: string; logged_by_name: string; created_at: string };
type RequestDetail = { id: string; status: string; created_at: string; customer_contact_confirmed_at: string | null; requested_date: string | null; earliest_date: string | null; requested_tech_ids: string[] | null; work_order_id: string | null; work_order: { id: string; work_order_number: string; status: string; scheduled_date: string | null; scheduled_start_time?: string | null } | null };

export function ServiceRequestFlowDetail({ requestId }: { requestId: string }) {
  const [request, setRequest] = useState<RequestDetail | null>(null);
  const [activities, setActivities] = useState<ContactActivity[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.from('service_requests').select('id,status,created_at,customer_contact_confirmed_at,requested_date,earliest_date,requested_tech_ids,work_order_id,work_order:work_orders!service_requests_work_order_id_fkey(id,work_order_number,status,scheduled_date)').eq('id', requestId).maybeSingle(),
      supabase.from('customer_contact_log').select('id,notes,logged_by_name,created_at').eq('service_request_id', requestId).order('created_at', { ascending: false }).limit(30),
    ]).then(([details, log]) => {
      if (!active) return;
      if (details.error || log.error) { setError('Service request details are unavailable.'); return; }
      setRequest(details.data as unknown as RequestDetail | null);
      setActivities((log.data || []) as ContactActivity[]);
    }).catch(() => { if (active) setError('Service request details are unavailable.'); });
    return () => { active = false; };
  }, [requestId]);
  if (error) return <p>{error}</p>;
  if (!request) return <p>Loading service request details…</p>;
  const scheduled = request.work_order && !['cancelled'].includes(request.work_order.status) && !!request.work_order.scheduled_date;
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm leading-snug">
    <p><strong>Request:</strong> {request.status.replace(/_/g, ' ')} · Opened {new Date(request.created_at).toLocaleDateString()}</p>
    <p><strong>Customer contact:</strong> {request.customer_contact_confirmed_at ? 'Spoke with customer' : activities.length ? 'Contact attempted / response not confirmed' : 'No attempts logged'}</p>
    {request.work_order && <p><strong>Work order:</strong> <a href={`?tab=work_orders&workOrderId=${request.work_order.id}`}>#{request.work_order.work_order_number}</a> · {request.work_order.status}{scheduled && <> · {request.work_order.scheduled_date} </>}</p>}
    {!request.work_order && <p>Not yet scheduled</p>}
    {(request.earliest_date || request.requested_date) && <p><strong>Requested dates:</strong> {[request.earliest_date, request.requested_date].filter(Boolean).join(" – ")} (not guaranteed)</p>}
    {request.requested_tech_ids?.length ? <p><strong>Preferred technicians:</strong> {request.requested_tech_ids.length} requested</p> : null}
    <p className="sm:col-span-2"><strong>Contact history</strong></p>
    {activities.length ? <div className="sm:col-span-2 space-y-1">{activities.map(activity => <p key={activity.id}><small>{new Date(activity.created_at).toLocaleString()} · {activity.logged_by_name}</small> — {activity.notes}</p>)}</div> : <p>No contact notes recorded yet.</p>}
  </div>;
}
