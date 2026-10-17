import { requestConfirmation } from '../../lib/feedback';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { accessoryPricing } from '../../lib/accessoryPricing';
const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
export default function ProductAccessories({ productId, readOnly = false, summaryOnly = false, parentQuantity = 1, baseMaterial = 0, baseLabor = 0 }: {
  productId: string; readOnly?: boolean; summaryOnly?: boolean; parentQuantity?: number; baseMaterial?: number; baseLabor?: number;
}) {
  const { profile } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, any>>({});
  const canEdit = !readOnly && !!profile?.can_edit_products && !!profile?.organization_id;
  async function load() {
    setLoading(true); setError('');
    const { data, error } = await supabase.from('product_accessories').select('*, accessory:products!product_accessories_accessory_product_id_fkey(id,name,manufacturer_model_number,our_price,default_labor_hours,labor_phase_id,labor_phases(name,default_price))').eq('parent_product_id', productId).order('sort_order');
    if (error) setError(error.message); else setRows(data || []);
    setLoading(false);
  }
  useEffect(() => {
    void load();
    supabase.from('product_package_items').select('package:product_packages(id,package_name)').eq('product_id', productId).then(({ data }) => setPackages((data || []).map((item: any) => item.package).filter(Boolean)));
  }, [productId]);
  useEffect(() => {
    if (!adding || !canEdit) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      let query = supabase.from('products').select('id,name,manufacturer_model_number,our_price').eq('organization_id', profile!.organization_id).eq('is_active', true).neq('id', productId).order('name').limit(20);
      if (search.trim()) query = query.ilike('name', `%${search.trim()}%`);
      const { data, error } = await query;
      if (!cancelled) { if (error) setError(error.message); else setProducts(data || []); }
    }, 200);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [adding, search, productId, canEdit, profile?.organization_id]);
  async function mutate(id: string, patch?: any) {
    if (!canEdit || saving) return;
    setSaving(id); setError('');
    let query = patch ? supabase.from('product_accessories').update(patch) : supabase.from('product_accessories').delete();
    const { data, error } = await query.eq('id', id).eq('parent_product_id', productId).eq('organization_id', profile!.organization_id).select('id').single();
    if (error || !data) setError(error?.message || 'This accessory could not be saved.');
    else { setDrafts(current => { const next = { ...current }; delete next[id]; return next; }); await load(); }
    setSaving(null);
  }
  async function add(id: string) {
    if (!canEdit || saving || rows.some(row => row.accessory_product_id === id)) return;
    setSaving(id); setError('');
    const { error } = await supabase.from('product_accessories').insert({ parent_product_id: productId, accessory_product_id: id, organization_id: profile!.organization_id, quantity: 1, is_default_selected: false, sort_order: rows.length });
    if (error) setError(error.message); else { setAdding(false); setSearch(''); await load(); }
    setSaving(null);
  }
  function save(row: any) {
    const draft = drafts[row.id]; if (!draft) return;
    const patch: any = { quantity: Number(draft.quantity), is_default_selected: draft.is_default_selected };
    for (const key of ['unit_price_override', 'labor_hours_override', 'labor_rate_override']) patch[key] = draft[key] === '' || draft[key] == null ? null : Number(draft[key]);
    if (!Number.isFinite(patch.quantity) || patch.quantity <= 0 || Object.values(patch).some(value => typeof value === 'number' && (!Number.isFinite(value) || value < 0))) { setError('Quantity must be greater than zero; price, hours and rate must be zero or greater.'); return; }
    void mutate(row.id, patch);
  }
  const savedOrDraft = (row: any) => {
    const draft = drafts[row.id]; if (!draft) return row;
    const result = { ...row, ...draft };
    for (const key of ['unit_price_override', 'labor_hours_override', 'labor_rate_override']) if (result[key] === '') result[key] = null;
    return result;
  };
  const priced = rows.filter(row => row.accessory).map(row => ({ row, price: accessoryPricing(savedOrDraft(row), parentQuantity) }));
  const base = baseMaterial + baseLabor;
  const all = priced.reduce((sum, item) => sum + item.price.total, base);
  const defaults = priced.filter(item => savedOrDraft(item.row).is_default_selected).reduce((sum, item) => sum + item.price.total, base);
  return <section className="space-y-3" aria-label="Accessories and installed totals">
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {loading ? <p className="text-sm text-gray-500">Loading accessories…</p> : <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-lg bg-blue-50 p-3 text-sm">
        <div>Item + labor<strong className="block">{money(base)}</strong></div>
        <div>With default accessories<strong className="block">{money(defaults)}</strong></div>
        <div>With all accessories<strong className="block">{money(all)}</strong></div>
      </div>
      <p className="text-xs text-gray-500">For {parentQuantity} parent item{parentQuantity === 1 ? '' : 's'}. Includes accessory labor; excludes tax and proposal modifiers.</p>
      {!summaryOnly && <>
        <div className="flex justify-between gap-2"><h3 className="font-semibold">Accessories</h3>{canEdit && <button type="button" onClick={() => setAdding(!adding)} className="text-sm text-blue-700">Add accessory</button>}</div>
        {adding && canEdit && <div className="border rounded-lg p-3 space-y-2"><input aria-label="Search accessories" placeholder="Search accessories" value={search} onChange={e => setSearch(e.target.value)} className="w-full border rounded p-2 text-sm" />{products.filter(product => !rows.some(row => row.accessory_product_id === product.id)).map(product => <button type="button" key={product.id} disabled={!!saving} onClick={() => void add(product.id)} className="block text-left text-sm text-blue-700 p-2">{product.name || product.manufacturer_model_number} · {money(Number(product.our_price || 0))}</button>)}</div>}
        {packages.length > 0 && <p className="text-xs text-gray-600">Used in packages: {packages.map(item => item.package_name).join(', ')}</p>}
        {!rows.length && <p className="text-sm text-gray-500">No accessories linked to this item.</p>}
        {priced.map(({ row, price }) => {
          const draft = drafts[row.id] || { quantity: row.quantity ?? 1, is_default_selected: row.is_default_selected, unit_price_override: row.unit_price_override ?? '', labor_hours_override: row.labor_hours_override ?? '', labor_rate_override: row.labor_rate_override ?? '' };
          const change = (key: string, value: any) => setDrafts(current => ({ ...current, [row.id]: { ...draft, [key]: value } }));
          const preview = accessoryPricing({ ...row, ...draft, unit_price_override: draft.unit_price_override === '' ? null : draft.unit_price_override, labor_hours_override: draft.labor_hours_override === '' ? null : draft.labor_hours_override, labor_rate_override: draft.labor_rate_override === '' ? null : draft.labor_rate_override }, parentQuantity);
          return <article key={row.id} className="border rounded-lg p-3 space-y-2">
            <div className="flex justify-between gap-2"><strong className="text-sm">{row.accessory.name || row.accessory.manufacturer_model_number}</strong><span className="text-sm font-semibold">{money(preview.total)}</span></div>
            {canEdit ? <>
              <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={draft.is_default_selected} onChange={e => change('is_default_selected', e.target.checked)} />Selected by default</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{[['quantity', 'Qty per item', 1], ['unit_price_override', 'Unit price', price.price], ['labor_hours_override', 'Labor hours / unit', price.hours], ['labor_rate_override', 'Labor rate / hour', price.rate]].map(([key, label, fallback]) => <label key={String(key)} className="text-xs">{label}<input type="number" aria-label={`${label} — ${row.accessory.name || row.accessory.manufacturer_model_number}`} min={key === 'quantity' ? 0.001 : 0} step="any" value={draft[String(key)]} placeholder={String(fallback)} onChange={e => change(String(key), e.target.value)} className="w-full border rounded p-2 text-sm mt-1" /></label>)}</div>
              <p className="text-xs text-gray-500">Blank price/labor fields use catalog defaults. Labor: {row.accessory.labor_phases?.name || 'No phase'} · {money(preview.labor)}. Set hours to 0 to remove labor from this accessory.</p>
              <div className="flex gap-3 text-sm"><button type="button" disabled={!drafts[row.id] || !!saving} onClick={() => save(row)} className="text-blue-700 disabled:text-gray-400">{saving === row.id ? 'Saving…' : 'Save accessory'}</button><button type="button" disabled={!!saving} onClick={() => change('labor_hours_override', 0)} className="text-gray-700">Remove labor</button><button type="button" disabled={!!saving} onClick={async () => { if ((await requestConfirmation('Remove this accessory link? The catalog product is preserved.', { theme: 'amber' }))) void mutate(row.id); }} className="text-red-700">Remove accessory</button></div>
            </> : <p className="text-xs text-gray-600">{price.quantity} × {money(price.price)} · {price.hours ? `${price.hours} labor hrs/unit × ${money(price.rate)}/hr (${money(price.labor)})` : 'No labor'} · {row.is_default_selected ? 'Default accessory' : 'Optional accessory'}</p>}
          </article>;
        })}
        {Object.keys(drafts).length > 0 && <p className="text-xs text-amber-700">Save each accessory to apply its changes. Totals include your accessory edits.</p>}
      </>}
    </>}
  </section>;
}
