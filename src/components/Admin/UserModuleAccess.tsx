import { useState, useEffect } from 'react';
import { X, Shield, Eye, EyeOff, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface UserModuleAccessProps {
  userId: string;
  userName: string;
  userRoleId: string | null;
  onClose: () => void;
}

interface Department {
  id: string;
  name: string;
  display_name: string;
  color: string;
}

interface Module {
  id: string;
  department_id: string;
  module_key: string;
  display_name: string;
  description: string;
  icon: string;
  sort_order: number;
  is_active: boolean;
}

interface ModuleOverride {
  id: string;
  user_id: string;
  module_id: string;
  override_type: 'grant' | 'revoke';
}

interface RoleModuleAccess {
  module_id: string;
  has_access: boolean;
}

interface GroupedModules {
  [departmentId: string]: Module[];
}

export function UserModuleAccess({ userId, userName, userRoleId, onClose }: UserModuleAccessProps) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [modules, setModules] = useState<GroupedModules>({});
  const [allModules, setAllModules] = useState<Module[]>([]);
  const [roleAccess, setRoleAccess] = useState<Map<string, boolean>>(new Map());
  const [overrides, setOverrides] = useState<Map<string, ModuleOverride>>(new Map());
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    loadData();
  }, [userId, userRoleId]);

  async function loadData() {
    setLoading(true);
    try {
      const { data: deptData, error: deptError } = await supabase
        .from('departments')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      if (deptError) throw deptError;
      setDepartments(deptData || []);

      const { data: moduleData, error: moduleError } = await supabase
        .from('department_modules')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      if (moduleError) throw moduleError;

      const grouped: GroupedModules = {};
      (moduleData || []).forEach((module: Module) => {
        if (!grouped[module.department_id]) {
          grouped[module.department_id] = [];
        }
        grouped[module.department_id].push(module);
      });
      setModules(grouped);
      setAllModules(moduleData || []);

      if (userRoleId) {
        const { data: roleAccessData, error: roleError } = await supabase
          .from('role_module_access')
          .select('module_id, has_access')
          .eq('role_id', userRoleId);

        if (roleError) throw roleError;

        const accessMap = new Map<string, boolean>();
        (roleAccessData || []).forEach((item: RoleModuleAccess) => {
          accessMap.set(item.module_id, item.has_access);
        });
        setRoleAccess(accessMap);
      }

      const { data: overrideData, error: overrideError } = await supabase
        .from('user_permission_overrides')
        .select('*')
        .eq('user_id', userId);

      if (overrideError) throw overrideError;

      const overrideMap = new Map<string, ModuleOverride>();
      (overrideData || []).forEach((override: ModuleOverride) => {
        overrideMap.set(override.module_id, override);
      });
      setOverrides(overrideMap);

      const initialExpanded = new Set<string>();
      (deptData || []).forEach((dept: Department) => {
        initialExpanded.add(dept.id);
      });
      setExpandedDepts(initialExpanded);
    } catch (error) {
      console.error('Error loading module access:', error);
      showMessage('error', 'Failed to load module access data');
    } finally {
      setLoading(false);
    }
  }

  function showMessage(type: 'success' | 'error', text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  }

  async function handleToggleAccess(moduleId: string) {
    const module = allModules.find(m => m.id === moduleId);
    if (!module) return;

    // Find all copies of this module across every department (same module_key)
    const siblings = allModules.filter(m => m.module_key === module.module_key);
    const siblingIds = siblings.map(m => m.id);

    // Determine current effective access across all copies
    const currentAccess = getEffectiveAccess(moduleId);
    const newAccess = !currentAccess;

    // Determine the role default across all copies (true if any copy has role access)
    const roleHasAccess = siblings.some(s => roleAccess.get(s.id) ?? false);

    try {
      if (newAccess === roleHasAccess) {
        // New value matches role default — remove all overrides for this module_key
        const overridesToDelete = siblingIds.filter(id => overrides.has(id));
        if (overridesToDelete.length > 0) {
          const { error } = await supabase
            .from('user_permission_overrides')
            .delete()
            .eq('user_id', userId)
            .in('module_id', overridesToDelete);

          if (error) throw error;
        }

        const newOverrides = new Map(overrides);
        overridesToDelete.forEach(id => newOverrides.delete(id));
        setOverrides(newOverrides);
      } else {
        const newOverrideType: 'grant' | 'revoke' = newAccess ? 'grant' : 'revoke';

        // Separate siblings into those that already have an override and those that don't
        const toUpdate = siblings.filter(s => overrides.has(s.id));
        const toInsert = siblings.filter(s => !overrides.has(s.id));

        // Update existing overrides
        if (toUpdate.length > 0) {
          const { error } = await supabase
            .from('user_permission_overrides')
            .update({ override_type: newOverrideType })
            .eq('user_id', userId)
            .in('module_id', toUpdate.map(s => s.id));

          if (error) throw error;
        }

        // Insert new overrides for copies that don't have one yet
        if (toInsert.length > 0) {
          const { data, error } = await supabase
            .from('user_permission_overrides')
            .insert(
              toInsert.map(s => ({
                user_id: userId,
                module_id: s.id,
                override_type: newOverrideType,
              }))
            )
            .select();

          if (error) throw error;

          // Add inserted overrides to the map
          const newOverrides = new Map(overrides);
          (data || []).forEach((o: ModuleOverride) => {
            newOverrides.set(o.module_id, o);
          });
          // Update existing overrides in the map
          toUpdate.forEach(s => {
            const existing = newOverrides.get(s.id);
            if (existing) {
              newOverrides.set(s.id, { ...existing, override_type: newOverrideType });
            }
          });
          setOverrides(newOverrides);
        } else {
          // Only updates — reflect them in the map
          const newOverrides = new Map(overrides);
          toUpdate.forEach(s => {
            const existing = newOverrides.get(s.id);
            if (existing) {
              newOverrides.set(s.id, { ...existing, override_type: newOverrideType });
            }
          });
          setOverrides(newOverrides);
        }
      }

      showMessage('success', 'Module access updated successfully');
    } catch (error) {
      console.error('Error updating module access:', error);
      showMessage('error', 'Failed to update module access');
    }
  }

  function getEffectiveAccess(moduleId: string): boolean {
    const module = allModules.find(m => m.id === moduleId);
    if (!module) return false;

    // Unify across all copies sharing the same module_key
    const siblings = allModules.filter(m => m.module_key === module.module_key);

    // If any sibling has an override, the most permissive override wins
    const overriddenSibling = siblings.find(s => overrides.has(s.id));
    if (overriddenSibling) {
      return overrides.get(overriddenSibling.id)!.override_type === 'grant';
    }

    // Otherwise use the most permissive role default across all copies
    return siblings.some(s => roleAccess.get(s.id) ?? false);
  }

  function hasOverride(moduleId: string): boolean {
    const module = allModules.find(m => m.id === moduleId);
    if (!module) return false;
    // Show override badge if any copy sharing this module_key has an override
    return allModules
      .filter(m => m.module_key === module.module_key)
      .some(m => overrides.has(m.id));
  }

  function getRoleDefault(moduleId: string): boolean {
    const module = allModules.find(m => m.id === moduleId);
    if (!module) return false;
    const siblings = allModules.filter(m => m.module_key === module.module_key);
    return siblings.some(s => roleAccess.get(s.id) ?? false);
  }

  function getSharedDepartments(moduleId: string): string[] {
    const module = allModules.find(m => m.id === moduleId);
    if (!module) return [];
    const siblings = allModules.filter(m => m.module_key === module.module_key);
    return departments
      .filter(d => siblings.some(s => s.department_id === d.id))
      .map(d => d.display_name);
  }

  function toggleDepartment(deptId: string) {
    const newExpanded = new Set(expandedDepts);
    if (newExpanded.has(deptId)) {
      newExpanded.delete(deptId);
    } else {
      newExpanded.add(deptId);
    }
    setExpandedDepts(newExpanded);
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-5xl w-full mx-4">
          <div className="text-center py-8 text-gray-600">Loading module access...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Module Access Control</h2>
              <p className="text-sm text-gray-600 mt-1">
                Manage {userName}'s access to individual pages and modules
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {message && (
            <div className={`mb-4 p-4 rounded-lg ${
              message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}>
              {message.text}
            </div>
          )}

          <div className="mb-6 p-4 bg-blue-50 rounded-lg">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-900">
                <p className="font-medium mb-1">Module-Level Access Control:</p>
                <ul className="list-disc list-inside space-y-1 text-blue-800">
                  <li>Control access to individual pages within each department</li>
                  <li>Users inherit module access from their role by default</li>
                  <li>Override specific modules to grant or restrict access</li>
                  <li>Overridden modules are highlighted with a yellow badge</li>
                  <li>Shared pages (appearing in multiple departments) are synced automatically — toggling one copy toggles all</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {departments.map((dept) => {
              const deptModules = modules[dept.id] || [];
              const isExpanded = expandedDepts.has(dept.id);

              return (
                <div key={dept.id} className="border-2 border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleDepartment(dept.id)}
                    className="w-full p-4 bg-gray-50 hover:bg-gray-100 transition-colors flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                        style={{ backgroundColor: dept.color }}
                      >
                        {dept.display_name.charAt(0)}
                      </div>
                      <div className="text-left">
                        <h3 className="font-semibold text-gray-900">{dept.display_name}</h3>
                        <p className="text-xs text-gray-600">{deptModules.length} modules</p>
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-gray-500" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-500" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="p-4 space-y-2 bg-white">
                      {deptModules.map((module) => {
                        const hasAccess = getEffectiveAccess(module.id);
                        const isOverridden = hasOverride(module.id);
                        const roleHasAccess = getRoleDefault(module.id);
                        const sharedDepts = getSharedDepartments(module.id);
                        const isShared = sharedDepts.length > 1;

                        return (
                          <div
                            key={module.id}
                            className={`p-3 rounded-lg border transition-all ${
                              hasAccess
                                ? 'border-green-200 bg-green-50'
                                : 'border-gray-200 bg-gray-50'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3 flex-1">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-medium text-sm text-gray-900">
                                      {module.display_name}
                                    </h4>
                                    {isOverridden && (
                                      <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs font-medium rounded">
                                        Override
                                      </span>
                                    )}
                                    {isShared && (
                                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                                        Shared
                                      </span>
                                    )}
                                  </div>
                                  {module.description && (
                                    <p className="text-xs text-gray-600 mt-0.5">{module.description}</p>
                                  )}
                                  <p className="text-xs text-gray-500 mt-1">
                                    Role default: {roleHasAccess ? 'Has access' : 'No access'}
                                  </p>
                                  {isShared && (
                                    <p className="text-xs text-blue-600 mt-0.5">
                                      Also in: {sharedDepts.filter(d => d !== dept.display_name).join(', ')}
                                    </p>
                                  )}
                                </div>
                              </div>

                              <button
                                onClick={() => handleToggleAccess(module.id)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium text-xs transition-all ${
                                  hasAccess
                                    ? 'bg-green-600 hover:bg-green-700 text-white'
                                    : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
                                }`}
                              >
                                {hasAccess ? (
                                  <>
                                    <Eye className="w-3 h-3" />
                                    Access
                                  </>
                                ) : (
                                  <>
                                    <EyeOff className="w-3 h-3" />
                                    No Access
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      {deptModules.length === 0 && (
                        <div className="text-center py-8 text-gray-500 text-sm">
                          No modules in this department
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {departments.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              No departments found
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
