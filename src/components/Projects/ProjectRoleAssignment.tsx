import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Users, ChevronDown, X, Loader2, DollarSign, PenTool, Briefcase } from 'lucide-react';

interface RoleEmployee {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

interface ProjectRoleAssignmentProps {
  projectId: string;
  currentSalespersonId: string | null;
  currentDesignerId: string | null;
  currentProjectManagerId: string | null;
  onUpdate: (updates: {
    salesperson_id?: string | null;
    designer_id?: string | null;
    project_manager_id?: string | null;
  }) => void;
  readOnly?: boolean;
}

interface RoleConfig {
  key: 'salesperson_id' | 'designer_id' | 'project_manager_id';
  commissionTypeKey: string;
  label: string;
  icon: typeof DollarSign;
  iconColor: string;
  badgeColor: string;
}

const ROLE_CONFIGS: RoleConfig[] = [
  {
    key: 'salesperson_id',
    commissionTypeKey: 'sales_projects',
    label: 'Salesperson',
    icon: DollarSign,
    iconColor: 'text-blue-400',
    badgeColor: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  },
  {
    key: 'designer_id',
    commissionTypeKey: 'design',
    label: 'Designer',
    icon: PenTool,
    iconColor: 'text-teal-400',
    badgeColor: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
  },
  {
    key: 'project_manager_id',
    commissionTypeKey: 'pm',
    label: 'Project Manager',
    icon: Briefcase,
    iconColor: 'text-amber-400',
    badgeColor: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
];

export function ProjectRoleAssignment({
  projectId,
  currentSalespersonId,
  currentDesignerId,
  currentProjectManagerId,
  onUpdate,
  readOnly = false,
}: ProjectRoleAssignmentProps) {
  const [employees, setEmployees] = useState<RoleEmployee[]>([]);
  const [roleUserTypes, setRoleUserTypes] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const currentValues: Record<string, string | null> = {
    salesperson_id: currentSalespersonId,
    designer_id: currentDesignerId,
    project_manager_id: currentProjectManagerId,
  };

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [employeesRes, settingsRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, email, role')
          .eq('is_active', true)
          .order('full_name'),
        supabase
          .from('company_commission_settings')
          .select('commission_role_user_types')
          .maybeSingle(),
      ]);

      if (employeesRes.error) throw employeesRes.error;
      setEmployees(employeesRes.data || []);
      setRoleUserTypes(settingsRes.data?.commission_role_user_types || {});
    } catch (err) {
      console.error('Error loading role assignment data:', err);
    } finally {
      setLoading(false);
    }
  }

  function getFilteredEmployees(commissionTypeKey: string): RoleEmployee[] {
    const allowedRoles = roleUserTypes[commissionTypeKey] || [];
    if (allowedRoles.length === 0) return employees;
    return employees.filter(e => allowedRoles.includes(e.role));
  }

  async function handleSelect(roleKey: string, employeeId: string | null) {
    setSaving(roleKey);
    setOpenDropdown(null);
    try {
      const dbField = roleKey;
      const { error } = await supabase
        .from('projects')
        .update({ [dbField]: employeeId })
        .eq('id', projectId);
      if (error) throw error;
      onUpdate({ [roleKey]: employeeId });
    } catch (err) {
      console.error('Error updating project role:', err);
    } finally {
      setSaving(null);
    }
  }

  function getEmployeeName(id: string | null): string {
    if (!id) return '';
    return employees.find(e => e.id === id)?.full_name || 'Unknown';
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-500 text-sm py-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading team roles...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Users className="w-4 h-4 text-gray-400" />
        <span className="text-sm font-medium text-gray-300">Project Team Roles</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {ROLE_CONFIGS.map(roleConfig => {
          const Icon = roleConfig.icon;
          const currentId = currentValues[roleConfig.key];
          const currentName = getEmployeeName(currentId);
          const filteredEmployees = getFilteredEmployees(roleConfig.commissionTypeKey);
          const isSaving = saving === roleConfig.key;
          const isOpen = openDropdown === roleConfig.key;

          return (
            <div key={roleConfig.key} className="relative">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Icon className={`w-3.5 h-3.5 ${roleConfig.iconColor}`} />
                <label className="text-xs font-medium text-gray-400">{roleConfig.label}</label>
              </div>

              {readOnly ? (
                <div className={`px-3 py-2 rounded-lg border text-sm ${
                  currentId
                    ? `${roleConfig.badgeColor} border`
                    : 'bg-gray-800/50 border-gray-700/40 text-gray-500'
                }`}>
                  {currentId ? currentName : 'Not assigned'}
                </div>
              ) : (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setOpenDropdown(isOpen ? null : roleConfig.key)}
                    disabled={isSaving}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-colors ${
                      currentId
                        ? 'bg-gray-800 border-gray-600 text-white hover:border-gray-500'
                        : 'bg-gray-800/50 border-gray-700/40 text-gray-500 hover:border-gray-600 hover:text-gray-400'
                    } focus:outline-none focus:ring-2 focus:ring-blue-500/50`}
                  >
                    <span className="truncate">
                      {isSaving ? (
                        <span className="flex items-center gap-1.5">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Saving...
                        </span>
                      ) : currentId ? (
                        currentName
                      ) : (
                        `Assign ${roleConfig.label}`
                      )}
                    </span>
                    <ChevronDown className={`w-4 h-4 shrink-0 ml-2 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isOpen && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl overflow-hidden">
                      {currentId && (
                        <button
                          type="button"
                          onClick={() => handleSelect(roleConfig.key, null)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-gray-700/50 transition-colors border-b border-gray-700"
                        >
                          <X className="w-3.5 h-3.5" />
                          Remove assignment
                        </button>
                      )}
                      <div className="max-h-48 overflow-y-auto">
                        {filteredEmployees.length === 0 ? (
                          <div className="px-3 py-3 text-xs text-gray-500 text-center">
                            No eligible employees found
                          </div>
                        ) : (
                          filteredEmployees.map(emp => (
                            <button
                              key={emp.id}
                              type="button"
                              onClick={() => handleSelect(roleConfig.key, emp.id)}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left transition-colors hover:bg-gray-700/50 ${
                                emp.id === currentId ? 'bg-gray-700/30 text-white' : 'text-gray-300'
                              }`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate">{emp.full_name}</div>
                                <div className="text-[11px] text-gray-500 truncate capitalize">{emp.role?.replace('_', ' ')}</div>
                              </div>
                              {emp.id === currentId && (
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {openDropdown && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setOpenDropdown(null)}
        />
      )}
    </div>
  );
}
