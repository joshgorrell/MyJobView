import { useState, useEffect } from 'react';
import { X, Mail, AtSign, Shield, Briefcase, Eye, EyeOff, UserCircle, Clock, DollarSign } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { generateUsername } from '../../lib/username';
import { CompanyOffice } from '../../lib/types';

interface PaySchedule {
  id: string;
  name: string;
  frequency: string;
  is_active: boolean;
}

interface AddUserFormProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface Role {
  id: string;
  role_key: string;
  display_name: string;
  description: string;
}

export function AddUserForm({ onClose, onSuccess }: AddUserFormProps) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [offices, setOffices] = useState<CompanyOffice[]>([]);
  const [selectedOffices, setSelectedOffices] = useState<string[]>([]);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    first_name: '',
    last_name: '',
    username: '',
    role: 'sales' as 'admin' | 'finance' | 'manager' | 'sales' | 'tech' | 'service_manager',
    role_id: '' as string,
    email_leads: false,
    can_view_prospects: true,
    can_view_all_tasks: true,
    can_view_all_pipeline: true,
    can_edit_contact_assignments: false,
    can_edit_products: true,
    can_see_all_review_requests: false,
    can_edit_contacts: true,
    has_calendar_access: true,
    proposal_visibility_scope: 'company' as 'own' | 'office' | 'company',
    discussion_visibility_scope: 'all' as 'all' | 'assigned_only' | 'private_only' | 'own_posts',
    employment_type: 'hourly' as 'hourly' | 'job_time' | 'salary' | 'salary_no_clock',
    standard_start_time: '08:00',
    standard_end_time: '17:00',
    travel_bonus_enabled: false,
    travel_bonus_rate: '0.50',
    travel_bonus_method: 'round_trip' as 'round_trip' | 'one_way',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [paySchedules, setPaySchedules] = useState<PaySchedule[]>([]);
  const [isEmployee, setIsEmployee] = useState(false);
  const [employeeForm, setEmployeeForm] = useState({
    hire_date: new Date().toISOString().split('T')[0],
    employment_status: 'active' as 'active' | 'inactive' | 'terminated',
    termination_date: '',
    employee_number: '',
    compensation_type: 'hourly' as 'salary' | 'hourly',
    requires_daily_clock: true,
    requires_time_allocation: false,
    payroll_time_basis: 'daily_clock' as 'salary' | 'daily_clock' | 'work_allocation',
    expected_weekly_hours: '40',
    standard_start_time: '08:00',
    standard_end_time: '17:00',
    work_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] as string[],
    overtime_eligible: false,
    pto_eligible: false,
    pay_schedule_id: '' as string,
  });

  useEffect(() => {
    loadRoles();
    loadOffices();
    loadPaySchedules();
  }, []);

  async function loadRoles() {
    try {
      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .eq('is_active', true)
        .order('role_key');

      if (error) throw error;
      setRoles(data || []);
      if (data && data.length > 0) {
        const salesRole = data.find(r => r.role_key === 'sales');
        if (salesRole) {
          setFormData(prev => ({ ...prev, role_id: salesRole.id }));
        }
      }
    } catch (error) {
      console.error('Error loading roles:', error);
    }
  }

  async function loadOffices() {
    try {
      const { data, error } = await supabase
        .from('company_offices')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;
      setOffices(data || []);
    } catch (error) {
      console.error('Error loading offices:', error);
    }
  }

  async function loadPaySchedules() {
    try {
      const { data, error } = await supabase
        .from('pay_schedules')
        .select('id, name, frequency, is_active')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      setPaySchedules(data || []);
    } catch (error) {
      console.error('Error loading pay schedules:', error);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Check if username is already taken
      if (formData.username) {
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('username')
          .eq('username', formData.username)
          .maybeSingle();

        if (existingProfile) {
          setError(`Username "@${formData.username}" is already taken. Please choose a different username.`);
          setLoading(false);
          return;
        }
      }

      const username = formData.username || generateUsername(formData.full_name);

      // Use edge function to create user without logging in
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: formData.email,
            password: formData.password,
            full_name: formData.full_name,
            first_name: formData.first_name || null,
            last_name: formData.last_name || null,
            username: username,
            role: formData.role,
            role_id: formData.role_id,
            email_leads: formData.email_leads,
            can_view_prospects: formData.can_view_prospects,
            can_view_all_tasks: formData.can_view_all_tasks,
            can_view_all_pipeline: formData.can_view_all_pipeline,
            can_edit_contact_assignments: formData.can_edit_contact_assignments,
            can_edit_products: formData.can_edit_products,
            can_see_all_review_requests: formData.can_see_all_review_requests,
            can_edit_contacts: formData.can_edit_contacts,
            has_calendar_access: formData.has_calendar_access,
            proposal_visibility_scope: formData.proposal_visibility_scope,
            discussion_visibility_scope: formData.discussion_visibility_scope,
            employment_type: formData.employment_type,
            standard_start_time: formData.standard_start_time,
            standard_end_time: formData.standard_end_time,
            travel_bonus_enabled: formData.travel_bonus_enabled,
            travel_bonus_rate: parseFloat(formData.travel_bonus_rate),
            travel_bonus_method: formData.travel_bonus_method,
            office_ids: selectedOffices,
          }),
        }
      );

      console.log('Response status:', response.status);
      console.log('Response ok:', response.ok);

      const result = await response.json();
      console.log('Response body:', result);

      if (!response.ok) {
        console.error('Server response error:', result);
        console.error('Status code:', response.status);
        const errorMsg = result.error || result.message || 'Failed to create user';
        throw new Error(errorMsg);
      }

      console.log('User created successfully:', result);

      // If employee, create employee record + initial config + classification atomically via RPC
      if (isEmployee && result.userId) {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        const { error: rpcError } = await supabase.rpc('classify_as_employee', {
          p_user_id: result.userId,
          p_hire_date: employeeForm.hire_date,
          p_employee_number: employeeForm.employee_number || null,
          p_employment_status: employeeForm.employment_status,
          p_compensation_type: employeeForm.compensation_type,
          p_requires_daily_clock: employeeForm.requires_daily_clock,
          p_requires_time_allocation: employeeForm.requires_time_allocation,
          p_payroll_time_basis: employeeForm.payroll_time_basis,
          p_expected_weekly_hours: employeeForm.expected_weekly_hours ? parseFloat(employeeForm.expected_weekly_hours) : null,
          p_standard_start_time: employeeForm.standard_start_time,
          p_standard_end_time: employeeForm.standard_end_time,
          p_work_days: employeeForm.work_days,
          p_overtime_eligible: employeeForm.overtime_eligible,
          p_pto_eligible: employeeForm.pto_eligible,
          p_pay_schedule_id: employeeForm.pay_schedule_id || null,
          p_reviewed_by: currentUser?.id,
        });
        if (rpcError) {
          console.error('Employee creation error:', rpcError);
          throw new Error(`Employee setup failed: ${rpcError.message}`);
        }
      }

      onSuccess();
    } catch (err: any) {
      console.error('Error creating user:', err);
      console.error('Full error object:', JSON.stringify(err, null, 2));
      const errorMsg = err.message || 'Failed to create user';
      setError(`Error: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-0 z-50 overflow-hidden">
      <div className="bg-gray-900 rounded-xl shadow-2xl max-w-md w-full h-full sm:h-auto sm:max-h-[90vh] sm:my-4 border-0 sm:border border-purple-500/30 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-purple-500/30 flex-shrink-0">
          <h2 className="text-xl sm:text-2xl font-bold text-white">Add New User</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Full Name *
            </label>
            <input
              type="text"
              required
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              placeholder="John Doe"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                First Name
              </label>
              <input
                type="text"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="John"
              />
              <p className="text-xs text-gray-500 mt-1">Optional - for QuickBooks payroll</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Last Name
              </label>
              <input
                type="text"
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="Doe"
              />
              <p className="text-xs text-gray-500 mt-1">Optional - for QuickBooks payroll</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Username (@ mention name)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <AtSign className="w-4 h-4 text-gray-500" />
              </div>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') })}
                className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder={formData.full_name ? generateUsername(formData.full_name) : 'johndoe'}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Leave blank to auto-generate from name. Lowercase letters and numbers only.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Email *
            </label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              placeholder="john@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Password *
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-4 py-2 pr-10 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                placeholder="Minimum 6 characters"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-white"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Role *
            </label>
            <select
              value={formData.role_id}
              onChange={(e) => {
                const selectedRole = roles.find(r => r.id === e.target.value);
                const roleKey = selectedRole?.role_key as any || 'sales';
                // Auto-set can_view_prospects for sales, admin, and manager roles
                const canViewProspects = ['sales', 'admin', 'manager'].includes(roleKey);
                setFormData({
                  ...formData,
                  role_id: e.target.value,
                  role: roleKey,
                  can_view_prospects: canViewProspects
                });
              }}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            >
              {roles.length === 0 && <option>Loading roles...</option>}
              {roles.map(role => (
                <option key={role.id} value={role.id}>
                  {role.display_name}
                </option>
              ))}
            </select>
            {formData.role_id && roles.length > 0 && (
              <p className="text-xs text-gray-400 mt-1">
                {roles.find(r => r.id === formData.role_id)?.description}
              </p>
            )}
          </div>

          {offices.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Office Assignments
              </label>
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-2">
                <p className="text-xs text-gray-400 mb-3">
                  Select which offices this user has access to. Leave empty for access to all offices.
                </p>
                {offices.map((office) => (
                  <label key={office.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedOffices.includes(office.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedOffices([...selectedOffices, office.id]);
                        } else {
                          setSelectedOffices(selectedOffices.filter(id => id !== office.id));
                        }
                      }}
                      className="w-4 h-4 text-cyan-500 bg-gray-700 border-gray-600 rounded focus:ring-2 focus:ring-cyan-500"
                    />
                    <span className="text-sm text-white">{office.office_name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="bg-gray-800 border border-cyan-500/30 rounded-lg p-4 space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.email_leads}
                onChange={(e) => setFormData({ ...formData, email_leads: e.target.checked })}
                className="mt-1 w-4 h-4 text-cyan-500 bg-gray-700 border-gray-600 rounded focus:ring-2 focus:ring-cyan-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm font-medium text-white">
                    Email Leads
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  User will receive email notifications for new leads
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.can_view_prospects}
                onChange={(e) => setFormData({ ...formData, can_view_prospects: e.target.checked })}
                className="mt-1 w-4 h-4 text-cyan-500 bg-gray-700 border-gray-600 rounded focus:ring-2 focus:ring-cyan-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm font-medium text-white">
                    Can View Prospects
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Access to prospect contacts and competitor tracking. Default: ON for sales/admin/manager roles.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.can_view_all_tasks}
                onChange={(e) => setFormData({ ...formData, can_view_all_tasks: e.target.checked })}
                className="mt-1 w-4 h-4 text-cyan-500 bg-gray-700 border-gray-600 rounded focus:ring-2 focus:ring-cyan-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm font-medium text-white">
                    Can View All Tasks
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Allow user to see all company tasks (if disabled, user can only see their own tasks)
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.can_view_all_pipeline}
                onChange={(e) => setFormData({ ...formData, can_view_all_pipeline: e.target.checked })}
                className="mt-1 w-4 h-4 text-cyan-500 bg-gray-700 border-gray-600 rounded focus:ring-2 focus:ring-cyan-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm font-medium text-white">
                    Can View All Pipeline
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Allow user to see company-wide pipeline data (contacts, connections, leads, fishbowl). Business Development Managers need this.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.can_edit_contact_assignments}
                onChange={(e) => setFormData({ ...formData, can_edit_contact_assignments: e.target.checked })}
                className="mt-1 w-4 h-4 text-cyan-500 bg-gray-700 border-gray-600 rounded focus:ring-2 focus:ring-cyan-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm font-medium text-white">
                    Can Edit Contact Assignments
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Allow user to reassign contacts to different sales reps. Useful for sales managers and team leads.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.can_edit_products}
                onChange={(e) => setFormData({ ...formData, can_edit_products: e.target.checked })}
                className="mt-1 w-4 h-4 text-cyan-500 bg-gray-700 border-gray-600 rounded focus:ring-2 focus:ring-cyan-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm font-medium text-white">
                    Can Edit Products
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Allow user to add, edit, and delete products in the catalog (unchecked = view only)
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.can_edit_contacts}
                onChange={(e) => setFormData({ ...formData, can_edit_contacts: e.target.checked })}
                className="mt-1 w-4 h-4 text-cyan-500 bg-gray-700 border-gray-600 rounded focus:ring-2 focus:ring-cyan-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm font-medium text-white">
                    Can Edit Contacts
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Allow user to add, edit, and delete contacts (unchecked = view only)
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.can_see_all_review_requests}
                onChange={(e) => setFormData({ ...formData, can_see_all_review_requests: e.target.checked })}
                className="mt-1 w-4 h-4 text-cyan-500 bg-gray-700 border-gray-600 rounded focus:ring-2 focus:ring-cyan-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm font-medium text-white">
                    Can See All Review Requests
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Allow user to see all company review requests (unchecked = only see their own)
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.has_calendar_access}
                onChange={(e) => setFormData({ ...formData, has_calendar_access: e.target.checked })}
                className="mt-1 w-4 h-4 text-cyan-500 bg-gray-700 border-gray-600 rounded focus:ring-2 focus:ring-cyan-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm font-medium text-white">
                    Has Calendar Access
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Allow user to access their personal calendar for scheduling and reminders (enabled by default)
                </p>
              </div>
            </label>
          </div>

          <div className="bg-gray-800 border border-cyan-500/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Briefcase className="w-5 h-5 text-cyan-400 mt-2" />
              <div className="flex-1">
                <label className="block text-sm font-medium text-white mb-2">
                  Proposal Visibility Scope
                </label>
                <select
                  value={formData.proposal_visibility_scope}
                  onChange={(e) => setFormData({ ...formData, proposal_visibility_scope: e.target.value as any })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                >
                  <option value="own">Only My Proposals</option>
                  <option value="office">My Office Proposals</option>
                  <option value="company">All Company Proposals</option>
                </select>
                <p className="text-xs text-gray-400 mt-2">
                  <span className="font-medium">Only My Proposals:</span> User sees only proposals they created<br/>
                  <span className="font-medium">My Office:</span> User sees all proposals from their assigned office(s)<br/>
                  <span className="font-medium">All Company:</span> User sees all proposals company-wide
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gray-800 border border-cyan-500/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Briefcase className="w-5 h-5 text-cyan-400 mt-2" />
              <div className="flex-1">
                <label className="block text-sm font-medium text-white mb-2">
                  Team Pulse (Discussion) Visibility
                </label>
                <select
                  value={formData.discussion_visibility_scope}
                  onChange={(e) => setFormData({ ...formData, discussion_visibility_scope: e.target.value as any })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                >
                  <option value="all">All Discussion Posts</option>
                  <option value="assigned_only">Only Assigned or Mentioned Posts</option>
                  <option value="private_only">Only Private Posts (Assigned/Mentioned)</option>
                  <option value="own_posts">Only Their Own Posts</option>
                </select>
                <p className="text-xs text-gray-400 mt-2">
                  <span className="font-medium">All Posts:</span> User sees all company discussion posts (default)<br/>
                  <span className="font-medium">Assigned/Mentioned Only:</span> User only sees posts assigned to them or where they're mentioned<br/>
                  <span className="font-medium">Private Posts Only:</span> User only sees private posts they are part of<br/>
                  <span className="font-medium">Own Posts Only:</span> User only sees discussion posts they created
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gray-800 border border-blue-500/30 rounded-lg p-4 space-y-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isEmployee}
                onChange={(e) => setIsEmployee(e.target.checked)}
                className="mt-1 w-4 h-4 text-cyan-500 bg-gray-700 border-gray-600 rounded focus:ring-2 focus:ring-cyan-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <UserCircle className="w-4 h-4 text-blue-400" />
                  <span className="text-sm font-medium text-white">Is this person an Employee?</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">Check to enable payroll, timekeeping, and pay schedule assignment.</p>
              </div>
            </label>

            {isEmployee && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Hire Date *</label>
                    <input
                      type="date"
                      required={isEmployee}
                      value={employeeForm.hire_date}
                      onChange={(e) => setEmployeeForm({ ...employeeForm, hire_date: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Employee #</label>
                    <input
                      type="text"
                      value={employeeForm.employee_number}
                      onChange={(e) => setEmployeeForm({ ...employeeForm, employee_number: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                      placeholder="Optional"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Compensation Type</label>
                  <select
                    value={employeeForm.compensation_type}
                    onChange={(e) => {
                      const val = e.target.value as 'salary' | 'hourly';
                      setEmployeeForm({ ...employeeForm, compensation_type: val, payroll_time_basis: (val === 'salary' ? 'salary' : 'daily_clock') as any });
                    }}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  >
                    <option value="hourly">Hourly</option>
                    <option value="salary">Salary</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Payroll Time Basis</label>
                  <select
                    value={employeeForm.payroll_time_basis}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, payroll_time_basis: e.target.value as any })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  >
                    <option value="salary">Salary (no hourly segments)</option>
                    <option value="daily_clock">Daily Clock (one segment per clock entry)</option>
                    <option value="work_allocation">Work Allocation (segments from job time)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Pay Schedule</label>
                  <select
                    value={employeeForm.pay_schedule_id}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, pay_schedule_id: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  >
                    <option value="">No pay schedule assigned</option>
                    {paySchedules.map(ps => (
                      <option key={ps.id} value={ps.id}>{ps.name} ({ps.frequency})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Expected Weekly Hours</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    value={employeeForm.expected_weekly_hours}
                    onChange={(e) => setEmployeeForm({ ...employeeForm, expected_weekly_hours: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>

                <div className="space-y-2 border-t border-gray-700 pt-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={employeeForm.requires_daily_clock} onChange={(e) => setEmployeeForm({ ...employeeForm, requires_daily_clock: e.target.checked })} className="mt-1 w-4 h-4 text-cyan-500 bg-gray-700 border-gray-600 rounded focus:ring-2 focus:ring-cyan-500" />
                    <span className="text-sm font-medium text-white">Requires Daily Clock</span>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={employeeForm.requires_time_allocation} onChange={(e) => setEmployeeForm({ ...employeeForm, requires_time_allocation: e.target.checked })} className="mt-1 w-4 h-4 text-cyan-500 bg-gray-700 border-gray-600 rounded focus:ring-2 focus:ring-cyan-500" />
                    <span className="text-sm font-medium text-white">Requires Time Allocation</span>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={employeeForm.overtime_eligible} onChange={(e) => setEmployeeForm({ ...employeeForm, overtime_eligible: e.target.checked })} className="mt-1 w-4 h-4 text-cyan-500 bg-gray-700 border-gray-600 rounded focus:ring-2 focus:ring-cyan-500" />
                    <span className="text-sm font-medium text-white">Overtime Eligible</span>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={employeeForm.pto_eligible} onChange={(e) => setEmployeeForm({ ...employeeForm, pto_eligible: e.target.checked })} className="mt-1 w-4 h-4 text-cyan-500 bg-gray-700 border-gray-600 rounded focus:ring-2 focus:ring-cyan-500" />
                    <span className="text-sm font-medium text-white">PTO Eligible</span>
                    <p className="text-xs text-gray-400 mt-1">Does not by itself generate payable hours</p>
                  </label>
                </div>

                {employeeForm.requires_daily_clock && (
                  <div className="border-t border-gray-700 pt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Standard Start Time</label>
                        <input type="time" value={employeeForm.standard_start_time} onChange={(e) => setEmployeeForm({ ...employeeForm, standard_start_time: e.target.value })} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Standard End Time</label>
                        <input type="time" value={employeeForm.standard_end_time} onChange={(e) => setEmployeeForm({ ...employeeForm, standard_end_time: e.target.value })} className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Work Days</label>
                      <div className="flex flex-wrap gap-2">
                        {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => (
                          <label key={day} className="flex items-center gap-1 cursor-pointer">
                            <input type="checkbox" checked={employeeForm.work_days.includes(day)} onChange={(e) => { const newDays = e.target.checked ? [...employeeForm.work_days, day] : employeeForm.work_days.filter(d => d !== day); setEmployeeForm({ ...employeeForm, work_days: newDays }); }} className="w-4 h-4 text-cyan-500 bg-gray-700 border-gray-600 rounded focus:ring-2 focus:ring-cyan-500" />
                            <span className="text-xs text-white capitalize">{day.slice(0, 3)}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="bg-gray-800 border border-cyan-500/30 rounded-lg p-4 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-cyan-400" />
              Travel Bonus
            </h3>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.travel_bonus_enabled}
                  onChange={(e) => setFormData({ ...formData, travel_bonus_enabled: e.target.checked })}
                  className="mt-1 w-4 h-4 text-cyan-500 bg-gray-700 border-gray-600 rounded focus:ring-2 focus:ring-cyan-500"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium text-white">Enable Travel Bonus</span>
                  <p className="text-xs text-gray-400 mt-1">
                    GPS tracking with automatic travel bonus calculation
                  </p>
                </div>
              </label>

              {formData.travel_bonus_enabled && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Rate per Mile
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.travel_bonus_rate}
                      onChange={(e) => setFormData({ ...formData, travel_bonus_rate: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Method
                    </label>
                    <select
                      value={formData.travel_bonus_method}
                      onChange={(e) => setFormData({ ...formData, travel_bonus_method: e.target.value as any })}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    >
                      <option value="round_trip">Round Trip</option>
                      <option value="one_way">One Way</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:shadow-lg hover:shadow-cyan-500/50 transition-all font-medium disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
