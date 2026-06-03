import { useState, useEffect } from 'react';
import { Users, CreditCard as Edit2, Save, X, DollarSign, ChevronDown, ChevronUp, Check, Loader2, Search, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface EmployeeConfig {
  id: string;
  employee_id: string;
  eligible_for_commissions: boolean;
  custom_sales_projects_rate: number | null;
  custom_design_rate: number | null;
  custom_pm_rate: number | null;
  custom_service_sales_rate: number | null;
  custom_service_pm_rate: number | null;
  custom_contract_commission_rate: number | null;
  design_credit_mode: 'auto' | 'manual';
  bonus_tier_threshold: number | null;
  bonus_tier_rate: number | null;
}

interface CompanyDefaults {
  default_sales_projects_rate: number;
  default_design_rate: number;
  default_pm_rate: number;
  default_service_sales_rate: number;
  default_service_pm_rate: number;
  default_contract_commission_rate: number;
}

interface EmployeeProfile {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

const rateFields = [
  { key: 'custom_sales_projects_rate' as const, defaultKey: 'default_sales_projects_rate' as const, label: 'Sales (Projects)', desc: 'On collected project funds' },
  { key: 'custom_design_rate' as const, defaultKey: 'default_design_rate' as const, label: 'Design', desc: 'When credited as designer' },
  { key: 'custom_pm_rate' as const, defaultKey: 'default_pm_rate' as const, label: 'Project Mgmt', desc: 'On collected project funds' },
  { key: 'custom_service_sales_rate' as const, defaultKey: 'default_service_sales_rate' as const, label: 'Service Sales', desc: 'On collected service work' },
  { key: 'custom_service_pm_rate' as const, defaultKey: 'default_service_pm_rate' as const, label: 'Service PM', desc: 'On collected service work' },
  { key: 'custom_contract_commission_rate' as const, defaultKey: 'default_contract_commission_rate' as const, label: 'Contract Sales', desc: 'Security/VIP/service plan contracts' },
];

export function EmployeeCommissionConfig() {
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [configs, setConfigs] = useState<Map<string, EmployeeConfig>>(new Map());
  const [defaults, setDefaults] = useState<CompanyDefaults | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRates, setEditRates] = useState<Record<string, string>>({});
  const [editBonusThreshold, setEditBonusThreshold] = useState('');
  const [editBonusRate, setEditBonusRate] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [employeesRes, configsRes, defaultsRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email, role').eq('is_active', true).order('full_name'),
        supabase.from('employee_commission_config').select('*'),
        supabase.from('company_commission_settings').select('default_sales_projects_rate, default_design_rate, default_pm_rate, default_service_sales_rate, default_service_pm_rate, default_contract_commission_rate').maybeSingle(),
      ]);

      if (employeesRes.error) throw employeesRes.error;
      if (configsRes.error) throw configsRes.error;

      setEmployees(employeesRes.data || []);
      setDefaults(defaultsRes.data || null);

      const configMap = new Map<string, EmployeeConfig>();
      (configsRes.data || []).forEach((config: any) => {
        configMap.set(config.employee_id, config);
      });
      setConfigs(configMap);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function toggleEligibility(employeeId: string) {
    const existingConfig = configs.get(employeeId);
    try {
      if (existingConfig) {
        const { error } = await supabase
          .from('employee_commission_config')
          .update({ eligible_for_commissions: !existingConfig.eligible_for_commissions })
          .eq('id', existingConfig.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('employee_commission_config')
          .insert({ employee_id: employeeId, eligible_for_commissions: true });
        if (error) throw error;
      }
      await loadData();
    } catch (err) {
      console.error('Error toggling eligibility:', err);
    }
  }

  function startEditing(employeeId: string) {
    const config = configs.get(employeeId);
    const rates: Record<string, string> = {};
    rateFields.forEach(f => {
      const val = config?.[f.key];
      rates[f.key] = val !== null && val !== undefined ? String(val) : '';
    });
    setEditRates(rates);
    setEditBonusThreshold(config?.bonus_tier_threshold != null ? String(config.bonus_tier_threshold) : '');
    setEditBonusRate(config?.bonus_tier_rate != null ? String(config.bonus_tier_rate) : '');
    setEditingId(employeeId);
  }

  async function saveRates(employeeId: string) {
    setSaving(true);
    try {
      const updates: Record<string, number | null> = {};
      rateFields.forEach(f => {
        const val = editRates[f.key];
        updates[f.key] = val !== '' ? parseFloat(val) : null;
      });
      updates.bonus_tier_threshold = editBonusThreshold !== '' ? parseFloat(editBonusThreshold) : null;
      updates.bonus_tier_rate = editBonusRate !== '' ? parseFloat(editBonusRate) : null;

      const existingConfig = configs.get(employeeId);
      if (existingConfig) {
        const { error } = await supabase
          .from('employee_commission_config')
          .update(updates)
          .eq('id', existingConfig.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('employee_commission_config')
          .insert({ employee_id: employeeId, eligible_for_commissions: true, ...updates });
        if (error) throw error;
      }

      await loadData();
      setEditingId(null);
    } catch (err) {
      console.error('Error saving rates:', err);
    } finally {
      setSaving(false);
    }
  }

  function clearCustomRates(employeeId: string) {
    const cleared: Record<string, string> = {};
    rateFields.forEach(f => { cleared[f.key] = ''; });
    setEditRates(cleared);
    setEditBonusThreshold('');
    setEditBonusRate('');
  }

  const filteredEmployees = employees.filter(e =>
    e.full_name.toLowerCase().includes(search.toLowerCase()) ||
    e.email.toLowerCase().includes(search.toLowerCase())
  );

  const eligibleCount = [...configs.values()].filter(c => c.eligible_for_commissions).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-white">Employee Commission Configuration</h2>
          <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
            {eligibleCount} eligible
          </span>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search employees..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent w-56"
          />
        </div>
      </div>

      <div className="space-y-2">
        {filteredEmployees.map(employee => {
          const config = configs.get(employee.id);
          const isEligible = config?.eligible_for_commissions || false;
          const isEditing = editingId === employee.id;
          const hasCustomRates = config && rateFields.some(f => config[f.key] !== null);

          return (
            <div key={employee.id} className="bg-gray-900/50 rounded-lg border border-gray-700/50 overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">{employee.full_name}</div>
                  <div className="text-xs text-gray-500 truncate">{employee.email}</div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {hasCustomRates && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded">
                      Custom Rates
                    </span>
                  )}

                  <button
                    onClick={() => toggleEligibility(employee.id)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                      isEligible
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30'
                        : 'bg-gray-700 text-gray-400 border border-gray-600 hover:bg-gray-600'
                    }`}
                  >
                    {isEligible ? 'Eligible' : 'Not Eligible'}
                  </button>

                  {isEligible && (
                    <button
                      onClick={() => isEditing ? setEditingId(null) : startEditing(employee.id)}
                      className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                      title={isEditing ? 'Close' : 'Edit rates'}
                    >
                      {isEditing ? <ChevronUp className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </div>

              {isEditing && (
                <div className="px-4 pb-4 pt-1 border-t border-gray-700/50 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {rateFields.map(field => {
                      const defaultVal = defaults?.[field.defaultKey];
                      return (
                        <div key={field.key}>
                          <label className="block text-xs font-medium text-gray-400 mb-1">{field.label}</label>
                          <div className="relative">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              placeholder={defaultVal != null ? `Default: ${defaultVal}%` : 'Not set'}
                              value={editRates[field.key] || ''}
                              onChange={e => setEditRates({ ...editRates, [field.key]: e.target.value })}
                              className="w-full px-3 py-2 pr-8 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">%</span>
                          </div>
                          <p className="text-[10px] text-gray-600 mt-0.5">{field.desc}</p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="border-t border-gray-700/30 pt-3">
                    <h4 className="text-xs font-medium text-gray-400 mb-2">Bonus Tier (Optional)</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Threshold ($)</label>
                        <input
                          type="number"
                          step="1000"
                          min="0"
                          placeholder="e.g. 500000"
                          value={editBonusThreshold}
                          onChange={e => setEditBonusThreshold(e.target.value)}
                          className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Bonus Rate (%)</label>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            placeholder="e.g. 1.5"
                            value={editBonusRate}
                            onChange={e => setEditBonusRate(e.target.value)}
                            className="w-full px-3 py-2 pr-8 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">%</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-[10px] text-gray-600 mt-1">
                      Additional commission earned when total sales exceed the threshold amount
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => saveRates(employee.id)}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      Save Rates
                    </button>
                    <button
                      onClick={() => clearCustomRates(employee.id)}
                      className="px-3 py-2 text-gray-400 text-sm hover:text-white transition-colors"
                    >
                      Clear Custom
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-3 py-2 text-gray-400 text-sm hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {filteredEmployees.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <AlertCircle className="w-6 h-6 mx-auto mb-2 text-gray-600" />
            No employees match your search
          </div>
        )}
      </div>

      <div className="bg-gray-900/30 rounded-lg border border-gray-700/30 p-4">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">How It Works</h4>
        <ul className="text-xs text-gray-500 space-y-1">
          <li>Toggle "Eligible" to enable commission tracking for an employee</li>
          <li>Click the edit icon to set custom rates that override company defaults</li>
          <li>Leave a rate blank to use the company default for that commission type</li>
          <li>Bonus tiers add extra commission when an employee's total sales exceed the threshold</li>
        </ul>
      </div>
    </div>
  );
}
