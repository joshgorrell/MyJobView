import { useEffect, useState } from 'react';
import { Users, Plus, Edit2, UserX, UserCheck, Shield, User, Trash2, Mail, Briefcase, Lock, Layout } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Profile } from '../../lib/types';
import { formatDistanceToNow, formatRoleName } from '../../lib/utils';
import { AddUserForm } from './AddUserForm';
import { EditUserForm } from './EditUserForm';
import { UserDepartmentAccess } from './UserDepartmentAccess';
import { UserModuleAccess } from './UserModuleAccess';
import { useToast } from '../Shared/Toast';

export function UserManagement() {
  const toast = useToast();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [managingDepartmentUser, setManagingDepartmentUser] = useState<Profile | null>(null);
  const [managingModuleUser, setManagingModuleUser] = useState<Profile | null>(null);

  useEffect(() => {
    loadUsers();

    const channel = supabase
      .channel('profiles_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        loadUsers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadUsers() {
    try {
      console.log('Loading users with all fields...');
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name', { ascending: true });

      if (error) {
        console.error('Error loading users:', error);
        throw error;
      }

      console.log('Users loaded:', data?.length || 0);
      setUsers(data || []);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleUserStatus(userId: string, currentStatus: boolean) {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: !currentStatus })
        .eq('id', userId);

      if (error) throw error;
      loadUsers();
    } catch (error) {
      console.error('Error updating user status:', error);
      toast.error('Failed to update user status');
    }
  }

  async function sendPasswordResetEmail(email: string, userName: string) {
    toast.confirm(`Send password reset email to ${userName} (${email})?`, async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reset-user-password`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email }),
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to send reset email');
        }

        toast.success('Password reset email sent successfully');
      } catch (error: any) {
        console.error('Error sending reset email:', error);
        toast.error(error.message || 'Failed to send reset email');
      }
    }, 'Send password reset?');
  }

  async function deleteUser(userId: string, userName: string) {
    toast.confirm(
      `This will permanently delete ${userName}'s account, remove all their data, and cannot be undone.`,
      async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) throw new Error('Not authenticated');

          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-user`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ userId }),
            }
          );

          const result = await response.json();

          if (!response.ok) {
            throw new Error(result.error || 'Failed to delete user');
          }

          toast.success('User deleted successfully');
          loadUsers();
        } catch (error: any) {
          console.error('Error deleting user:', error);
          toast.error(error.message || 'Failed to delete user');
        }
      },
      `Delete ${userName}?`
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading users...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
        <div className="flex items-center gap-2 text-blue-800">
          <Users className="w-5 h-5" />
          <h2 className="text-lg font-semibold">User Management</h2>
          <span className="ml-2 bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-full">
            {users.length}
          </span>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all font-medium flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
        >
          <Plus className="w-4 h-4" />
          Add New User
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-1.5 rounded-lg flex-shrink-0 ${
                        user.is_active ? 'bg-blue-100' : 'bg-gray-100'
                      }`}>
                        {user.role === 'admin' ? (
                          <Shield className={`w-4 h-4 ${user.is_active ? 'text-blue-600' : 'text-gray-400'}`} />
                        ) : (
                          <User className={`w-4 h-4 ${user.is_active ? 'text-blue-600' : 'text-gray-400'}`} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className={`font-medium text-sm ${
                          user.is_active ? 'text-gray-900' : 'text-gray-400'
                        }`}>
                          {user.full_name}
                        </div>
                        <div className={`text-xs truncate ${
                          user.is_active ? 'text-gray-500' : 'text-gray-400'
                        }`}>
                          {user.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      user.role === 'admin' ? 'bg-blue-100 text-blue-700' :
                      user.role === 'finance' ? 'bg-purple-100 text-purple-700' :
                      user.role === 'manager' ? 'bg-orange-100 text-orange-700' :
                      user.role === 'service_manager' ? 'bg-teal-100 text-teal-700' :
                      user.role === 'office_manager' ? 'bg-indigo-100 text-indigo-700' :
                      user.role === 'project_manager' ? 'bg-cyan-100 text-cyan-700' :
                      user.role === 'sales' ? 'bg-green-100 text-green-700' :
                      user.role === 'tech' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {formatRoleName(user.role)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      user.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-500">
                      {formatDistanceToNow(user.created_at)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditingUser(user)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Edit user"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setManagingDepartmentUser(user)}
                        className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                        title="Manage department access"
                      >
                        <Lock className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setManagingModuleUser(user)}
                        className="p-1.5 text-cyan-600 hover:bg-cyan-50 rounded transition-colors"
                        title="Manage page access"
                      >
                        <Layout className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => sendPasswordResetEmail(user.email, user.full_name)}
                        className="p-1.5 text-purple-600 hover:bg-purple-50 rounded transition-colors"
                        title="Reset password"
                      >
                        <Mail className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => toggleUserStatus(user.id, user.is_active)}
                        className={`p-1.5 rounded transition-colors ${
                          user.is_active
                            ? 'text-red-600 hover:bg-red-50'
                            : 'text-green-600 hover:bg-green-50'
                        }`}
                        title={user.is_active ? 'Suspend' : 'Activate'}
                      >
                        {user.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => deleteUser(user.id, user.full_name)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {users.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <Users className="w-12 h-12 mx-auto mb-3 text-gray-400" />
          <p>No users found</p>
        </div>
      )}

      {showAddForm && (
        <AddUserForm
          onClose={() => setShowAddForm(false)}
          onSuccess={() => {
            setShowAddForm(false);
            loadUsers();
          }}
        />
      )}

      {editingUser && (
        <EditUserForm
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSuccess={() => {
            setEditingUser(null);
            loadUsers();
          }}
        />
      )}

      {managingDepartmentUser && (
        <UserDepartmentAccess
          userId={managingDepartmentUser.id}
          userName={managingDepartmentUser.full_name}
          userRoleId={managingDepartmentUser.role_id}
          onClose={() => setManagingDepartmentUser(null)}
        />
      )}

      {managingModuleUser && (
        <UserModuleAccess
          userId={managingModuleUser.id}
          userName={managingModuleUser.full_name}
          userRoleId={managingModuleUser.role_id}
          onClose={() => setManagingModuleUser(null)}
        />
      )}
    </div>
  );
}
