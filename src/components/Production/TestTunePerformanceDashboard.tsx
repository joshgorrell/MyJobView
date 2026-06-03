import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Award, TrendingUp, TrendingDown, Clock, Target, AlertTriangle, CheckCircle2, Calendar, Filter, Download, Eye, BarChart3, DollarSign, Archive, HelpCircle, CreditCard as Edit3, Activity, Repeat, ChevronDown, ChevronUp, Trophy, LineChart } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { TestTuneProjectDetail } from './TestTuneProjectDetail';
import { MyBonusesTab } from './MyBonusesTab';
import { HelpModal } from '../Help/HelpModal';
import { TestTuneHelpContent } from './TestTuneHelpContent';
import { AdminBonusOverrideModal } from './AdminBonusOverrideModal';
import { TechLeaderboard } from './TechLeaderboard';
import { TestTuneAlertsBanner } from './TestTuneAlertsBanner';
import { TestTuneAnalytics } from './TestTuneAnalytics';
import {
  getUserTestTunePermissions,
  getProjectsWithVariance,
  getTestTuneStatsForUser,
  getPMMetrics,
  getVisibleColumns,
  getVisibleFilters,
  getEmptyStateMessage,
  getDashboardTitle,
  type TestTunePermissions,
  type TestTuneProject,
  type TestTuneStats,
  type PMMetrics
} from '../../lib/testTunePermissions';

export function TestTunePerformanceDashboard() {
  const { profile, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState<TestTuneProject[]>([]);
  const [stats, setStats] = useState<TestTuneStats | null>(null);
  const [permissions, setPermissions] = useState<TestTunePermissions | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOffice, setSelectedOffice] = useState<string>('all');
  const [selectedPM, setSelectedPM] = useState<string>('all');
  const [selectedTech, setSelectedTech] = useState<string>('all');
  const [selectedSalesRep, setSelectedSalesRep] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showExpired, setShowExpired] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'days_remaining' | 'percentage_of_target' | 'contact_name'>('days_remaining');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'projects' | 'bonuses' | 'analytics' | 'leaderboard'>('projects');
  const [bonusCount, setBonusCount] = useState<number>(0);
  const [pendingBonuses, setPendingBonuses] = useState<Array<{ id: string; contact_name: string; order_number: string; total_bonus_amount: number }>>([]);
  const [showHelp, setShowHelp] = useState(false);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [pmMetrics, setPMMetrics] = useState<PMMetrics | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [overrideModal, setOverrideModal] = useState<{
    projectId: string;
    projectNumber: string;
    customerName: string;
    employeeId: string;
    employeeName: string;
    employeeRole: string;
    currentBonus: number;
  } | null>(null);

  const [offices, setOffices] = useState<Array<{ id: string; name: string }>>([]);
  const [pms, setPMs] = useState<Array<{ id: string; name: string }>>([]);
  const [techs, setTechs] = useState<Array<{ id: string; name: string }>>([]);
  const [salesReps, setSalesReps] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    if (authLoading || !profile?.id) return;

    async function initializeData() {
      await loadPermissions();
      loadData();
      loadBonusCount();
      loadPendingBonuses();
    }

    initializeData();

    const subscription = supabase
      .channel('test_tune_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_orders' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'test_tune_bonus_calculations' }, () => loadBonusCount())
      .subscribe();

    return () => { subscription.unsubscribe(); };
  }, [authLoading, showExpired, profile?.id, startDate, endDate]);

  async function loadPermissions() {
    if (!profile?.id) return;
    try {
      const perms = await getUserTestTunePermissions(profile.id);
      setPermissions(perms);
    } catch (error) {
      console.error('Error loading permissions:', error);
    }
  }

  async function loadBonusCount() {
    if (!profile?.id) return;
    try {
      const { count, error } = await supabase
        .from('test_tune_bonus_calculations')
        .select('*', { count: 'exact', head: true })
        .or(`lead_technician_id.eq.${profile.id},project_manager_id.eq.${profile.id}`);
      if (error) throw error;
      setBonusCount(count || 0);
    } catch (error) {
      console.error('Error loading bonus count:', error);
    }
  }

  async function loadPendingBonuses() {
    try {
      const { data } = await supabase
        .from('test_tune_bonus_calculations')
        .select(`
          id, bonus_pool,
          sales_order:sales_order_id(order_number, contact:contact_id(full_name))
        `)
        .eq('approval_status', 'pending');
      if (data) {
        setPendingBonuses(data.map((b: any) => ({
          id: b.id,
          contact_name: b.sales_order?.contact?.full_name ?? 'Unknown',
          order_number: b.sales_order?.order_number ?? '',
          total_bonus_amount: b.bonus_pool ?? 0,
        })));
      }
    } catch (error) {
      console.error('Error loading pending bonuses:', error);
    }
  }

  function exportToCSV() {
    if (projects.length === 0) { alert('No data to export'); return; }

    const baseColumns = [
      { key: 'contact_name', label: 'Customer Name' },
      { key: 'order_number', label: 'Sales Order' },
      { key: 'completion_date', label: 'Completion Date' },
      { key: 'days_remaining', label: 'Days Remaining' },
      { key: 'field_labor_target', label: 'Field Target (hrs)' },
      { key: 'field_performance_hours', label: 'Field Labor Used (hrs)' },
      { key: 'hours_remaining', label: 'Hours Saved' },
      { key: 'labor_savings_pct', label: 'Savings % of Est.' },
      { key: 'percentage_of_target', label: '% of Target' },
      { key: 'status_indicator', label: 'Status' }
    ];
    const roleSpecificColumns: { key: string; label: string }[] = [];

    if (permissions!.can_view_bonus_amounts) {
      roleSpecificColumns.push({ key: 'lead_tech_name', label: 'Lead Tech' }, { key: 'projected_bonus', label: 'Projected Bonus ($)' });
    }
    if (permissions!.can_view_pm_metrics) {
      roleSpecificColumns.push({ key: 'pm_name', label: 'Project Manager' }, { key: 'pm_hours_used', label: 'PM Hours' }, { key: 'non_performance_hours', label: 'Non-Performance Hours' });
    }
    if (['sales', 'sales_rep', 'sales_manager'].includes(permissions!.user_role)) {
      roleSpecificColumns.push({ key: 'variance', label: 'Variance' }, { key: 'office_name', label: 'Office' });
    }
    if (['admin', 'super_admin'].includes(permissions!.user_role)) {
      roleSpecificColumns.push({ key: 'office_name', label: 'Office' }, { key: 'sales_rep_name', label: 'Sales Rep' });
    }

    const allColumns = [...baseColumns, ...roleSpecificColumns];
    const header = allColumns.map(col => col.label).join(',');
    const rows = projects.map(project => allColumns.map(col => {
      let value: any = project[col.key as keyof typeof project];
      if (col.key === 'completion_date' && value) value = new Date(value as string).toLocaleDateString();
      else if (['field_labor_target', 'field_performance_hours', 'hours_remaining', 'pm_hours_used', 'non_performance_hours'].includes(col.key)) value = typeof value === 'number' ? value.toFixed(1) : '0.0';
      else if (col.key === 'labor_savings_pct') value = typeof value === 'number' ? `${value.toFixed(1)}%` : '';
      else if (col.key === 'percentage_of_target') value = typeof value === 'number' ? `${value.toFixed(0)}%` : '0%';
      else if (col.key === 'projected_bonus') value = typeof value === 'number' ? value.toFixed(0) : '0';
      else if (col.key === 'status_indicator') value = value === 'on_track' ? 'On Track' : value === 'warning' ? 'Warning' : 'Over Budget';
      else if (col.key === 'variance') { const diff = (project.field_labor_target || 0) - (project.field_performance_hours || 0); value = diff > 0 ? `Under by ${diff.toFixed(1)}h` : diff < 0 ? `Over by ${Math.abs(diff).toFixed(1)}h` : 'On Target'; }
      const stringValue = String(value || '');
      return (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
    }).join(',')).join('\n');

    const csv = `${header}\n${rows}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const roleLabel = ['tech', 'lead_tech'].includes(permissions!.user_role) ? 'Tech' : ['sales', 'sales_rep'].includes(permissions!.user_role) ? 'Sales' : ['manager', 'service_manager'].includes(permissions!.user_role) ? 'Manager' : 'Admin';
    link.download = `Test_Tune_${roleLabel}_Report_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function loadData() {
    if (!profile?.id) return;
    try {
      setLoading(true);
      const projectsData = await getProjectsWithVariance(profile.id, startDate || undefined, endDate || undefined, showExpired);
      setProjects(projectsData as any);
      const statsData = await getTestTuneStatsForUser(profile.id);
      setStats(statsData);
      if (permissions?.can_view_pm_metrics && profile.id) {
        const pmMetricsData = await getPMMetrics(profile.id, startDate || undefined, endDate || undefined);
        setPMMetrics(pmMetricsData);
      }
      extractFilterOptions(projectsData);
    } catch (error) {
      console.error('Error loading test & tune data:', error);
    } finally {
      setLoading(false);
    }
  }

  function extractFilterOptions(projectsData: TestTuneProject[]) {
    setOffices(Array.from(new Map(projectsData.filter(p => p.office_id).map(p => [p.office_id, { id: p.office_id, name: p.office_name }])).values()));
    setPMs(Array.from(new Map(projectsData.filter(p => p.pm_id && p.pm_name).map(p => [p.pm_id, { id: p.pm_id!, name: p.pm_name! }])).values()));
    setTechs(Array.from(new Map(projectsData.filter(p => p.lead_tech_id && p.lead_tech_name).map(p => [p.lead_tech_id, { id: p.lead_tech_id!, name: p.lead_tech_name! }])).values()));
    setSalesReps(Array.from(new Map(projectsData.filter(p => p.sales_rep_id && p.sales_rep_name).map(p => [p.sales_rep_id, { id: p.sales_rep_id!, name: p.sales_rep_name! }])).values()));
  }

  function getFilteredProjects() {
    return projects
      .filter(p => {
        if (selectedOffice !== 'all' && p.office_name !== selectedOffice) return false;
        if (selectedPM !== 'all' && p.pm_name !== selectedPM) return false;
        if (selectedTech !== 'all' && p.lead_tech_name !== selectedTech) return false;
        if (selectedSalesRep !== 'all' && p.sales_rep_name !== selectedSalesRep) return false;
        if (statusFilter !== 'all' && p.status_indicator !== statusFilter) return false;
        return true;
      })
      .sort((a, b) => {
        const aVal = a[sortBy]; const bVal = b[sortBy];
        const comparison = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
        return sortOrder === 'asc' ? comparison : -comparison;
      });
  }

  const filteredProjects = getFilteredProjects();

  if (loading || !permissions) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Clock className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
          <p className="text-gray-600">Loading Test & Tune dashboard...</p>
        </div>
      </div>
    );
  }

  const visibleColumns = getVisibleColumns(permissions);
  const visibleFilters = getVisibleFilters(permissions);
  const dashboardTitle = getDashboardTitle(permissions);
  const emptyMessage = getEmptyStateMessage(permissions);
  const isSalesRole = ['sales', 'sales_rep', 'sales_manager'].includes(permissions.user_role);
  const hasFilters = visibleFilters.showOfficeFilter || visibleFilters.showPMFilter || visibleFilters.showTechFilter || visibleFilters.showSalesFilter;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Award className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600 flex-shrink-0" />
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold text-white truncate">{dashboardTitle}</h1>
            <p className="text-xs sm:text-sm text-gray-300 hidden sm:block">
              90-Day Post-Completion Labor Tracking
              {permissions.user_role === 'sales' && ' - Estimation Accuracy'}
              {permissions.can_view_bonus_amounts && ' & Bonus System'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setShowHelp(true)}
            className="p-2 text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
          >
            <HelpCircle className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          {permissions.can_export_data && (
            <button
              onClick={exportToCSV}
              className="flex items-center gap-1.5 px-2.5 sm:px-4 py-2 text-xs sm:text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export Report</span>
              <span className="sm:hidden">Export</span>
            </button>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white border border-gray-200 rounded-lg p-1 flex gap-1">
        <button
          onClick={() => setActiveTab('projects')}
          className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'projects' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <div className="flex items-center justify-center gap-1.5">
            <BarChart3 className="w-4 h-4" />
            <span>
              {permissions.user_role === 'tech' ? 'My Projects' :
               permissions.user_role === 'sales' ? 'My Sales' :
               ['manager', 'service_manager'].includes(permissions.user_role) ? 'Office Projects' :
               'Active Projects'}
            </span>
          </div>
        </button>
        {permissions.can_view_bonus_amounts && (
          <button
            onClick={() => setActiveTab('bonuses')}
            className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'bonuses' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <div className="flex items-center justify-center gap-1.5">
              <Award className="w-4 h-4" />
              <span>My Bonuses</span>
              {bonusCount > 0 && (
                <span className={`px-1.5 py-0.5 text-xs font-bold rounded-full ${
                  activeTab === 'bonuses' ? 'bg-white text-blue-600' : 'bg-blue-100 text-blue-700'
                }`}>
                  {bonusCount}
                </span>
              )}
            </div>
          </button>
        )}
        <button
          onClick={() => setActiveTab('analytics')}
          className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'analytics' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <div className="flex items-center justify-center gap-1.5">
            <LineChart className="w-4 h-4" />
            <span className="hidden sm:inline">Analytics</span>
            <span className="sm:hidden">Charts</span>
          </div>
        </button>
        {(permissions.can_view_pm_metrics || permissions.can_view_all_projects) && (
          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'leaderboard' ? 'bg-blue-600 text-white' : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <div className="flex items-center justify-center gap-1.5">
              <Trophy className="w-4 h-4" />
              <span>Leaderboard</span>
            </div>
          </button>
        )}
      </div>

      {activeTab === 'bonuses' ? (
        <MyBonusesTab />
      ) : activeTab === 'analytics' ? (
        <TestTuneAnalytics permissions={permissions} profileId={profile!.id} />
      ) : activeTab === 'leaderboard' ? (
        <TechLeaderboard permissions={permissions} currentUserId={profile!.id} />
      ) : (
        <>
          {/* Alerts Banner */}
          <TestTuneAlertsBanner
            projects={projects}
            permissions={permissions}
            pendingBonuses={pendingBonuses}
            onProjectClick={(id) => setSelectedProject(id)}
          />

          {/* Stats Grid */}
          {stats && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-3 sm:p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-blue-900">
                    {permissions.user_role === 'tech' ? 'My Projects' :
                     permissions.user_role === 'sales' ? 'My Sales' :
                     ['manager', 'service_manager'].includes(permissions.user_role) ? 'Office' :
                     'Active'}
                  </span>
                  <Calendar className="w-4 h-4 text-blue-600" />
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-blue-900">{stats.total_projects}</div>
                <div className="text-xs text-blue-700 mt-0.5">In 90-day window</div>
              </div>

              {permissions.user_role !== 'sales' && (
                <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-3 sm:p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-green-900">Labor Savings</span>
                    <DollarSign className="w-4 h-4 text-green-600" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-green-900">
                    ${(stats.total_labor_savings || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                  <div className="text-xs text-green-700 mt-0.5">Total saved</div>
                </div>
              )}

              <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 border border-cyan-200 rounded-lg p-3 sm:p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-cyan-900">
                    {permissions.user_role === 'sales' ? 'Avg Accuracy' : 'Avg Efficiency'}
                  </span>
                  <Target className="w-4 h-4 text-cyan-600" />
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-cyan-900">
                  {(stats.avg_efficiency_percentage || 0).toFixed(1)}%
                </div>
                <div className="text-xs text-cyan-700 mt-0.5">
                  {permissions.user_role === 'sales' ? 'Estimation' : 'Labor efficiency'}
                </div>
              </div>

              {permissions.can_view_bonus_amounts && (
                <div className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-lg p-3 sm:p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-amber-900">
                      {permissions.user_role === 'tech' ? 'My Potential' : 'Est. Bonuses'}
                    </span>
                    <Award className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-amber-900">
                    ${(stats.estimated_bonus_pool || 0).toLocaleString()}
                  </div>
                  <div className="text-xs text-amber-700 mt-0.5">Projected pool</div>
                </div>
              )}

              <div className="bg-white border-2 border-green-200 rounded-lg p-3 sm:p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-700">On Track</span>
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-green-600">{stats.projects_on_track}</div>
                <div className="text-xs text-gray-600 mt-0.5">Under 75% budget</div>
              </div>

              <div className="bg-white border-2 border-yellow-200 rounded-lg p-3 sm:p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-700">At Risk</span>
                  <AlertTriangle className="w-4 h-4 text-yellow-600" />
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-yellow-600">{stats.projects_at_risk}</div>
                <div className="text-xs text-gray-600 mt-0.5">75-100% budget</div>
              </div>

              <div className="bg-white border-2 border-red-200 rounded-lg p-3 sm:p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-700">Over Budget</span>
                  <TrendingDown className="w-4 h-4 text-red-600" />
                </div>
                <div className="text-2xl sm:text-3xl font-bold text-red-600">{stats.projects_over_budget}</div>
                <div className="text-xs text-gray-600 mt-0.5">Exceeded target</div>
              </div>

              {permissions.user_role !== 'sales' && (
                <div className="bg-gradient-to-br from-red-50 to-red-100 border border-red-200 rounded-lg p-3 sm:p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-red-900">Margin Drag</span>
                    <TrendingDown className="w-4 h-4 text-red-600" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-bold text-red-900">
                    ${(stats.total_margin_drag || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                  <div className="text-xs text-red-700 mt-0.5">Cost overages</div>
                </div>
              )}
            </div>
          )}

          {/* PM Metrics */}
          {pmMetrics && permissions?.can_view_pm_metrics && (
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-5 h-5 text-blue-600" />
                <h3 className="text-base sm:text-lg font-bold text-blue-900">PM Performance Metrics</h3>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white border border-blue-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-700">First-Time Complete</span>
                    <CheckCircle2 className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="text-xl sm:text-2xl font-bold text-blue-900">{pmMetrics.first_time_completion_rate.toFixed(1)}%</div>
                  <div className="text-xs text-gray-600 mt-0.5">{pmMetrics.first_time_completions} of {pmMetrics.completed_projects}</div>
                </div>
                <div className="bg-white border border-blue-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-700">Post-Complete Labor</span>
                    <Repeat className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="text-xl sm:text-2xl font-bold text-blue-900">{pmMetrics.total_post_completion_hours.toFixed(1)}h</div>
                  <div className="text-xs text-gray-600 mt-0.5">Avg {pmMetrics.avg_post_completion_hours.toFixed(1)}h/project</div>
                </div>
                <div className="bg-white border border-red-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-700">Labor Drag</span>
                    <TrendingDown className="w-4 h-4 text-red-600" />
                  </div>
                  <div className="text-xl sm:text-2xl font-bold text-red-900">${pmMetrics.total_labor_drag_cost.toLocaleString()}</div>
                  <div className="text-xs text-gray-600 mt-0.5">From overages</div>
                </div>
                <div className="bg-white border border-green-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-700">Labor Savings</span>
                    <TrendingUp className="w-4 h-4 text-green-600" />
                  </div>
                  <div className="text-xl sm:text-2xl font-bold text-green-900">${pmMetrics.total_labor_savings.toLocaleString()}</div>
                  <div className="text-xs text-gray-600 mt-0.5">Under budget</div>
                </div>
              </div>
            </div>
          )}

          {/* Filters - collapsible on mobile */}
          {hasFilters && (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="w-full flex items-center justify-between px-4 py-3 sm:cursor-default sm:pointer-events-none"
              >
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-gray-600" />
                  <span className="font-medium text-gray-900 text-sm">Filters</span>
                  {(selectedOffice !== 'all' || selectedPM !== 'all' || selectedTech !== 'all' || selectedSalesRep !== 'all' || statusFilter !== 'all' || startDate || endDate) && (
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">Active</span>
                  )}
                </div>
                <div className="flex items-center gap-3 sm:hidden">
                  {showFilters ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
                </div>
              </button>

              <div className={`${showFilters ? 'block' : 'hidden'} sm:block border-t border-gray-100 p-4 space-y-4`}>
                {/* Show Expired toggle */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showExpired}
                    onChange={(e) => setShowExpired(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700 flex items-center gap-1">
                    <Archive className="w-4 h-4" />
                    Show Expired Projects
                  </span>
                </label>

                {/* Date Range */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-3 border-b border-gray-100">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Start Date</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-3 py-2 border-2 border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">End Date</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full px-3 py-2 border-2 border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Dropdowns */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {visibleFilters.showOfficeFilter && offices.length > 0 && (
                    <select
                      value={selectedOffice}
                      onChange={(e) => setSelectedOffice(e.target.value)}
                      className="px-3 py-2 border-2 border-blue-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="all">All Offices</option>
                      {offices.map(o => <option key={o.id} value={o.name}>{o.name}</option>)}
                    </select>
                  )}
                  {visibleFilters.showPMFilter && pms.length > 0 && (
                    <select
                      value={selectedPM}
                      onChange={(e) => setSelectedPM(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">All Project Managers</option>
                      {pms.map(pm => <option key={pm.id} value={pm.name}>{pm.name}</option>)}
                    </select>
                  )}
                  {visibleFilters.showTechFilter && techs.length > 0 && (
                    <select
                      value={selectedTech}
                      onChange={(e) => setSelectedTech(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">All Lead Techs</option>
                      {techs.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                    </select>
                  )}
                  {visibleFilters.showSalesFilter && salesReps.length > 0 && (
                    <select
                      value={selectedSalesRep}
                      onChange={(e) => setSelectedSalesRep(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">All Sales Reps</option>
                      {salesReps.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                    </select>
                  )}
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Status</option>
                    <option value="on_track">On Track (Under 75%)</option>
                    <option value="warning">At Risk (75-100%)</option>
                    <option value="over">Over Budget (Over 100%)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Projects - Desktop Table / Mobile Cards */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            {/* Sort bar for mobile */}
            <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200 sm:hidden">
              <span className="text-xs font-medium text-gray-600">Sort by:</span>
              <select
                value={`${sortBy}_${sortOrder}`}
                onChange={(e) => {
                  const [by, order] = e.target.value.split('_') as any;
                  setSortBy(by === 'contact' ? 'contact_name' : by === 'days' ? 'days_remaining' : 'percentage_of_target');
                  setSortOrder(order);
                }}
                className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500"
              >
                <option value="days_remaining_asc">Days Left (Low to High)</option>
                <option value="days_remaining_desc">Days Left (High to Low)</option>
                <option value="percentage_of_target_desc">% of Target (High to Low)</option>
                <option value="percentage_of_target_asc">% of Target (Low to High)</option>
                <option value="contact_name_asc">Customer (A-Z)</option>
                <option value="contact_name_desc">Customer (Z-A)</option>
              </select>
            </div>

            {filteredProjects.length === 0 ? (
              <div className="px-4 py-12 text-center text-gray-500">{emptyMessage}</div>
            ) : (
              <>
                {/* Mobile Card List */}
                <div className="sm:hidden divide-y divide-gray-100">
                  {filteredProjects.map((project) => {
                    const isExpired = project.days_remaining === 0;
                    const salesRepIneligible = (project as any).sales_rep_eligible === false;
                    const statusColor = project.status_indicator === 'on_track' ? 'bg-green-500' : project.status_indicator === 'warning' ? 'bg-yellow-500' : 'bg-red-500';
                    const pctColor = project.status_indicator === 'on_track' ? 'text-green-700 bg-green-50' : project.status_indicator === 'warning' ? 'text-yellow-700 bg-yellow-50' : 'text-red-700 bg-red-50';

                    return (
                      <div
                        key={project.id}
                        onClick={() => setSelectedProject(project.id)}
                        className={`p-4 cursor-pointer active:bg-gray-50 ${isExpired ? 'bg-gray-50' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusColor}`} />
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-gray-900 truncate">{project.contact_name}</div>
                              <div className="text-xs text-gray-500">#{project.order_number}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {isExpired && <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded">EXPIRED</span>}
                            {salesRepIneligible && permissions.can_view_bonus_amounts && (
                              <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs font-medium rounded">Ineligible</span>
                            )}
                            <span className={`px-2 py-0.5 text-xs font-bold rounded ${pctColor}`}>
                              {project.percentage_of_target.toFixed(0)}%
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                          <div className="bg-gray-50 rounded p-2 text-center">
                            <div className="text-gray-500 mb-0.5">Target</div>
                            <div className="font-semibold text-gray-900">{project.field_labor_target.toFixed(1)}h</div>
                          </div>
                          <div className="bg-gray-50 rounded p-2 text-center">
                            <div className="text-gray-500 mb-0.5">Used</div>
                            <div className={`font-semibold ${project.field_performance_hours > project.field_labor_target ? 'text-red-600' : 'text-gray-900'}`}>
                              {project.field_performance_hours.toFixed(1)}h
                            </div>
                          </div>
                          <div className="bg-gray-50 rounded p-2 text-center">
                            <div className="text-gray-500 mb-0.5">Saved</div>
                            <div className={`font-semibold ${project.hours_remaining > 0 ? 'text-green-600' : project.hours_remaining < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                              {project.hours_remaining.toFixed(1)}h
                            </div>
                            {project.labor_savings_pct != null && (
                              <div className={`text-xs mt-0.5 ${project.hours_remaining > 0 ? 'text-green-500' : project.hours_remaining < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                                ({project.labor_savings_pct > 0 ? '+' : ''}{project.labor_savings_pct.toFixed(1)}%)
                              </div>
                            )}
                          </div>
                          <div className="bg-gray-50 rounded p-2 text-center">
                            <div className="text-gray-500 mb-0.5">Days Left</div>
                            <div className={`font-semibold ${project.days_remaining === 0 ? 'text-red-600' : project.days_remaining <= 7 ? 'text-yellow-600' : 'text-gray-900'}`}>
                              {project.days_remaining}
                            </div>
                          </div>
                        </div>

                        {(visibleColumns.showLeadTech || visibleColumns.showPM || visibleColumns.showSalesRep || visibleColumns.showOffice) && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {visibleColumns.showLeadTech && project.lead_tech_name && (
                              <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">Tech: {project.lead_tech_name}</span>
                            )}
                            {visibleColumns.showPM && project.pm_name && (
                              <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">PM: {project.pm_name}</span>
                            )}
                            {visibleColumns.showSalesRep && project.sales_rep_name && (
                              <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">Sales: {project.sales_rep_name}</span>
                            )}
                            {visibleColumns.showOffice && project.office_name && (
                              <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">{project.office_name}</span>
                            )}
                          </div>
                        )}

                        {isSalesRole && (
                          <div className="flex gap-2 mt-2">
                            <div className="flex-1 bg-gray-50 rounded p-2 text-center text-xs">
                              <div className="text-gray-500 mb-0.5">Variance</div>
                              <div className={`font-semibold ${(project as any).hours_variance > 0 ? 'text-green-600' : (project as any).hours_variance < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                                {(project as any).hours_variance > 0 ? '+' : ''}{((project as any).hours_variance || 0).toFixed(1)}h
                              </div>
                            </div>
                            <div className="flex-1 bg-gray-50 rounded p-2 text-center text-xs">
                              <div className="text-gray-500 mb-0.5">Cost Impact</div>
                              <div className={`font-semibold ${(project as any).cost_variance > 0 ? 'text-green-600' : (project as any).cost_variance < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                                {(project as any).cost_variance > 0 ? '+' : ''}${Math.abs((project as any).cost_variance || 0).toLocaleString()}
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-gray-100">
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedProject(project.id); }}
                            className="flex items-center gap-1 text-xs text-blue-600 font-medium px-2 py-1 rounded hover:bg-blue-50"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            View Details
                          </button>
                          {permissions.can_override_bonuses && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOverrideModal({ projectId: project.id, projectNumber: project.order_number, customerName: project.contact_name, employeeId: project.lead_tech_id || '', employeeName: project.lead_tech_name || 'Unknown', employeeRole: 'Lead Technician', currentBonus: 0 });
                              }}
                              className="flex items-center gap-1 text-xs text-amber-600 font-medium px-2 py-1 rounded hover:bg-amber-50"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              Override
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Status</th>
                        <th
                          onClick={() => { setSortBy('contact_name'); setSortOrder(sortBy === 'contact_name' && sortOrder === 'asc' ? 'desc' : 'asc'); }}
                          className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                        >
                          Customer
                        </th>
                        {visibleColumns.showOffice && <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Office</th>}
                        {visibleColumns.showSalesRep && <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Sales Rep</th>}
                        {visibleColumns.showLeadTech && <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Lead Tech</th>}
                        {visibleColumns.showPM && <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">PM</th>}
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Field Target</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Field Used</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">
                          {isSalesRole ? 'Variance' : 'Hours Left'}
                        </th>
                        {isSalesRole && <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Cost Impact</th>}
                        <th
                          onClick={() => { setSortBy('days_remaining'); setSortOrder(sortBy === 'days_remaining' && sortOrder === 'asc' ? 'desc' : 'asc'); }}
                          className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase cursor-pointer hover:bg-gray-100"
                        >
                          Days Left
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {filteredProjects.map((project) => {
                        const isExpired = project.days_remaining === 0;
                        const salesRepIneligible = (project as any).sales_rep_eligible === false;

                        return (
                          <tr
                            key={project.id}
                            onClick={() => setSelectedProject(project.id)}
                            className={`hover:bg-gray-50 cursor-pointer ${isExpired ? 'bg-gray-50' : ''}`}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full ${
                                  project.status_indicator === 'on_track' ? 'bg-green-500' :
                                  project.status_indicator === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
                                }`} />
                                <span className="text-xs text-gray-600">{project.percentage_of_target.toFixed(0)}%</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div>
                                  <div className="text-sm font-medium text-gray-900">{project.contact_name}</div>
                                  <div className="text-xs text-gray-500">#{project.order_number}</div>
                                </div>
                                {isExpired && <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded">EXPIRED</span>}
                                {salesRepIneligible && permissions.can_view_bonus_amounts && (
                                  <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-medium rounded" title="Sales Rep bonus ineligible">Sales Bonus Ineligible</span>
                                )}
                              </div>
                            </td>
                            {visibleColumns.showOffice && <td className="px-4 py-3 text-sm text-gray-600">{project.office_name}</td>}
                            {visibleColumns.showSalesRep && <td className="px-4 py-3 text-sm text-gray-600">{project.sales_rep_name || '-'}</td>}
                            {visibleColumns.showLeadTech && <td className="px-4 py-3 text-sm text-gray-600">{project.lead_tech_name || '-'}</td>}
                            {visibleColumns.showPM && <td className="px-4 py-3 text-sm text-gray-600">{project.pm_name || '-'}</td>}
                            <td className="px-4 py-3 text-sm text-right text-gray-900 font-medium">{project.field_labor_target.toFixed(1)}h</td>
                            <td className="px-4 py-3 text-sm text-right font-medium">
                              <span className={project.field_performance_hours > project.field_labor_target ? 'text-red-600' : 'text-gray-900'}>
                                {project.field_performance_hours.toFixed(1)}h
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-medium">
                              {isSalesRole ? (
                                <span className={(project as any).hours_variance > 0 ? 'text-green-600' : (project as any).hours_variance < 0 ? 'text-red-600' : 'text-gray-900'}>
                                  {(project as any).hours_variance > 0 ? '+' : ''}{((project as any).hours_variance || 0).toFixed(1)}h
                                </span>
                              ) : (
                                <div className="flex flex-col items-end">
                                  <span className={project.hours_remaining < 0 ? 'text-red-600' : 'text-green-600'}>
                                    {project.hours_remaining.toFixed(1)}h
                                  </span>
                                  {project.labor_savings_pct != null && (
                                    <span className={`text-xs ${project.hours_remaining > 0 ? 'text-green-500' : project.hours_remaining < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                                      ({project.labor_savings_pct > 0 ? '+' : ''}{project.labor_savings_pct.toFixed(1)}%)
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                            {isSalesRole && (
                              <td className="px-4 py-3 text-sm text-right font-medium">
                                <span className={(project as any).cost_variance > 0 ? 'text-green-600' : (project as any).cost_variance < 0 ? 'text-red-600' : 'text-gray-900'}>
                                  {(project as any).cost_variance > 0 ? '+' : ''}${Math.abs((project as any).cost_variance || 0).toLocaleString()}
                                </span>
                              </td>
                            )}
                            <td className="px-4 py-3 text-sm text-right">
                              <span className={`font-medium ${project.days_remaining === 0 ? 'text-red-600' : project.days_remaining <= 7 ? 'text-yellow-600' : 'text-gray-900'}`}>
                                {project.days_remaining}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setSelectedProject(project.id); }}
                                  className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-1 rounded"
                                  title="View details"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                {permissions.can_override_bonuses && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOverrideModal({ projectId: project.id, projectNumber: project.order_number, customerName: project.contact_name, employeeId: project.lead_tech_id || '', employeeName: project.lead_tech_name || 'Unknown', employeeRole: 'Lead Technician', currentBonus: 0 });
                                    }}
                                    className="text-amber-600 hover:text-amber-800 hover:bg-amber-50 p-1 rounded"
                                    title="Override bonus"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {selectedProject && (
        <TestTuneProjectDetail projectId={selectedProject} onClose={() => setSelectedProject(null)} />
      )}

      {showHelp && (
        <HelpModal onClose={() => setShowHelp(false)}>
          <TestTuneHelpContent
            userRole={permissions.user_role}
            canViewBonusAmounts={permissions.can_view_bonus_amounts}
            canViewPMMetrics={permissions.can_view_pm_metrics}
            canViewAdminControls={permissions.can_view_admin_controls}
          />
        </HelpModal>
      )}

      {overrideModal && (
        <AdminBonusOverrideModal
          {...overrideModal}
          onClose={() => setOverrideModal(null)}
          onSuccess={() => { loadData(); setOverrideModal(null); }}
        />
      )}
    </div>
  );
}
