import { useEffect, useState } from 'react';
import { Users, Plus, CreditCard as Edit2, UserX, UserCheck, Shield, User, Trash2, Mail, Briefcase, Lock, LayoutGrid as Layout, AlertCircle, UserCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Profile } from '../../lib/types';
import { formatDistanceToNow, formatRoleName } from '../../lib/utils';
import { AddUserForm } from './AddUserForm';
import { EditUserForm } from './EditUserForm';
import { UserDepartmentAccess } from './UserDepartmentAccess';
import { UserModuleAccess } from './UserModuleAccess';
import { useToast } from '../Shared/Toast';

interface EmployeeInfo {
  user_id: string;
  employee_id: string;
  employment_status: string;
  hire_date: string;
}

interface ProfileActivity {
  id: string;
  full_name: string;
  role: string;
  email: string;
  employment_type: string | null;
  is_active: boolean;
  clock_count: number;
  time_count: number;
  is_employee: boolean;
  employee_status: string | null;
  config_reviewed: boolean;
}

export function UserManagement({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const toast = useToast();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [managingDepartmentUser, setManagingDepartmentUser] = useState<Profile | null>(null);
  const [managingModuleUser, setManagingModuleUser] = useState<Profile | null>(null);
  const [employeeMap, setEmployeeMap] = useState<Map<string, EmployeeInfo>>(new Map());
  const [activityMap, setActivityMap] = useState<Map<string, { clock_count: number; time_count: number }>>(new Map());
  const [configReviewMap, setConfigReviewMap] = useState<Map<string, boolean>>(new Map());

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

      // Load employee records
      const { data: empData } = await supabase
        .from('employees')
        .select('user_id, id, employment_status, hire_date');
      const empMap = new Map<string, EmployeeInfo>();
      (empData || []).forEach(e => empMap.set(e.user_id, e));
      setEmployeeMap(empMap);

      // Load config review status
      const empIds = (empData || []).map(e => e.id);
      if (empIds.length > 0) {
        const { data: configData } = await supabase
          .from('employee_payroll_configs')
          .select('employee_id, effective_to, reviewed_at')
          .in('employee_id', empIds)
          .is('effective_to', null);
        const reviewMap = new Map<string, boolean>();
        (configData || []).forEach(c => {
          reviewMap.set(c.employee_id, !!c.reviewed_at);
        });
        setConfigReviewMap(reviewMap);
      }

      // Load activity counts for migration hints
      const userIds = (data || []).map(p => p.id);
      if (userIds.length > 0) {
        const { count: clockCount } = await supabase
          .from('daily_clock_entries')
          .select('id', { count: 'exact', head: true })
          .in('technician_id', userIds);
        const { count: timeCount } = await supabase
          .from('time_entries')
          .select('id', { count: 'exact', head: true })
          .in('technician_id', userIds);
        // We can't get per-user counts from aggregate queries easily, so just set placeholders
        const actMap = new Map<string, { clock_count: number; time_count: number }>();
        (data || []).forEach(p => actMap.set(p.id, { clock_count: 0, time_count: 0 }));
        setActivityMap(actMap);
      }
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

      {/* Employee Setup Required Section */}
      {(() => {
        const unclassified = users.filter(u => !employeeMap.has(u.id));
        const unreviewed = users.filter(u => {
          const emp = employeeMap.get(u.id);
          return emp && !configReviewMap.get(emp.id);
        });
        if (unclassified.length === 0 && unreviewed.length === 0) return null;
        return (
          <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 text-amber-800">
              <AlertCircle className="w-5 h-5" />
              <h3 className="text-sm font-semibold">Employee Setup Required</h3>
            </div>
            <p className="text-xs text-amber-700">
              Review each person below and explicitly designate them as an Employee or Non-Employee User. Legacy fields and activity are suggestions only.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-amber-100 border-b border-amber-300">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-amber-800 uppercase">User</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-amber-800 uppercase">Role</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-amber-800 uppercase">Legacy Type</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-amber-800 uppercase">Employee?</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-amber-800 uppercase">Configuration</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-amber-800 uppercase">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-200">
                  {unclassified.map(u => (
                    <tr key={u.id} className="bg-white/50">
                      <td className="px-3 py-2 text-gray-900 font-medium">{u.full_name}</td>
                      <td className="px-3 py-2 text-gray-600">{formatRoleName(u.role)}</td>
                      <td className="px-3 py-2 text-gray-500">{(u as any).employment_type || '-'}</td>
                      <td className="px-3 py-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">Not classified</span>
                      </td>
                      <td className="px-3 py-2 text-gray-400 text-xs">No employee record</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => setEditingUser(u)}
                          className="px-3 py-1 bg-amber-600 text-white rounded text-xs font-medium hover:bg-amber-700 transition-colors"
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                  {unreviewed.map(u => {
                    const emp = employeeMap.get(u.id)!;
                    return (
                      <tr key={u.id} className="bg-white/50">
                        <td className="px-3 py-2 text-gray-900 font-medium">{u.full_name}</td>
                        <td className="px-3 py-2 text-gray-600">{formatRoleName(u.role)}</td>
                        <td className="px-3 py-2 text-gray-500">{(u as any).employment_type || '-'}</td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">Employee</span>
                        </td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">Needs review</span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => setEditingUser(u)}
                            className="px-3 py-1 bg-amber-600 text-white rounded text-xs font-medium hover:bg-amber-700 transition-colors"
                          >
                            Review
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

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
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        user.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                      {employeeMap.has(user.id) && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                          <UserCircle className="w-3 h-3" />
                          Employee
                        </span>
                      )}
                      {(() => {
                        const emp = employeeMap.get(user.id);
                        if (emp && !configReviewMap.get(emp.id)) {
                          return (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                              <AlertCircle className="w-3 h-3" />
                              Unreviewed
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </div>
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
          onNavigate={onNavigate}
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
