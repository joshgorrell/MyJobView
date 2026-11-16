import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
type Person = { id: string; name: string; admin: boolean; granted: boolean };
export function AssistOperatorAccess({ organizationId }: { organizationId: string }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const epoch = useRef(0); const saving = useRef(false);
  useEffect(() => {
    const version = ++epoch.current; setPeople([]); setError(''); setBusy(false); saving.current = false;
    void supabase.rpc('manage_assist_operators', { p_organization_id: organizationId }).then(({ data, error: failure }) => {
      if (epoch.current !== version) return;
      if (failure) setError('Unable to load user permissions.'); else setPeople(data?.people || []);
    });
    return () => { epoch.current++; };
  }, [organizationId]);
  async function change(person: Person) {
    if (saving.current || person.admin) return;
    const version = epoch.current; saving.current = true; setBusy(true); setError('');
    try {
      const { data, error: failure } = await supabase.rpc('manage_assist_operators', { p_organization_id: organizationId, p_user_id: person.id, p_granted: !person.granted });
      if (failure) throw failure;
      if (epoch.current === version) setPeople(data?.people || []);
    } catch { if (epoch.current === version) setError('Unable to save user permissions. No changes confirmed.'); }
    finally { if (epoch.current === version) { saving.current = false; setBusy(false); } }
  }
  return <div className="space-y-3 border-t border-subtle pt-4"><h5 className="font-semibold text-primary">User access</h5><p className="text-sm text-muted">Choose who may view and control your dealer’s technician laptops. Administrators have access.</p>
    <div className="space-y-1">{people.map(person => <label key={person.id} className="flex min-h-11 items-center gap-3 text-sm text-primary"><input type="checkbox" checked={person.granted} disabled={busy || person.admin} onChange={() => void change(person)} />{person.name}{person.admin ? ' (Administrator)' : ''}</label>)}</div>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </div>;
}
