import { useState, useEffect } from 'react';
import { Shield, Edit2, Users, Lock, AlertCircle, Key } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { UserPermissionOverrides } from './UserPermissionOverrides';

interface UserWithRole {
  id: string;
  full_name: string;
  email: string;
  role: string;
  role_id: string | null;
  is_active: boolean;
}

interface Role {
  id: string;
  role_key: string;
  display_name: string;
  description: string;
  is_system_role: boolean;
  is_active: boolean;
}

export function PermissionsManagement() {
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithRole | null>(null);
  const [showOverridesModal, setShowOverridesModal] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [usersRes, rolesRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, email, role, role_id, is_active')
          .order('full_name'),
        supabase
          .from('roles')
          .select('*')
          .eq('is_active', true)
          .order('display_name')
      ]);

      if (usersRes.error) throw usersRes.error;
      if (rolesRes.error) throw rolesRes.error;

      setUsers(usersRes.data || []);
      setRoles(rolesRes.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
      showMessage('error', 'Failed to load user data');
    } finally {
      setLoading(false);
    }
  }

  async function handleRoleChange(userId: string, newRoleId: string) {
    const role = roles.find(r => r.id === newRoleId);
    if (!role) return;

    setSaving(true);
    setMessage(null);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          role_id: newRoleId,
          role: role.role_key
        })
        .eq('id', userId);

      if (error) throw error;

      await loadData();
      showMessage('success', 'User role updated successfully');
    } catch (error) {
      console.error('Error updating role:', error);
      showMessage('error', 'Failed to update user role');
    } finally {
      setSaving(false);
    }
  }

  function showMessage(type: 'success' | 'error', text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  }

  function openOverridesModal(user: UserWithRole) {
    setSelectedUser(user);
    setShowOverridesModal(true);
  }

  function closeOverridesModal() {
    setShowOverridesModal(false);
    setSelectedUser(null);
    loadData();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading permissions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-600" />
          User Permissions & Role Assignment
        </h3>
        <p className="text-gray-600 mt-1">
          Assign roles to users and configure per-user permission overrides
        </p>
      </div>

      {message && (
        <div className={`p-4 rounded-lg flex items-center gap-3 ${
          message.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="font-medium">{message.text}</p>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <h4 className="font-semibold text-blue-900">How Permissions Work</h4>
            <div className="text-sm text-blue-800 space-y-1">
              <p><strong>1. Role Assignment:</strong> Each user is assigned a role that determines their base module access.</p>
              <p><strong>2. Permission Overrides:</strong> Grant or revoke access to specific modules for individual users beyond their role.</p>
              <p><strong>3. Priority:</strong> User-specific overrides always take precedence over role-based permissions.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    User
                  </div>
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Role
                  </div>
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-4 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">
                  <div className="flex items-center justify-center gap-2">
                    <Key className="w-4 h-4" />
                    Per-User Overrides
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {users.map((user) => {
                const userRole = roles.find(r => r.id === user.role_id);
                return (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-semibold text-gray-900">{user.full_name}</div>
                        <div className="text-sm text-gray-500">{user.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={user.role_id || ''}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        disabled={saving}
                        className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                      >
                        <option value="">No Role Assigned</option>
                        {roles.map(role => (
                          <option key={role.id} value={role.id}>
                            {role.display_name}
                          </option>
                        ))}
                      </select>
                      {userRole && (
                        <div className="text-xs text-gray-500 mt-1">
                          {userRole.description}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center">
                        <button
                          onClick={() => openOverridesModal(user)}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2 text-sm"
                        >
                          <Lock className="w-4 h-4" />
                          Manage Overrides
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer Help */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-gray-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-gray-900 mb-1">Role-Based Access</div>
              <div className="text-gray-600">
                Configure role permissions in the <strong>Roles</strong> tab to set department and module access for all users with that role.
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Key className="w-5 h-5 text-gray-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-gray-900 mb-1">Permission Overrides</div>
              <div className="text-gray-600">
                Grant or revoke specific module access for individual users. Overrides take priority over role permissions.
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Edit2 className="w-5 h-5 text-gray-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-gray-900 mb-1">Flexible Control</div>
              <div className="text-gray-600">
                Give users access to pages outside their role, or remove access to specific pages within their role.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Permission Overrides Modal */}
      {showOverridesModal && selectedUser && (
        <UserPermissionOverrides
          userId={selectedUser.id}
          userName={selectedUser.full_name}
          userRoleId={selectedUser.role_id}
          onClose={closeOverridesModal}
        />
      )}
    </div>
  );
}
