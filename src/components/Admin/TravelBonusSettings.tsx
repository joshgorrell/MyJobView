import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { MapPin, DollarSign, Save, Building2, Clock, User, AlertTriangle, X } from 'lucide-react';

interface OfficeSettings {
  id: string;
  office_id: string;
  radius_miles: number;
  default_rate_per_mile: number;
  calculation_method: string;
  auto_approve_under_amount: number | null;
  same_day_job_window_hours: number;
  office: {
    office_name: string;
    city: string;
    state: string;
  };
}

interface TechOverride {
  id: string;
  full_name: string;
  username: string;
  travel_bonus_rate: number;
  travel_bonus_method: string;
  travel_bonus_enabled: boolean;
  primary_office_id: string | null;
  office_name: string | null;
}

export function TravelBonusSettings() {
  const [officeSettings, setOfficeSettings] = useState<OfficeSettings[]>([]);
  const [techOverrides, setTechOverrides] = useState<TechOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [savingTech, setSavingTech] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const [officesRes, settingsRes, techRes] = await Promise.all([
        supabase.from('company_offices').select('id, office_name, city, state').order('office_name'),
        supabase.from('office_travel_settings').select('*'),
        supabase
          .from('profiles')
          .select('id, full_name, username, travel_bonus_rate, travel_bonus_method, travel_bonus_enabled, primary_office_id')
          .or('travel_bonus_enabled.eq.true,travel_bonus_rate.not.is.null')
          .order('full_name'),
      ]);

      if (officesRes.error) throw officesRes.error;
      if (settingsRes.error) throw settingsRes.error;

      const combined = officesRes.data?.map(office => {
        const setting = settingsRes.data?.find(s => s.office_id === office.id);
        return setting ? {
          ...setting,
          office,
        } : {
          id: '',
          office_id: office.id,
          radius_miles: 15.0,
          default_rate_per_mile: 0.50,
          calculation_method: 'round_trip',
          auto_approve_under_amount: null,
          same_day_job_window_hours: 4.0,
          office,
        };
      }) || [];

      setOfficeSettings(combined);

      if (techRes.data) {
        const officeMap = new Map(officesRes.data?.map(o => [o.id, o.office_name]) || []);
        const techs: TechOverride[] = techRes.data.map(t => ({
          id: t.id,
          full_name: t.full_name || t.username || 'Unknown',
          username: t.username || '',
          travel_bonus_rate: t.travel_bonus_rate,
          travel_bonus_method: t.travel_bonus_method || 'round_trip',
          travel_bonus_enabled: t.travel_bonus_enabled || false,
          primary_office_id: t.primary_office_id,
          office_name: t.primary_office_id ? (officeMap.get(t.primary_office_id) || null) : null,
        }));
        setTechOverrides(techs);
      }
    } catch (error) {
      console.error('Error loading travel bonus settings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function saveOfficeSettings(setting: OfficeSettings) {
    setSaving(setting.office_id);

    try {
      if (setting.id) {
        const { error } = await supabase
          .from('office_travel_settings')
          .update({
            radius_miles: setting.radius_miles,
            default_rate_per_mile: setting.default_rate_per_mile,
            calculation_method: setting.calculation_method,
            auto_approve_under_amount: setting.auto_approve_under_amount,
            same_day_job_window_hours: setting.same_day_job_window_hours,
          })
          .eq('id', setting.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('office_travel_settings')
          .insert({
            office_id: setting.office_id,
            radius_miles: setting.radius_miles,
            default_rate_per_mile: setting.default_rate_per_mile,
            calculation_method: setting.calculation_method,
            auto_approve_under_amount: setting.auto_approve_under_amount,
            same_day_job_window_hours: setting.same_day_job_window_hours,
          });

        if (error) throw error;
      }

      await loadSettings();
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings');
    } finally {
      setSaving(null);
    }
  }

  async function clearTechOverride(techId: string) {
    setSavingTech(techId);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ travel_bonus_rate: null, travel_bonus_method: null })
        .eq('id', techId);

      if (error) throw error;
      await loadSettings();
    } catch (error) {
      console.error('Error clearing tech override:', error);
      alert('Failed to clear override');
    } finally {
      setSavingTech(null);
    }
  }

  async function saveTechOverride(tech: TechOverride) {
    setSavingTech(tech.id);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          travel_bonus_rate: tech.travel_bonus_rate,
          travel_bonus_method: tech.travel_bonus_method,
        })
        .eq('id', tech.id);

      if (error) throw error;
      await loadSettings();
    } catch (error) {
      console.error('Error saving tech override:', error);
      alert('Failed to save override');
    } finally {
      setSavingTech(null);
    }
  }

  function updateOfficeSetting(officeId: string, field: string, value: any) {
    setOfficeSettings(prev => prev.map(setting =>
      setting.office_id === officeId ? { ...setting, [field]: value } : setting
    ));
  }

  function updateTechOverride(techId: string, field: string, value: any) {
    setTechOverrides(prev => prev.map(t =>
      t.id === techId ? { ...t, [field]: value } : t
    ));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading travel bonus settings...</div>
      </div>
    );
  }

  const techs = techOverrides.filter(t => t.travel_bonus_rate !== null);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-white">Travel Bonus Settings</h2>
        <p className="text-gray-300">
          Configure travel bonus calculations per office
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="font-semibold text-blue-900 mb-2">How Travel Bonuses Work</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• <strong>Radius Bubble:</strong> Miles within this radius of the office don't count toward the bonus</li>
          <li>• <strong>Rate Per Mile:</strong> Default bonus per eligible mile (can be overridden per tech below)</li>
          <li>• <strong>Round Trip:</strong> Calculates office &rarr; job &rarr; office (subtracts radius &times; 2)</li>
          <li>• <strong>One Way:</strong> Calculates office &rarr; job only (subtracts radius &times; 1)</li>
          <li>• <strong>Auto-Approve:</strong> Automatically approve bonuses under this amount (optional)</li>
          <li>• <strong>Job Window:</strong> If a tech clocked out of another job within this many hours, the bonus is calculated job-to-job instead of office-to-job — preventing double-counting the office distance</li>
        </ul>
      </div>

      <div className="space-y-4">
        {officeSettings.map(setting => (
          <div key={setting.office_id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <Building2 className="w-6 h-6 text-blue-600" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {setting.office.office_name}
                </h3>
                <p className="text-sm text-gray-500">
                  {setting.office.city}, {setting.office.state}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <MapPin className="w-4 h-4 inline mr-1" />
                  Radius Bubble (miles)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={setting.radius_miles}
                  onChange={(e) => updateOfficeSetting(setting.office_id, 'radius_miles', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="15.0"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Miles within this radius don't count toward bonus
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <DollarSign className="w-4 h-4 inline mr-1" />
                  Default Rate Per Mile
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={setting.default_rate_per_mile}
                  onChange={(e) => updateOfficeSetting(setting.office_id, 'default_rate_per_mile', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="0.40"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Can be overridden per technician — see below
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Calculation Method
                </label>
                <select
                  value={setting.calculation_method}
                  onChange={(e) => updateOfficeSetting(setting.office_id, 'calculation_method', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="round_trip">Round Trip (Office → Job → Office)</option>
                  <option value="one_way">One Way (Office → Job)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Auto-Approve Under Amount (Optional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={setting.auto_approve_under_amount || ''}
                  onChange={(e) => updateOfficeSetting(setting.office_id, 'auto_approve_under_amount', e.target.value ? parseFloat(e.target.value) : null)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="Leave empty for manual approval"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Bonuses under this amount will be auto-approved
                </p>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Clock className="w-4 h-4 inline mr-1" />
                  Same-Day Job Window (hours)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="24"
                  value={setting.same_day_job_window_hours}
                  onChange={(e) => updateOfficeSetting(setting.office_id, 'same_day_job_window_hours', parseFloat(e.target.value) || 4.0)}
                  className="w-full md:w-48 px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="4.0"
                />
                <p className="text-xs text-gray-500 mt-1">
                  If a tech clocked out of a prior job within this window, the travel bonus is calculated job-to-job (full mileage, no radius deduction) instead of office-to-job. Set to 0 to always use the office as the origin.
                </p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="text-sm text-gray-600">
                  <strong>Example:</strong> 30 mile round trip =
                  {setting.calculation_method === 'round_trip'
                    ? ` ${Math.max(0, 30 - (setting.radius_miles * 2)).toFixed(1)} eligible miles`
                    : ` ${Math.max(0, 15 - setting.radius_miles).toFixed(1)} eligible miles`
                  } × ${setting.default_rate_per_mile.toFixed(2)} =
                  <strong className="text-green-600 ml-1">
                    ${(Math.max(0, (setting.calculation_method === 'round_trip' ? 30 - (setting.radius_miles * 2) : 15 - setting.radius_miles)) * setting.default_rate_per_mile).toFixed(2)}
                  </strong>
                </div>
                <button
                  onClick={() => saveOfficeSettings(setting)}
                  disabled={saving === setting.office_id}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                >
                  <Save className="w-4 h-4" />
                  {saving === setting.office_id ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {techs.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <User className="w-6 h-6 text-orange-600" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Per-Technician Rate Overrides</h3>
              <p className="text-sm text-gray-500">
                These technicians have individual rates set that override the office default
              </p>
            </div>
          </div>

          <div className="mb-4 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              Individual tech rates take priority over office rates. If a tech's rate doesn't match your office default, clear it to use the office rate instead.
            </p>
          </div>

          <div className="space-y-3">
            {techs.map(tech => (
              <div key={tech.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900">{tech.full_name}</div>
                  <div className="text-sm text-gray-500">
                    {tech.office_name ? `Office: ${tech.office_name}` : 'No office assigned'}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Rate / Mile</label>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500 text-sm">$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={tech.travel_bonus_rate}
                        onChange={(e) => updateTechOverride(tech.id, 'travel_bonus_rate', parseFloat(e.target.value) || 0)}
                        className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Method</label>
                    <select
                      value={tech.travel_bonus_method}
                      onChange={(e) => updateTechOverride(tech.id, 'travel_bonus_method', e.target.value)}
                      className="px-2 py-1.5 border border-gray-300 rounded text-sm"
                    >
                      <option value="round_trip">Round Trip</option>
                      <option value="one_way">One Way</option>
                    </select>
                  </div>

                  <div className="flex items-end gap-2 pb-0.5">
                    <button
                      onClick={() => saveTechOverride(tech)}
                      disabled={savingTech === tech.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:bg-gray-400"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {savingTech === tech.id ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={() => clearTechOverride(tech.id)}
                      disabled={savingTech === tech.id}
                      title="Clear override — tech will use office default rate"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded text-sm hover:bg-red-100 disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" />
                      Clear
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
