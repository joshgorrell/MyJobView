import { useState, useEffect } from 'react';
import { Monitor, MapPin, CheckCircle2, Save, Loader2, Building2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Office {
  id: string;
  office_name: string;
  city: string | null;
  state: string | null;
  display_order: number;
}

export function KioskSettings() {
  const [offices, setOffices] = useState<Office[]>([]);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [selectedOfficeId, setSelectedOfficeId] = useState<string | null>(null);
  const [originalOfficeId, setOriginalOfficeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [officeResult, settingsResult] = await Promise.all([
        supabase
          .from('company_offices')
          .select('id, office_name, city, state, display_order')
          .order('display_order', { ascending: true }),
        supabase
          .from('company_settings')
          .select('id, kiosk_office_id')
          .maybeSingle(),
      ]);

      if (officeResult.error) throw officeResult.error;
      setOffices(officeResult.data ?? []);

      if (settingsResult.error) throw settingsResult.error;
      const kioskOfficeId = settingsResult.data?.kiosk_office_id ?? null;
      setSettingsId(settingsResult.data?.id ?? null);
      setSelectedOfficeId(kioskOfficeId);
      setOriginalOfficeId(kioskOfficeId);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!settingsId) return;
    setSaving(true);
    setSaved(false);
    try {
      const { error } = await supabase
        .from('company_settings')
        .update({ kiosk_office_id: selectedOfficeId })
        .eq('id', settingsId);

      if (error) throw error;
      setOriginalOfficeId(selectedOfficeId);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save kiosk office setting:', err);
    } finally {
      setSaving(false);
    }
  }

  const isDirty = selectedOfficeId !== originalOfficeId;

  const activeOffice = offices.find(o => o.id === selectedOfficeId);
  const fallbackOffice = offices[0];
  const effectiveOffice = activeOffice ?? fallbackOffice;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
          <Monitor className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Kiosk Settings</h3>
          <p className="text-sm text-gray-500">Configure the default office for tradeshow and kiosk lead submissions</p>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
        <MapPin className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
        <div className="text-sm text-blue-800">
          <p className="font-medium mb-1">How office assignment works</p>
          <p>When a visitor submits through the kiosk, they are created as both a contact and a lead. Both are assigned to the selected office below. If no office is selected, the system automatically uses the first office in display order.</p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Assign kiosk submissions to this office
        </label>

        {offices.length === 0 ? (
          <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
            <Building2 className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No offices configured yet.</p>
            <p className="text-xs mt-1">Add offices in the Company settings tab first.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {offices.map(office => {
              const isSelected = selectedOfficeId === office.id;
              const isFallback = !selectedOfficeId && office.id === fallbackOffice?.id;
              return (
                <button
                  key={office.id}
                  onClick={() => setSelectedOfficeId(isSelected ? null : office.id)}
                  className={`relative text-left p-4 rounded-lg border-2 transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 shadow-sm'
                      : isFallback
                      ? 'border-amber-400 bg-amber-50'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {isSelected && (
                    <CheckCircle2 className="absolute top-3 right-3 w-5 h-5 text-blue-500" />
                  )}
                  {isFallback && !isSelected && (
                    <span className="absolute top-2 right-2 text-xs font-medium text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                      Auto
                    </span>
                  )}
                  <div className="flex items-start gap-2 pr-6">
                    <Building2 className={`w-4 h-4 mt-0.5 shrink-0 ${isSelected ? 'text-blue-500' : 'text-gray-400'}`} />
                    <div>
                      <p className={`font-medium text-sm ${isSelected ? 'text-blue-700' : 'text-gray-800'}`}>
                        {office.office_name}
                      </p>
                      {(office.city || office.state) && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {[office.city, office.state].filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {offices.length > 0 && (
        <div className={`rounded-lg px-4 py-3 text-sm ${
          effectiveOffice
            ? 'bg-gray-50 border border-gray-200 text-gray-700'
            : 'bg-amber-50 border border-amber-200 text-amber-800'
        }`}>
          {effectiveOffice ? (
            <>
              <span className="font-medium">Current behavior: </span>
              New kiosk submissions will be assigned to{' '}
              <span className="font-semibold">{effectiveOffice.office_name}</span>
              {!selectedOfficeId && (
                <span className="text-gray-500"> (fallback — first office by display order)</span>
              )}
            </>
          ) : (
            'No offices available. Please add offices in the Company settings tab.'
          )}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving || !isDirty}
          className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all ${
            isDirty && !saving
              ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saving ? 'Saving...' : 'Save Changes'}
        </button>

        {saved && (
          <div className="flex items-center gap-1.5 text-sm text-green-600">
            <CheckCircle2 className="w-4 h-4" />
            Saved successfully
          </div>
        )}
      </div>
    </div>
  );
}
