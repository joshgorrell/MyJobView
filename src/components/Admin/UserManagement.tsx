import { useEffect, useState } from 'react';
import { Users, Plus, AlertCircle, CreditCard as Edit2, UserX, UserCheck, Shield, User, Trash2, Mail, UserCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Profile } from '../../lib/types';
import { formatDistanceToNow, formatRoleName } from '../../lib/utils';
import { AddUserForm } from './AddUserForm';
import type { CreatedUserData } from './AddUserForm';
import { EditUserForm } from './EditUserForm';
import { UserCreatedConfirmation } from './UserCreatedConfirmation';
import { useToast } from '../Shared/Toast';

interface AccountEmailStatus {
  user_id: string;
  welcome_sent_at: string | null;
  welcome_error: string | null;
  reset_sent_at: string | null;
  reset_error: string | null;
  activated_at: string | null;
}

interface EmployeeInfo {
  user_id: string;
  id: string;
  employment_status: string;
  hire_date: string;
}

export function UserManagement({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const toast = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [accountStatuses, setAccountStatuses] = useState<Map<string, AccountEmailStatus>>(new Map());
  const [accountStatusError, setAccountStatusError] = useState(false);
  const [sendingAccountEmail, setSendingAccountEmail] = useState<string | null>(null);
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);

  const [createdUserData, setCreatedUserData] = useState<CreatedUserData | null>(null);
  const [employeeMap, setEmployeeMap] = useState<Map<string, EmployeeInfo>>(new Map());
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
      setLoading(false);
      // Independent settings metadata must not serialize initial user rendering.
      const [statusResult, employeeResult] = await Promise.all([
        supabase.from('user_account_email_status').select('*'),
        supabase.from('employees').select('user_id, id, employment_status, hire_date'),
      ]);
      setAccountStatusError(!!statusResult.error);
      setAccountStatuses(new Map((statusResult.data || []).map(item => [item.user_id, item])));
      const employees = employeeResult.data || [];
      setEmployeeMap(new Map(employees.map(item => [item.user_id, item])));
      const employeeIds = employees.map(item => item.id);
      if (employeeIds.length) {
        const { data: configData } = await supabase.from('employee_payroll_configs')
          .select('employee_id, effective_to, reviewed_at')
          .in('employee_id', employeeIds).is('effective_to', null);
        setConfigReviewMap(new Map((configData || []).map(item => [item.employee_id, !!item.reviewed_at])));
      }

    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  }

  const visibleUsers = users.filter(user => {
    const query = searchTerm.trim().toLowerCase();
    if (query && ![user.full_name, user.email, user.username].some(value => String(value || '').toLowerCase().includes(query))) return false;
    if (roleFilter !== 'all' && user.role !== roleFilter) return false;
    if (statusFilter === 'active') return !!user.is_active;
    if (statusFilter === 'inactive') return !user.is_active;
    if (statusFilter === 'classification') return !(user as any).employment_classification || (user as any).employment_classification === 'unreviewed';
    if (statusFilter === 'payroll') {
      const employee = employeeMap.get(user.id);
      return (user as any).employment_classification === 'employee' && !!employee && !configReviewMap.get(employee.id);
    }
    return true;
  });

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

  async function sendAccountEmail(user: Profile, kind: 'welcome' | 'reset') {
    if (sendingAccountEmail) return;
    setSendingAccountEmail(user.id);
    try {
      const { data, error } = await supabase.functions.invoke(kind === 'welcome' ? 'send-welcome-email' : 'reset-user-password', {
        body: { email: user.email },
      });
      if (error) {
        let message = error.message;
        try { message = (await error.context?.json())?.error || message; } catch { /* Keep invocation error. */ }
        throw new Error(message);
      }
      if (!data?.success) throw new Error(data?.error || 'Email was not sent');
      if (data.warning) toast.error(data.warning);
      else toast.success(`${kind === 'welcome' ? 'Welcome' : 'Password reset'} email accepted by provider`);
      await loadUsers();
    } catch (error: any) {
      toast.error(error.message || 'Could not send email');
      await loadUsers();
    } finally {
      setSendingAccountEmail(null);
    }
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
        <div className="text-muted">Loading users...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 border border-blue-200">
        <div className="flex items-center gap-2 text-blue-800">
          <Users className="w-5 h-5" />
          <h2 className="text-lg font-semibold">User Management</h2>
          <span className="ml-2 bg-blue-600 text-primary text-xs font-bold px-2 py-1 rounded-full">
            {users.length}
          </span>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-primary rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all font-medium flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
        >
          <Plus className="w-4 h-4" />
          Add New User
        </button>
      </div>

      <label className="block rounded-lg border border-subtle bg-canvas p-3 text-sm text-primary">
        <span className="sr-only">Search users</span>
        <input type="search" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Search users by name, email or username" className="w-full bg-transparent outline-none" />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)} className="rounded-lg border border-subtle bg-canvas px-3 py-2 text-sm text-primary">Filters {statusFilter !== 'all' || roleFilter !== 'all' ? '•' : ''}</button>
        <span className="text-xs text-muted">{visibleUsers.length} of {users.length} users</span>
      </div>
      {showFilters && <div className="grid gap-3 rounded-lg border border-subtle bg-canvas p-3 sm:grid-cols-2">
        <label className="text-sm text-primary">Status<select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="mt-1 block w-full rounded-lg border border-subtle bg-surface p-2 text-primary"><option value="all">All</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="classification">Needs classification</option><option value="payroll">Payroll review required</option></select></label>
        <label className="text-sm text-primary">Role<select value={roleFilter} onChange={event => setRoleFilter(event.target.value)} className="mt-1 block w-full rounded-lg border border-subtle bg-surface p-2 text-primary"><option value="all">All roles</option>{[...new Set(users.map(user => String(user.role)))].sort().map(role => <option key={role} value={role}>{role.replace(/_/g, ' ')}</option>)}</select></label>
        <button type="button" onClick={() => {setStatusFilter('all');setRoleFilter('all');setSearchTerm('');}} className="text-left text-sm text-blue-600 underline">Clear filters</button>
      </div>}
      {/* Setup issues are summarized rather than duplicating the user directory. */}
      {(() => {
        const classificationCount = users.filter(u =>
          (u as any).employment_classification === 'unreviewed' || !(u as any).employment_classification
        ).length;
        const payrollCount = users.filter(u => {
          const emp = employeeMap.get(u.id);
          return (u as any).employment_classification === 'employee' && !!emp && !configReviewMap.get(emp.id);
        }).length;
        if (!classificationCount && !payrollCount) return null;
        return (
          <div className="flex flex-wrap gap-2" role="status" aria-label="User setup attention needed">
            {classificationCount > 0 && (
              <span className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {classificationCount} {classificationCount === 1 ? 'user needs' : 'users need'} classification
              </span>
            )}
            {payrollCount > 0 && (
              <span className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                {payrollCount} payroll {payrollCount === 1 ? 'configuration needs' : 'configurations need'} review
              </span>
            )}
          </div>
        );
      })()}

      <div className="bg-canvas rounded-lg shadow-sm border border-subtle overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface border-b border-subtle">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">User</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Created</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {visibleUsers.map((user) => (
                <tr key={user.id} className="hover:bg-surface">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-1.5 rounded-lg flex-shrink-0 ${
                        user.is_active ? 'bg-blue-100' : 'bg-surface'
                      }`}>
                        {user.role === 'admin' ? (
                          <Shield className={`w-4 h-4 ${user.is_active ? 'text-blue-600' : 'text-muted'}`} />
                        ) : (
                          <User className={`w-4 h-4 ${user.is_active ? 'text-blue-600' : 'text-muted'}`} />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className={`font-medium text-sm ${
                          user.is_active ? 'text-primary' : 'text-muted'
                        }`}>
                          {user.full_name}
                        </div>
                        <div className={`text-xs truncate ${
                          user.is_active ? 'text-muted' : 'text-muted'
                        }`}>
                          {user.email}
                        </div>
                        <div className="text-xs text-muted mt-1">
                          {accountStatusError ? 'Welcome status unavailable' : accountStatuses.get(user.id)?.activated_at ? 'Account Activated' : accountStatuses.get(user.id)?.welcome_sent_at ? `Welcome sent ${new Date(accountStatuses.get(user.id)!.welcome_sent_at!).toLocaleString()}` : 'Welcome: Never Sent'}
                        </div>
                        {(accountStatuses.get(user.id)?.welcome_error || accountStatuses.get(user.id)?.reset_error) && (
                          <div className="text-xs text-red-600 mt-1">{accountStatuses.get(user.id)?.welcome_error || accountStatuses.get(user.id)?.reset_error}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      user.role === 'admin' ? 'bg-blue-100 text-blue-700' :
                      user.role === 'finance' ? 'bg-purple-100 text-purple-700' :
                      user.role === 'manager' ? 'bg-orange-100 text-orange-700' :
                      String(user.role) === 'service_manager' ? 'bg-teal-100 text-teal-700' :
                      String(user.role) === 'office_manager' ? 'bg-indigo-100 text-indigo-700' :
                      String(user.role) === 'project_manager' ? 'bg-cyan-100 text-cyan-700' :
                      user.role === 'sales' ? 'bg-green-100 text-green-700' :
                      user.role === 'tech' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-surface text-secondary'
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
                      {((user as any).employment_classification === 'unreviewed' || !(user as any).employment_classification) && <button type="button" onClick={() => setEditingUser(user)} className="text-xs text-amber-700 underline">Needs classification</button>}
                      {(user as any).employment_classification === 'employee' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                          <UserCircle className="w-3 h-3" />
                          Employee
                        </span>
                      )}
                      {(user as any).employment_classification === 'non_employee' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-surface text-secondary">
                          Non-Employee
                        </span>
                      )}
                      {(() => {
                        const emp = employeeMap.get(user.id);
                        if ((user as any).employment_classification === 'employee' && emp && !configReviewMap.get(emp.id)) {
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
                    <span className="text-xs text-muted">
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
                        onClick={() => sendAccountEmail(user, 'welcome')}
                        disabled={!!sendingAccountEmail || !user.is_active}
                        className="px-2 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded disabled:opacity-50"
                        title="Send a secure password setup link"
                      >
                        {sendingAccountEmail === user.id ? 'Sending…' : accountStatuses.get(user.id)?.welcome_sent_at ? 'Resend Welcome' : 'Send Welcome'}
                      </button>
                      <button
                        disabled={!!sendingAccountEmail || !user.is_active}
                        onClick={() => sendAccountEmail(user, 'reset')}
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
        <div className="text-center py-12 text-muted">
          <Users className="w-12 h-12 mx-auto mb-3 text-muted" />
          <p>No users found</p>
        </div>
      )}

      {showAddForm && (
        <AddUserForm
          onClose={() => setShowAddForm(false)}
          onSuccess={(userData) => {
            setShowAddForm(false);
            loadUsers();
            setCreatedUserData(userData);
          }}
        />
      )}

      {createdUserData && (
        <UserCreatedConfirmation
          userData={createdUserData}
          onEditDepartment={() => {
            const user = users.find(u => u.id === createdUserData.userId);
            if (user) {
              setEditingUser(user);
            }
          }}
          onEditModules={() => {
            const user = users.find(u => u.id === createdUserData.userId);
            if (user) {
              setEditingUser(user);
            }
          }}
          onClose={() => setCreatedUserData(null)}
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


    </div>
  );
}
