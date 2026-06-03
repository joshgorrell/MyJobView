import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, X, Shield, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmModal from '../ui/ConfirmModal';

interface UserPermissionOverridesProps {
  userId: string;
  userName: string;
  userRoleId: string | null;
  onClose: () => void;
}

interface Department {
  id: string;
  display_name: string;
  color: string;
}

interface Module {
  id: string;
  module_key: string;
  display_name: string;
  department_id: string;
  description: string | null;
}

interface Override {
  id: string;
  module_id: string;
  override_type: 'grant' | 'revoke';
  notes: string | null;
}

interface RoleModuleAccess {
  module_id: string;
  has_access: boolean;
}

export function UserPermissionOverrides({ userId, userName, userRoleId, onClose }: UserPermissionOverridesProps) {
  const { profile } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [roleAccess, setRoleAccess] = useState<Map<string, boolean>>(new Map());
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [showAddOverride, setShowAddOverride] = useState(false);
  const [selectedModule, setSelectedModule] = useState<string>('');
  const [overrideType, setOverrideType] = useState<'grant' | 'revoke'>('grant');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [confirmDeleteOverrideId, setConfirmDeleteOverrideId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [userId, userRoleId]);

  async function loadData() {
    setLoading(true);
    try {
      const [deptRes, modulesRes, overridesRes] = await Promise.all([
        supabase.from('departments').select('id, display_name, color').order('sort_order'),
        supabase.from('department_modules').select('*').eq('is_active', true).order('department_id, sort_order'),
        supabase.from('user_permission_overrides').select('*').eq('user_id', userId)
      ]);

      if (deptRes.error) throw deptRes.error;
      if (modulesRes.error) throw modulesRes.error;
      if (overridesRes.error) throw overridesRes.error;

      setDepartments(deptRes.data || []);
      setModules(modulesRes.data || []);
      setOverrides(overridesRes.data || []);

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
    } catch (error) {
      console.error('Error loading data:', error);
      showMessage('error', 'Failed to load permission data');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddOverride() {
    if (!selectedModule) return;

    setSaving(true);
    setMessage(null);

    try {
      const { error } = await supabase
        .from('user_permission_overrides')
        .insert({
          user_id: userId,
          module_id: selectedModule,
          override_type: overrideType,
          notes: notes || null,
          created_by: profile?.id
        });

      if (error) throw error;

      await loadData();
      setShowAddOverride(false);
      setSelectedModule('');
      setNotes('');
      showMessage('success', 'Override added successfully');
    } catch (error: any) {
      console.error('Error adding override:', error);
      if (error.code === '23505') {
        showMessage('error', 'An override already exists for this module');
      } else {
        showMessage('error', 'Failed to add override');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteOverride(overrideId: string) {
    try {
      const { error } = await supabase
        .from('user_permission_overrides')
        .delete()
        .eq('id', overrideId);

      if (error) throw error;

      await loadData();
      showMessage('success', 'Override removed successfully');
    } catch (error) {
      console.error('Error deleting override:', error);
      showMessage('error', 'Failed to remove override');
    }
  }

  function showMessage(type: 'success' | 'error', text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  }

  function getModuleEffectiveAccess(moduleId: string): { hasAccess: boolean; source: string } {
    const override = overrides.find(o => o.module_id === moduleId);
    if (override) {
      return {
        hasAccess: override.override_type === 'grant',
        source: override.override_type === 'grant' ? 'Granted by Override' : 'Revoked by Override'
      };
    }

    const roleHasAccess = roleAccess.get(moduleId) || false;
    return {
      hasAccess: roleHasAccess,
      source: roleHasAccess ? 'Granted by Role' : 'Not Granted'
    };
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl p-8">
          <div className="text-gray-600">Loading permissions...</div>
        </div>
      </div>
    );
  }

  const modulesByDepartment = departments.map(dept => ({
    department: dept,
    modules: modules.filter(m => m.department_id === dept.id)
  }));

  const availableModulesForOverride = modules.filter(
    m => !overrides.some(o => o.module_id === m.id)
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Permission Overrides</h2>
            <p className="text-sm text-gray-600 mt-1">
              User: <span className="font-semibold">{userName}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto">
          {message && (
            <div className={`p-4 rounded-lg flex items-center gap-3 ${
              message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="font-medium">{message.text}</p>
            </div>
          )}

          {/* Add Override Button */}
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-600">
              Override user permissions beyond what their role provides
            </p>
            <button
              onClick={() => setShowAddOverride(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Override
            </button>
          </div>

          {/* Add Override Form */}
          {showAddOverride && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Add New Override</h3>
                <button
                  onClick={() => {
                    setShowAddOverride(false);
                    setSelectedModule('');
                    setNotes('');
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Module
                  </label>
                  <select
                    value={selectedModule}
                    onChange={(e) => setSelectedModule(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Select a module...</option>
                    {availableModulesForOverride.map(module => {
                      const dept = departments.find(d => d.id === module.department_id);
                      return (
                        <option key={module.id} value={module.id}>
                          {dept?.display_name} - {module.display_name}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Override Type
                  </label>
                  <select
                    value={overrideType}
                    onChange={(e) => setOverrideType(e.target.value as 'grant' | 'revoke')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="grant">Grant Access</option>
                    <option value="revoke">Revoke Access</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (Optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Why is this override needed?"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={2}
                />
              </div>

              <button
                onClick={handleAddOverride}
                disabled={!selectedModule || saving}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Adding...' : 'Add Override'}
              </button>
            </div>
          )}

          {/* Current Overrides */}
          {overrides.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-900">Active Overrides</h3>
              {overrides.map(override => {
                const module = modules.find(m => m.id === override.module_id);
                const dept = departments.find(d => d.id === module?.department_id);
                return (
                  <div
                    key={override.id}
                    className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">
                          {dept?.display_name} - {module?.display_name}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          override.override_type === 'grant'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {override.override_type === 'grant' ? 'Access Granted' : 'Access Revoked'}
                        </span>
                      </div>
                      {override.notes && (
                        <div className="text-sm text-gray-600 mt-1">{override.notes}</div>
                      )}
                    </div>
                    <button
                      onClick={() => setConfirmDeleteOverrideId(override.id)}
                      className="ml-4 p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Effective Permissions Summary */}
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900">Effective Permissions</h3>
            {modulesByDepartment.map(({ department, modules: deptModules }) => {
              if (deptModules.length === 0) return null;

              return (
                <div key={department.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: department.color }}
                      />
                      <h4 className="font-semibold text-gray-900">{department.display_name}</h4>
                    </div>
                  </div>
                  <div className="divide-y divide-gray-200">
                    {deptModules.map(module => {
                      const { hasAccess, source } = getModuleEffectiveAccess(module.id);
                      return (
                        <div
                          key={module.id}
                          className="px-4 py-3 flex items-center justify-between hover:bg-gray-50"
                        >
                          <div>
                            <div className="font-medium text-gray-900">{module.display_name}</div>
                            <div className="text-xs text-gray-500">{source}</div>
                          </div>
                          <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            hasAccess
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {hasAccess ? 'Has Access' : 'No Access'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmDeleteOverrideId !== null}
        title="Remove Permission Override"
        message="Remove this permission override?"
        variant="danger"
        confirmLabel="Remove"
        onConfirm={() => {
          if (confirmDeleteOverrideId) handleDeleteOverride(confirmDeleteOverrideId);
          setConfirmDeleteOverrideId(null);
        }}
        onCancel={() => setConfirmDeleteOverrideId(null)}
      />
    </div>
  );
}
