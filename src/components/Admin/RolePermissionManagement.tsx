import { useState, useEffect } from 'react';
import { Shield, Check, X, Save, AlertCircle, Building, Layers, Plus, Edit2, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import ConfirmModal from '../ui/ConfirmModal';

interface Role {
  id: string;
  role_key: string;
  display_name: string;
  description: string;
  is_system_role: boolean;
  is_active: boolean;
}

interface Department {
  id: string;
  name: string;
  display_name: string;
  icon: string;
  color: string;
  sort_order: number;
}

interface Module {
  id: string;
  department_id: string;
  module_key: string;
  display_name: string;
  description: string | null;
  icon: string;
  sort_order: number;
  parent_module_id: string | null;
}

interface RoleDepartmentAccess {
  role_id: string;
  department_id: string;
  has_access: boolean;
}

interface RoleModuleAccess {
  role_id: string;
  module_id: string;
  has_access: boolean;
}

export function RolePermissionManagement() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [departmentAccess, setDepartmentAccess] = useState<Map<string, boolean>>(new Map());
  const [moduleAccess, setModuleAccess] = useState<Map<string, boolean>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [confirmDeleteRole, setConfirmDeleteRole] = useState<Role | null>(null);
  const [roleForm, setRoleForm] = useState({
    role_key: '',
    display_name: '',
    description: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedRole) {
      loadRolePermissions(selectedRole);
    }
  }, [selectedRole]);

  async function loadData() {
    try {
      const [rolesRes, deptRes, modulesRes] = await Promise.all([
        supabase.from('roles').select('*').order('role_key'),
        supabase.from('departments').select('*').order('sort_order'),
        supabase.from('department_modules').select('*').order('department_id, sort_order')
      ]);

      if (rolesRes.error) throw rolesRes.error;
      if (deptRes.error) throw deptRes.error;
      if (modulesRes.error) throw modulesRes.error;

      setRoles(rolesRes.data || []);
      setDepartments(deptRes.data || []);
      setModules(modulesRes.data || []);

      if (rolesRes.data && rolesRes.data.length > 0) {
        setSelectedRole(rolesRes.data[0].id);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      showMessage('error', 'Failed to load roles and permissions');
    } finally {
      setLoading(false);
    }
  }

  async function loadRolePermissions(roleId: string) {
    try {
      const [deptAccessRes, moduleAccessRes] = await Promise.all([
        supabase
          .from('role_department_access')
          .select('department_id, has_access')
          .eq('role_id', roleId),
        supabase
          .from('role_module_access')
          .select('module_id, has_access')
          .eq('role_id', roleId)
      ]);

      if (deptAccessRes.error) throw deptAccessRes.error;
      if (moduleAccessRes.error) throw moduleAccessRes.error;

      const deptMap = new Map<string, boolean>();
      (deptAccessRes.data || []).forEach(item => {
        deptMap.set(item.department_id, item.has_access);
      });

      const moduleMap = new Map<string, boolean>();
      (moduleAccessRes.data || []).forEach(item => {
        moduleMap.set(item.module_id, item.has_access);
      });

      setDepartmentAccess(deptMap);
      setModuleAccess(moduleMap);
    } catch (error) {
      console.error('Error loading role permissions:', error);
      showMessage('error', 'Failed to load permissions');
    }
  }

  async function handleSavePermissions() {
    if (!selectedRole) return;

    setSaving(true);
    setMessage(null);

    try {
      const deptInserts: RoleDepartmentAccess[] = [];
      departmentAccess.forEach((hasAccess, deptId) => {
        deptInserts.push({
          role_id: selectedRole,
          department_id: deptId,
          has_access: hasAccess
        });
      });

      const moduleInserts: RoleModuleAccess[] = [];
      moduleAccess.forEach((hasAccess, moduleId) => {
        moduleInserts.push({
          role_id: selectedRole,
          module_id: moduleId,
          has_access: hasAccess
        });
      });

      await supabase
        .from('role_department_access')
        .delete()
        .eq('role_id', selectedRole);

      await supabase
        .from('role_module_access')
        .delete()
        .eq('role_id', selectedRole);

      if (deptInserts.length > 0) {
        const { error: deptError } = await supabase
          .from('role_department_access')
          .insert(deptInserts);

        if (deptError) throw deptError;
      }

      if (moduleInserts.length > 0) {
        const { error: moduleError } = await supabase
          .from('role_module_access')
          .insert(moduleInserts);

        if (moduleError) throw moduleError;
      }

      showMessage('success', 'Permissions saved successfully');
    } catch (error) {
      console.error('Error saving permissions:', error);
      showMessage('error', 'Failed to save permissions');
    } finally {
      setSaving(false);
    }
  }

  function toggleDepartmentAccess(deptId: string) {
    const newAccess = new Map(departmentAccess);
    newAccess.set(deptId, !newAccess.get(deptId));
    setDepartmentAccess(newAccess);
  }

  function toggleModuleAccess(moduleId: string) {
    const newAccess = new Map(moduleAccess);
    newAccess.set(moduleId, !newAccess.get(moduleId));
    setModuleAccess(newAccess);
  }

  function toggleAllModulesInDepartment(deptId: string, grant: boolean) {
    const deptModules = modules.filter(m => m.department_id === deptId);
    const newAccess = new Map(moduleAccess);
    deptModules.forEach(module => {
      newAccess.set(module.id, grant);
    });
    setModuleAccess(newAccess);
  }

  function showMessage(type: 'success' | 'error', text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  }

  function openCreateRoleModal() {
    setEditingRole(null);
    setRoleForm({ role_key: '', display_name: '', description: '' });
    setShowRoleModal(true);
  }

  function openEditRoleModal(role: Role) {
    setEditingRole(role);
    setRoleForm({
      role_key: role.role_key,
      display_name: role.display_name,
      description: role.description
    });
    setShowRoleModal(true);
  }

  async function handleSaveRole() {
    if (!roleForm.role_key || !roleForm.display_name || !roleForm.description) {
      showMessage('error', 'Please fill in all fields');
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      if (editingRole) {
        const { error } = await supabase
          .from('roles')
          .update({
            display_name: roleForm.display_name,
            description: roleForm.description
          })
          .eq('id', editingRole.id);

        if (error) throw error;
        showMessage('success', 'Role updated successfully');
      } else {
        const { error } = await supabase
          .from('roles')
          .insert({
            role_key: roleForm.role_key.toLowerCase().replace(/\s+/g, '_'),
            display_name: roleForm.display_name,
            description: roleForm.description,
            is_system_role: false,
            is_active: true
          });

        if (error) throw error;
        showMessage('success', 'Role created successfully');
      }

      setShowRoleModal(false);
      await loadData();
    } catch (error: any) {
      console.error('Error saving role:', error);
      if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
        showMessage('error', 'A role with this key already exists');
      } else {
        showMessage('error', 'Failed to save role');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleRoleActive(role: Role) {
    if (role.is_system_role) {
      showMessage('error', 'Cannot deactivate system roles');
      return;
    }

    try {
      const { error } = await supabase
        .from('roles')
        .update({ is_active: !role.is_active })
        .eq('id', role.id);

      if (error) throw error;

      showMessage('success', `Role ${role.is_active ? 'deactivated' : 'activated'} successfully`);
      await loadData();
    } catch (error) {
      console.error('Error toggling role:', error);
      showMessage('error', 'Failed to update role');
    }
  }

  async function handleDeleteRole(role: Role) {
    if (role.is_system_role) {
      showMessage('error', 'Cannot delete system roles');
      return;
    }

    try {
      const { error } = await supabase
        .from('roles')
        .delete()
        .eq('id', role.id);

      if (error) throw error;

      showMessage('success', 'Role deleted successfully');
      if (selectedRole === role.id) {
        setSelectedRole(roles[0]?.id || null);
      }
      await loadData();
    } catch (error) {
      console.error('Error deleting role:', error);
      showMessage('error', 'Failed to delete role');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600">Loading role permissions...</div>
      </div>
    );
  }

  const selectedRoleData = roles.find(r => r.id === selectedRole);
  const modulesByDepartment = departments.map(dept => ({
    department: dept,
    modules: modules.filter(m => m.department_id === dept.id && !m.parent_module_id)
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Role Permission Management</h2>
          <p className="text-sm text-gray-600 mt-1">
            Configure which departments and modules each role can access
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={openCreateRoleModal}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Role
          </button>
          <button
            onClick={handleSavePermissions}
            disabled={saving || !selectedRole}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Permissions'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-lg flex items-center gap-3 ${
          message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="font-medium">{message.text}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Role Selection Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3">
              <div className="flex items-center gap-2 text-white">
                <Shield className="w-5 h-5" />
                <h3 className="font-semibold">Roles</h3>
              </div>
            </div>
            <div className="divide-y divide-gray-200">
              {roles.map(role => (
                <div
                  key={role.id}
                  className={`transition-colors ${
                    selectedRole === role.id
                      ? 'bg-blue-50 border-l-4 border-blue-600'
                      : 'border-l-4 border-transparent'
                  }`}
                >
                  <button
                    onClick={() => setSelectedRole(role.id)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-gray-900 flex items-center gap-2">
                          {role.display_name}
                          {role.is_system_role && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">System</span>
                          )}
                          {!role.is_active && (
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">Inactive</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{role.description}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditRoleModal(role);
                          }}
                          className="p-1.5 hover:bg-blue-100 rounded text-blue-600"
                          title="Edit Role"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {!role.is_system_role && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteRole(role);
                            }}
                            className="p-1.5 hover:bg-red-100 rounded text-red-600"
                            title="Delete Role"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Permissions Configuration */}
        <div className="lg:col-span-3">
          {selectedRoleData && (
            <div className="space-y-6">
              {/* Role Header */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl shadow-md p-6 text-white">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-2xl font-bold">{selectedRoleData.display_name}</h3>
                    <p className="text-blue-100 mt-1">{selectedRoleData.description}</p>
                  </div>
                  <Shield className="w-12 h-12 opacity-50" />
                </div>
              </div>

              {/* Department & Module Access */}
              <div className="space-y-4">
                {modulesByDepartment.map(({ department, modules: deptModules }) => (
                  <div key={department.id} className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
                    {/* Department Header */}
                    <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg`} style={{ backgroundColor: `${department.color}20` }}>
                            <Building className="w-5 h-5" style={{ color: department.color }} />
                          </div>
                          <div>
                            <h4 className="font-bold text-gray-900">{department.display_name}</h4>
                            <div className="text-xs text-gray-500">
                              {deptModules.length} module{deptModules.length !== 1 ? 's' : ''}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleAllModulesInDepartment(department.id, true)}
                            className="px-3 py-1.5 text-xs bg-green-100 hover:bg-green-200 text-green-700 rounded-lg font-medium transition-colors"
                          >
                            Grant All
                          </button>
                          <button
                            onClick={() => toggleAllModulesInDepartment(department.id, false)}
                            className="px-3 py-1.5 text-xs bg-red-100 hover:bg-red-200 text-red-700 rounded-lg font-medium transition-colors"
                          >
                            Revoke All
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Modules */}
                    <div className="divide-y divide-gray-200">
                      {deptModules.map(module => {
                        const hasAccess = moduleAccess.get(module.id) || false;
                        return (
                          <div
                            key={module.id}
                            className="px-6 py-4 hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <Layers className="w-4 h-4 text-gray-400" />
                                <div>
                                  <div className="font-medium text-gray-900">{module.display_name}</div>
                                  {module.description && (
                                    <div className="text-xs text-gray-500 mt-0.5">{module.description}</div>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={() => toggleModuleAccess(module.id)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                                  hasAccess
                                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                }`}
                              >
                                {hasAccess ? (
                                  <>
                                    <Check className="w-4 h-4" />
                                    Access Granted
                                  </>
                                ) : (
                                  <>
                                    <X className="w-4 h-4" />
                                    No Access
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Role Modal */}
      {showRoleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-full sm:max-w-lg">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 rounded-t-xl">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <Shield className="w-6 h-6" />
                {editingRole ? 'Edit Role' : 'Create New Role'}
              </h3>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Role Key {!editingRole && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="text"
                  value={roleForm.role_key}
                  onChange={(e) => setRoleForm({ ...roleForm, role_key: e.target.value })}
                  disabled={!!editingRole}
                  placeholder="e.g., dispatcher, supervisor"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {editingRole
                    ? 'Role key cannot be changed after creation'
                    : 'Lowercase, use underscores instead of spaces (e.g., field_supervisor)'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Display Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={roleForm.display_name}
                  onChange={(e) => setRoleForm({ ...roleForm, display_name: e.target.value })}
                  placeholder="e.g., Dispatcher, Field Supervisor"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  The friendly name shown to users
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={roleForm.description}
                  onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                  placeholder="Describe the role's responsibilities and access level..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {editingRole?.is_system_role && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800">
                    This is a system role. Some properties cannot be modified.
                  </p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-gray-50 rounded-b-xl flex items-center justify-end gap-3">
              <button
                onClick={() => setShowRoleModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRole}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : editingRole ? 'Update Role' : 'Create Role'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmDeleteRole !== null}
        title="Delete Role"
        message={`Are you sure you want to delete the role "${confirmDeleteRole?.display_name}"? This action cannot be undone.`}
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => {
          if (confirmDeleteRole) handleDeleteRole(confirmDeleteRole);
          setConfirmDeleteRole(null);
        }}
        onCancel={() => setConfirmDeleteRole(null)}
      />
    </div>
  );
}
