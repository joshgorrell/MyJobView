import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';

interface Exclusion { available: boolean; excluded: boolean; automatic: boolean }

export default function ProductTechsafeExclusion({ productId, canEdit }: { productId: string; canEdit: boolean }) {
  const [setting, setSetting] = useState<Exclusion | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const sequence = useRef(0);
  const dataVersion = useRef(0);
  const savingRef = useRef(false);
  useEffect(() => {
    const current = ++sequence.current;
    setSetting(null); setError(''); setSaved(false); setSaving(false);
    let inFlight = false;
    const refresh = async () => {
      if (inFlight || savingRef.current) return;
      inFlight = true;
      const version = dataVersion.current;
      try {
        const { data, error: failure } = await supabase.rpc('get_techsafe_product_exclusion', { p_product_id: productId });
        if (current !== sequence.current || version !== dataVersion.current) return;
        if (failure || data?.available !== true) { setSetting(null); return; }
        if (typeof data?.excluded !== 'boolean' || typeof data?.automatic !== 'boolean') throw new Error('Invalid setting');
        setSetting(data);
      } catch { if (current === sequence.current && version === dataVersion.current) setSetting(null); }
      finally { inFlight = false; }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60000);
    return () => { sequence.current++; window.clearInterval(timer); };
  }, [productId]);

  async function change(excluded: boolean) {
    if (!canEdit || !setting || setting.automatic || saving || error) return;
    const current = sequence.current;
    dataVersion.current++;
    savingRef.current = true;
    setSaving(true); setSaved(false);
    try {
      const { data, error: failure } = await supabase.rpc('set_techsafe_product_exclusion', { p_product_id: productId, p_excluded: excluded });
      if (current !== sequence.current) return;
      if (failure?.code === '55000' || (!failure && data?.available === false)) { setSetting(null); return; }
      if (failure || typeof data?.excluded !== 'boolean' || typeof data?.automatic !== 'boolean') throw failure || new Error('Invalid setting');
      setSetting(data); setSaved(true);
    } catch { if (current === sequence.current) setError('Could not confirm the change. Close and reopen this product to check the saved setting before trying again.'); }
    finally { savingRef.current = false; if (current === sequence.current) setSaving(false); }
  }

  if (!setting?.available) return null;
  return <section className="rounded-lg border border-gray-200 bg-white p-4 md:col-span-2">
    <label className="flex items-start gap-3 text-sm font-medium text-gray-900">
      <input type="checkbox" checked={setting?.excluded ?? false} disabled={!setting || !canEdit || setting.automatic || saving || !!error}
        onChange={event => void change(event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
      Exclude from Techsafe
    </label>
    <p className="mt-2 text-xs text-gray-600">{setting?.automatic ? 'Miscellaneous items are always excluded from Techsafe.' : 'Ignore this product when preparing Techsafe drafts. Existing active coverage is unchanged.'}</p>
    {!setting && !error && <p role="status" className="mt-2 text-xs text-gray-600">Loading setting…</p>}
    {saving && <p role="status" className="mt-2 text-xs text-gray-600">Saving…</p>}
    {saved && !saving && !error && <p role="status" className="mt-2 text-xs text-green-700">Saved</p>}
    {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
  </section>;
}
