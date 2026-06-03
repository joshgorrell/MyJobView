import { supabase } from './supabase';

export interface TestTunePermissions {
  can_view_all_projects: boolean;
  can_edit_bonuses: boolean;
  can_override_bonuses: boolean;
  can_approve_bonuses: boolean;
  can_view_pm_metrics: boolean;
  can_view_admin_controls: boolean;
  can_view_bonus_amounts: boolean;
  can_export_data: boolean;
  user_role: string;
  is_executive: boolean;
}

export interface TestTuneProject {
  id: string;
  order_number: string;
  contact_name: string;
  contact_id: string;
  project_id: string;
  project_title: string;
  office_name: string;
  office_id: string;
  lead_tech_name: string | null;
  lead_tech_id: string | null;
  pm_name: string | null;
  pm_id: string | null;
  sales_rep_name: string | null;
  sales_rep_id: string | null;
  test_tune_start_date: string;
  test_tune_end_date: string;
  days_remaining: number;
  total_estimated_labor: number;
  field_labor_target: number;
  pm_allocation_hours: number;
  field_performance_hours: number;
  excluded_hours: number;
  hours_remaining: number;
  percentage_of_target: number;
  status_indicator: 'on_track' | 'warning' | 'over';
  target_recalculated: boolean;
  user_can_view: boolean;
  user_relationship: string;
  sales_rep_eligible: boolean | null;
  effective_labor_rate: number | null;
  effective_rate_threshold: number;
  elr_override_active: boolean;
  labor_savings_pct: number | null;
  bonus_tier_type: 'flat_hours' | 'pct_of_estimated';
}

export interface TestTuneStats {
  total_projects: number;
  projects_on_track: number;
  projects_at_risk: number;
  projects_over_budget: number;
  avg_efficiency_percentage: number;
  total_labor_savings: number;
  total_margin_drag: number;
  estimated_bonus_pool: number;
}

export interface PMMetrics {
  total_projects: number;
  completed_projects: number;
  first_time_completions: number;
  first_time_completion_rate: number;
  total_post_completion_hours: number;
  avg_post_completion_hours: number;
  total_labor_drag_cost: number;
  total_labor_savings: number;
  projects_on_track: number;
  projects_at_risk: number;
  projects_over_budget: number;
}

/**
 * Get user's Test & Tune permissions based on their role
 */
export async function getUserTestTunePermissions(userId: string): Promise<TestTunePermissions | null> {
  try {
    const { data, error } = await supabase.rpc('get_user_test_tune_permissions', {
      p_user_id: userId
    });

    if (error) throw error;
    return data?.[0] || null;
  } catch (error) {
    console.error('Error getting Test & Tune permissions:', error);
    return null;
  }
}

/**
 * Get Test & Tune projects filtered by user's role
 */
export async function getTestTuneProjectsForUser(
  userId: string,
  includeExpired: boolean = false
): Promise<TestTuneProject[]> {
  try {
    const { data, error } = await supabase.rpc('get_test_tune_projects_for_user', {
      p_user_id: userId,
      include_expired: includeExpired
    });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting Test & Tune projects:', error);
    return [];
  }
}

/**
 * Get aggregate stats for user's visible Test & Tune projects
 */
export async function getTestTuneStatsForUser(userId: string): Promise<TestTuneStats | null> {
  try {
    const { data, error } = await supabase.rpc('get_test_tune_stats_for_user', {
      p_user_id: userId
    });

    if (error) throw error;
    return data?.[0] || null;
  } catch (error) {
    console.error('Error getting Test & Tune stats:', error);
    return null;
  }
}

/**
 * Check if user can view a specific project
 */
export function canViewProject(
  project: TestTuneProject,
  userId: string,
  userRole: string
): boolean {
  // Admins and finance can view all
  if (userRole === 'admin' || userRole === 'finance') {
    return true;
  }

  // Use the user_can_view flag from the database function
  return project.user_can_view;
}

/**
 * Get visible table columns based on user's role
 */
export function getVisibleColumns(permissions: TestTunePermissions): {
  showOffice: boolean;
  showLeadTech: boolean;
  showPM: boolean;
  showSalesRep: boolean;
  showPMMetrics: boolean;
  showBonusAmounts: boolean;
  showAdminControls: boolean;
} {
  const { user_role, can_view_pm_metrics, can_view_bonus_amounts, can_view_admin_controls } = permissions;

  return {
    // Office column - hide for techs (they only see their projects)
    showOffice: user_role !== 'tech',

    // Lead Tech column - hide for techs (they already know it's them)
    showLeadTech: user_role !== 'tech',

    // PM column - show to managers and admins
    showPM: can_view_pm_metrics,

    // Sales Rep column - hide for sales (they only see their own)
    showSalesRep: user_role !== 'sales',

    // PM-specific metrics (office stats, PM performance)
    showPMMetrics: can_view_pm_metrics,

    // Bonus amounts - techs and PMs see their own, sales don't see any
    showBonusAmounts: can_view_bonus_amounts,

    // Admin override controls
    showAdminControls: can_view_admin_controls
  };
}

/**
 * Get visible filters based on user's role
 */
export function getVisibleFilters(permissions: TestTunePermissions): {
  showOfficeFilter: boolean;
  showPMFilter: boolean;
  showTechFilter: boolean;
  showSalesFilter: boolean;
} {
  const { user_role, can_view_all_projects } = permissions;

  return {
    // Office filter - show to admins and managers who can see multiple offices
    showOfficeFilter: can_view_all_projects,

    // PM filter - show to admins and managers
    showPMFilter: user_role === 'admin' || user_role === 'finance' || user_role === 'manager' || user_role === 'service_manager',

    // Tech filter - show to admins and managers
    showTechFilter: user_role === 'admin' || user_role === 'finance' || user_role === 'manager' || user_role === 'service_manager',

    // Sales filter - show to admins only
    showSalesFilter: user_role === 'admin' || user_role === 'finance'
  };
}

/**
 * Get role-specific empty state message
 */
export function getEmptyStateMessage(permissions: TestTunePermissions): string {
  const { user_role } = permissions;

  switch (user_role) {
    case 'tech':
      return 'You have no projects currently in the 90-Day Test & Tune period.';
    case 'manager':
    case 'service_manager':
      return 'Your office has no projects currently in the 90-Day Test & Tune period.';
    case 'sales':
      return 'You have no sales orders currently in the 90-Day Test & Tune period.';
    case 'admin':
    case 'finance':
      return 'No projects are currently in the 90-Day Test & Tune period.';
    default:
      return 'No Test & Tune projects available.';
  }
}

/**
 * Get role-specific dashboard title
 */
export function getDashboardTitle(permissions: TestTunePermissions): string {
  const { user_role, is_executive } = permissions;

  if (is_executive) {
    return 'Executive Test & Tune Performance Dashboard';
  }

  switch (user_role) {
    case 'tech':
      return 'My Test & Tune Performance';
    case 'manager':
    case 'service_manager':
      return 'Office Test & Tune Performance';
    case 'sales':
      return 'My Sales Estimation Accuracy';
    case 'admin':
    case 'finance':
      return 'Test & Tune Performance Dashboard';
    default:
      return 'Test & Tune Performance';
  }
}

/**
 * Format status indicator with appropriate color and label
 */
export function formatStatusIndicator(status: 'on_track' | 'warning' | 'over'): {
  color: string;
  label: string;
  badgeClass: string;
} {
  switch (status) {
    case 'on_track':
      return {
        color: 'text-green-600',
        label: 'On Track',
        badgeClass: 'bg-green-100 text-green-800'
      };
    case 'warning':
      return {
        color: 'text-yellow-600',
        label: 'At Risk',
        badgeClass: 'bg-yellow-100 text-yellow-800'
      };
    case 'over':
      return {
        color: 'text-red-600',
        label: 'Over Target',
        badgeClass: 'bg-red-100 text-red-800'
      };
    default:
      return {
        color: 'text-gray-600',
        label: 'Unknown',
        badgeClass: 'bg-gray-100 text-gray-800'
      };
  }
}

/**
 * Calculate the effective labor rate for a job.
 * Effective Labor Rate = Total Labor Revenue / Total Estimated Labor Hours
 */
export function calculateEffectiveLaborRate(
  totalLaborRevenue: number,
  totalEstimatedHours: number
): number {
  if (totalEstimatedHours <= 0) return 0;
  return totalLaborRevenue / totalEstimatedHours;
}

/**
 * Check if a sales rep is eligible for their sales bonus on a given job.
 * Returns false if effective labor rate is below the admin-configured threshold.
 * Operations (Lead Tech, PM) bonuses are NOT affected by this check.
 */
export function isSalesRepEligible(
  effectiveLaborRate: number,
  minThreshold: number
): boolean {
  return effectiveLaborRate >= minThreshold;
}

/**
 * Calculate projected bonus for a project (simplified estimate).
 *
 * Rule: Bonus is ONLY paid when Field Labor is strictly below Field Target.
 * No bonus is paid when on target (hours_remaining = 0) or over target.
 * Formula: (Field Target − Field Labor Used) × Labor Burden Rate × Tier %
 *
 * Supports both flat_hours and pct_of_estimated tier modes.
 */
export function calculateProjectedBonus(
  project: TestTuneProject,
  laborBurdenRate: number,
  bonusSettings: any
): number {
  const hoursRemaining = project.hours_remaining;

  // No bonus if on target or over target
  if (hoursRemaining <= 0) {
    return 0;
  }

  // Calculate savings value
  const savingsAmount = hoursRemaining * laborBurdenRate;

  const tierType = bonusSettings?.bonus_tier_type ?? 'flat_hours';
  const tiers: Array<{ min_hours?: number; max_hours?: number | null; min_pct?: number; max_pct?: number | null; percentage: number }> =
    bonusSettings?.bonus_tiers_jsonb ?? [];

  // Determine tier and apply percentage
  let bonusPercentage = 0;

  if (tiers.length > 0) {
    // Compute comparison value
    const savingsPct = project.total_estimated_labor > 0
      ? (hoursRemaining / project.total_estimated_labor) * 100
      : 0;

    const comparisonValue = tierType === 'pct_of_estimated' ? savingsPct : hoursRemaining;

    for (const tier of tiers) {
      const minVal = tierType === 'pct_of_estimated' ? (tier.min_pct ?? 0) : (tier.min_hours ?? 0);
      const maxVal = tierType === 'pct_of_estimated' ? tier.max_pct : tier.max_hours;
      if (comparisonValue >= minVal && (maxVal == null || comparisonValue <= maxVal)) {
        bonusPercentage = tier.percentage;
      }
    }
  } else {
    // Fallback: legacy 3-tier flat hours
    if (hoursRemaining >= (bonusSettings?.tier_3_min_hours ?? Infinity)) {
      bonusPercentage = bonusSettings?.tier_3_percentage ?? 0;
    } else if (hoursRemaining >= (bonusSettings?.tier_2_min_hours ?? Infinity)) {
      bonusPercentage = bonusSettings?.tier_2_percentage ?? 0;
    } else if (hoursRemaining >= (bonusSettings?.tier_1_min_hours ?? Infinity)) {
      bonusPercentage = bonusSettings?.tier_1_percentage ?? 0;
    }
  }

  const rawBonus = savingsAmount * (bonusPercentage / 100);

  // Apply optional per-project cap
  if (bonusSettings?.max_bonus_pool_per_project != null && rawBonus > bonusSettings.max_bonus_pool_per_project) {
    return bonusSettings.max_bonus_pool_per_project;
  }

  return rawBonus;
}

/**
 * Get PM aggregate metrics
 */
export async function getPMMetrics(
  pmId: string,
  startDate?: string,
  endDate?: string
): Promise<PMMetrics | null> {
  try {
    const { data, error } = await supabase.rpc('calculate_pm_aggregate_metrics', {
      p_pm_id: pmId,
      p_start_date: startDate || null,
      p_end_date: endDate || null
    });

    if (error) throw error;
    return data?.[0] || null;
  } catch (error) {
    console.error('Error getting PM metrics:', error);
    return null;
  }
}

/**
 * Get projects with enhanced variance data
 */
export async function getProjectsWithVariance(
  userId: string,
  startDate?: string,
  endDate?: string,
  includeExpired: boolean = false
): Promise<any[]> {
  try {
    const { data, error } = await supabase.rpc('get_test_tune_projects_with_variance', {
      p_user_id: userId,
      p_start_date: startDate || null,
      p_end_date: endDate || null,
      p_include_expired: includeExpired
    });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting projects with variance:', error);
    return [];
  }
}

/**
 * Apply bonus override
 */
export async function applyBonusOverride(
  salesOrderId: string,
  employeeId: string,
  overrideAmount: number,
  reason: string,
  adminNotes?: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('apply_bonus_override', {
      p_sales_order_id: salesOrderId,
      p_employee_id: employeeId,
      p_override_amount: overrideAmount,
      p_reason: reason,
      p_admin_notes: adminNotes || null
    });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error applying bonus override:', error);
    throw error;
  }
}
