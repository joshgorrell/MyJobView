import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Award,
  TrendingUp,
  TrendingDown,
  Clock,
  Target,
  Users,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Filter,
  Download,
  Eye,
  BarChart3,
  DollarSign,
  Hourglass,
  Archive,
  Crown,
  HelpCircle
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { TestTuneProjectDetail } from './TestTuneProjectDetail';
import { MyBonusesTab } from './MyBonusesTab';
import { HelpModal } from '../Help/HelpModal';
import { TestTuneHelpContent } from './TestTuneHelpContent';

interface TestTuneProject {
  id: string;
  order_number: string;
  contact_name: string;
  contact_id: string;
  project_id: string;
  project_title: string;
  office_name: string;
  lead_tech_name: string | null;
  pm_name: string | null;
  sales_rep_name: string | null;
  test_tune_start_date: string;
  test_tune_end_date: string;
  total_estimated_labor: number;
  field_labor_target: number;
  field_hours_used: number;
  pm_hours_used: number;
  non_performance_hours: number;
  has_vip_membership: boolean;
  days_remaining: number;
  percentage_used: number;
  status_color: 'green' | 'yellow' | 'red';
  is_expired: boolean;
}

interface DashboardStats {
  total_projects: number;
  total_post_completion_hours: number;
  avg_hours_per_job: number;
  jobs_over_target: number;
  jobs_over_target_percentage: number;
  total_margin_drag: number;
  first_time_completion_rate: number;
  total_labor_savings: number;
  avg_efficiency_percentage: number;
  projects_on_track: number;
  projects_at_risk: number;
  projects_over_budget: number;
  estimated_bonus_pool: number;
}

export function TestTunePerformanceDashboard() {
  const { profile, loading: authLoading } = useAuth();
  const [projects, setProjects] = useState<TestTuneProject[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedOffice, setSelectedOffice] = useState<string>('all');
  const [selectedPM, setSelectedPM] = useState<string>('all');
  const [selectedTech, setSelectedTech] = useState<string>('all');
  const [selectedSalesRep, setSelectedSalesRep] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showExpired, setShowExpired] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'days_remaining' | 'percentage_used' | 'contact_name'>('days_remaining');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'projects' | 'bonuses'>('projects');
  const [bonusCount, setBonusCount] = useState<number>(0);
  const [showHelp, setShowHelp] = useState(false);

  const [offices, setOffices] = useState<Array<{ id: string; name: string }>>([]);
  const [pms, setPMs] = useState<Array<{ id: string; name: string }>>([]);
  const [techs, setTechs] = useState<Array<{ id: string; name: string }>>([]);
  const [salesReps, setSalesReps] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    // Wait for auth to complete before attempting to load
    if (authLoading) {
      return;
    }

    loadData();
    loadFilters();
    loadBonusCount();

    // Set up real-time subscription
    const subscription = supabase
      .channel('test_tune_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sales_orders' },
        () => {
          loadData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'work_orders' },
        () => {
          loadData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'test_tune_bonus_calculations' },
        () => {
          loadBonusCount();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [authLoading, showExpired, profile?.id]);

  async function loadFilters() {
    // Load offices
    const { data: officesData } = await supabase
      .from('company_offices')
      .select('id, office_name')
      .order('office_name');

    if (officesData) {
      setOffices(officesData.map(o => ({ id: o.id, name: o.office_name })));
    }

    // Load PMs, Techs, and Sales Reps
    const { data: usersData } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .in('role', ['sales_manager', 'office_manager', 'technician', 'sales', 'admin'])
      .order('full_name');

    if (usersData) {
      setPMs(usersData
        .filter(u => ['sales_manager', 'office_manager'].includes(u.role))
        .map(u => ({ id: u.id, name: u.full_name || 'Unknown' }))
      );
      setTechs(usersData
        .filter(u => u.role === 'technician')
        .map(u => ({ id: u.id, name: u.full_name || 'Unknown' }))
      );
      setSalesReps(usersData
        .filter(u => ['sales', 'sales_manager', 'admin'].includes(u.role))
        .map(u => ({ id: u.id, name: u.full_name || 'Unknown' }))
      );
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

  async function loadData() {
    try {
      setLoading(true);

      // Get test & tune settings for labor burden rate and bonus settings
      const { data: settingsData } = await supabase
        .from('test_tune_settings')
        .select('*')
        .single();

      const laborBurdenRate = settingsData?.default_labor_burden_rate || 65;
      const onTargetBonus = settingsData?.on_target_bonus_amount || 500;

      // Load test & tune projects with expired filter
      const { data, error } = await supabase.rpc('get_test_tune_projects', {
        include_expired: showExpired
      });

      if (error) throw error;

      if (data) {
        const now = new Date();
        const projectsWithCalcs = data.map((p: any) => {
          const endDate = new Date(p.test_tune_end_date);
          const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          const isExpired = daysRemaining < 0;
          const percentageUsed = p.field_labor_target > 0
            ? (p.field_hours_used / p.field_labor_target) * 100
            : 0;

          let statusColor: 'green' | 'yellow' | 'red' = 'green';
          if (percentageUsed >= 100) statusColor = 'red';
          else if (percentageUsed >= 75) statusColor = 'yellow';

          return {
            ...p,
            days_remaining: Math.max(0, daysRemaining),
            percentage_used: percentageUsed,
            status_color: statusColor,
            is_expired: isExpired
          };
        });

        setProjects(projectsWithCalcs);

        // Calculate stats
        const activeProjects = projectsWithCalcs.filter(p => !p.is_expired);
        const totalProjects = activeProjects.length;
        const totalPostCompletionHours = activeProjects.reduce((sum, p) =>
          sum + p.field_hours_used + p.non_performance_hours, 0
        );
        const avgHoursPerJob = totalProjects > 0 ? totalPostCompletionHours / totalProjects : 0;
        const jobsOverTarget = activeProjects.filter(p => p.field_hours_used > p.field_labor_target).length;
        const jobsOverTargetPercentage = totalProjects > 0 ? (jobsOverTarget / totalProjects) * 100 : 0;

        const totalMarginDrag = activeProjects.reduce((sum, p) => {
          const overageHours = Math.max(0, p.field_hours_used - p.field_labor_target);
          return sum + (overageHours * laborBurdenRate);
        }, 0);

        const firstTimeCompletionCount = activeProjects.filter(p =>
          p.field_hours_used === 0 && p.non_performance_hours === 0
        ).length;
        const firstTimeCompletionRate = totalProjects > 0
          ? (firstTimeCompletionCount / totalProjects) * 100
          : 0;

        // New enhanced stats
        const totalLaborSavings = activeProjects.reduce((sum, p) => {
          const savingsHours = Math.max(0, p.field_labor_target - p.field_hours_used);
          return sum + (savingsHours * laborBurdenRate);
        }, 0);

        const avgEfficiency = totalProjects > 0
          ? activeProjects.reduce((sum, p) => sum + (100 - p.percentage_used), 0) / totalProjects
          : 0;

        const projectsOnTrack = activeProjects.filter(p => p.percentage_used < 75).length;
        const projectsAtRisk = activeProjects.filter(p => p.percentage_used >= 75 && p.percentage_used < 100).length;
        const projectsOverBudget = activeProjects.filter(p => p.percentage_used >= 100).length;

        // Estimate bonus pool - on target bonus for projects under 100%
        const estimatedBonusPool = activeProjects.reduce((sum, p) => {
          if (p.percentage_used < 100) {
            return sum + onTargetBonus;
          }
          return sum;
        }, 0);

        setStats({
          total_projects: totalProjects,
          total_post_completion_hours: totalPostCompletionHours,
          avg_hours_per_job: avgHoursPerJob,
          jobs_over_target: jobsOverTarget,
          jobs_over_target_percentage: jobsOverTargetPercentage,
          total_margin_drag: totalMarginDrag,
          first_time_completion_rate: firstTimeCompletionRate,
          total_labor_savings: totalLaborSavings,
          avg_efficiency_percentage: avgEfficiency,
          projects_on_track: projectsOnTrack,
          projects_at_risk: projectsAtRisk,
          projects_over_budget: projectsOverBudget,
          estimated_bonus_pool: estimatedBonusPool
        });
      }
    } catch (error) {
      console.error('Error loading test & tune data:', error);
    } finally {
      setLoading(false);
    }
  }

  function getFilteredProjects() {
    return projects
      .filter(p => {
        if (selectedOffice !== 'all' && p.office_name !== selectedOffice) return false;
        if (selectedPM !== 'all' && p.pm_name !== selectedPM) return false;
        if (selectedTech !== 'all' && p.lead_tech_name !== selectedTech) return false;
        if (selectedSalesRep !== 'all' && p.sales_rep_name !== selectedSalesRep) return false;
        if (statusFilter !== 'all' && p.status_color !== statusFilter) return false;
        return true;
      })
      .sort((a, b) => {
        const aVal = a[sortBy];
        const bVal = b[sortBy];
        const comparison = aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
        return sortOrder === 'asc' ? comparison : -comparison;
      });
  }

  const filteredProjects = getFilteredProjects();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Clock className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
          <p className="text-gray-600">Loading Test & Tune dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Award className="w-8 h-8 text-purple-600" />
          <div>
            <h1 className="text-2xl font-bold text-white">Test & Tune Performance Dashboard</h1>
            <p className="text-sm text-gray-200">90-Day Post-Completion Labor Tracking & Bonus System</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHelp(true)}
            className="p-2 text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
            title="Learn about the Test & Tune bonus system"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
          <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            <Download className="w-4 h-4" />
            Export Report
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white border border-gray-200 rounded-lg p-1 inline-flex gap-1">
        <button
          onClick={() => setActiveTab('projects')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'projects'
              ? 'bg-blue-600 text-white'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Active Projects
          </div>
        </button>
        <button
          onClick={() => setActiveTab('bonuses')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            activeTab === 'bonuses'
              ? 'bg-blue-600 text-white'
              : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4" />
            My Bonuses
            <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${
              activeTab === 'bonuses'
                ? 'bg-white text-blue-600'
                : 'bg-blue-100 text-blue-700'
            }`}>
              {bonusCount}
            </span>
          </div>
        </button>
      </div>

      {/* Render based on active tab */}
      {activeTab === 'bonuses' ? (
        <MyBonusesTab />
      ) : (
        <>
          {/* Enhanced Stats Grid */}
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Row 1 */}
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-blue-900">Active Projects</span>
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <div className="text-3xl font-bold text-blue-900">{stats.total_projects}</div>
            <div className="text-xs text-blue-700 mt-1">In 90-day Test & Tune period</div>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-green-900">Labor Savings</span>
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-3xl font-bold text-green-900">
              ${stats.total_labor_savings.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </div>
            <div className="text-xs text-green-700 mt-1">Total labor cost savings</div>
          </div>

          <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 border border-cyan-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-cyan-900">Avg Efficiency</span>
              <Target className="w-5 h-5 text-cyan-600" />
            </div>
            <div className="text-3xl font-bold text-cyan-900">
              {stats.avg_efficiency_percentage.toFixed(1)}%
            </div>
            <div className="text-xs text-cyan-700 mt-1">Average labor efficiency</div>
          </div>

          <div className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-amber-900">Estimated Bonuses</span>
              <Award className="w-5 h-5 text-amber-600" />
            </div>
            <div className="text-3xl font-bold text-amber-900">
              ${stats.estimated_bonus_pool.toLocaleString()}
            </div>
            <div className="text-xs text-amber-700 mt-1">Projected bonus pool</div>
          </div>

          {/* Row 2 */}
          <div className="bg-white border-2 border-green-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">On Track</span>
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-3xl font-bold text-green-600">{stats.projects_on_track}</div>
            <div className="text-xs text-gray-600 mt-1">Under 75% of labor budget</div>
          </div>

          <div className="bg-white border-2 border-yellow-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">At Risk</span>
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
            </div>
            <div className="text-3xl font-bold text-yellow-600">{stats.projects_at_risk}</div>
            <div className="text-xs text-gray-600 mt-1">75-100% of labor budget</div>
          </div>

          <div className="bg-white border-2 border-red-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Over Budget</span>
              <TrendingDown className="w-5 h-5 text-red-600" />
            </div>
            <div className="text-3xl font-bold text-red-600">{stats.projects_over_budget}</div>
            <div className="text-xs text-gray-600 mt-1">Exceeded labor target</div>
          </div>

          <div className="bg-gradient-to-br from-red-50 to-red-100 border border-red-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-red-900">Margin Drag</span>
              <TrendingDown className="w-5 h-5 text-red-600" />
            </div>
            <div className="text-3xl font-bold text-red-900">
              ${stats.total_margin_drag.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </div>
            <div className="text-xs text-red-700 mt-1">Labor cost overages</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-600" />
            <span className="font-medium text-gray-900">Filters</span>
            {selectedOffice !== 'all' && (
              <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm font-medium rounded-full">
                Office: {selectedOffice}
              </span>
            )}
            {selectedOffice === 'all' && (
              <span className="px-3 py-1 bg-gray-100 text-gray-700 text-sm font-medium rounded-full">
                Office: ALL
              </span>
            )}
          </div>
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
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <select
            value={selectedOffice}
            onChange={(e) => setSelectedOffice(e.target.value)}
            className="px-3 py-2 border-2 border-blue-300 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Offices</option>
            {offices.map(office => (
              <option key={office.id} value={office.name}>{office.name}</option>
            ))}
          </select>

          <select
            value={selectedSalesRep}
            onChange={(e) => setSelectedSalesRep(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Sales Reps</option>
            {salesReps.map(rep => (
              <option key={rep.id} value={rep.name}>{rep.name}</option>
            ))}
          </select>

          <select
            value={selectedPM}
            onChange={(e) => setSelectedPM(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Project Managers</option>
            {pms.map(pm => (
              <option key={pm.id} value={pm.name}>{pm.name}</option>
            ))}
          </select>

          <select
            value={selectedTech}
            onChange={(e) => setSelectedTech(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Lead Techs</option>
            {techs.map(tech => (
              <option key={tech.id} value={tech.name}>{tech.name}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Status</option>
            <option value="green">Green (Under 75%)</option>
            <option value="yellow">Yellow (75-100%)</option>
            <option value="red">Red (Over 100%)</option>
          </select>
        </div>
      </div>

      {/* Projects Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Status
                </th>
                <th
                  onClick={() => {
                    if (sortBy === 'contact_name') {
                      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortBy('contact_name');
                      setSortOrder('asc');
                    }
                  }}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  Customer
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Sales Rep
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Lead Tech
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                  PM
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Field Target
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Field Used
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Labor Budget Left
                </th>
                <th
                  onClick={() => {
                    if (sortBy === 'days_remaining') {
                      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortBy('days_remaining');
                      setSortOrder('asc');
                    }
                  }}
                  className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                >
                  Calendar Days Left
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredProjects.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                    {showExpired ? 'No Test & Tune projects found' : 'No active Test & Tune projects found'}
                  </td>
                </tr>
              ) : (
                filteredProjects.map((project) => (
                  <tr
                    key={project.id}
                    className={`hover:bg-gray-50 cursor-pointer ${project.is_expired ? 'bg-gray-50' : ''}`}
                    onClick={() => setSelectedProject(project.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${
                          project.status_color === 'green' ? 'bg-green-500' :
                          project.status_color === 'yellow' ? 'bg-yellow-500' :
                          'bg-red-500'
                        }`} />
                        <span className="text-xs text-gray-600">
                          {project.percentage_used.toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{project.contact_name}</div>
                          <div className="text-xs text-gray-500">#{project.order_number}</div>
                        </div>
                        {project.is_expired && (
                          <div className="flex items-center gap-1">
                            <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded">
                              EXPIRED
                            </span>
                            {project.has_vip_membership && (
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded flex items-center gap-1">
                                <Crown className="w-3 h-3" />
                                VIP
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{project.sales_rep_name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{project.lead_tech_name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{project.pm_name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900 font-medium">
                      {project.field_labor_target.toFixed(1)}h
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium">
                      <span className={
                        project.field_hours_used > project.field_labor_target
                          ? 'text-red-600'
                          : 'text-gray-900'
                      }>
                        {project.field_hours_used.toFixed(1)}h
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium">
                      <span className={
                        project.field_labor_target - project.field_hours_used < 0
                          ? 'text-red-600'
                          : 'text-green-600'
                      }>
                        {(project.field_labor_target - project.field_hours_used).toFixed(1)}h
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {project.is_expired ? (
                        <span className="text-red-600 font-medium">Expired</span>
                      ) : (
                        <span className={
                          project.days_remaining < 7
                            ? 'text-red-600 font-medium'
                            : project.days_remaining < 30
                            ? 'text-yellow-600'
                            : 'text-gray-600'
                        }>
                          {project.days_remaining} days
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setSelectedProject(project.id)}
                        className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      >
                        <Eye className="w-3 h-3" />
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

          {/* Project Detail Modal */}
          {selectedProject && (
            <TestTuneProjectDetail
              projectId={selectedProject}
              onClose={() => setSelectedProject(null)}
            />
          )}
        </>
      )}

      {/* Help Modal */}
      <HelpModal
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        title="Test & Tune Bonus System Guide"
      >
        <TestTuneHelpContent />
      </HelpModal>
    </div>
  );
}
