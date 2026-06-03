import { useState, useEffect } from 'react';
import { X, Save, Shield, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface UserDepartmentAccessProps {
  userId: string;
  userName: string;
  userRoleId: string | null;
  onClose: () => void;
}

interface Department {
  id: string;
  name: string;
  display_name: string;
  description: string;
  color: string;
  is_active: boolean;
}

interface DepartmentOverride {
  id: string;
  user_id: string;
  department_id: string;
  has_access: boolean;
}

interface RoleDepartmentAccess {
  department_id: string;
  has_access: boolean;
}

export function UserDepartmentAccess({ userId, userName, userRoleId, onClose }: UserDepartmentAccessProps) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roleAccess, setRoleAccess] = useState<Map<string, boolean>>(new Map());
  const [overrides, setOverrides] = useState<Map<string, DepartmentOverride>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
        .order('sort_order');

      if (deptError) throw deptError;
      setDepartments(deptData || []);

      if (userRoleId) {
        const { data: roleAccessData, error: roleError } = await supabase
          .from('role_department_access')
          .select('department_id, has_access')
          .eq('role_id', userRoleId);

        if (roleError) throw roleError;

        const accessMap = new Map<string, boolean>();
        (roleAccessData || []).forEach((item: RoleDepartmentAccess) => {
          accessMap.set(item.department_id, item.has_access);
        });
        setRoleAccess(accessMap);
      }

      const { data: overrideData, error: overrideError } = await supabase
        .from('department_user_overrides')
        .select('*')
        .eq('user_id', userId);

      if (overrideError) throw overrideError;

      const overrideMap = new Map<string, DepartmentOverride>();
      (overrideData || []).forEach((override: DepartmentOverride) => {
        overrideMap.set(override.department_id, override);
      });
      setOverrides(overrideMap);
    } catch (error) {
      console.error('Error loading department access:', error);
      showMessage('error', 'Failed to load department access data');
    } finally {
      setLoading(false);
    }
  }

  function showMessage(type: 'success' | 'error', text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  }

  async function handleToggleAccess(departmentId: string) {
    const currentOverride = overrides.get(departmentId);
    const roleHasAccess = roleAccess.get(departmentId) ?? false;

    try {
      if (currentOverride) {
        const newAccess = !currentOverride.has_access;

        if (newAccess === roleHasAccess) {
          const { error } = await supabase
            .from('department_user_overrides')
            .delete()
            .eq('id', currentOverride.id);

          if (error) throw error;

          const newOverrides = new Map(overrides);
          newOverrides.delete(departmentId);
          setOverrides(newOverrides);
        } else {
          const { error } = await supabase
            .from('department_user_overrides')
            .update({ has_access: newAccess })
            .eq('id', currentOverride.id);

          if (error) throw error;

          const newOverrides = new Map(overrides);
          newOverrides.set(departmentId, { ...currentOverride, has_access: newAccess });
          setOverrides(newOverrides);
        }
      } else {
        const newAccess = !roleHasAccess;

        const { data, error } = await supabase
          .from('department_user_overrides')
          .insert({
            user_id: userId,
            department_id: departmentId,
            has_access: newAccess
          })
          .select()
          .single();

        if (error) throw error;

        const newOverrides = new Map(overrides);
        newOverrides.set(departmentId, data);
        setOverrides(newOverrides);
      }

      showMessage('success', 'Department access updated successfully');
    } catch (error) {
      console.error('Error updating department access:', error);
      showMessage('error', 'Failed to update department access');
    }
  }

  function getEffectiveAccess(departmentId: string): boolean {
    const override = overrides.get(departmentId);
    if (override) {
      return override.has_access;
    }
    return roleAccess.get(departmentId) ?? false;
  }

  function hasOverride(departmentId: string): boolean {
    return overrides.has(departmentId);
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4">
          <div className="text-center py-8 text-gray-600">Loading department access...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Department Access</h2>
              <p className="text-sm text-gray-600 mt-1">
                Manage {userName}'s access to departments
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
                <p className="font-medium mb-1">How Department Access Works:</p>
                <ul className="list-disc list-inside space-y-1 text-blue-800">
                  <li>By default, users inherit department access from their role</li>
                  <li>You can override access for individual users here</li>
                  <li>Overridden departments are highlighted with a yellow badge</li>
                  <li>Toggle access to grant or revoke department visibility</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {departments.map((dept) => {
              const hasAccess = getEffectiveAccess(dept.id);
              const isOverridden = hasOverride(dept.id);
              const roleHasAccess = roleAccess.get(dept.id) ?? false;

              return (
                <div
                  key={dept.id}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    hasAccess
                      ? 'border-green-200 bg-green-50'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                        style={{ backgroundColor: dept.color }}
                      >
                        {dept.display_name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900">
                            {dept.display_name}
                          </h3>
                          {isOverridden && (
                            <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs font-medium rounded">
                              Override
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">{dept.description}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Role default: {roleHasAccess ? 'Has access' : 'No access'}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleToggleAccess(dept.id)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                        hasAccess
                          ? 'bg-green-600 hover:bg-green-700 text-white'
                          : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
                      }`}
                    >
                      {hasAccess ? (
                        <>
                          <Eye className="w-4 h-4" />
                          Has Access
                        </>
                      ) : (
                        <>
                          <EyeOff className="w-4 h-4" />
                          No Access
                        </>
                      )}
                    </button>
                  </div>
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
