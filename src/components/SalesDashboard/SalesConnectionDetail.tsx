import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import ConnectionForm from '../Connections/ConnectionForm';
import type { SalesRecord } from '../../lib/salesDashboardRecords';

export function SalesConnectionDetail({ record, onBack, onSaved }: { record: SalesRecord; onBack: () => void; onSaved: () => void }) {
  const { profile } = useAuth();
  const [connection, setConnection] = useState<any>(null);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void supabase.from('connections').select('*').eq('id', record.id).eq('organization_id', profile?.organization_id).maybeSingle().then(({ data, error }) => { if (!cancelled) { setConnection(data); setError(!!error || !data); } });
    return () => { cancelled = true; };
  }, [record.id, profile?.organization_id]);
  return <section className="bg-white text-gray-900 p-6 rounded-xl border border-gray-200">
    <button onClick={onBack} className="text-blue-700 mb-4">Back to list</button><h2 className="text-xl font-semibold">{record.title} · {record.customer}</h2>
    {error ? <p className="text-red-700 mt-4">This connection could not be loaded.</p> : !connection ? <p className="mt-4">Loading connection…</p> : <><p className="text-sm text-gray-500 mt-2">{new Date(connection.connection_date).toLocaleString()}</p><p className="whitespace-pre-wrap mt-4">{connection.notes || 'No notes recorded.'}</p>{connection.follow_up_needed && <p className="mt-4">Follow-up: {connection.follow_up_description || 'Needed'} {connection.reminder_date || ''}</p>}{connection.user_id === profile?.id && <button onClick={() => setEditing(true)} className="mt-4 rounded-lg bg-blue-700 text-white px-4 py-2">Edit connection</button>}</>}
    {editing && <ConnectionForm editConnection={connection} onClose={() => setEditing(false)} onSuccess={() => { setEditing(false); onSaved(); onBack(); }} />}
  </section>;
}
