import { useEffect, useState } from 'react';
import {
  DollarSign,
  Settings,
  Users,
  TrendingUp,
  HelpCircle,
  FileText,
  CheckCircle,
  Clock,
  AlertCircle,
  Filter,
  Download,
  Calendar,
  RefreshCw,
  Shield
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { CompanyCommissionSettings } from './CompanyCommissionSettings';
import { EmployeeCommissionConfig } from './EmployeeCommissionConfig';
import { CommissionReportPage } from './CommissionReportPage';
import { ContractCommissionReportPage } from './ContractCommissionReportPage';
import { HelpModal } from '../Help/HelpModal';
import { CommissionHelpContent } from './CommissionHelpContent';

type TabType =
  | 'overview'
  | 'records'
  | 'approval'
  | 'payments'
  | 'adjustments'
  | 'employee-config'
  | 'company-settings'
  | 'pay-period-report'
  | 'contract-report';

interface CommissionRecord {
  id: string;
  employee_id: string;
  employee_name: string;
  role_type: string;
  basis_amount: number;
  commission_rate: number;
  amount_earned: number;
  amount_paid: number;
  status: string;
  approval_status: string;
  approved_by: string | null;
  approved_at: string | null;
  pay_period_start: string | null;
  pay_period_end: string | null;
  created_at: string;
  project_id: string | null;
  invoice_id: string | null;
}

interface DashboardMetrics {
  pendingApprovalCount: number;
  pendingApprovalAmount: number;
  readyToPayCount: number;
  readyToPayAmount: number;
  paidThisPeriod: number;
  totalLiability: number;
}

interface FilterState {
  employees: string[];
  statuses: string[];
  approvalStatuses: string[];
  dateRange: { start: string; end: string };
}

const roleTypeLabels: Record<string, string> = {
  sales_projects: 'Sales (Projects)',
  design: 'Design',
  pm: 'Project Manager',
  service_sales: 'Service Sales',
  service_pm: 'Service PM'
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDateTime(dateString: string) {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  });
}

const statusBadgeStyles: Record<string, string> = {
  pending: 'bg-gray-500/20 text-gray-400 border border-gray-500/30',
  accruing: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  ready_to_pay: 'bg-green-500/20 text-green-400 border border-green-500/30',
  paid: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
};

const approvalBadgeStyles: Record<string, string> = {
  pending_approval: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  approved: 'bg-green-500/20 text-green-400 border border-green-500/30',
  rejected: 'bg-red-500/20 text-red-400 border border-red-500/30',
  auto_approved: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  on_hold: 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
};

export function CommissionsPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin' || profile?.role === 'manager' || profile?.role === 'finance' || profile?.role === 'sales_manager';

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [showHelp, setShowHelp] = useState(false);

  const [commissions, setCommissions] = useState<CommissionRecord[]>([]);
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    pendingApprovalCount: 0,
    pendingApprovalAmount: 0,
    readyToPayCount: 0,
    readyToPayAmount: 0,
    paidThisPeriod: 0,
    totalLiability: 0
  });
  const [employees, setEmployees] = useState<{ id: string; full_name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    employees: [],
    statuses: [],
    approvalStatuses: [],
    dateRange: { start: '', end: '' }
  });

  const managementTabs: TabType[] = ['overview', 'records', 'approval', 'payments', 'adjustments', 'pay-period-report', 'contract-report'];

  useEffect(() => {
    if (managementTabs.includes(activeTab)) {
      loadManagementData();
    }
  }, [profile, filters, activeTab]);

  async function loadManagementData() {
    try {
      setLoading(true);

      const { data: employeesData } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .order('full_name');
      setEmployees((employeesData || []) as { id: string; full_name: string }[]);

      let query = supabase
        .from('commission_records')
        .select(`
          *,
          employee:profiles!commission_records_employee_id_fkey(full_name),
          approver:profiles!commission_records_approved_by_fkey(full_name)
        `)
        .order('created_at', { ascending: false });

      if (filters.employees.length > 0) query = query.in('employee_id', filters.employees);
      if (filters.statuses.length > 0) query = query.in('status', filters.statuses);
      if (filters.approvalStatuses.length > 0) query = query.in('approval_status', filters.approvalStatuses);
      if (filters.dateRange.start) query = query.gte('created_at', filters.dateRange.start);
      if (filters.dateRange.end) query = query.lte('created_at', filters.dateRange.end);

      const { data: commissionsData } = await query;

      const formatted = (commissionsData || []).map((c: any) => ({
        id: c.id,
        employee_id: c.employee_id,
        employee_name: c.employee?.full_name || 'Unknown',
        role_type: c.role_type,
        basis_amount: Number(c.basis_amount || 0),
        commission_rate: Number(c.commission_rate || 0),
        amount_earned: Number(c.amount_earned || 0),
        amount_paid: Number(c.amount_paid || 0),
        status: c.status,
        approval_status: c.approval_status,
        approved_by: c.approver?.full_name || null,
        approved_at: c.approved_at,
        pay_period_start: c.pay_period_start,
        pay_period_end: c.pay_period_end,
        created_at: c.created_at,
        project_id: c.project_id,
        invoice_id: c.invoice_id
      }));

      setCommissions(formatted);

      const pendingApproval = formatted.filter((c: CommissionRecord) => c.approval_status === 'pending_approval');
      const readyToPay = formatted.filter((c: CommissionRecord) =>
        c.approval_status === 'approved' && c.status === 'ready_to_pay'
      );
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const paidThisPeriod = formatted
        .filter((c: CommissionRecord) => c.status === 'paid' && c.created_at >= monthStart)
        .reduce((sum: number, c: CommissionRecord) => sum + c.amount_paid, 0);
      const totalLiability = formatted
        .filter((c: CommissionRecord) => c.status !== 'paid')
        .reduce((sum: number, c: CommissionRecord) => sum + (c.amount_earned - c.amount_paid), 0);

      setMetrics({
        pendingApprovalCount: pendingApproval.length,
        pendingApprovalAmount: pendingApproval.reduce((s: number, c: CommissionRecord) => s + c.amount_earned, 0),
        readyToPayCount: readyToPay.length,
        readyToPayAmount: readyToPay.reduce((s: number, c: CommissionRecord) => s + (c.amount_earned - c.amount_paid), 0),
        paidThisPeriod,
        totalLiability
      });
    } catch (error) {
      console.error('Error loading commission management data:', error);
    } finally {
      setLoading(false);
    }
  }

  function clearFilters() {
    setFilters({ employees: [], statuses: [], approvalStatuses: [], dateRange: { start: '', end: '' } });
  }

  const activeFilterCount = filters.employees.length + filters.statuses.length + filters.approvalStatuses.length +
    (filters.dateRange.start ? 1 : 0) + (filters.dateRange.end ? 1 : 0);

  function exportToCSV() {
    const headers = ['Employee', 'Role Type', 'Basis Amount', 'Rate %', 'Amount Earned', 'Amount Paid', 'Status', 'Approval Status', 'Created'];
    const rows = commissions.map(c => [
      c.employee_name,
      roleTypeLabels[c.role_type] || c.role_type,
      c.basis_amount.toFixed(2),
      c.commission_rate.toFixed(2),
      c.amount_earned.toFixed(2),
      c.amount_paid.toFixed(2),
      c.status,
      c.approval_status,
      new Date(c.created_at).toLocaleDateString()
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `commissions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const tabs: { id: TabType; label: string; icon: typeof DollarSign; badge?: number }[] = [
    { id: 'overview', label: 'Overview', icon: Users },
    { id: 'records', label: 'All Records', icon: FileText },
    {
      id: 'approval',
      label: 'Approval Queue',
      icon: CheckCircle,
      badge: metrics.pendingApprovalCount > 0 ? metrics.pendingApprovalCount : undefined
    },
    { id: 'payments', label: 'Payments', icon: DollarSign },
    { id: 'adjustments', label: 'Adjustments', icon: Calendar },
    { id: 'pay-period-report', label: 'Pay Period Report', icon: FileText },
    { id: 'contract-report', label: 'Contract Report', icon: Shield },
    { id: 'employee-config', label: 'Employee Setup', icon: Users },
    { id: 'company-settings', label: 'Commission Settings', icon: Settings }
  ];

  const visibleTabs = tabs;

  const showManagementHeader = managementTabs.includes(activeTab) && activeTab !== 'pay-period-report' && activeTab !== 'contract-report';

  return (
    <div className="space-y-0">
      {/* Page Header */}
      <div className="bg-gray-800 rounded-t-lg border border-gray-700 border-b-0 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <DollarSign className="w-6 h-6 text-green-400" />
            <div>
              <h1 className="text-2xl font-bold text-white">Commissions Management</h1>
              <p className="text-sm text-gray-400">Configure rates, approve earnings, and manage all employee commissions</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {showManagementHeader && (
              <>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors ${
                    showFilters
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  <Filter className="w-4 h-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="px-1.5 py-0.5 bg-blue-500 text-white text-xs font-bold rounded-full">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={loadManagementData}
                  className="p-2 text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                  title="Refresh data"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </>
            )}
            <button
              onClick={() => setShowHelp(true)}
              className="p-2 text-gray-300 hover:text-white bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
              title="Commission system guide"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="bg-gray-800/50 border-x border-gray-700 px-1">
        <div className="flex gap-1 overflow-x-auto">
          {visibleTabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-600'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.badge !== undefined && (
                  <span className="ml-1 px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 text-xs font-bold rounded-full">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters Panel (admin management tabs only) */}
      {showManagementHeader && showFilters && (
        <div className="bg-gray-800 border-x border-gray-700 px-6 py-5 border-b border-gray-700/50">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Filter Records</h3>
            <button onClick={clearFilters} className="text-xs text-blue-400 hover:text-blue-300">
              Clear All
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Employee</label>
              <select
                multiple
                size={4}
                value={filters.employees}
                onChange={e => setFilters({ ...filters, employees: Array.from(e.target.selectedOptions, o => o.value) })}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.full_name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Status</label>
              <div className="space-y-2">
                {['pending', 'accruing', 'ready_to_pay', 'paid'].map(s => (
                  <label key={s} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.statuses.includes(s)}
                      onChange={e => setFilters({
                        ...filters,
                        statuses: e.target.checked
                          ? [...filters.statuses, s]
                          : filters.statuses.filter(x => x !== s)
                      })}
                      className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-300 capitalize">{s.replace(/_/g, ' ')}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Approval Status</label>
              <div className="space-y-2">
                {['pending_approval', 'approved', 'rejected', 'auto_approved', 'on_hold'].map(s => (
                  <label key={s} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.approvalStatuses.includes(s)}
                      onChange={e => setFilters({
                        ...filters,
                        approvalStatuses: e.target.checked
                          ? [...filters.approvalStatuses, s]
                          : filters.approvalStatuses.filter(x => x !== s)
                      })}
                      className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-300 capitalize">{s.replace(/_/g, ' ')}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Date Range</label>
              <div className="space-y-2">
                <input
                  type="date"
                  value={filters.dateRange.start}
                  onChange={e => setFilters({ ...filters, dateRange: { ...filters.dateRange, start: e.target.value } })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <input
                  type="date"
                  value={filters.dateRange.end}
                  onChange={e => setFilters({ ...filters, dateRange: { ...filters.dateRange, end: e.target.value } })}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content */}
      <div className="bg-gray-800 rounded-b-lg border border-gray-700 border-t-0 p-6">

        {/* Overview — metrics + summary by employee */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                title="Pending Approval"
                amount={metrics.pendingApprovalAmount}
                sub={`${metrics.pendingApprovalCount} commissions`}
                icon={Clock}
                iconColor="text-yellow-400"
                iconBg="bg-yellow-500/10"
                accent={metrics.pendingApprovalCount > 0}
              />
              <MetricCard
                title="Ready to Pay"
                amount={metrics.readyToPayAmount}
                sub={`${metrics.readyToPayCount} commissions`}
                icon={CheckCircle}
                iconColor="text-green-400"
                iconBg="bg-green-500/10"
              />
              <MetricCard
                title="Paid This Period"
                amount={metrics.paidThisPeriod}
                sub="Current month"
                icon={DollarSign}
                iconColor="text-blue-400"
                iconBg="bg-blue-500/10"
              />
              <MetricCard
                title="Total Liability"
                amount={metrics.totalLiability}
                sub="All unpaid commissions"
                icon={TrendingUp}
                iconColor="text-red-400"
                iconBg="bg-red-500/10"
              />
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12 text-gray-500">Loading...</div>
            ) : (
              <div>
                <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4 text-gray-500" />
                  Summary by Employee
                </h3>
                <div className="overflow-x-auto rounded-lg border border-gray-700">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-700/50 text-xs text-gray-400 uppercase tracking-wider">
                        <th className="px-5 py-3 text-left">Employee</th>
                        <th className="px-5 py-3 text-right">Total Earned</th>
                        <th className="px-5 py-3 text-right">Total Paid</th>
                        <th className="px-5 py-3 text-right">Balance Due</th>
                        <th className="px-5 py-3 text-center"># Records</th>
                        <th className="px-5 py-3 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700/50">
                      {Object.entries(
                        commissions.reduce((acc, c) => {
                          if (!acc[c.employee_id]) acc[c.employee_id] = { name: c.employee_name, earned: 0, paid: 0, count: 0 };
                          acc[c.employee_id].earned += c.amount_earned;
                          acc[c.employee_id].paid += c.amount_paid;
                          acc[c.employee_id].count += 1;
                          return acc;
                        }, {} as Record<string, { name: string; earned: number; paid: number; count: number }>)
                      ).map(([empId, data]) => (
                        <tr key={empId} className="hover:bg-gray-700/30 transition-colors">
                          <td className="px-5 py-3 text-sm font-medium text-white">{data.name}</td>
                          <td className="px-5 py-3 text-sm text-green-400 text-right">{formatCurrency(data.earned)}</td>
                          <td className="px-5 py-3 text-sm text-emerald-400 text-right">{formatCurrency(data.paid)}</td>
                          <td className="px-5 py-3 text-sm font-semibold text-right">
                            <span className={data.earned - data.paid > 0 ? 'text-amber-400' : 'text-gray-400'}>
                              {formatCurrency(data.earned - data.paid)}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-sm text-gray-400 text-center">{data.count}</td>
                          <td className="px-5 py-3 text-center">
                            <button
                              onClick={() => {
                                setFilters({ ...filters, employees: [empId] });
                                setActiveTab('records');
                              }}
                              className="text-xs text-blue-400 hover:text-blue-300 font-medium"
                            >
                              View Records
                            </button>
                          </td>
                        </tr>
                      ))}
                      {commissions.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-500">
                            No commission records found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* All Records */}
        {activeTab === 'records' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-500" />
                Detailed Commission Records
                <span className="text-xs text-gray-500 font-normal">({commissions.length} total)</span>
              </h3>
              <button
                onClick={exportToCSV}
                className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-12 text-gray-500">Loading...</div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-700">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-700/50 text-xs text-gray-400 uppercase tracking-wider">
                      <th className="px-5 py-3 text-left">Employee</th>
                      <th className="px-5 py-3 text-left">Role Type</th>
                      <th className="px-5 py-3 text-right">Basis Amt</th>
                      <th className="px-5 py-3 text-right">Rate</th>
                      <th className="px-5 py-3 text-right">Earned</th>
                      <th className="px-5 py-3 text-center">Status</th>
                      <th className="px-5 py-3 text-center">Approval</th>
                      <th className="px-5 py-3 text-left">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700/50">
                    {commissions.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-500">
                          No commission records found
                        </td>
                      </tr>
                    ) : (
                      commissions.map(c => (
                        <tr key={c.id} className="hover:bg-gray-700/30 transition-colors">
                          <td className="px-5 py-3 text-sm font-medium text-white">{c.employee_name}</td>
                          <td className="px-5 py-3 text-sm text-gray-400">{roleTypeLabels[c.role_type] || c.role_type}</td>
                          <td className="px-5 py-3 text-sm text-white text-right">{formatCurrency(c.basis_amount)}</td>
                          <td className="px-5 py-3 text-sm text-gray-400 text-right">{c.commission_rate}%</td>
                          <td className="px-5 py-3 text-sm font-semibold text-green-400 text-right">{formatCurrency(c.amount_earned)}</td>
                          <td className="px-5 py-3 text-center">
                            <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${statusBadgeStyles[c.status] || statusBadgeStyles.pending}`}>
                              {c.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-center">
                            <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${approvalBadgeStyles[c.approval_status] || approvalBadgeStyles.pending_approval}`}>
                              {c.approval_status.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-xs text-gray-500">{formatDateTime(c.created_at)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Approval Queue */}
        {activeTab === 'approval' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-yellow-400" />
              <h3 className="text-sm font-semibold text-gray-300">Approval Queue</h3>
              {metrics.pendingApprovalCount > 0 && (
                <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 text-xs font-bold rounded-full">
                  {metrics.pendingApprovalCount} pending
                </span>
              )}
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-12 text-gray-500">Loading...</div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-700">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-700/50 text-xs text-gray-400 uppercase tracking-wider">
                      <th className="px-5 py-3 text-left">Employee</th>
                      <th className="px-5 py-3 text-left">Role Type</th>
                      <th className="px-5 py-3 text-right">Amount Earned</th>
                      <th className="px-5 py-3 text-center">Status</th>
                      <th className="px-5 py-3 text-left">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700/50">
                    {commissions.filter(c => c.approval_status === 'pending_approval').length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-5 py-10 text-center">
                          <CheckCircle className="w-8 h-8 text-green-500/40 mx-auto mb-2" />
                          <p className="text-sm text-gray-500">No commissions pending approval</p>
                        </td>
                      </tr>
                    ) : (
                      commissions
                        .filter(c => c.approval_status === 'pending_approval')
                        .map(c => (
                          <tr key={c.id} className="hover:bg-gray-700/30 transition-colors">
                            <td className="px-5 py-3 text-sm font-medium text-white">{c.employee_name}</td>
                            <td className="px-5 py-3 text-sm text-gray-400">{roleTypeLabels[c.role_type] || c.role_type}</td>
                            <td className="px-5 py-3 text-sm font-semibold text-green-400 text-right">{formatCurrency(c.amount_earned)}</td>
                            <td className="px-5 py-3 text-center">
                              <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                                Pending Approval
                              </span>
                            </td>
                            <td className="px-5 py-3 text-xs text-gray-500">{formatDateTime(c.created_at)}</td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Payments */}
        {activeTab === 'payments' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <DollarSign className="w-5 h-5 text-emerald-400" />
              <h3 className="text-sm font-semibold text-gray-300">Payment History</h3>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-12 text-gray-500">Loading...</div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-700">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-700/50 text-xs text-gray-400 uppercase tracking-wider">
                      <th className="px-5 py-3 text-left">Employee</th>
                      <th className="px-5 py-3 text-left">Role Type</th>
                      <th className="px-5 py-3 text-right">Amount Earned</th>
                      <th className="px-5 py-3 text-right">Amount Paid</th>
                      <th className="px-5 py-3 text-left">Pay Period</th>
                      <th className="px-5 py-3 text-left">Paid Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700/50">
                    {commissions.filter(c => c.status === 'paid').length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-10 text-center">
                          <DollarSign className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                          <p className="text-sm text-gray-500">No payment history yet</p>
                        </td>
                      </tr>
                    ) : (
                      commissions
                        .filter(c => c.status === 'paid')
                        .map(c => (
                          <tr key={c.id} className="hover:bg-gray-700/30 transition-colors">
                            <td className="px-5 py-3 text-sm font-medium text-white">{c.employee_name}</td>
                            <td className="px-5 py-3 text-sm text-gray-400">{roleTypeLabels[c.role_type] || c.role_type}</td>
                            <td className="px-5 py-3 text-sm text-green-400 text-right">{formatCurrency(c.amount_earned)}</td>
                            <td className="px-5 py-3 text-sm font-semibold text-emerald-400 text-right">{formatCurrency(c.amount_paid)}</td>
                            <td className="px-5 py-3 text-xs text-gray-500">
                              {c.pay_period_start && c.pay_period_end
                                ? `${new Date(c.pay_period_start).toLocaleDateString()} – ${new Date(c.pay_period_end).toLocaleDateString()}`
                                : '-'}
                            </td>
                            <td className="px-5 py-3 text-xs text-gray-500">{formatDateTime(c.approved_at || c.created_at)}</td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Adjustments */}
        {activeTab === 'adjustments' && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <AlertCircle className="w-10 h-10 text-gray-600" />
            <h3 className="text-sm font-semibold text-gray-400">Commission Adjustments</h3>
            <p className="text-sm text-gray-600 text-center max-w-xs">
              Manual commission corrections and adjustments will be managed here.
            </p>
          </div>
        )}

        {/* Employee Setup */}
        {activeTab === 'employee-config' && <EmployeeCommissionConfig />}

        {/* Company Settings */}
        {activeTab === 'company-settings' && <CompanyCommissionSettings />}

        {/* Pay Period Report */}
        {activeTab === 'pay-period-report' && <CommissionReportPage />}

        {/* Contract Report */}
        {activeTab === 'contract-report' && <ContractCommissionReportPage />}
      </div>

      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} title="Commission System Guide">
        <CommissionHelpContent />
      </HelpModal>
    </div>
  );
}

function MetricCard({
  title, amount, sub, icon: Icon, iconColor, iconBg, accent
}: {
  title: string;
  amount: number;
  sub: string;
  icon: typeof DollarSign;
  iconColor: string;
  iconBg: string;
  accent?: boolean;
}) {
  return (
    <div className={`bg-gray-900/50 rounded-xl border p-5 transition-colors ${
      accent ? 'border-yellow-500/30' : 'border-gray-700/50'
    }`}>
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2 rounded-lg ${iconBg}`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        {accent && <AlertCircle className="w-4 h-4 text-yellow-500" />}
      </div>
      <p className="text-xs text-gray-500 mb-1">{title}</p>
      <p className="text-xl font-bold text-white">{formatCurrency(amount)}</p>
      <p className="text-xs text-gray-600 mt-0.5">{sub}</p>
    </div>
  );
}
