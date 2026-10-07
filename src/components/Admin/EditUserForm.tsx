import {
  UserSetupTabs,
  UserNotifications,
  UserDataCard,
  setupSections,
  notificationDefaults,
  saveSetupReview,
  useSetupReview,
} from './UserSetup';
import { useState, useEffect, useRef } from 'react';
import {
  X,
  Key,
  AtSign,
  Briefcase,
  Shield,
  Calendar as CalendarIcon,
  UserCircle,
  Clock,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Profile, CompanyOffice } from '../../lib/types';

type TabKey = (typeof setupSections)[number]['key'] | 'review';

interface PaySchedule {
  id: string;
  name: string;
  frequency: string;
  is_active: boolean;
}

interface EmployeeRecord {
  id: string;
  employment_status: string;
  hire_date: string;
  termination_date: string | null;
  employee_number: string | null;
}

interface EmployeePayrollConfig {
  id: string;
  effective_from: string;
  effective_to: string | null;
  compensation_type: 'salary' | 'hourly';
  requires_daily_clock: boolean;
  requires_time_allocation: boolean;
  payroll_time_basis: 'salary' | 'daily_clock' | 'work_allocation';
  expected_weekly_hours: number | null;
  standard_start_time: string | null;
  standard_end_time: string | null;
  work_days: string[] | null;
  overtime_eligible: boolean;
  pto_eligible: boolean;
  pay_schedule_id: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

interface Role {
  id: string;
  role_key: string;
  display_name: string;
  description: string;
}

interface Department {
  id: string;
  name: string;
  display_name: string;
  description: string;
  color: string;
  is_active: boolean;
  sort_order: number;
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

interface EditUserFormProps {
  user: Profile;
  onClose: () => void;
  onSuccess: () => void;
  onNavigate?: (tab: string) => void;
}

export function EditUserForm({ user, onClose, onSuccess, onNavigate }: EditUserFormProps) {
  const [dataLoadFailed, setDataLoadFailed] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const contentRef = useRef<HTMLFormElement>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('profile');

  const { reviewed, setReviewed, reviewError } = useSetupReview(user.id);
  const [notifications, setNotifications] = useState(() =>
    notificationDefaults(user as unknown as Record<string, unknown>),
  );
  // --- Details tab state ---
  const [roles, setRoles] = useState<Role[]>([]);
  const [offices, setOffices] = useState<CompanyOffice[]>([]);
  const [selectedOffices, setSelectedOffices] = useState<string[]>([]);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [formData, setFormData] = useState({
    full_name: user.full_name,
    first_name: (user as any).first_name || '',
    last_name: (user as any).last_name || '',
    username: user.username,
    email: user.email,
    role: user.role,
    role_id: (user as any).role_id || '',
    email_leads: user.email_leads,
    is_sales_rep: (user as any).is_sales_rep ?? false,
    can_create_proposals: (user as any).can_create_proposals ?? true,
    can_create_purchase_orders:
      (user as any).can_create_purchase_orders ?? ['admin', 'manager', 'finance'].includes(user.role),
    can_view_prospects: (user as any).can_view_prospects ?? false,
    can_view_all_tasks: (user as any).can_view_all_tasks ?? true,
    can_view_all_messages: (user as any).can_view_all_messages ?? false,
    can_view_all_pipeline: (user as any).can_view_all_pipeline ?? true,
    can_edit_contact_assignments: (user as any).can_edit_contact_assignments ?? false,
    can_create_work_orders: (user as any).can_create_work_orders ?? false,
    can_edit_products: (user as any).can_edit_products ?? true,
    can_see_all_review_requests: (user as any).can_see_all_review_requests ?? false,
    can_request_google_reviews: (user as any).can_request_google_reviews ?? true,
    can_view_customer_feedback: (user as any).can_view_customer_feedback ?? ((user as any).can_see_all_review_requests ?? false),
    can_manage_customer_feedback: (user as any).can_manage_customer_feedback ?? false,
    can_send_lost_opportunity_reviews: user.can_send_lost_opportunity_reviews ?? false,
    can_view_lost_opportunity_submissions: user.can_view_lost_opportunity_submissions ?? false,
    notify_lost_opportunity_submissions: user.notify_lost_opportunity_submissions ?? false,
    can_edit_contacts: (user as any).can_edit_contacts ?? true,
    has_calendar_access: (user as any).has_calendar_access ?? true,
    proposal_visibility_scope: (user as any).proposal_visibility_scope || ('company' as 'own' | 'office' | 'company'),
    discussion_visibility_scope:
      (user as any).discussion_visibility_scope || ('all' as 'all' | 'assigned_only' | 'private_only' | 'own_posts'),
    travel_bonus_enabled: (user as any).travel_bonus_enabled || false,
    travel_bonus_rate: (user as any).travel_bonus_rate || '0.50',
    travel_bonus_method: (user as any).travel_bonus_method || 'round_trip',
    sales_rep_start_date: (user as any).sales_rep_start_date
      ? new Date((user as any).sales_rep_start_date + 'T12:00:00').toISOString().split('T')[0]
      : '',
  });

  // --- Access tab state ---
  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptRoleAccess, setDeptRoleAccess] = useState<Map<string, boolean>>(new Map());
  const [deptOverrides, setDeptOverrides] = useState<Map<string, DepartmentOverride>>(new Map());
  const [modules, setModules] = useState<Record<string, Module[]>>({});
  const [modRoleAccess, setModRoleAccess] = useState<Map<string, boolean>>(new Map());
  const [modOverrides, setModOverrides] = useState<Map<string, ModuleOverride>>(new Map());
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const [accessMessage, setAccessMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // --- Employee tab state ---
  const [paySchedules, setPaySchedules] = useState<PaySchedule[]>([]);
  const [employeeRecord, setEmployeeRecord] = useState<EmployeeRecord | null>(null);
  const [currentConfig, setCurrentConfig] = useState<EmployeePayrollConfig | null>(null);
  const [isEmployee, setIsEmployee] = useState(false);
  const [showEmployeeSetup, setShowEmployeeSetup] = useState(false);
  const [classification, setClassification] = useState<string>('unreviewed');
  const [showNonEmployeeConfirm, setShowNonEmployeeConfirm] = useState(false);
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [showEffectiveDatePrompt, setShowEffectiveDatePrompt] = useState(false);
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

  // --- Shared state ---
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      loadRoles(),
      loadOffices(),
      loadUserOffices(),
      loadPaySchedules(),
      loadEmployeeData(),
      loadDepartments(),
      loadModules(),
    ]).finally(() => setDataLoading(false));
  }, []);

  useEffect(() => {
    if (formData.role_id) {
      loadDepartments();
      loadModules();
    }
  }, [formData.role_id]);

  useEffect(() => {
    if (roles.length > 0 && !formData.role_id && formData.role) {
      const matchingRole = roles.find((r) => r.role_key === formData.role);
      if (matchingRole) {
        setFormData((prev) => ({ ...prev, role_id: matchingRole.id }));
      }
    }
  }, [roles]);

  // ===== Data loading =====

  async function loadRoles() {
    try {
      const { data, error } = await supabase.from('roles').select('*').eq('is_active', true).order('role_key');
      if (error) throw error;
      setRoles(data || []);
    } catch (error) {
      setDataLoadFailed(true);
      setError('Unable to load user setup data. Close and reopen this form before saving.');
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
      setDataLoadFailed(true);
      setError('Unable to load user setup data. Close and reopen this form before saving.');
      console.error('Error loading offices:', error);
    }
  }

  async function loadUserOffices() {
    try {
      const { data, error } = await supabase.from('user_offices').select('office_id').eq('user_id', user.id);
      if (error) throw error;
      setSelectedOffices((data || []).map((uo) => uo.office_id));
    } catch (error) {
      setDataLoadFailed(true);
      setError('Unable to load user setup data. Close and reopen this form before saving.');
      console.error('Error loading user offices:', error);
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
      setDataLoadFailed(true);
      setError('Unable to load user setup data. Close and reopen this form before saving.');
      console.error('Error loading pay schedules:', error);
    }
  }

  async function loadEmployeeData() {
    try {
      const { data: empData, error: empError } = await supabase
        .from('employees')
        .select('id, employment_status, hire_date, termination_date, employee_number')
        .eq('user_id', user.id)
        .maybeSingle();

      if (empError) throw empError;

      if (empData) {
        setIsEmployee(true);
        setEmployeeRecord(empData);
        setClassification('employee');
        setEmployeeForm((prev) => ({
          ...prev,
          hire_date: empData.hire_date,
          employment_status: empData.employment_status as any,
          termination_date: empData.termination_date || '',
          employee_number: empData.employee_number || '',
        }));

        const { data: configData, error: configError } = await supabase
          .from('employee_payroll_configs')
          .select('*')
          .eq('employee_id', empData.id)
          .is('effective_to', null)
          .maybeSingle();

        if (configError) throw configError;

        if (configData) {
          setCurrentConfig(configData);
          setEmployeeForm((prev) => ({
            ...prev,
            compensation_type: configData.compensation_type,
            requires_daily_clock: configData.requires_daily_clock,
            requires_time_allocation: configData.requires_time_allocation,
            payroll_time_basis: configData.payroll_time_basis,
            expected_weekly_hours: configData.expected_weekly_hours?.toString() || '40',
            standard_start_time: configData.standard_start_time || '08:00',
            standard_end_time: configData.standard_end_time || '17:00',
            work_days: configData.work_days || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
            overtime_eligible: configData.overtime_eligible,
            pto_eligible: configData.pto_eligible,
            pay_schedule_id: configData.pay_schedule_id || '',
          }));
        }
      } else {
        const { data: profData } = await supabase
          .from('profiles')
          .select('employment_classification')
          .eq('id', user.id)
          .maybeSingle();
        if (profData?.employment_classification) {
          setClassification(profData.employment_classification);
          if (profData.employment_classification === 'non_employee') {
            setIsEmployee(false);
          }
        }
      }
    } catch (error) {
      setDataLoadFailed(true);
      setError('Unable to load user setup data. Close and reopen this form before saving.');
      console.error('Error loading employee data:', error);
    }
  }

  async function loadDepartments() {
    try {
      const { data: deptData, error: deptError } = await supabase
        .from('departments')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      if (deptError) throw deptError;
      setDepartments(deptData || []);

      const initialExpanded = new Set<string>();
      (deptData || []).forEach((d: Department) => initialExpanded.add(d.id));
      setExpandedDepts(initialExpanded);

      if (formData.role_id || (user as Profile & { role_id?: string }).role_id) {
        const roleId = formData.role_id || (user as Profile & { role_id?: string }).role_id;
        const { data: roleAccessData, error: roleError } = await supabase
          .from('role_department_access')
          .select('department_id, has_access')
          .eq('role_id', roleId);
        if (roleError) throw roleError;
        const accessMap = new Map<string, boolean>();
        (roleAccessData || []).forEach((item: RoleDepartmentAccess) => {
          accessMap.set(item.department_id, item.has_access);
        });
        setDeptRoleAccess(accessMap);
      }

      const { data: overrideData, error: overrideError } = await supabase
        .from('department_user_overrides')
        .select('*')
        .eq('user_id', user.id);
      if (overrideError) throw overrideError;
      const overrideMap = new Map<string, DepartmentOverride>();
      (overrideData || []).forEach((o: DepartmentOverride) => overrideMap.set(o.department_id, o));
      setDeptOverrides(overrideMap);
    } catch (error) {
      setDataLoadFailed(true);
      setError('Unable to load user setup data. Close and reopen this form before saving.');
      console.error('Error loading departments:', error);
    }
  }

  async function loadModules() {
    try {
      const { data: moduleData, error: moduleError } = await supabase
        .from('department_modules')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      if (moduleError) throw moduleError;

      const grouped: Record<string, Module[]> = {};
      (moduleData || []).forEach((m: Module) => {
        if (!grouped[m.department_id]) grouped[m.department_id] = [];
        grouped[m.department_id].push(m);
      });
      setModules(grouped);

      if (formData.role_id || (user as Profile & { role_id?: string }).role_id) {
        const roleId = formData.role_id || (user as Profile & { role_id?: string }).role_id;
        const { data: roleAccessData, error: roleError } = await supabase
          .from('role_module_access')
          .select('module_id, has_access')
          .eq('role_id', roleId);
        if (roleError) throw roleError;
        const accessMap = new Map<string, boolean>();
        (roleAccessData || []).forEach((item: RoleModuleAccess) => {
          accessMap.set(item.module_id, item.has_access);
        });
        setModRoleAccess(accessMap);
      }

      const { data: overrideData, error: overrideError } = await supabase
        .from('user_permission_overrides')
        .select('*')
        .eq('user_id', user.id);
      if (overrideError) throw overrideError;
      const overrideMap = new Map<string, ModuleOverride>();
      (overrideData || []).forEach((o: ModuleOverride) => overrideMap.set(o.module_id, o));
      setModOverrides(overrideMap);
    } catch (error) {
      setDataLoadFailed(true);
      setError('Unable to load user setup data. Close and reopen this form before saving.');
      console.error('Error loading modules:', error);
    }
  }

  // ===== Access tab helpers =====

  function showAccessMessage(type: 'success' | 'error', text: string) {
    setAccessMessage({ type, text });
    setTimeout(() => setAccessMessage(null), 4000);
  }

  function getDeptEffectiveAccess(deptId: string): boolean {
    const override = deptOverrides.get(deptId);
    if (override) return override.has_access;
    return deptRoleAccess.get(deptId) ?? false;
  }

  function hasDeptOverride(deptId: string): boolean {
    return deptOverrides.has(deptId);
  }

  async function handleToggleDeptAccess(deptId: string) {
    const currentOverride = deptOverrides.get(deptId);
    const roleHasAccess = deptRoleAccess.get(deptId) ?? false;

    try {
      const remaining = reviewed.filter((k) => k !== 'permissions');
      await saveSetupReview(user.id, remaining);
      setReviewed(remaining);
      if (currentOverride) {
        const newAccess = !currentOverride.has_access;
        if (newAccess === roleHasAccess) {
          const { error } = await supabase.from('department_user_overrides').delete().eq('id', currentOverride.id);
          if (error) throw error;
          const newMap = new Map(deptOverrides);
          newMap.delete(deptId);
          setDeptOverrides(newMap);
        } else {
          const { error } = await supabase
            .from('department_user_overrides')
            .update({ has_access: newAccess })
            .eq('id', currentOverride.id);
          if (error) throw error;
          const newMap = new Map(deptOverrides);
          newMap.set(deptId, { ...currentOverride, has_access: newAccess });
          setDeptOverrides(newMap);
        }
      } else {
        const newAccess = !roleHasAccess;
        const { data, error } = await supabase
          .from('department_user_overrides')
          .insert({
            user_id: user.id,
            department_id: deptId,
            has_access: newAccess,
          })
          .select()
          .single();
        if (error) throw error;
        const newMap = new Map(deptOverrides);
        newMap.set(deptId, data);
        setDeptOverrides(newMap);
      }
      showAccessMessage('success', 'Department access updated');
    } catch (error) {
      console.error('Error updating department access:', error);
      showAccessMessage('error', 'Failed to update department access');
    }
  }

  function getModEffectiveAccess(moduleId: string): boolean {
    const override = modOverrides.get(moduleId);
    if (override) return override.override_type === 'grant';
    return modRoleAccess.get(moduleId) ?? false;
  }

  function hasModOverride(moduleId: string): boolean {
    return modOverrides.has(moduleId);
  }

  async function handleToggleModAccess(moduleId: string) {
    const currentOverride = modOverrides.get(moduleId);
    const roleHasAccess = modRoleAccess.get(moduleId) ?? false;

    try {
      const remaining = reviewed.filter((k) => k !== 'permissions');
      await saveSetupReview(user.id, remaining);
      setReviewed(remaining);
      if (currentOverride) {
        const currentAccess = currentOverride.override_type === 'grant';
        const newAccess = !currentAccess;
        if (newAccess === roleHasAccess) {
          const { error } = await supabase.from('user_permission_overrides').delete().eq('id', currentOverride.id);
          if (error) throw error;
          const newMap = new Map(modOverrides);
          newMap.delete(moduleId);
          setModOverrides(newMap);
        } else {
          const newType: 'grant' | 'revoke' = newAccess ? 'grant' : 'revoke';
          const { error } = await supabase
            .from('user_permission_overrides')
            .update({ override_type: newType })
            .eq('id', currentOverride.id);
          if (error) throw error;
          const newMap = new Map(modOverrides);
          newMap.set(moduleId, { ...currentOverride, override_type: newType });
          setModOverrides(newMap);
        }
      } else {
        const newType: 'grant' | 'revoke' = !roleHasAccess ? 'grant' : 'revoke';
        const { data, error } = await supabase
          .from('user_permission_overrides')
          .insert({
            user_id: user.id,
            module_id: moduleId,
            override_type: newType,
          })
          .select()
          .single();
        if (error) throw error;
        const newMap = new Map(modOverrides);
        newMap.set(moduleId, data);
        setModOverrides(newMap);
      }
      showAccessMessage('success', 'Page access updated');
    } catch (error) {
      console.error('Error updating page access:', error);
      showAccessMessage('error', 'Failed to update page access');
    }
  }

  function toggleDeptExpand(deptId: string) {
    const newSet = new Set(expandedDepts);
    if (newSet.has(deptId)) newSet.delete(deptId);
    else newSet.add(deptId);
    setExpandedDepts(newSet);
  }

  // ===== Employee tab helpers =====

  function checkConfigChanged(newValues: any): boolean {
    if (!currentConfig) return true;
    const fields = [
      'compensation_type',
      'requires_daily_clock',
      'requires_time_allocation',
      'payroll_time_basis',
      'expected_weekly_hours',
      'standard_start_time',
      'standard_end_time',
      'work_days',
      'overtime_eligible',
      'pto_eligible',
      'pay_schedule_id',
    ];
    return fields.some((f) => {
      const oldVal = (currentConfig as any)[f];
      const newVal = newValues[f];
      if (f === 'work_days') {
        const oldArr = [...(oldVal || [])].sort().join(',');
        const newArr = [...(newVal || [])].sort().join(',');
        return oldArr !== newArr;
      }
      if (f === 'expected_weekly_hours') {
        return (oldVal?.toString() || '') !== (newVal?.toString() || '');
      }
      return oldVal !== newVal;
    });
  }

  // ===== Submit =====

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (dataLoading) return;
    if (dataLoadFailed) {
      setError('Setup data did not load. Close and reopen this form before saving.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (!formData.full_name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email))
        throw new Error('Enter a full name and valid email.');
      if (isEmployee && (!employeeForm.hire_date || !employeeForm.pay_schedule_id))
        throw new Error('Employees require a hire date and pay schedule.');
      if (!formData.role_id) throw new Error('Please select a role for this user');

      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      const { data: currentProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', currentUser?.id)
        .single();

      if (currentProfile?.role !== 'admin') throw new Error('Only admins can edit users');

      if (formData.email !== user.email) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-user-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ userId: user.id, newEmail: formData.email }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to update email');
      }

      const updateData = {
        ...notifications,
        full_name: formData.full_name,
        first_name: formData.first_name || null,
        last_name: formData.last_name || null,
        username: formData.username,
        role: formData.role,
        role_id: formData.role_id || null,
        email_leads: formData.email_leads,
        is_sales_rep: formData.is_sales_rep,
        can_create_proposals: formData.can_create_proposals,
        can_create_purchase_orders: formData.can_create_purchase_orders,
        can_view_prospects: formData.can_view_prospects,
        can_view_all_tasks: formData.can_view_all_tasks,
        can_view_all_messages: formData.can_view_all_messages,
        can_view_all_pipeline: formData.can_view_all_pipeline,
        can_edit_contact_assignments: formData.can_edit_contact_assignments,
        can_create_work_orders: formData.can_create_work_orders,
        can_edit_products: formData.can_edit_products,
        can_see_all_review_requests: formData.can_see_all_review_requests,
        can_request_google_reviews: formData.can_request_google_reviews,
        can_view_customer_feedback: formData.can_view_customer_feedback,
        can_manage_customer_feedback: formData.can_manage_customer_feedback,
        can_send_lost_opportunity_reviews: formData.can_send_lost_opportunity_reviews,
        can_view_lost_opportunity_submissions: formData.can_view_lost_opportunity_submissions,
        notify_lost_opportunity_submissions: formData.notify_lost_opportunity_submissions,
        can_edit_contacts: formData.can_edit_contacts,
        has_calendar_access: formData.has_calendar_access,
        proposal_visibility_scope: formData.proposal_visibility_scope,
        discussion_visibility_scope: formData.discussion_visibility_scope,
        travel_bonus_enabled: formData.travel_bonus_enabled,
        travel_bonus_rate: formData.travel_bonus_enabled ? parseFloat(formData.travel_bonus_rate as string) : null,
        travel_bonus_method: formData.travel_bonus_enabled ? formData.travel_bonus_method : null,
        sales_rep_start_date: formData.sales_rep_start_date || null,
      };

      const { data: updatedProfile, error: updateError } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', user.id)
        .select()
        .single();

      if (updateError) throw new Error(`Database error: ${updateError.message} (${updateError.code})`);
      if (!updatedProfile) throw new Error('Update succeeded but no data returned.');

      if (['sales', 'admin', 'manager', 'sales_manager'].includes(formData.role)) {
        await supabase.rpc('recalculate_sales_quota_for_user', {
          p_user_id: user.id,
        });
      }

      const { error: deleteError } = await supabase.from('user_offices').delete().eq('user_id', user.id);
      if (deleteError) throw new Error(`Office assignment update failed: ${deleteError.message}`);

      if (selectedOffices.length > 0) {
        const { error: officeError } = await supabase.from('user_offices').insert(
          selectedOffices.map((officeId) => ({
            user_id: user.id,
            office_id: officeId,
          })),
        );
        if (officeError) throw new Error(`Office assignment failed: ${officeError.message}`);
      }

      const {
        data: { user: currentUser2 },
      } = await supabase.auth.getUser();

      if (isEmployee && employeeRecord) {
        const { error: rpcError } = await supabase.rpc('update_employee_and_config', {
          p_user_id: user.id,
          p_hire_date: employeeForm.hire_date,
          p_employee_number: employeeForm.employee_number || null,
          p_employment_status: employeeForm.employment_status,
          p_termination_date: employeeForm.termination_date || null,
          p_compensation_type: employeeForm.compensation_type,
          p_requires_daily_clock: employeeForm.requires_daily_clock,
          p_requires_time_allocation: employeeForm.requires_time_allocation,
          p_payroll_time_basis: employeeForm.payroll_time_basis,
          p_expected_weekly_hours: employeeForm.expected_weekly_hours
            ? parseFloat(employeeForm.expected_weekly_hours)
            : null,
          p_standard_start_time: employeeForm.standard_start_time,
          p_standard_end_time: employeeForm.standard_end_time,
          p_work_days: employeeForm.work_days,
          p_overtime_eligible: employeeForm.overtime_eligible,
          p_pto_eligible: employeeForm.pto_eligible,
          p_pay_schedule_id: employeeForm.pay_schedule_id || null,
          p_effective_date: showEffectiveDatePrompt && checkConfigChanged(employeeForm) ? effectiveDate : null,
          p_reviewed_by: currentUser2?.id,
        });
        if (rpcError) throw new Error(`Employee update failed: ${rpcError.message}`);
      } else if (showEmployeeSetup && isEmployee && !employeeRecord) {
        const { error: rpcError } = await supabase.rpc('classify_as_employee', {
          p_user_id: user.id,
          p_hire_date: employeeForm.hire_date,
          p_employee_number: employeeForm.employee_number || null,
          p_employment_status: employeeForm.employment_status,
          p_compensation_type: employeeForm.compensation_type,
          p_requires_daily_clock: employeeForm.requires_daily_clock,
          p_requires_time_allocation: employeeForm.requires_time_allocation,
          p_payroll_time_basis: employeeForm.payroll_time_basis,
          p_expected_weekly_hours: employeeForm.expected_weekly_hours
            ? parseFloat(employeeForm.expected_weekly_hours)
            : null,
          p_standard_start_time: employeeForm.standard_start_time,
          p_standard_end_time: employeeForm.standard_end_time,
          p_work_days: employeeForm.work_days,
          p_overtime_eligible: employeeForm.overtime_eligible,
          p_pto_eligible: employeeForm.pto_eligible,
          p_pay_schedule_id: employeeForm.pay_schedule_id || null,
          p_reviewed_by: currentUser2?.id,
        });
        if (rpcError) throw new Error(`Employee creation failed: ${rpcError.message}`);
      } else if (showNonEmployeeConfirm) {
        const { error: rpcError } = await supabase.rpc('classify_as_non_employee', {
          p_user_id: user.id,
          p_reviewed_by: currentUser2?.id,
        });
        if (rpcError) throw new Error(`Non-employee classification failed: ${rpcError.message}`);
      }

      await saveSetupReview(
        user.id,
        !isEmployee && !showNonEmployeeConfirm && classification === 'unreviewed'
          ? reviewed.filter((k) => k !== 'access' && k !== 'pay')
          : reviewed,
      );
      setSuccessMessage('User updated successfully! Closing...');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error during update:', err);
      setError(err.message || 'Failed to update user');
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordReset(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reset-user-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ email: user.email, password: newPassword }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to reset password');

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

  // ===== Shared styling =====
  const inputClass =
    'w-full px-4 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent';
  const selectClass = inputClass;
  const checkboxClass =
    'mt-1 w-4 h-4 text-cyan-500 bg-gray-700 border-gray-600 rounded focus:ring-2 focus:ring-cyan-500';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-0 z-50 overflow-hidden">
      <div className="bg-gray-900 rounded-xl shadow-2xl max-w-4xl w-full h-full sm:h-auto sm:max-h-[90vh] sm:my-4 border-0 sm:border border-gray-700 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-700 flex-shrink-0">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white">Edit User</h2>
            <div className="flex items-center gap-3 mt-2">
              {user.avatar_url && <img src={user.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />}
              <div>
                <p className="text-white">{formData.full_name}</p>
                <p className="text-sm text-gray-300">
                  {roles.find((r) => r.id === formData.role_id)?.display_name || formData.role} ·{' '}
                  {user.is_active ? 'Active' : 'Inactive'} ·{' '}
                  {selectedOffices.length
                    ? offices
                        .filter((o) => selectedOffices.includes(o.id))
                        .map((o) => o.office_name)
                        .join(', ')
                    : 'All offices'}
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close Edit User"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <UserSetupTabs active={activeTab} onSelect={(tab) => { setActiveTab(tab); contentRef.current?.scrollTo({ top: 0 }); }} reviewed={reviewed} />
        {/* Messages */}
        {(error || successMessage || accessMessage) && (
          <div className="px-4 sm:px-6 pt-4 flex-shrink-0 space-y-2">
            {error && (
              <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-sm">{error}</div>
            )}
            {successMessage && (
              <div className="p-3 bg-green-500/20 border border-green-500/50 rounded-lg text-green-300 text-sm">
                {successMessage}
              </div>
            )}
            {accessMessage && activeTab === 'permissions' && (
              <div
                className={`p-3 rounded-lg text-sm ${
                  accessMessage.type === 'success'
                    ? 'bg-green-500/20 border border-green-500/50 text-green-300'
                    : 'bg-red-500/20 border border-red-500/50 text-red-300'
                }`}
              >
                {accessMessage.text}
              </div>
            )}
          </div>
        )}

        {/* Tab content */}
        <form
          id="edit-user-form"
          ref={contentRef}
          onSubmit={handleSubmit}
          onChange={() => setReviewed((prev) => prev.filter((k) => k !== activeTab))}
          className="min-h-0 flex-1 overflow-y-auto"
        >
          <div className="p-4 sm:p-6 space-y-5">
            {reviewError && <p className="text-red-300">{reviewError}</p>}
            {activeTab === 'notifications' && (
              <UserNotifications
                value={{
                  ...notifications,
                  email_leads: formData.email_leads,
                  notify_lost_opportunity_submissions: formData.notify_lost_opportunity_submissions,
                }}
                onChange={(v) => {
                  setNotifications(v);
                  setFormData({
                    ...formData,
                    email_leads: v.email_leads,
                    notify_lost_opportunity_submissions: v.notify_lost_opportunity_submissions,
                  });
                }}
                canViewResponses={formData.can_view_lost_opportunity_submissions}
              />
            )}
            {activeTab === 'review' && (
              <UserDataCard
                profile={{
                  ...user,
                  ...formData,
                  ...notifications,
                  email_leads: formData.email_leads,
                  notify_lost_opportunity_submissions: formData.notify_lost_opportunity_submissions,
                }}
                classification={isEmployee ? 'employee' : showNonEmployeeConfirm ? 'non_employee' : classification}
                employee={employeeForm}
                offices={offices.filter((o) => selectedOffices.includes(o.id)).map((o) => o.office_name)}
                roleName={roles.find((r) => r.id === formData.role_id)?.display_name}
                paySchedule={paySchedules.find((p) => p.id === employeeForm.pay_schedule_id)?.name}
                access={departments.map((d) => ({
                  name: d.display_name,
                  enabled: getDeptEffectiveAccess(d.id),
                  custom: deptOverrides.has(d.id),
                  modules: (modules[d.id] || []).map((m) => ({
                    name: m.display_name,
                    enabled: getDeptEffectiveAccess(d.id) && getModEffectiveAccess(m.id),
                    custom: modOverrides.has(m.id),
                  })),
                }))}
              />
            )}
            {activeTab !== 'review' && (
              <label className="flex items-center gap-2 text-cyan-300 text-sm">
                <input
                  type="checkbox"
                  checked={reviewed.includes(activeTab)}
                  onChange={(e) => {
                    e.stopPropagation();
                    setReviewed(e.target.checked ? [...reviewed, activeTab] : reviewed.filter((k) => k !== activeTab));
                  }}
                />
                I have reviewed this section
              </label>
            )}

            {/* ===== USER DETAILS TAB ===== */}
            {activeTab === 'profile' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Identity</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Full Name *</label>
                      <input
                        type="text"
                        required
                        value={formData.full_name}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            full_name: e.target.value,
                          })
                        }
                        className={inputClass}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">First Name</label>
                        <input
                          type="text"
                          value={formData.first_name}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              first_name: e.target.value,
                            })
                          }
                          className={inputClass}
                          placeholder="John"
                        />
                        <p className="text-xs text-gray-500 mt-1">Optional - for QuickBooks payroll</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Last Name</label>
                        <input
                          type="text"
                          value={formData.last_name}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              last_name: e.target.value,
                            })
                          }
                          className={inputClass}
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
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              username: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''),
                            })
                          }
                          className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Lowercase letters and numbers only</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Email *</label>
                      <input
                        type="email"
                        name="user-email"
                        autoComplete="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className={inputClass}
                      />
                      <p className="text-xs text-gray-500 mt-1">This will update the user's login email</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'access' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Role</h3>
                  <select
                    value={formData.role_id}
                    onChange={(e) => {
                      setReviewed((prev) => prev.filter((k) => k !== 'access' && k !== 'permissions'));
                      const selectedRole = roles.find((r) => r.id === e.target.value);
                      setFormData({
                        ...formData,
                        role_id: e.target.value,
                        role: (selectedRole?.role_key as any) || 'sales',
                      });
                    }}
                    className={`w-full px-4 py-2 bg-gray-800 border ${formData.role_id ? 'border-gray-700' : 'border-orange-500'} text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
                  >
                    {roles.length === 0 && <option value="">Loading roles...</option>}
                    {roles.length > 0 && !formData.role_id && <option value="">-- Select a Role --</option>}
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.display_name}
                      </option>
                    ))}
                  </select>
                  {formData.role_id && roles.length > 0 && (
                    <p className="text-xs text-gray-400 mt-1">
                      {roles.find((r) => r.id === formData.role_id)?.description}
                    </p>
                  )}
                  {!formData.role_id && roles.length > 0 && (
                    <p className="text-xs text-orange-400 mt-1">Please select a role to continue</p>
                  )}
                </div>
                {offices.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                      Office Assignments
                    </h3>
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
                              if (e.target.checked) setSelectedOffices([...selectedOffices, office.id]);
                              else setSelectedOffices(selectedOffices.filter((id) => id !== office.id));
                            }}
                            className={checkboxClass}
                          />
                          <span className="text-sm text-white">{office.office_name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Password</h3>
                  {!showPasswordReset ? (
                    <button
                      type="button"
                      onClick={() => setShowPasswordReset(true)}
                      className="w-full px-4 py-2 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors font-medium flex items-center justify-center gap-2"
                    >
                      <Key className="w-4 h-4" />
                      Reset Password
                    </button>
                  ) : (
                    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">New Password *</label>
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
                          className={inputClass}
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
                          className="flex-1 px-4 py-2 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors font-medium text-sm"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handlePasswordReset}
                          disabled={loading || dataLoading || dataLoadFailed}
                          className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-medium disabled:opacity-50 text-sm"
                        >
                          {loading ? 'Resetting...' : 'Reset Password'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {activeTab === 'permissions' && (
              <section aria-label="Feedback Access" className="rounded-xl border border-cyan-800 bg-gray-800/50 p-4 space-y-3">
                <h3 className="text-lg font-semibold text-white">Feedback Access</h3>
                <p className="text-sm text-gray-300">Choose what this user can view and send within Feedback. Also enable the Feedback module under department/module access below.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ['can_request_google_reviews', 'Ask for Google Reviews', 'Send Google review requests.'],
                    ['can_view_customer_feedback', 'View Customer Feedback', 'View the customer feedback dashboard and responses.'],
                    ['can_manage_customer_feedback', 'Manage Feedback & Send Proposal Follow-Ups', 'Send customer feedback requests and regular proposal follow-ups.'],
                    ['can_send_lost_opportunity_reviews', 'Send Lost Opportunity Reviews', 'Send private feedback requests for lost opportunities.'],
                    ['can_view_lost_opportunity_submissions', 'View Lost Opportunity Responses', 'Read private responses and competing bids.'],
                    ['can_see_all_review_requests', 'See All Company Review Requests', 'View company-wide request history instead of only this user’s requests.'],
                  ].map(([key, label, description]) => (
                    <label key={key} className="flex items-start gap-3 rounded-lg border border-gray-700 bg-gray-800 p-3 cursor-pointer">
                      <input type="checkbox" className={checkboxClass} checked={Boolean((formData as any)[key])} onChange={e => setFormData({ ...formData, [key]: e.target.checked })} />
                      <span><span className="block font-medium text-white">{label}</span><span className="block text-xs text-gray-400 mt-1">{description}</span></span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-cyan-200">Owner Proposal Follow-Up is available only to Josh Gorrell. These permissions do not grant access to that email.</p>
              </section>
            )}

            {activeTab === 'permissions' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Permissions</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                      {
                        key: 'can_create_proposals',
                        icon: Briefcase,
                        label: 'Can Create Proposals',
                        desc: 'Permission to create and manage proposals',
                      },
                      {
                        key: 'can_create_purchase_orders',
                        icon: Briefcase,
                        label: 'Manage Purchasing',
                        desc: 'View all product requests, request vendor quotes, create POs and receive items. No request approval step.',
                      },
                      {
                        key: 'can_view_prospects',
                        icon: Shield,
                        label: 'Can View Prospects',
                        desc: 'Access to prospect contacts and competitor tracking',
                      },
                      {
                        key: 'can_view_all_tasks',
                        icon: Shield,
                        label: 'Can View All Tasks',
                        desc: 'See all company tasks (off = own tasks only)',
                      },
                      {
                        key: 'can_view_all_messages',
                        icon: Shield,
                        label: 'View All Company Conversations',
                        desc: 'Executive oversight of customer and job conversations',
                      },
                      {
                        key: 'can_view_all_pipeline',
                        icon: Shield,
                        label: 'Can View All Pipeline',
                        desc: 'See company-wide pipeline data',
                      },
                      {
                        key: 'can_edit_contact_assignments',
                        icon: Shield,
                        label: 'Can Edit Contact Assignments',
                        desc: 'Reassign contacts to different sales reps',
                      },
                      {
                        key: 'can_create_work_orders',
                        icon: Briefcase,
                        label: 'Can Create Work Orders',
                        desc: 'Create work orders from My Work Center',
                      },
                      {
                        key: 'can_edit_products',
                        icon: Shield,
                        label: 'Can Edit Products',
                        desc: 'Add, edit, and delete products in the catalog',
                      },
                      {
                        key: 'can_edit_contacts',
                        icon: Shield,
                        label: 'Can Edit Contacts',
                        desc: 'Add, edit, and delete contacts',
                      },
                      {
                        key: 'has_calendar_access',
                        icon: CalendarIcon,
                        label: 'Has Calendar Access',
                        desc: 'Access personal calendar for scheduling',
                      },
                    ].map(({ key, icon: Icon, label, desc }) => (
                      <label
                        key={key}
                        className="flex items-start gap-3 cursor-pointer bg-gray-800 border border-gray-700 rounded-lg p-3 hover:border-gray-600 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={(formData as any)[key]}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              [key]: e.target.checked,
                            })
                          }
                          className={checkboxClass}
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Icon className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                            <span className="text-sm font-medium text-white">{label}</span>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">{desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    Visibility Scopes
                  </h3>
                  <div className="space-y-3">
                    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                      <label className="block text-sm font-medium text-white mb-2">Proposal Visibility Scope</label>
                      <select
                        value={formData.proposal_visibility_scope}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            proposal_visibility_scope: e.target.value as any,
                          })
                        }
                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                      >
                        <option value="own">Only My Proposals</option>
                        <option value="office">My Office Proposals</option>
                        <option value="company">All Company Proposals</option>
                      </select>
                      <p className="text-xs text-gray-400 mt-2">
                        <span className="font-medium">Only My:</span> sees only proposals they created &middot;{' '}
                        <span className="font-medium">My Office:</span> sees proposals from assigned office(s) &middot;{' '}
                        <span className="font-medium">All Company:</span> sees all proposals
                      </p>
                    </div>

                    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                      <label className="block text-sm font-medium text-white mb-2">
                        Team Pulse (Discussion) Visibility
                      </label>
                      <select
                        value={formData.discussion_visibility_scope}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            discussion_visibility_scope: e.target.value as any,
                          })
                        }
                        className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                      >
                        <option value="all">All Discussion Posts</option>
                        <option value="assigned_only">Only Assigned or Mentioned Posts</option>
                        <option value="private_only">Only Private Posts (Assigned/Mentioned)</option>
                        <option value="own_posts">Only Their Own Posts</option>
                      </select>
                      <p className="text-xs text-gray-400 mt-2">
                        <span className="font-medium">All:</span> sees all posts &middot;{' '}
                        <span className="font-medium">Assigned:</span> only posts assigned to or mentioning them
                        &middot; <span className="font-medium">Private:</span> only private posts they're part of
                        &middot; <span className="font-medium">Own:</span> only posts they created
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'pay' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Travel Bonus</h3>
                  <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-4">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.travel_bonus_enabled}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            travel_bonus_enabled: e.target.checked,
                          })
                        }
                        className={checkboxClass}
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium text-white">Enable Travel Bonus</span>
                        <p className="text-xs text-gray-400 mt-1">
                          GPS tracking with automatic travel bonus calculation
                        </p>
                      </div>
                    </label>
                    {formData.travel_bonus_enabled && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-1">Rate per Mile</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={formData.travel_bonus_rate}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                travel_bonus_rate: e.target.value,
                              })
                            }
                            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-1">Method</label>
                          <select
                            value={formData.travel_bonus_method}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                travel_bonus_method: e.target.value as any,
                              })
                            }
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
              </div>
            )}
            {activeTab === 'sales' && (
              <div className="space-y-5">
                <label className="flex gap-3 text-white">
                  <input
                    type="checkbox"
                    checked={formData.is_sales_rep}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        is_sales_rep: e.target.checked,
                      })
                    }
                  />
                  Sales representative (business designation)
                </label>
                {(formData.role === 'sales' || formData.role === 'admin' || formData.role === 'manager') && (
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                      Sales Target Settings
                    </h3>
                    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Sales Start Date</label>
                        <input
                          type="date"
                          value={formData.sales_rep_start_date}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              sales_rep_start_date: e.target.value,
                            })
                          }
                          className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                        />
                        <p className="text-xs text-gray-400 mt-1">
                          Drives automatic annual quota calculation. For the full 30-year trajectory and growth rate
                          overrides,{' '}
                          <button
                            type="button"
                            onClick={() => {
                              onNavigate?.('settings_salestargets');
                              onClose();
                            }}
                            className="text-cyan-400 font-medium hover:text-cyan-300 underline underline-offset-2 transition-colors"
                          >
                            go to Settings &rarr; Sales Targets
                          </button>
                          .
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ===== DEPARTMENT ACCESS TAB ===== */}
            {activeTab === 'permissions' && (
              <>
                <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-blue-200">
                      <p className="font-medium mb-1">How Access Works</p>
                      <ul className="list-disc list-inside space-y-1 text-blue-300 text-xs">
                        <li>Users inherit access from their role by default</li>
                        <li>Toggle a department to override the role default</li>
                        <li>Expand a department to control individual pages</li>
                        <li>Overridden items are marked with a yellow badge</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* Department-level access */}
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    Department Access
                  </h3>
                  <div className="space-y-2">
                    {departments.map((dept) => {
                      const hasAccess = getDeptEffectiveAccess(dept.id);
                      const isOverridden = hasDeptOverride(dept.id);
                      const roleHasAccess = deptRoleAccess.get(dept.id) ?? false;

                      return (
                        <div
                          key={dept.id}
                          className={`rounded-lg border transition-all ${
                            hasAccess ? 'border-green-500/30 bg-green-500/10' : 'border-gray-700 bg-gray-800/50'
                          }`}
                        >
                          <div className="p-3 flex items-center justify-between">
                            <div className="flex items-center gap-3 flex-1">
                              <div
                                className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                                style={{ backgroundColor: dept.color }}
                              >
                                {dept.display_name.charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-medium text-sm text-white">{dept.display_name}</h4>
                                  {isOverridden && (
                                    <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-300 text-xs font-medium rounded">
                                      Override
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  Role default: {roleHasAccess ? 'Has access' : 'No access'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => toggleDeptExpand(dept.id)}
                                className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
                              >
                                {expandedDepts.has(dept.id) ? (
                                  <ChevronDown className="w-4 h-4" />
                                ) : (
                                  <ChevronRight className="w-4 h-4" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleToggleDeptAccess(dept.id)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium text-xs transition-all ${
                                  hasAccess
                                    ? 'bg-green-600 hover:bg-green-700 text-white'
                                    : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                                }`}
                              >
                                {hasAccess ? (
                                  <>
                                    <Eye className="w-3 h-3" /> Access
                                  </>
                                ) : (
                                  <>
                                    <EyeOff className="w-3 h-3" /> No Access
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Page-level access */}
                          {expandedDepts.has(dept.id) && (modules[dept.id] || []).length > 0 && (
                            <div className="px-3 pb-3 space-y-1.5 border-t border-gray-700/50 pt-2">
                              {(modules[dept.id] || []).map((mod) => {
                                const modHasAccess = getModEffectiveAccess(mod.id);
                                const modIsOverridden = hasModOverride(mod.id);
                                const modRoleHasAccess = modRoleAccess.get(mod.id) ?? false;

                                return (
                                  <div
                                    key={mod.id}
                                    className={`p-2.5 rounded-lg border flex items-center justify-between transition-all ${
                                      modHasAccess
                                        ? 'border-green-500/20 bg-green-500/5'
                                        : 'border-gray-700 bg-gray-800/30'
                                    }`}
                                  >
                                    <div className="min-w-0 flex-1 mr-3">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm text-white font-medium">{mod.display_name}</span>
                                        {modIsOverridden && (
                                          <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-300 text-xs font-medium rounded">
                                            Override
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-xs text-gray-500 mt-0.5">
                                        {mod.description ||
                                          `Role default: ${modRoleHasAccess ? 'Has access' : 'No access'}`}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleToggleModAccess(mod.id)}
                                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium text-xs transition-all flex-shrink-0 ${
                                        modHasAccess
                                          ? 'bg-green-600 hover:bg-green-700 text-white'
                                          : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                                      }`}
                                    >
                                      {modHasAccess ? (
                                        <>
                                          <Eye className="w-3 h-3" /> On
                                        </>
                                      ) : (
                                        <>
                                          <EyeOff className="w-3 h-3" /> Off
                                        </>
                                      )}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {expandedDepts.has(dept.id) && (modules[dept.id] || []).length === 0 && (
                            <div className="px-3 pb-3 text-center text-gray-500 text-xs">
                              No pages in this department
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* ===== EMPLOYEE INFO TAB ===== */}
            {activeTab === 'access' && (
              <div className="space-y-5">
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-4">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <UserCircle className="w-4 h-4 text-blue-400" />
                    Employee Classification
                  </h3>

                  {!isEmployee ? (
                    <div className="space-y-3">
                      {classification === 'non_employee' && (
                        <div className="flex items-center gap-2 p-2 bg-green-500/20 border border-green-500/50 rounded-lg text-green-300 text-xs">
                          <UserCircle className="w-4 h-4 flex-shrink-0" />
                          <span>Classified as Non-Employee. Payroll and timekeeping are not enabled.</span>
                        </div>
                      )}
                      {classification === 'unreviewed' && (
                        <div className="flex items-center gap-2 p-2 bg-amber-500/20 border border-amber-500/50 rounded-lg text-amber-300 text-xs">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          <span>This legacy user has not been classified yet. Choose a classification below.</span>
                        </div>
                      )}
                      <p className="text-xs text-gray-400">
                        {classification === 'non_employee'
                          ? 'Change classification to enable payroll and timekeeping.'
                          : 'Designate this person as an Employee to enable payroll and timekeeping, or confirm them as a Non-Employee.'}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setReviewed((prev) => prev.filter((k) => k !== 'access' && k !== 'pay'));
                          setIsEmployee(true);
                          setShowEmployeeSetup(true);
                        }}
                        className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
                      >
                        {classification === 'non_employee' ? 'Change to Employee' : 'Make this person an Employee'}
                      </button>
                      {classification !== 'non_employee' && (
                        <button
                          type="button"
                          onClick={() => {
                            setReviewed((prev) => prev.filter((k) => k !== 'access' && k !== 'pay'));
                            setShowNonEmployeeConfirm(true);
                          }}
                          className="w-full px-4 py-2 bg-gray-700 text-gray-200 rounded-lg hover:bg-gray-600 transition-colors font-medium text-sm border border-gray-600"
                        >
                          Confirm as Non-Employee User
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {currentConfig && !currentConfig.reviewed_at && (
                        <div className="flex items-center gap-2 p-2 bg-amber-500/20 border border-amber-500/50 rounded-lg text-amber-300 text-xs">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          <span>Timekeeping configuration needs review. Payroll will be blocked until reviewed.</span>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-1">Hire Date *</label>
                          <input
                            type="date"
                            required={isEmployee}
                            value={employeeForm.hire_date}
                            onChange={(e) =>
                              setEmployeeForm({
                                ...employeeForm,
                                hire_date: e.target.value,
                              })
                            }
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-1">Employee #</label>
                          <input
                            type="text"
                            value={employeeForm.employee_number}
                            onChange={(e) =>
                              setEmployeeForm({
                                ...employeeForm,
                                employee_number: e.target.value,
                              })
                            }
                            className={inputClass}
                            placeholder="Optional"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-1">Employment Status</label>
                          <select
                            value={employeeForm.employment_status}
                            onChange={(e) =>
                              setEmployeeForm({
                                ...employeeForm,
                                employment_status: e.target.value as any,
                              })
                            }
                            className={selectClass}
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                            <option value="terminated">Terminated</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-1">Termination Date</label>
                          <input
                            type="date"
                            value={employeeForm.termination_date}
                            onChange={(e) =>
                              setEmployeeForm({
                                ...employeeForm,
                                termination_date: e.target.value,
                              })
                            }
                            disabled={employeeForm.employment_status !== 'terminated'}
                            className={`${inputClass} disabled:opacity-50`}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {activeTab === 'pay' && (
              <div className="space-y-5">
                {isEmployee && (
                  <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-4">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Clock className="w-4 h-4 text-cyan-400" />
                      Timekeeping & Payroll
                    </h3>

                    {showEffectiveDatePrompt && (
                      <div className="p-3 bg-blue-500/20 border border-blue-500/50 rounded-lg space-y-2">
                        <p className="text-sm text-blue-300 font-medium">When should this change take effect?</p>
                        <input
                          type="date"
                          value={effectiveDate}
                          onChange={(e) => setEffectiveDate(e.target.value)}
                          className={inputClass}
                        />
                        <p className="text-xs text-gray-400">
                          The prior configuration will be preserved through the day before this date.
                        </p>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Compensation Type</label>
                        <select
                          value={employeeForm.compensation_type}
                          onChange={(e) => {
                            const val = e.target.value as 'salary' | 'hourly';
                            const newBasis = val === 'salary' ? 'salary' : 'daily_clock';
                            setEmployeeForm({
                              ...employeeForm,
                              compensation_type: val,
                              payroll_time_basis: newBasis as any,
                            });
                            setShowEffectiveDatePrompt(true);
                          }}
                          className={selectClass}
                        >
                          <option value="hourly">Hourly</option>
                          <option value="salary">Salary</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Pay Schedule</label>
                        <select
                          value={employeeForm.pay_schedule_id}
                          onChange={(e) => {
                            setEmployeeForm({
                              ...employeeForm,
                              pay_schedule_id: e.target.value,
                            });
                            setShowEffectiveDatePrompt(true);
                          }}
                          className={selectClass}
                        >
                          <option value="">No pay schedule assigned</option>
                          {paySchedules.map((ps) => (
                            <option key={ps.id} value={ps.id}>
                              {ps.name} ({ps.frequency})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">What determines payable time?</label>
                      <select
                        value={employeeForm.payroll_time_basis}
                        onChange={(e) => {
                          setEmployeeForm({
                            ...employeeForm,
                            payroll_time_basis: e.target.value as any,
                            requires_daily_clock: e.target.value === 'work_allocation' ? false : e.target.value === 'daily_clock' ? true : employeeForm.requires_daily_clock,
                          });
                          setShowEffectiveDatePrompt(true);
                        }}
                        className={selectClass}
                      >
                        <option value="salary">Salary</option>
                        <option value="daily_clock">Daily Clock / Hourly</option>
                        <option value="work_allocation">Job Time Only</option>
                      </select>
                      <p className="text-xs text-gray-400 mt-1">
                        {employeeForm.payroll_time_basis === 'work_allocation' ? 'No Daily Clock. Approved Work Order time determines pay. Manual Job Time and Shop/Training Time require permission and approval.' : employeeForm.payroll_time_basis === 'salary' ? 'Salary determines pay. Recorded time is used for job costing and operational reporting.' : 'Daily Clock determines paid hours. Job Time records where that labor went.'}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Expected Weekly Hours</label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={employeeForm.expected_weekly_hours}
                        onChange={(e) => {
                          setEmployeeForm({
                            ...employeeForm,
                            expected_weekly_hours: e.target.value,
                          });
                          setShowEffectiveDatePrompt(true);
                        }}
                        className={inputClass}
                      />
                    </div>

                    <div className="space-y-2 border-t border-gray-700 pt-3">
                      {[
                        {
                          key: 'requires_daily_clock',
                          label: 'Requires Daily Clock',
                          desc: 'Employee must clock in/out each work day',
                        },
                        {
                          key: 'requires_time_allocation',
                          label: 'Requires Time Allocation',
                          desc: 'Employee must allocate time to specific jobs/projects',
                        },
                        {
                          key: 'overtime_eligible',
                          label: 'Overtime Eligible',
                          desc: 'Overtime rules may apply to this employee',
                        },
                        {
                          key: 'pto_eligible',
                          label: 'PTO Eligible',
                          desc: 'PTO functionality applies',
                        },
                      ].map(({ key, label, desc }) => (
                        <label key={key} className="flex items-start gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={(employeeForm as any)[key]}
                            onChange={(e) => {
                              setEmployeeForm({
                                ...employeeForm,
                                [key]: e.target.checked,
                              });
                              setShowEffectiveDatePrompt(true);
                            }}
                            className={checkboxClass}
                          />
                          <div className="flex-1">
                            <span className="text-sm font-medium text-white">{label}</span>
                            <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                          </div>
                        </label>
                      ))}
                    </div>

                    {employeeForm.requires_daily_clock && (
                      <div className="border-t border-gray-700 pt-3 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Standard Start Time</label>
                            <input
                              type="time"
                              value={employeeForm.standard_start_time}
                              onChange={(e) => {
                                setEmployeeForm({
                                  ...employeeForm,
                                  standard_start_time: e.target.value,
                                });
                                setShowEffectiveDatePrompt(true);
                              }}
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Standard End Time</label>
                            <input
                              type="time"
                              value={employeeForm.standard_end_time}
                              onChange={(e) => {
                                setEmployeeForm({
                                  ...employeeForm,
                                  standard_end_time: e.target.value,
                                });
                                setShowEffectiveDatePrompt(true);
                              }}
                              className={inputClass}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">Work Days</label>
                          <div className="flex flex-wrap gap-2">
                            {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(
                              (day) => (
                                <label key={day} className="flex items-center gap-1 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={employeeForm.work_days.includes(day)}
                                    onChange={(e) => {
                                      const newDays = e.target.checked
                                        ? [...employeeForm.work_days, day]
                                        : employeeForm.work_days.filter((d) => d !== day);
                                      setEmployeeForm({
                                        ...employeeForm,
                                        work_days: newDays,
                                      });
                                      setShowEffectiveDatePrompt(true);
                                    }}
                                    className={checkboxClass}
                                  />
                                  <span className="text-xs text-white capitalize">{day.slice(0, 3)}</span>
                                </label>
                              ),
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </form>

        {/* Footer buttons */}
        <div className="flex gap-3 p-4 sm:p-6 border-t border-gray-700 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="edit-user-form"
            disabled={loading || dataLoading || dataLoadFailed}
            className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:shadow-lg hover:shadow-cyan-500/50 transition-all font-medium disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
