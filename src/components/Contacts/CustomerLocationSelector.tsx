import { useEffect, useMemo, useState } from 'react';
import { Building2, Check, ChevronDown, MapPin, Plus, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

export interface CustomerLocation {
  id: string;
  customer_contact_id: string;
  name: string;
  department: string | null;
  building_name: string | null;
  street_address: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  country: string | null;
  primary_contact_id: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  access_instructions: string | null;
  is_default: boolean;
  is_active: boolean;
}

interface CustomerLocationSelectorProps {
  customerContactId: string;
  value: string | null;
  onChange: (location: CustomerLocation | null) => void;
  compact?: boolean;
  allowCreate?: boolean;
}

const emptyForm = {
  name: '',
  department: '',
  building_name: '',
  street_address: '',
  address_line_2: '',
  city: '',
  state: '',
  zip_code: '',
  country: 'USA',
  phone: '',
  email: '',
  notes: '',
  access_instructions: '',
  is_default: false,
};

export function CustomerLocationSelector({ customerContactId, value, onChange, compact = false, allowCreate = true }: CustomerLocationSelectorProps) {
  const { profile } = useAuth();
  const [locations, setLocations] = useState<CustomerLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    void loadLocations();
  }, [customerContactId]);

  async function loadLocations(preselectDefault = false) {
    setLoading(true);
    setError('');
    try {
      const { data, error: loadError } = await supabase
        .from('customer_locations')
        .select('*')
        .eq('customer_contact_id', customerContactId)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('name');
      if (loadError) throw loadError;
      const next = (data || []) as CustomerLocation[];
      setLocations(next);
      if ((preselectDefault || !value) && next.length) {
        const defaultLocation = next.find(location => location.is_default);
        if (defaultLocation && !value) onChange(defaultLocation);
      }
    } catch (e: any) {
      setError(e?.message || 'Unable to load locations.');
    } finally {
      setLoading(false);
    }
  }

  const selected = useMemo(() => locations.find(location => location.id === value) || null, [locations, value]);

  function addressLine(location: CustomerLocation) {
    return [location.building_name, location.street_address, [location.city, location.state].filter(Boolean).join(', '), location.zip_code]
      .filter(Boolean)
      .join(' · ');
  }

  async function createLocation() {
    if (!form.name.trim()) {
      setError('Enter a location or department name.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { data, error: createError } = await supabase
        .from('customer_locations')
        .insert({
          customer_contact_id: customerContactId,
          name: form.name.trim(),
          department: form.department.trim() || null,
          building_name: form.building_name.trim() || null,
          street_address: form.street_address.trim() || null,
          address_line_2: form.address_line_2.trim() || null,
          city: form.city.trim() || null,
          state: form.state.trim() || null,
          zip_code: form.zip_code.trim() || null,
          country: form.country.trim() || 'USA',
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          notes: form.notes.trim() || null,
          access_instructions: form.access_instructions.trim() || null,
          is_default: form.is_default,
          created_by: profile?.id || null,
        })
        .select('*')
        .single();
      if (createError) throw createError;
      setForm(emptyForm);
      setShowCreate(false);
      await loadLocations();
      onChange(data as CustomerLocation);
    } catch (e: any) {
      setError(e?.message || 'Unable to create location.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`flex w-full items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 text-left text-white transition-colors hover:border-gray-600 ${compact ? 'min-h-10 px-3 py-2 text-sm' : 'min-h-12 px-3 py-2.5 sm:px-4'}`}
      >
        <MapPin className="h-4 w-4 flex-shrink-0 text-blue-400" />
        <span className="min-w-0 flex-1">
          {selected ? (
            <>
              <span className="block truncate text-sm font-semibold">{selected.name}</span>
              <span className="block truncate text-xs text-gray-400">{addressLine(selected) || selected.department || 'No address entered'}</span>
            </>
          ) : (
            <>
              <span className="block text-sm font-medium">Company / main address</span>
              <span className="block text-xs text-gray-500">No specific location or department selected</span>
            </>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <button type="button" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} aria-label="Close location menu" />
          <div className="fixed bottom-0 left-0 right-0 z-50 max-h-[82dvh] overflow-hidden rounded-t-2xl border border-gray-700 bg-gray-800 shadow-2xl sm:absolute sm:bottom-auto sm:left-0 sm:right-auto sm:mt-1 sm:max-h-[420px] sm:w-full sm:min-w-[420px] sm:rounded-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-700 bg-gray-800 px-4 py-3">
              <div>
                <div className="text-sm font-bold text-white">Location / Department</div>
                <div className="text-xs text-gray-400">The customer stays the same; this identifies where the work happens.</div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-700 hover:text-white"><X className="h-4 w-4" /></button>
            </div>

            <div className="max-h-[calc(82dvh-64px)] overflow-y-auto p-2 sm:max-h-[350px]">
              <button
                type="button"
                onClick={() => { onChange(null); setOpen(false); }}
                className={`mb-1 flex w-full items-start gap-3 rounded-lg p-3 text-left hover:bg-gray-700 ${!value ? 'bg-blue-500/10' : ''}`}
              >
                <Building2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-white">Company / main address</span><span className="block text-xs text-gray-400">Use the primary customer address.</span></span>
                {!value && <Check className="h-4 w-4 text-blue-400" />}
              </button>

              {loading ? <div className="p-4 text-center text-sm text-gray-400">Loading locations…</div> : locations.map(location => (
                <button
                  type="button"
                  key={location.id}
                  onClick={() => { onChange(location); setOpen(false); }}
                  className={`mb-1 flex w-full items-start gap-3 rounded-lg p-3 text-left hover:bg-gray-700 ${value === location.id ? 'bg-blue-500/10' : ''}`}
                >
                  <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-400" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5"><span className="truncate text-sm font-semibold text-white">{location.name}</span>{location.is_default && <span className="rounded bg-gray-700 px-1.5 py-0.5 text-[10px] font-bold uppercase text-gray-300">Default</span>}</span>
                    {(location.department || location.building_name) && <span className="block truncate text-xs text-gray-300">{[location.department, location.building_name].filter(Boolean).join(' · ')}</span>}
                    <span className="block truncate text-xs text-gray-500">{addressLine(location) || 'No address entered'}</span>
                  </span>
                  {value === location.id && <Check className="h-4 w-4 flex-shrink-0 text-blue-400" />}
                </button>
              ))}

              {allowCreate && (
                <button type="button" onClick={() => setShowCreate(true)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-600 px-3 py-2.5 text-sm font-semibold text-blue-300 hover:border-blue-500 hover:bg-blue-500/10">
                  <Plus className="h-4 w-4" /> Add location / department
                </button>
              )}
              {error && <div className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">{error}</div>}
            </div>
          </div>
        </>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/65 sm:items-center sm:p-4">
          <div className="flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-gray-700 bg-gray-800 shadow-2xl sm:max-w-2xl sm:rounded-xl">
            <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3 sm:px-6 sm:py-4">
              <div><h3 className="font-bold text-white">Add Location / Department</h3><p className="text-xs text-gray-400">Building, campus, department, branch, or other customer site.</p></div>
              <button type="button" onClick={() => setShowCreate(false)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-700 hover:text-white"><X className="h-5 w-5" /></button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="sm:col-span-2"><span className="mb-1 block text-xs font-semibold text-gray-300">Location / Department Name *</span><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Alumni Relations" className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white" /></label>
                <label><span className="mb-1 block text-xs font-semibold text-gray-300">Department</span><input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} placeholder="Alumni Relations" className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white" /></label>
                <label><span className="mb-1 block text-xs font-semibold text-gray-300">Building / Site</span><input value={form.building_name} onChange={e => setForm(f => ({ ...f, building_name: e.target.value }))} placeholder="Alumni Center" className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white" /></label>
                <label className="sm:col-span-2"><span className="mb-1 block text-xs font-semibold text-gray-300">Street Address</span><input value={form.street_address} onChange={e => setForm(f => ({ ...f, street_address: e.target.value }))} className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white" /></label>
                <label className="sm:col-span-2"><span className="mb-1 block text-xs font-semibold text-gray-300">Address Line 2</span><input value={form.address_line_2} onChange={e => setForm(f => ({ ...f, address_line_2: e.target.value }))} className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white" /></label>
                <label><span className="mb-1 block text-xs font-semibold text-gray-300">City</span><input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white" /></label>
                <div className="grid grid-cols-2 gap-2"><label><span className="mb-1 block text-xs font-semibold text-gray-300">State</span><input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white" /></label><label><span className="mb-1 block text-xs font-semibold text-gray-300">ZIP</span><input value={form.zip_code} onChange={e => setForm(f => ({ ...f, zip_code: e.target.value }))} className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white" /></label></div>
                <label><span className="mb-1 block text-xs font-semibold text-gray-300">Phone</span><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white" /></label>
                <label><span className="mb-1 block text-xs font-semibold text-gray-300">Email</span><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white" /></label>
                <label className="sm:col-span-2"><span className="mb-1 block text-xs font-semibold text-gray-300">Access Instructions</span><textarea value={form.access_instructions} onChange={e => setForm(f => ({ ...f, access_instructions: e.target.value }))} rows={2} placeholder="Parking, loading dock, building access, etc." className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white" /></label>
                <label className="sm:col-span-2"><span className="mb-1 block text-xs font-semibold text-gray-300">Notes</span><textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white" /></label>
                <button type="button" onClick={() => setForm(f => ({ ...f, is_default: !f.is_default }))} className="sm:col-span-2 flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 text-left text-sm text-gray-200"><span className={`flex h-5 w-5 items-center justify-center rounded border ${form.is_default ? 'border-blue-500 bg-blue-600' : 'border-gray-600'}`}>{form.is_default && <Check className="h-3 w-3 text-white" />}</span><span><strong className="block text-white">Default location</strong><span className="text-xs text-gray-400">Preselect this location for future proposals for this customer.</span></span></button>
              </div>
              {error && <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-gray-700 px-4 py-3 sm:flex-row sm:justify-end sm:px-6 sm:py-4"><button type="button" onClick={() => setShowCreate(false)} disabled={saving} className="rounded-lg px-4 py-2.5 text-sm font-medium text-gray-300 hover:bg-gray-700">Cancel</button><button type="button" onClick={createLocation} disabled={saving || !form.name.trim()} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Adding…' : 'Add Location'}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
