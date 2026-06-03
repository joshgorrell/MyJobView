import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  ArrowLeft,
  Award,
  TrendingUp,
  TrendingDown,
  Clock,
  Target,
  Calendar,
  DollarSign,
  Users,
  AlertTriangle,
  CheckCircle2,
  Wrench,
  FileText,
  Crown,
  ExternalLink,
  Hourglass,
  ChevronRight,
  Layers,
  Star,
  UserCheck,
  History
} from 'lucide-react';

interface ProjectDetail {
  id: string;
  order_number: string;
  contact_name: string;
  contact_id: string;
  contact_email: string;
  contact_phone: string;
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
  portal_access_level: string;
  punchlist_item_count: number;
  work_order_count: number;
  contract_total: number;
  can_view_bonus_amounts: boolean;
  can_view_pm_metrics: boolean;
  can_view_admin_controls: boolean;
  can_view_all_work_orders: boolean;
  user_has_access: boolean;
}

interface WorkOrder {
  id: string;
  work_order_number: string;
  title: string;
  work_order_type: string;
  status: string;
  scheduled_date: string | null;
  completed_date: string | null;
  estimated_hours: number;
  actual_hours: number;
  labor_category: string;
  assigned_tech_name: string | null;
  notes: string | null;
  created_at: string;
}

interface BonusRecord {
  id: string;
  bonus_tier: string | null;
  hours_saved: number;
  labor_savings_value: number;
  bonus_pool: number;
  tech_bonus_amount: number;
  pm_bonus_amount: number;
  tech_bonus_percentage: number;
  pm_bonus_percentage: number;
  status: string;
  approval_status: string;
  approved_by_name: string | null;
  approved_at: string | null;
  override_reason: string | null;
  calculated_at: string;
  on_target_bonus: boolean;
}

interface BonusApproval {
  id: string;
  action: string;
  performed_by_name: string | null;
  reason: string | null;
  override_amount: number | null;
  created_at: string;
}

interface TestTuneProjectDetailProps {
  projectId: string;
  onClose: () => void;
}

export function TestTuneProjectDetail({ projectId, onClose }: TestTuneProjectDetailProps) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [bonusRecord, setBonusRecord] = useState<BonusRecord | null>(null);
  const [bonusHistory, setBonusHistory] = useState<BonusApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [laborBurdenRate, setLaborBurdenRate] = useState(65);
  const [showBonusHistory, setShowBonusHistory] = useState(false);

  useEffect(() => {
    loadProjectDetail();
  }, [projectId]);

  async function loadProjectDetail() {
    try {
      setLoading(true);

      // Get labor burden rate
      const { data: settingsData } = await supabase
        .from('test_tune_settings')
        .select('default_labor_burden_rate')
        .single();

      if (settingsData) {
        setLaborBurdenRate(settingsData.default_labor_burden_rate);
      }

      // Load project detail
      const { data: projectData, error: projectError } = await supabase
        .rpc('get_test_tune_project_detail', { project_sales_order_id: projectId });

      if (projectError) throw projectError;

      if (projectData && projectData.length > 0) {
        setProject(projectData[0]);
      }

      // Load work orders
      const { data: workOrdersData, error: workOrdersError } = await supabase
        .rpc('get_test_tune_project_work_orders', { project_sales_order_id: projectId });

      if (workOrdersError) throw workOrdersError;

      if (workOrdersData) {
        setWorkOrders(workOrdersData);
      }

      // Load bonus record with approver info
      const { data: bonusData } = await supabase
        .from('test_tune_bonus_calculations')
        .select(`
          id, bonus_tier, hours_saved, labor_savings_value, bonus_pool,
          tech_bonus_amount, pm_bonus_amount, tech_bonus_percentage, pm_bonus_percentage,
          status, approval_status, override_reason, calculated_at, on_target_bonus,
          approved_by:approved_by_id(full_name)
        `)
        .eq('sales_order_id', projectId)
        .maybeSingle();

      if (bonusData) {
        setBonusRecord({
          ...bonusData,
          approved_by_name: (bonusData.approved_by as any)?.full_name ?? null,
          approved_at: null,
        });

        // Load approval history
        const { data: historyData } = await supabase
          .from('test_tune_bonus_approvals')
          .select(`
            id, action, reason, override_amount, created_at,
            performed_by:performed_by_id(full_name)
          `)
          .eq('bonus_calculation_id', bonusData.id)
          .order('created_at', { ascending: false });

        if (historyData) {
          setBonusHistory(historyData.map((h: any) => ({
            ...h,
            performed_by_name: h.performed_by?.full_name ?? null,
          })));
        }
      } else {
        setBonusRecord(null);
        setBonusHistory([]);
      }
    } catch (error) {
      console.error('Error loading project detail:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <Clock className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
          <p className="text-gray-600">Loading project details...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md">
          <AlertTriangle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <p className="text-center text-gray-900 font-medium mb-4">Project not found</p>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const now = new Date();
  const endDate = new Date(project.test_tune_end_date);
  const startDate = new Date(project.test_tune_start_date);
  const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const daysElapsed = totalDays - daysRemaining;
  const isExpired = daysRemaining === 0;

  const percentageUsed = project.field_labor_target > 0
    ? (project.field_hours_used / project.field_labor_target) * 100
    : 0;

  const laborRemaining = project.field_labor_target - project.field_hours_used;
  const laborSavings = laborRemaining > 0 ? laborRemaining * laborBurdenRate : 0;
  const laborOverage = Math.max(0, -laborRemaining) * laborBurdenRate;
  const isOnTarget = laborRemaining === 0;

  let statusColor: 'green' | 'yellow' | 'red' = 'green';
  if (percentageUsed >= 100) statusColor = 'red';
  else if (percentageUsed >= 75) statusColor = 'yellow';

  const totalPostCompletionHours = project.field_hours_used + project.pm_hours_used + project.non_performance_hours;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 overflow-y-auto z-50">
      <div className="min-h-screen p-4">
        <div className="max-w-7xl mx-auto my-8">
          <div className="bg-white rounded-lg shadow-lg">
            {/* Header */}
            <div className="border-b border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={onClose}
                  className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
                >
                  <ArrowLeft className="w-5 h-5" />
                  Back to Dashboard
                </button>
                <div className="flex items-center gap-2">
                  {isExpired && (
                    <>
                      <span className="px-3 py-1 bg-red-100 text-red-700 text-sm font-medium rounded-full">
                        EXPIRED
                      </span>
                      {project.has_vip_membership && (
                        <span className="px-3 py-1 bg-amber-100 text-amber-700 text-sm font-medium rounded-full flex items-center gap-1">
                          <Crown className="w-4 h-4" />
                          VIP Member - Access Maintained
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 mb-1 sm:mb-2 leading-tight">{project.contact_name}</h1>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
                    <span className="font-medium">Order #{project.order_number}</span>
                    <span className="hidden sm:inline text-gray-300">|</span>
                    <span>{project.office_name}</span>
                    {project.project_title && (
                      <span className="truncate max-w-xs">{project.project_title}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600 mt-1">
                    <span>Sales: <strong>{project.sales_rep_name || 'Unknown'}</strong></span>
                    {project.lead_tech_name && (
                      <span>Tech: <strong>{project.lead_tech_name}</strong></span>
                    )}
                    {project.pm_name && (
                      <span>PM: <strong>{project.pm_name}</strong></span>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <div className={`inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg ${
                    statusColor === 'green' ? 'bg-green-100 text-green-800' :
                    statusColor === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    <div className={`w-2.5 h-2.5 rounded-full ${
                      statusColor === 'green' ? 'bg-green-500' :
                      statusColor === 'yellow' ? 'bg-yellow-500' :
                      'bg-red-500'
                    }`} />
                    <span className="font-bold text-base sm:text-lg">{percentageUsed.toFixed(0)}%</span>
                    <span className="text-xs sm:text-sm">of Target</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className={`p-6 grid grid-cols-1 md:grid-cols-2 ${project.can_view_pm_metrics ? 'lg:grid-cols-4' : 'lg:grid-cols-3'} gap-4`}>
              {/* Labor Budget Status */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-blue-900">Labor Budget Status</span>
                  <Target className="w-5 h-5 text-blue-600" />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-blue-700">Target:</span>
                    <span className="font-medium text-blue-900">{project.field_labor_target.toFixed(1)}h</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-blue-700">Used:</span>
                    <span className="font-medium text-blue-900">{project.field_hours_used.toFixed(1)}h</span>
                  </div>
                  <div className="w-full bg-blue-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        percentageUsed >= 100 ? 'bg-red-500' :
                        percentageUsed >= 75 ? 'bg-yellow-500' :
                        'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(100, percentageUsed)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-sm font-bold">
                    <span className="text-blue-900">Remaining:</span>
                    <span className={laborRemaining < 0 ? 'text-red-600' : 'text-green-600'}>
                      {laborRemaining.toFixed(1)}h
                    </span>
                  </div>
                </div>
              </div>

              {/* Days Remaining */}
              <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 border border-cyan-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-cyan-900">Time Remaining</span>
                  <Calendar className="w-5 h-5 text-cyan-600" />
                </div>
                <div className="space-y-2">
                  <div className="text-3xl font-bold text-cyan-900">
                    {isExpired ? 'Expired' : `${daysRemaining} days`}
                  </div>
                  <div className="text-xs text-cyan-700">
                    {daysElapsed} of {totalDays} days elapsed
                  </div>
                  <div className="w-full bg-cyan-200 rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-cyan-600"
                      style={{ width: `${(daysElapsed / totalDays) * 100}%` }}
                    />
                  </div>
                  <div className="text-xs text-cyan-700">
                    {new Date(project.test_tune_start_date).toLocaleDateString()} - {new Date(project.test_tune_end_date).toLocaleDateString()}
                  </div>
                </div>
              </div>

              {/* Cost Impact - Only show to admins and managers */}
              {project.can_view_pm_metrics && (
                <div className={`bg-gradient-to-br ${
                  laborOverage > 0 ? 'from-red-50 to-red-100 border-red-200' :
                  isOnTarget ? 'from-gray-50 to-gray-100 border-gray-200' :
                  'from-green-50 to-green-100 border-green-200'
                } border rounded-lg p-4`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-sm font-medium ${
                      laborOverage > 0 ? 'text-red-900' :
                      isOnTarget ? 'text-gray-700' :
                      'text-green-900'
                    }`}>
                      {laborOverage > 0 ? 'Margin Drag' : isOnTarget ? 'On Target' : 'Labor Savings'}
                    </span>
                    <DollarSign className={`w-5 h-5 ${
                      laborOverage > 0 ? 'text-red-600' :
                      isOnTarget ? 'text-gray-500' :
                      'text-green-600'
                    }`} />
                  </div>
                  <div className={`text-3xl font-bold ${
                    laborOverage > 0 ? 'text-red-900' :
                    isOnTarget ? 'text-gray-600' :
                    'text-green-900'
                  }`}>
                    {isOnTarget ? '—' : `$${(laborOverage > 0 ? laborOverage : laborSavings).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
                  </div>
                  <div className={`text-xs mt-1 ${
                    laborOverage > 0 ? 'text-red-700' :
                    isOnTarget ? 'text-gray-500' :
                    'text-green-700'
                  }`}>
                    {isOnTarget ? 'No bonus — exactly on target' : `@ $${laborBurdenRate}/hour labor burden`}
                  </div>
                </div>
              )}

              {/* All Labor Hours - Show different breakdown based on role */}
              <div className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-amber-900">
                    {project.can_view_pm_metrics ? 'Total Labor Hours' : 'Field Labor Hours'}
                  </span>
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <div className="space-y-2">
                  <div className="text-3xl font-bold text-amber-900">
                    {project.can_view_pm_metrics ? totalPostCompletionHours.toFixed(1) : project.field_hours_used.toFixed(1)}h
                  </div>
                  {project.can_view_pm_metrics && (
                    <div className="space-y-1 text-xs text-amber-700">
                      <div className="flex justify-between">
                        <span>Field:</span>
                        <span className="font-medium">{project.field_hours_used.toFixed(1)}h</span>
                      </div>
                      <div className="flex justify-between">
                        <span>PM:</span>
                        <span className="font-medium">{project.pm_hours_used.toFixed(1)}h</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Non-Perf:</span>
                        <span className="font-medium">{project.non_performance_hours.toFixed(1)}h</span>
                      </div>
                    </div>
                  )}
                  {!project.can_view_pm_metrics && (
                    <div className="text-xs text-amber-700">
                      Counted toward performance
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bonus Calculation Breakdown - visible when there's a record or when admin can see */}
            {project.can_view_bonus_amounts && (
              <div className="p-6 border-t border-gray-200">
                <div className="flex items-center gap-2 mb-4">
                  <Award className="w-5 h-5 text-amber-500" />
                  <h2 className="text-xl font-bold text-gray-900">Bonus Calculation</h2>
                  {bonusRecord && (
                    <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${
                      bonusRecord.approval_status === 'approved' ? 'bg-green-100 text-green-700' :
                      bonusRecord.approval_status === 'paid' ? 'bg-blue-100 text-blue-700' :
                      bonusRecord.approval_status === 'denied' ? 'bg-red-100 text-red-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {bonusRecord.approval_status === 'approved' ? 'Approved' :
                       bonusRecord.approval_status === 'paid' ? 'Paid' :
                       bonusRecord.approval_status === 'denied' ? 'Denied' :
                       'Pending Approval'}
                    </span>
                  )}
                </div>

                {!bonusRecord ? (
                  <div className="bg-gray-50 border border-dashed border-gray-300 rounded-lg p-8 text-center">
                    <Award className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-600 font-medium">
                      {isExpired ? 'No bonus record found for this project.' : 'Bonus will be calculated when the Test & Tune period ends.'}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      {isExpired
                        ? 'This project may not have qualified, or evaluation is pending.'
                        : `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining in the evaluation window.`
                      }
                    </p>
                    {!isExpired && laborRemaining > 0 && (
                      <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-lg">
                        <TrendingUp className="w-4 h-4 text-green-600" />
                        <span className="text-sm text-green-800 font-medium">
                          Projected savings: {laborRemaining.toFixed(1)}h = ${laborSavings.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Formula visualization — horizontal on sm+, vertical grid on mobile */}
                    <div className="bg-gradient-to-r from-amber-50 to-amber-100 border border-amber-200 rounded-xl p-4 sm:p-5">
                      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-3 sm:mb-4">Calculation Breakdown</p>

                      {/* Mobile: clean card grid */}
                      <div className="grid grid-cols-2 gap-2 sm:hidden">
                        <div className="bg-white rounded-lg border border-amber-200 px-3 py-2.5 text-center shadow-sm">
                          <div className="text-xs text-amber-600 mb-0.5">Hours Saved</div>
                          <div className="text-lg font-bold text-amber-900">{bonusRecord.hours_saved.toFixed(1)}h</div>
                        </div>
                        <div className="bg-white rounded-lg border border-amber-200 px-3 py-2.5 text-center shadow-sm">
                          <div className="text-xs text-amber-600 mb-0.5">Burden Rate</div>
                          <div className="text-lg font-bold text-amber-900">${laborBurdenRate}/hr</div>
                        </div>
                        <div className="bg-white rounded-lg border border-amber-200 px-3 py-2.5 text-center shadow-sm">
                          <div className="text-xs text-amber-600 mb-0.5">Labor Savings</div>
                          <div className="text-lg font-bold text-green-700">${bonusRecord.labor_savings_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                        </div>
                        <div className={`rounded-lg border px-3 py-2.5 text-center shadow-sm ${
                          bonusRecord.on_target_bonus ? 'bg-blue-50 border-blue-200' :
                          bonusRecord.bonus_tier === 'tier_3' ? 'bg-emerald-50 border-emerald-300' :
                          bonusRecord.bonus_tier === 'tier_2' ? 'bg-teal-50 border-teal-200' :
                          'bg-white border-amber-200'
                        }`}>
                          <div className="text-xs text-amber-600 mb-0.5">
                            {bonusRecord.on_target_bonus ? 'On Target' : `Tier ${bonusRecord.bonus_tier?.replace('tier_', '') ?? '?'}`}
                          </div>
                          <div className={`text-lg font-bold ${
                            bonusRecord.on_target_bonus ? 'text-blue-700' :
                            bonusRecord.bonus_tier === 'tier_3' ? 'text-emerald-700' :
                            bonusRecord.bonus_tier === 'tier_2' ? 'text-teal-700' :
                            'text-amber-900'
                          }`}>
                            {bonusRecord.on_target_bonus ? 'Flat $150' :
                              bonusRecord.bonus_tier === 'tier_3' ? '35%' :
                              bonusRecord.bonus_tier === 'tier_2' ? '30%' : '20%'}
                          </div>
                        </div>
                        <div className="col-span-2 bg-amber-600 rounded-lg px-3 py-2.5 text-center shadow-sm">
                          <div className="text-xs text-amber-100 mb-0.5">Bonus Pool</div>
                          <div className="text-xl font-bold text-white">${bonusRecord.bonus_pool.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                        </div>
                      </div>

                      {/* Desktop: horizontal formula */}
                      <div className="hidden sm:flex flex-wrap items-center gap-2">
                        <div className="bg-white rounded-lg border border-amber-200 px-4 py-3 text-center shadow-sm">
                          <div className="text-xs text-amber-600 mb-1">Hours Saved</div>
                          <div className="text-xl font-bold text-amber-900">{bonusRecord.hours_saved.toFixed(1)}h</div>
                        </div>
                        <span className="text-amber-500 font-bold text-lg">×</span>
                        <div className="bg-white rounded-lg border border-amber-200 px-4 py-3 text-center shadow-sm">
                          <div className="text-xs text-amber-600 mb-1">Burden Rate</div>
                          <div className="text-xl font-bold text-amber-900">${laborBurdenRate}/hr</div>
                        </div>
                        <span className="text-amber-500 font-bold text-lg">=</span>
                        <div className="bg-white rounded-lg border border-amber-200 px-4 py-3 text-center shadow-sm">
                          <div className="text-xs text-amber-600 mb-1">Labor Savings</div>
                          <div className="text-xl font-bold text-green-700">${bonusRecord.labor_savings_value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                        </div>
                        <span className="text-amber-500 font-bold text-lg">×</span>
                        <div className={`rounded-lg border px-4 py-3 text-center shadow-sm ${
                          bonusRecord.on_target_bonus ? 'bg-blue-50 border-blue-200' :
                          bonusRecord.bonus_tier === 'tier_3' ? 'bg-emerald-50 border-emerald-300' :
                          bonusRecord.bonus_tier === 'tier_2' ? 'bg-teal-50 border-teal-200' :
                          'bg-white border-amber-200'
                        }`}>
                          <div className="text-xs text-amber-600 mb-1">
                            {bonusRecord.on_target_bonus ? 'On Target' : `Tier ${bonusRecord.bonus_tier?.replace('tier_', '') ?? '?'}`}
                          </div>
                          <div className={`text-xl font-bold ${
                            bonusRecord.on_target_bonus ? 'text-blue-700' :
                            bonusRecord.bonus_tier === 'tier_3' ? 'text-emerald-700' :
                            bonusRecord.bonus_tier === 'tier_2' ? 'text-teal-700' :
                            'text-amber-900'
                          }`}>
                            {bonusRecord.on_target_bonus ? 'Flat $150' :
                              bonusRecord.bonus_tier === 'tier_3' ? '35%' :
                              bonusRecord.bonus_tier === 'tier_2' ? '30%' : '20%'}
                          </div>
                        </div>
                        <span className="text-amber-500 font-bold text-lg">=</span>
                        <div className="bg-amber-600 rounded-lg px-4 py-3 text-center shadow-sm">
                          <div className="text-xs text-amber-100 mb-1">Bonus Pool</div>
                          <div className="text-xl font-bold text-white">${bonusRecord.bonus_pool.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                        </div>
                      </div>
                    </div>

                    {/* Tech / PM Split */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="bg-white border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Wrench className="w-4 h-4 text-blue-600" />
                          <span className="text-sm font-semibold text-gray-900">Lead Technician Share</span>
                          <span className="ml-auto text-xs text-gray-500">{bonusRecord.tech_bonus_percentage}%</span>
                        </div>
                        <div className="text-3xl font-bold text-blue-700">
                          ${bonusRecord.tech_bonus_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                        {project.lead_tech_name && (
                          <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                            <UserCheck className="w-3 h-3" />
                            {project.lead_tech_name}
                          </div>
                        )}
                        <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
                          <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${bonusRecord.tech_bonus_percentage}%` }} />
                        </div>
                      </div>

                      <div className="bg-white border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Users className="w-4 h-4 text-teal-600" />
                          <span className="text-sm font-semibold text-gray-900">Project Manager Share</span>
                          <span className="ml-auto text-xs text-gray-500">{bonusRecord.pm_bonus_percentage}%</span>
                        </div>
                        <div className="text-3xl font-bold text-teal-700">
                          ${bonusRecord.pm_bonus_amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </div>
                        {project.pm_name && (
                          <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                            <UserCheck className="w-3 h-3" />
                            {project.pm_name}
                          </div>
                        )}
                        <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
                          <div className="bg-teal-500 h-1.5 rounded-full" style={{ width: `${bonusRecord.pm_bonus_percentage}%` }} />
                        </div>
                      </div>
                    </div>

                    {/* Tier Reference Guide */}
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5" />
                        Tier Reference
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                        <div className={`rounded-lg border p-3 text-center ${bonusRecord.on_target_bonus ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-300' : 'bg-white border-gray-200'}`}>
                          <div className="font-semibold text-blue-700 mb-0.5">On Target</div>
                          <div className="text-gray-600">Exact hit</div>
                          <div className="font-bold text-blue-700 mt-1">Flat $150</div>
                        </div>
                        <div className={`rounded-lg border p-3 text-center ${bonusRecord.bonus_tier === 'tier_1' && !bonusRecord.on_target_bonus ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-300' : 'bg-white border-gray-200'}`}>
                          <div className="font-semibold text-amber-700 mb-0.5">Tier 1</div>
                          <div className="text-gray-600">1–5h saved</div>
                          <div className="font-bold text-amber-700 mt-1">20% of savings</div>
                        </div>
                        <div className={`rounded-lg border p-3 text-center ${bonusRecord.bonus_tier === 'tier_2' ? 'bg-teal-50 border-teal-300 ring-2 ring-teal-300' : 'bg-white border-gray-200'}`}>
                          <div className="font-semibold text-teal-700 mb-0.5">Tier 2</div>
                          <div className="text-gray-600">6–10h saved</div>
                          <div className="font-bold text-teal-700 mt-1">30% of savings</div>
                        </div>
                        <div className={`rounded-lg border p-3 text-center ${bonusRecord.bonus_tier === 'tier_3' ? 'bg-emerald-50 border-emerald-300 ring-2 ring-emerald-300' : 'bg-white border-gray-200'}`}>
                          <div className="font-semibold text-emerald-700 mb-0.5">Tier 3</div>
                          <div className="text-gray-600">11+ h saved</div>
                          <div className="font-bold text-emerald-700 mt-1">35% of savings</div>
                        </div>
                      </div>
                    </div>

                    {/* Override reason */}
                    {bonusRecord.override_reason && (
                      <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-lg p-3">
                        <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-semibold text-orange-800">Manual Override Applied</p>
                          <p className="text-xs text-orange-700 mt-0.5">{bonusRecord.override_reason}</p>
                        </div>
                      </div>
                    )}

                    {/* Approval info */}
                    {bonusRecord.approved_by_name && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        <span>Approved by <strong>{bonusRecord.approved_by_name}</strong></span>
                        <span className="ml-auto text-xs text-gray-500">
                          {new Date(bonusRecord.calculated_at).toLocaleDateString()}
                        </span>
                      </div>
                    )}

                    {/* Approval history toggle */}
                    {bonusHistory.length > 0 && (
                      <div>
                        <button
                          onClick={() => setShowBonusHistory(!showBonusHistory)}
                          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 font-medium"
                        >
                          <History className="w-4 h-4" />
                          {showBonusHistory ? 'Hide' : 'Show'} Approval History ({bonusHistory.length})
                          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showBonusHistory ? 'rotate-90' : ''}`} />
                        </button>

                        {showBonusHistory && (
                          <div className="mt-2 space-y-2">
                            {bonusHistory.map((h) => (
                              <div key={h.id} className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm">
                                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                                  h.action === 'approved' ? 'bg-green-500' :
                                  h.action === 'denied' ? 'bg-red-500' :
                                  h.action === 'override' ? 'bg-orange-500' :
                                  'bg-gray-400'
                                }`} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-gray-900 capitalize">{h.action}</span>
                                    {h.performed_by_name && <span className="text-gray-500">by {h.performed_by_name}</span>}
                                    {h.override_amount !== null && (
                                      <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">
                                        Adjusted to ${h.override_amount.toLocaleString()}
                                      </span>
                                    )}
                                  </div>
                                  {h.reason && <p className="text-xs text-gray-600 mt-0.5">{h.reason}</p>}
                                </div>
                                <span className="text-xs text-gray-400 flex-shrink-0">
                                  {new Date(h.created_at).toLocaleDateString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Work Orders Section */}
            <div className="p-6 border-t border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Wrench className="w-5 h-5 text-gray-600" />
                  Work Orders During Test & Tune Period
                  {!project.can_view_all_work_orders && (
                    <span className="text-xs font-normal text-gray-500">(Your assignments only)</span>
                  )}
                </h2>
                <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm font-medium rounded-full">
                  {workOrders.length} {project.can_view_all_work_orders ? 'total' : 'yours'}
                </span>
              </div>

              {workOrders.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Wrench className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <p>No work orders recorded during Test & Tune period</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {workOrders.map((wo) => (
                    <div key={wo.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4 hover:bg-gray-100 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-gray-900">{wo.title}</span>
                            <span className="text-sm text-gray-500">#{wo.work_order_number}</span>
                            <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                              wo.status === 'completed' ? 'bg-green-100 text-green-700' :
                              wo.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {wo.status}
                            </span>
                            <span className="px-2 py-0.5 text-xs font-medium bg-cyan-100 text-cyan-700 rounded">
                              {wo.labor_category}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            {wo.assigned_tech_name && (
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {wo.assigned_tech_name}
                              </span>
                            )}
                            {wo.scheduled_date && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {new Date(wo.scheduled_date).toLocaleDateString()}
                              </span>
                            )}
                            {wo.completed_date && (
                              <span className="flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-green-600" />
                                Completed {new Date(wo.completed_date).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          {wo.notes && (
                            <p className="text-sm text-gray-600 mt-2">{wo.notes}</p>
                          )}
                        </div>
                        <div className="text-right ml-4">
                          <div className="text-lg font-bold text-gray-900">
                            {wo.actual_hours > 0 ? wo.actual_hours.toFixed(1) : wo.estimated_hours.toFixed(1)}h
                          </div>
                          <div className="text-xs text-gray-500">
                            {wo.actual_hours > 0 ? 'actual' : 'estimated'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Links Section */}
            <div className="p-6 border-t border-gray-200 bg-gray-50">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Related Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Portal Access</span>
                    <ExternalLink className="w-4 h-4 text-gray-400" />
                  </div>
                  <div className="text-lg font-bold text-gray-900">{project.portal_access_level || 'None'}</div>
                  {project.has_vip_membership && (
                    <div className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                      <Crown className="w-3 h-3" />
                      VIP Member
                    </div>
                  )}
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Punchlist Items</span>
                    <FileText className="w-4 h-4 text-gray-400" />
                  </div>
                  <div className="text-lg font-bold text-gray-900">{project.punchlist_item_count}</div>
                  <div className="text-xs text-gray-500 mt-1">Total items</div>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">Contract Value</span>
                    <DollarSign className="w-4 h-4 text-gray-400" />
                  </div>
                  <div className="text-lg font-bold text-gray-900">
                    ${project.contract_total.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">Total contract</div>
                </div>
              </div>

              {/* Contact Information */}
              <div className="mt-4 bg-white border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Customer Contact</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  {project.contact_email && (
                    <div>
                      <span className="text-gray-500">Email:</span>
                      <a href={`mailto:${project.contact_email}`} className="ml-2 text-blue-600 hover:underline">
                        {project.contact_email}
                      </a>
                    </div>
                  )}
                  {project.contact_phone && (
                    <div>
                      <span className="text-gray-500">Phone:</span>
                      <a href={`tel:${project.contact_phone}`} className="ml-2 text-blue-600 hover:underline">
                        {project.contact_phone}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={onClose}
                className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
