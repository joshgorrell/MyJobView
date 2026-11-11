import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
const DEPARTMENTS = ['sales','service','projects','security','accounting','administration'] as const;
type Person = { id: string; full_name: string | null; email: string | null; role: string };
type Grant = { user_id: string; department: string };
export function PhoneVoicemailPermissions() {
  const [people, setPeople] = useState<Person[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [selected, setSelected] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data, error: e } = await supabase.functions.invoke('phone-voicemail-permissions', { method: 'GET' });
        if (e) throw e;
        if (!active) return;
        setPeople(data.people || []);
        setGrants(data.grants || []);
      } catch {
        if (active) setError('Unable to load voicemail permissions.');
      }
    })();
    return () => { active = false; };
  }, []);
  const choose = (id: string) => {
    setSelected(id);
    setChosen(grants.filter(g => g.user_id === id).map(g => g.department));
    setError('');
    setMessage('');
  };
  const save = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { data, error: e } = await supabase.functions.invoke('phone-voicemail-permissions', {
        method: 'PUT', body: { userId: selected, departments: chosen },
      });
      if (e || data?.saved !== true) throw new Error('Save failed');
      setGrants(old => [...old.filter(g => g.user_id !== selected),
        ...chosen.map(department => ({ user_id: selected, department }))]);
      setMessage('Voicemail permissions saved.');
    } catch { setError('Could not save voicemail permissions. No changes confirmed.'); }
    finally { setBusy(false); }
  };
  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
      <h4 className="font-semibold text-gray-900">Voicemail department access</h4>
      <p className="text-sm text-gray-600">Choose which voicemail departments each employee may read and listen to in Flow. Administrators have full access.</p>
      <label className="block text-sm font-medium text-gray-700" htmlFor="phone-voicemail-person">Employee</label>
      <select id="phone-voicemail-person" className="w-full rounded-lg border border-gray-300 p-2 text-sm"
        value={selected} onChange={e => choose(e.target.value)}>
        <option value="">Select employee</option>
        {people.map(p => <option key={p.id} value={p.id}>{p.full_name || p.email || p.id}{p.role === 'admin' ? ' (Admin)' : ''}</option>)}
      </select>
      {selected && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {DEPARTMENTS.map(department => (
              <label key={department} className="flex items-center gap-2 text-sm capitalize">
                <input type="checkbox" checked={chosen.includes(department)}
                  onChange={e => setChosen(old => e.target.checked
                    ? [...old, department] : old.filter(d => d !== department))} />
                {department}
              </label>
            ))}
          </div>
          <button type="button" onClick={() => void save()} disabled={busy}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? 'Saving…' : 'Save permissions'}
          </button>
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="text-sm text-green-700">{message}</p>}
    </section>
  );
}
