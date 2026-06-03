import { useState, useEffect } from 'react';
import { DollarSign, Save, RefreshCw, Loader2, CheckCircle, AlertCircle, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface CommissionSettings {
  id: string;
  commission_basis: 'gross' | 'profit';
  default_sales_projects_rate: number;
  default_design_rate: number;
  default_pm_rate: number;
  default_service_sales_rate: number;
  default_service_pm_rate: number;
  default_contract_commission_rate: number;
  commission_role_user_types: Record<string, string[]>;
}

const rateFields: { key: keyof Omit<CommissionSettings, 'id' | 'commission_basis' | 'commission_role_user_types'>; label: string; desc: string; isContract?: boolean }[] = [
  { key: 'default_sales_projects_rate', label: 'Sales (Projects)', desc: 'Paid on project funds collected' },
  { key: 'default_design_rate', label: 'Design', desc: 'Paid if separate designer credited' },
  { key: 'default_pm_rate', label: 'Project Management', desc: 'Paid on collected project funds' },
  { key: 'default_service_sales_rate', label: 'Service Sales', desc: 'Paid on collected service work' },
  { key: 'default_service_pm_rate', label: 'Service PM', desc: 'Paid on collected service work' },
  { key: 'default_contract_commission_rate', label: 'Contract Sales', desc: 'Security contracts, VIP & service plans — term × monthly × rate', isContract: true },
];

const ROLE_TYPE_CONFIGS: { key: string; label: string; desc: string }[] = [
  { key: 'sales_projects', label: 'Sales (Projects)', desc: 'Who can be selected as salesperson on a project' },
  { key: 'design', label: 'Design', desc: 'Who can be selected as designer on a project' },
  { key: 'pm', label: 'Project Management', desc: 'Who can be selected as project manager on a project' },
  { key: 'service_sales', label: 'Service Sales', desc: 'Who earns service sales commissions' },
  { key: 'service_pm', label: 'Service PM', desc: 'Who can manage service projects for commission' },
];

const AVAILABLE_ROLES: { value: string; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'finance', label: 'Finance' },
  { value: 'sales', label: 'Sales' },
  { value: 'tech', label: 'Technician' },
  { value: 'service_manager', label: 'Service Manager' },
];

export function CompanyCommissionSettings() {
  const [settings, setSettings] = useState<CommissionSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const { data, error } = await supabase
        .from('company_commission_settings')
        .select('*')
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setSettings({
          ...data,
          commission_role_user_types: data.commission_role_user_types || {},
        });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleRoleForType(commissionTypeKey: string, roleValue: string) {
    if (!settings) return;
    const current = settings.commission_role_user_types[commissionTypeKey] || [];
    const updated = current.includes(roleValue)
      ? current.filter(r => r !== roleValue)
      : [...current, roleValue];
    setSettings({
      ...settings,
      commission_role_user_types: {
        ...settings.commission_role_user_types,
        [commissionTypeKey]: updated,
      },
    });
  }

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const { error } = await supabase
        .from('company_commission_settings')
        .update({
          commission_basis: settings.commission_basis,
          default_sales_projects_rate: settings.default_sales_projects_rate,
          default_design_rate: settings.default_design_rate,
          default_pm_rate: settings.default_pm_rate,
          default_service_sales_rate: settings.default_service_sales_rate,
          default_service_pm_rate: settings.default_service_pm_rate,
          default_contract_commission_rate: settings.default_contract_commission_rate,
          commission_role_user_types: settings.commission_role_user_types,
        })
        .eq('id', settings.id);
      if (error) throw error;
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
        <p className="text-gray-400">Failed to load commission settings</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <DollarSign className="w-5 h-5 text-green-400" />
        <h2 className="text-lg font-semibold text-white">Company Commission Settings</h2>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-sm">
          <CheckCircle className="w-4 h-4 shrink-0" />
          Settings saved successfully
        </div>
      )}

      <div className="bg-gray-900/50 rounded-lg border border-gray-700/50 p-5 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">Commission Basis</label>
          <select
            value={settings.commission_basis}
            onChange={e => setSettings({ ...settings, commission_basis: e.target.value as 'gross' | 'profit' })}
            className="w-full sm:w-64 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="gross">Gross (Full Sale Price)</option>
            <option value="profit">Profit (Sale Price - Cost)</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">
            {settings.commission_basis === 'gross'
              ? 'Commissions calculated on the full sale amount'
              : 'Commissions calculated on profit margin only'}
          </p>
        </div>

        <div className="border-t border-gray-700/50 pt-5">
          <h3 className="text-sm font-semibold text-gray-300 mb-1">Default Commission Rates</h3>
          <p className="text-xs text-gray-500 mb-4">
            Applied to all employees unless overridden at the employee or project level.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {rateFields.filter(f => !f.isContract).map(field => (
              <div key={field.key}>
                <label className="block text-xs font-medium text-gray-400 mb-1">{field.label}</label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={settings[field.key]}
                    onChange={e => setSettings({ ...settings, [field.key]: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 pr-8 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">%</span>
                </div>
                <p className="text-[10px] text-gray-600 mt-0.5">{field.desc}</p>
              </div>
            ))}
          </div>

          {/* Contract Commission Rate — separate section */}
          <div className="border-t border-gray-700/50 pt-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-full uppercase tracking-wider">
                Contract Sales
              </span>
              <p className="text-xs text-gray-500">Applied to security contracts, VIP plans, and service plans at point of sale</p>
            </div>
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-4">
              <div className="flex items-start gap-6 flex-wrap">
                <div className="w-40">
                  <label className="block text-xs font-medium text-gray-400 mb-1">Contract Commission Rate</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={settings.default_contract_commission_rate}
                      onChange={e => setSettings({ ...settings, default_contract_commission_rate: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 pr-8 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">%</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 mb-1">Formula applied to every contract sale:</p>
                  <div className="flex items-center gap-1.5 flex-wrap text-xs">
                    <span className="px-2 py-1 bg-gray-800 rounded text-gray-300">Term (months)</span>
                    <span className="text-gray-600">×</span>
                    <span className="px-2 py-1 bg-gray-800 rounded text-gray-300">Monthly Amount</span>
                    <span className="text-gray-600">=</span>
                    <span className="px-2 py-1 bg-gray-800 rounded text-gray-300">Total Contract Value</span>
                    <span className="text-gray-600">×</span>
                    <span className="px-2 py-1 bg-emerald-900/40 rounded text-emerald-400 font-medium">{settings.default_contract_commission_rate}%</span>
                    <span className="text-gray-600">=</span>
                    <span className="px-2 py-1 bg-gray-800 rounded text-green-400 font-medium">Commission</span>
                  </div>
                  <p className="text-[10px] text-gray-600 mt-1.5">
                    Example: 36 months × $40/mo = $1,440 × {settings.default_contract_commission_rate}% = ${(1440 * settings.default_contract_commission_rate / 100).toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Role Type Assignments */}
        <div className="border-t border-gray-700/50 pt-5">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-gray-300">Role Type Assignments</h3>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            For each commission type, select which user roles are eligible to serve that role on a project.
            When assigning people to a job, only employees with a matching role will appear in the picker.
          </p>

          <div className="space-y-4">
            {ROLE_TYPE_CONFIGS.map(commType => {
              const selected = settings.commission_role_user_types[commType.key] || [];
              return (
                <div key={commType.key} className="bg-gray-800/50 rounded-lg border border-gray-700/40 p-4">
                  <div className="mb-3">
                    <div className="text-sm font-medium text-white">{commType.label}</div>
                    <div className="text-[11px] text-gray-500 mt-0.5">{commType.desc}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {AVAILABLE_ROLES.map(role => {
                      const isSelected = selected.includes(role.value);
                      return (
                        <button
                          key={role.value}
                          type="button"
                          onClick={() => toggleRoleForType(commType.key, role.value)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                            isSelected
                              ? 'bg-blue-600/30 text-blue-300 border-blue-500/50 hover:bg-blue-600/40'
                              : 'bg-gray-700/50 text-gray-400 border-gray-600/50 hover:bg-gray-700 hover:text-gray-300'
                          }`}
                        >
                          {isSelected && (
                            <CheckCircle className="w-3 h-3 inline mr-1 -mt-0.5" />
                          )}
                          {role.label}
                        </button>
                      );
                    })}
                  </div>
                  {selected.length === 0 && (
                    <p className="text-[11px] text-gray-600 mt-2 italic">
                      No roles selected — all active employees will be available for this role
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-t border-gray-700/50 pt-4">
          <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
            <h4 className="text-xs font-semibold text-blue-400 mb-1">Notes</h4>
            <ul className="text-xs text-gray-500 space-y-0.5">
              <li>Project/service commissions accrue when invoice payments are received</li>
              <li>Contract commissions are earned at point of sale (full term value × rate)</li>
              <li>Changes affect future commissions only — existing records are not altered</li>
              <li>Employee-level overrides take precedence over these company defaults</li>
              <li>Role assignments filter who appears in project role pickers — leaving a type empty shows all employees</li>
            </ul>
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            onClick={loadSettings}
            className="px-4 py-2 border border-gray-600 text-gray-400 rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 sm:flex-none px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors flex items-center justify-center gap-2 text-sm font-medium disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
