import { useState, useEffect } from 'react';
import { X, Key, AtSign, Mail, Briefcase, Shield, Calendar as CalendarIcon, Target } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Profile, CompanyOffice } from '../../lib/types';

interface EditUserFormProps {
  user: Profile;
  onClose: () => void;
  onSuccess: () => void;
}

interface Role {
  id: string;
  role_key: string;
  display_name: string;
  description: string;
}

export function EditUserForm({ user, onClose, onSuccess }: EditUserFormProps) {
  const [roles, setRoles] = useState<Role[]>([]);
  const [formData, setFormData] = useState({
    full_name: user.full_name,
    first_name: (user as any).first_name || '',
    last_name: (user as any).last_name || '',
    username: user.username,
    email: user.email,
    role: user.role,
    role_id: (user as any).role_id || '',
    email_leads: user.email_leads,
    can_view_prospects: (user as any).can_view_prospects ?? false,
    can_view_all_tasks: (user as any).can_view_all_tasks ?? true,
    can_view_all_pipeline: (user as any).can_view_all_pipeline ?? true,
    can_edit_contact_assignments: (user as any).can_edit_contact_assignments ?? false,
    can_create_work_orders: (user as any).can_create_work_orders ?? false,
    can_edit_products: (user as any).can_edit_products ?? true,
    can_see_all_review_requests: (user as any).can_see_all_review_requests ?? false,
    can_edit_contacts: (user as any).can_edit_contacts ?? true,
    has_calendar_access: (user as any).has_calendar_access ?? true,
    proposal_visibility_scope: (user as any).proposal_visibility_scope || 'company' as 'own' | 'office' | 'company',
    discussion_visibility_scope: (user as any).discussion_visibility_scope || 'all' as 'all' | 'assigned_only' | 'private_only' | 'own_posts',
    employment_type: (user as any).employment_type || 'hourly',
    standard_start_time: (user as any).standard_start_time || '08:00',
    standard_end_time: (user as any).standard_end_time || '17:00',
    travel_bonus_enabled: (user as any).travel_bonus_enabled || false,
    travel_bonus_rate: (user as any).travel_bonus_rate || '0.50',
    travel_bonus_method: (user as any).travel_bonus_method || 'round_trip',
    monthly_sales_target: (user as any).monthly_sales_target || '0',
    yearly_escalation_percentage: (user as any).yearly_escalation_percentage || '0',
    previous_year_sales: (user as any).previous_year_sales || '0',
  });
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [offices, setOffices] = useState<CompanyOffice[]>([]);
  const [selectedOffices, setSelectedOffices] = useState<string[]>([]);

  useEffect(() => {
    loadRoles();
    loadOffices();
    loadUserOffices();
  }, []);

  // When roles are loaded, set the role_id if it's not already set
  useEffect(() => {
    if (roles.length > 0 && !formData.role_id && formData.role) {
      const matchingRole = roles.find(r => r.role_key === formData.role);
      if (matchingRole) {
        setFormData(prev => ({ ...prev, role_id: matchingRole.id }));
      }
    }
  }, [roles]);

  async function loadRoles() {
    try {
      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .eq('is_active', true)
        .order('role_key');

      if (error) throw error;
      setRoles(data || []);
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

  async function loadUserOffices() {
    try {
      const { data, error } = await supabase
        .from('user_offices')
        .select('office_id')
        .eq('user_id', user.id);

      if (error) throw error;
      setSelectedOffices((data || []).map(uo => uo.office_id));
    } catch (error) {
      console.error('Error loading user offices:', error);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation(); // Prevent any parent handlers from firing

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    console.log('=== FORM SUBMIT STARTED ===');
    console.log('User ID being updated:', user.id);
    console.log('Current form data:', JSON.stringify(formData, null, 2));

    try {
      // Validate that a role is selected
      if (!formData.role_id) {
        throw new Error('Please select a role for this user');
      }

      // Check current user's permissions
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      console.log('Current logged in user:', currentUser?.id);

      const { data: currentProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', currentUser?.id)
        .single();

      console.log('Current user role:', currentProfile?.role);

      if (currentProfile?.role !== 'admin') {
        throw new Error('Only admins can edit users');
      }

      // If email changed, update it via edge function
      if (formData.email !== user.email) {
        console.log('Email changed, updating via edge function...');
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-user-email`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              userId: user.id,
              newEmail: formData.email,
            }),
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || 'Failed to update email');
        }
        console.log('Email updated successfully');
      }

      console.log('=== PREPARING PROFILE UPDATE ===');
      const updateData = {
        full_name: formData.full_name,
        first_name: formData.first_name || null,
        last_name: formData.last_name || null,
        username: formData.username,
        role: formData.role,
        role_id: formData.role_id || null,
        email_leads: formData.email_leads,
        can_view_prospects: formData.can_view_prospects,
        can_view_all_tasks: formData.can_view_all_tasks,
        can_view_all_pipeline: formData.can_view_all_pipeline,
        can_edit_contact_assignments: formData.can_edit_contact_assignments,
        can_create_work_orders: formData.can_create_work_orders,
        can_edit_products: formData.can_edit_products,
        can_see_all_review_requests: formData.can_see_all_review_requests,
        can_edit_contacts: formData.can_edit_contacts,
        has_calendar_access: formData.has_calendar_access,
        proposal_visibility_scope: formData.proposal_visibility_scope,
        discussion_visibility_scope: formData.discussion_visibility_scope,
        employment_type: formData.employment_type,
        requires_daily_clock: formData.employment_type === 'hourly' || formData.employment_type === 'job_time' || formData.employment_type === 'salary',
        standard_start_time: (formData.employment_type !== 'job_time' && formData.employment_type !== 'salary_no_clock') ? formData.standard_start_time : null,
        standard_end_time: (formData.employment_type !== 'job_time' && formData.employment_type !== 'salary_no_clock') ? formData.standard_end_time : null,
        travel_bonus_enabled: formData.travel_bonus_enabled,
        travel_bonus_rate: formData.travel_bonus_enabled ? parseFloat(formData.travel_bonus_rate as string) : null,
        travel_bonus_method: formData.travel_bonus_enabled ? formData.travel_bonus_method : null,
        monthly_sales_target: parseFloat(formData.monthly_sales_target as string) || 0,
        yearly_escalation_percentage: parseFloat(formData.yearly_escalation_percentage as string) || 0,
        previous_year_sales: parseFloat(formData.previous_year_sales as string) || 0,
      };

      console.log('Update data to be saved:', JSON.stringify(updateData, null, 2));

      console.log('=== EXECUTING UPDATE QUERY ===');
      const { data: updatedProfile, error: updateError } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', user.id)
        .select()
        .single();

      if (updateError) {
        console.error('!!! PROFILE UPDATE ERROR !!!', {
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint,
          code: updateError.code
        });
        throw new Error(`Database error: ${updateError.message} (${updateError.code})`);
      }

      if (!updatedProfile) {
        throw new Error('Update succeeded but no data returned. This might be an RLS policy issue.');
      }

      console.log('=== PROFILE UPDATED SUCCESSFULLY ===');
      console.log('Updated profile:', JSON.stringify(updatedProfile, null, 2));

      // Verify the update by reading back the data
      console.log('=== VERIFYING UPDATE ===');
      const { data: verifyData, error: verifyError } = await supabase
        .from('profiles')
        .select('can_view_all_tasks, can_view_all_pipeline, employment_type, travel_bonus_enabled, travel_bonus_rate, travel_bonus_method')
        .eq('id', user.id)
        .single();

      if (verifyError) {
        console.error('Verification error:', verifyError);
      } else {
        console.log('Verified data from database:', JSON.stringify(verifyData, null, 2));

        // Compare what we tried to save vs what's actually in the database
        console.log('Comparison:');
        console.log('- can_view_all_tasks: sent =', updateData.can_view_all_tasks, ', saved =', verifyData?.can_view_all_tasks);
        console.log('- can_view_all_pipeline: sent =', updateData.can_view_all_pipeline, ', saved =', verifyData?.can_view_all_pipeline);
        console.log('- employment_type: sent =', updateData.employment_type, ', saved =', verifyData?.employment_type);
        console.log('- travel_bonus_enabled: sent =', updateData.travel_bonus_enabled, ', saved =', verifyData?.travel_bonus_enabled);
        console.log('- travel_bonus_rate: sent =', updateData.travel_bonus_rate, ', saved =', verifyData?.travel_bonus_rate);
      }

      console.log('=== UPDATING OFFICE ASSIGNMENTS ===');
      const { error: deleteError } = await supabase
        .from('user_offices')
        .delete()
        .eq('user_id', user.id);

      if (deleteError) {
        console.error('Error deleting office assignments:', deleteError);
      }

      if (selectedOffices.length > 0) {
        console.log('Inserting office assignments:', selectedOffices);
        const { error: officeError } = await supabase
          .from('user_offices')
          .insert(selectedOffices.map(officeId => ({
            user_id: user.id,
            office_id: officeId,
          })));

        if (officeError) {
          console.error('Office assignment error:', officeError);
          throw new Error(`Office assignment failed: ${officeError.message}`);
        }
        console.log('Office assignments updated successfully');
      }

      console.log('=== ALL UPDATES COMPLETE ===');
      setSuccessMessage('✓ User updated successfully! Closing in 2 seconds...');

      // Wait 2 seconds so user can see the success message
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log('Calling onSuccess callback...');
      onSuccess();
    } catch (err: any) {
      console.error('=== ERROR DURING UPDATE ===', err);
      const errorMessage = err.message || 'Failed to update user. Check console for details.';
      console.error('Error message to display:', errorMessage);
      setError(errorMessage);
      // Don't close on error - let user see the error message
    } finally {
      console.log('=== FORM SUBMIT FINISHED ===');
      setLoading(false);
    }
  }

  async function handlePasswordReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reset-user-password`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            email: user.email,
            password: newPassword,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to reset password');
      }

      setSuccessMessage('Password reset successfully');
      setNewPassword('');
      setShowPasswordReset(false);
    } catch (err: any) {
      console.error('Error resetting password:', err);
      setError(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-0 z-50 overflow-hidden">
      <div className="bg-gray-900 rounded-xl shadow-2xl max-w-md w-full h-full sm:h-auto sm:max-h-[90vh] sm:my-4 border-0 sm:border border-purple-500/30 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-purple-500/30">
          <h2 className="text-xl sm:text-2xl font-bold text-white">Edit User</h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-sm">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-green-500/20 border border-green-500/50 rounded-lg text-green-300 text-sm">
              {successMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
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
                Username (@ mention name) *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <AtSign className="w-4 h-4 text-gray-500" />
                </div>
                <input
                  type="text"
                  required
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') })}
                  className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">Lowercase letters and numbers only</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Email *
              </label>
              <input
                type="email"
                name="user-email"
                autoComplete="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">This will update the user's login email</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Role *
              </label>
              <select
                value={formData.role_id}
                onChange={(e) => {
                  const selectedRole = roles.find(r => r.id === e.target.value);
                  console.log('Role selected:', selectedRole);
                  setFormData({ ...formData, role_id: e.target.value, role: selectedRole?.role_key as any || 'sales' });
                }}
                className={`w-full px-4 py-2 bg-gray-800 border ${formData.role_id ? 'border-gray-700' : 'border-orange-500'} text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
              >
                {roles.length === 0 && <option value="">Loading roles...</option>}
                {roles.length > 0 && !formData.role_id && <option value="">-- Select a Role --</option>}
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
              {!formData.role_id && roles.length > 0 && (
                <p className="text-xs text-orange-400 mt-1">
                  Please select a role to continue
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
                    Access to prospect contacts and competitor tracking
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
                  checked={formData.can_create_work_orders}
                  onChange={(e) => setFormData({ ...formData, can_create_work_orders: e.target.checked })}
                  className="mt-1 w-4 h-4 text-cyan-500 bg-gray-700 border-gray-600 rounded focus:ring-2 focus:ring-cyan-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-cyan-400" />
                    <span className="text-sm font-medium text-white">
                      Can Create Work Orders
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Allow user to create new work orders from My Work Center (admins and managers always have this access)
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
                    <CalendarIcon className="w-4 h-4 text-cyan-400" />
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

            <div className="bg-gray-800 border border-cyan-500/30 rounded-lg p-4 space-y-4">
              <h3 className="text-sm font-semibold text-white">Time & Pay Settings</h3>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Employment Type *
                </label>
                <select
                  value={formData.employment_type}
                  onChange={(e) => setFormData({ ...formData, employment_type: e.target.value as any })}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                >
                  <option value="hourly">Hourly - Daily clock required, paid by hours</option>
                  <option value="job_time">Job Time - No daily clock, paid per job</option>
                  <option value="salary">Salary - Daily clock for tracking only</option>
                  <option value="salary_no_clock">Salary - No time clock needed</option>
                </select>
              </div>

              {formData.employment_type !== 'job_time' && formData.employment_type !== 'salary_no_clock' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Start Time
                    </label>
                    <input
                      type="time"
                      value={formData.standard_start_time}
                      onChange={(e) => setFormData({ ...formData, standard_start_time: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      End Time
                    </label>
                    <input
                      type="time"
                      value={formData.standard_end_time}
                      onChange={(e) => setFormData({ ...formData, standard_end_time: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    />
                  </div>
                </div>
              )}

              <div className="border-t border-gray-700 pt-4">
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
            </div>

            {/* Sales Target Settings - Only show for sales roles */}
            {(formData.role === 'sales' || formData.role === 'admin' || formData.role === 'manager') && (
              <div className="bg-gray-800 border border-cyan-500/30 rounded-lg p-4 space-y-4">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Target className="w-4 h-4 text-cyan-400" />
                  Sales Target Settings
                </h3>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Monthly Sales Target ($)
                  </label>
                  <input
                    type="number"
                    step="1000"
                    min="0"
                    value={formData.monthly_sales_target}
                    onChange={(e) => setFormData({ ...formData, monthly_sales_target: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    placeholder="0"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Goal for sales this rep should achieve each month
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Yearly Escalation (%)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      value={formData.yearly_escalation_percentage}
                      onChange={(e) => setFormData({ ...formData, yearly_escalation_percentage: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                      placeholder="0"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      % increase over last year (e.g., 5% growth)
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Previous Year Sales ($)
                    </label>
                    <input
                      type="number"
                      step="1000"
                      min="0"
                      value={formData.previous_year_sales}
                      onChange={(e) => setFormData({ ...formData, previous_year_sales: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                      placeholder="0"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Total sales from previous year
                    </p>
                  </div>
                </div>

                {parseFloat(formData.previous_year_sales) > 0 && parseFloat(formData.yearly_escalation_percentage) > 0 && (
                  <div className="bg-gray-700 border border-gray-600 rounded-lg p-3">
                    <p className="text-xs text-gray-400 mb-1">Escalated Target:</p>
                    <p className="text-lg font-bold text-cyan-400">
                      ${(parseFloat(formData.previous_year_sales) * (1 + parseFloat(formData.yearly_escalation_percentage) / 100)).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {parseFloat(formData.yearly_escalation_percentage)}% increase over ${parseFloat(formData.previous_year_sales).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </p>
                  </div>
                )}
              </div>
            )}

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
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>

          <div className="border-t border-purple-500/30 pt-4">
            {!showPasswordReset ? (
              <button
                onClick={() => setShowPasswordReset(true)}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors font-medium flex items-center justify-center gap-2"
              >
                <Key className="w-4 h-4" />
                Reset Password
              </button>
            ) : (
              <form onSubmit={handlePasswordReset} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    New Password *
                  </label>
                  <input
                    type="password"
                    name="admin-reset-password"
                    autoComplete="new-password"
                    data-lpignore="true"
                    data-form-type="other"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                    placeholder="Minimum 6 characters"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPasswordReset(false);
                      setNewPassword('');
                    }}
                    className="flex-1 px-4 py-2 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors font-medium text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium disabled:opacity-50 text-sm"
                  >
                    {loading ? 'Resetting...' : 'Reset Password'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
