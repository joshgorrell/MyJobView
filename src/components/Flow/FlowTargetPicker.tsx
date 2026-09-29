import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { FlowTarget } from '../../lib/flow/types';

export function FlowTargetPicker({ onSelect, contactId }: { onSelect: (target: FlowTarget) => void; contactId?: string }) {
  const [search, setSearch] = useState('');
  const [targets, setTargets] = useState<FlowTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const { data, error: failure } = await supabase.rpc('search_flow_targets', { p_search: search, p_contact: contactId || null });
      if (cancelled) return;
      setTargets((data || []) as FlowTarget[]); setError(failure ? 'Could not load customers and jobs.' : ''); setLoading(false);
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [search, contactId]);
  return <div className="flow-target-picker">
    <input aria-label="Find a customer, project, or work order" placeholder="Find a customer, project, or work order…" value={search} onChange={e => setSearch(e.target.value)} />
    <div className="flow-target-results" aria-live="polite">
      {loading ? <p>Searching…</p> : error ? <p role="alert">{error}</p> : !targets.length ? <p>No matching records.</p> : targets.map(target =>
        <button type="button" key={`${target.kind}:${target.id}`} onClick={() => onSelect(target)}>
          <span>{target.label}</span><small>{target.kind.replace('_', ' ')}</small>
        </button>)}
    </div>
  </div>;
}
