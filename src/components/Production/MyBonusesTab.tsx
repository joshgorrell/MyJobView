import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Award,
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Banknote,
  Target,
  Calendar,
  User,
  FileText,
  ChevronDown,
  ChevronUp,
  Search,
  X,
  SlidersHorizontal,
  ArrowUpDown,
  MapPin,
  Navigation,
  Building2,
  ArrowRight
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { BonusPerformanceChart } from './BonusPerformanceChart';

interface BonusCalculation {
  id: string;
  sales_order_id: string;
  order_number: string;
  contact_name: string;
  office_name: string;
  evaluation_date: string;
  total_estimated_labor: number;
  field_labor_target: number;
  total_field_hours: number;
  labor_savings_hours: number;
  labor_burden_rate: number;
  total_savings_amount: number;
  bonus_tier: string;
  bonus_percentage: number;
  total_bonus_amount: number;
  tech_bonus_amount: number;
  pm_bonus_amount: number;
  lead_technician_id: string | null;
  lead_technician_name: string | null;
  project_manager_id: string | null;
  project_manager_name: string | null;
  status: string;
  notes: string | null;
  reviewed_by_name: string | null;
  review_date: string | null;
  override_reason: string | null;
  created_at: string;
}

interface BonusStats {
  total_bonuses: number;
  pending_count: number;
  approved_count: number;
  paid_count: number;
  denied_count: number;
  total_earnings: number;
  pending_earnings: number;
}

interface TravelBonus {
  id: string;
  work_order_id: string;
  from_type: 'office' | 'previous_job' | null;
  from_address: string | null;
  job_address: string;
  total_distance_miles: number;
  eligible_miles: number;
  rate_per_mile: number;
  bonus_amount: number;
  adjusted_amount: number | null;
  calculation_method: string;
  status: string;
  created_at: string;
  work_order: { title: string } | null;
}

export function MyBonusesTab() {
  const { profile } = useAuth();
  const [bonuses, setBonuses] = useState<BonusCalculation[]>([]);
  const [stats, setStats] = useState<BonusStats | null>(null);
  const [travelBonuses, setTravelBonuses] = useState<TravelBonus[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedBonus, setExpandedBonus] = useState<string | null>(null);

  // Advanced filtering state
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'status'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    loadBonuses();
    loadTravelBonuses();

    const subscription = supabase
      .channel('my_bonuses_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'test_tune_bonus_calculations',
          filter: `lead_technician_id=eq.${profile?.id}`
        },
        () => {
          loadBonuses();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'test_tune_bonus_calculations',
          filter: `project_manager_id=eq.${profile?.id}`
        },
        () => {
          loadBonuses();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [profile?.id]);

  async function loadBonuses() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('test_tune_bonus_calculations')
        .select(`
          *,
          sales_orders!inner(order_number, contact_id, office_id),
          contacts!sales_orders_contact_id_fkey(full_name),
          company_offices!sales_orders_office_id_fkey(office_name),
          lead_tech:profiles!lead_technician_id(full_name),
          project_manager:profiles!project_manager_id(full_name),
          approvals:test_tune_bonus_approvals(
            reviewed_by,
            review_date,
            override_reason,
            reviewer:profiles!reviewed_by(full_name)
          )
        `)
        .or(`lead_technician_id.eq.${profile?.id},project_manager_id.eq.${profile?.id}`)
        .order('evaluation_date', { ascending: false });

      if (error) throw error;

      const bonusesWithDetails = data.map((b: any) => ({
        id: b.id,
        sales_order_id: b.sales_order_id,
        order_number: b.sales_orders.order_number,
        contact_name: b.contacts?.full_name || 'Unknown',
        office_name: b.company_offices?.office_name || 'Unknown',
        evaluation_date: b.evaluation_date,
        total_estimated_labor: b.total_estimated_labor,
        field_labor_target: b.field_labor_target,
        total_field_hours: b.total_field_hours,
        labor_savings_hours: b.labor_savings_hours,
        labor_burden_rate: b.labor_burden_rate,
        total_savings_amount: b.total_savings_amount,
        bonus_tier: b.bonus_tier,
        bonus_percentage: b.bonus_percentage,
        total_bonus_amount: b.total_bonus_amount,
        tech_bonus_amount: b.tech_bonus_amount,
        pm_bonus_amount: b.pm_bonus_amount,
        lead_technician_id: b.lead_technician_id,
        lead_technician_name: b.lead_tech?.full_name || null,
        project_manager_id: b.project_manager_id,
        project_manager_name: b.project_manager?.full_name || null,
        status: b.status,
        notes: b.notes,
        reviewed_by_name: b.approvals?.[0]?.reviewer?.full_name || null,
        review_date: b.approvals?.[0]?.review_date || null,
        override_reason: b.approvals?.[0]?.override_reason || null,
        created_at: b.created_at
      }));

      setBonuses(bonusesWithDetails);

      const statsCalc: BonusStats = {
        total_bonuses: bonusesWithDetails.length,
        pending_count: bonusesWithDetails.filter(b => b.status === 'provisional').length,
        approved_count: bonusesWithDetails.filter(b => b.status === 'approved').length,
        paid_count: bonusesWithDetails.filter(b => b.status === 'paid').length,
        denied_count: bonusesWithDetails.filter(b => b.status === 'denied').length,
        total_earnings: bonusesWithDetails
          .filter(b => b.status === 'paid')
          .reduce((sum, b) => sum + getUserBonusAmount(b), 0),
        pending_earnings: bonusesWithDetails
          .filter(b => b.status === 'provisional' || b.status === 'approved')
          .reduce((sum, b) => sum + getUserBonusAmount(b), 0)
      };

      setStats(statsCalc);
    } catch (error) {
      console.error('Error loading bonuses:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadTravelBonuses() {
    if (!profile) return;
    try {
      const { data, error } = await supabase
        .from('travel_bonus_requests')
        .select(`
          id,
          work_order_id,
          from_type,
          from_address,
          job_address,
          total_distance_miles,
          eligible_miles,
          rate_per_mile,
          bonus_amount,
          adjusted_amount,
          calculation_method,
          status,
          created_at,
          work_order:work_orders(title)
        `)
        .eq('technician_id', profile.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTravelBonuses(data || []);
    } catch (error) {
      console.error('Error loading travel bonuses:', error);
    }
  }

  function getUserBonusAmount(bonus: BonusCalculation): number {
    const isTech = bonus.lead_technician_id === profile?.id;
    const isPM = bonus.project_manager_id === profile?.id;

    if (isTech && isPM) {
      return bonus.total_bonus_amount;
    } else if (isTech) {
      return bonus.tech_bonus_amount;
    } else if (isPM) {
      return bonus.pm_bonus_amount;
    }
    return 0;
  }

  function getUserRole(bonus: BonusCalculation): string {
    const isTech = bonus.lead_technician_id === profile?.id;
    const isPM = bonus.project_manager_id === profile?.id;

    if (isTech && isPM) {
      return 'Lead Tech & PM';
    } else if (isTech) {
      return 'Lead Technician';
    } else if (isPM) {
      return 'Project Manager';
    }
    return '';
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'provisional':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'approved':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'paid':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'denied':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'provisional':
        return <AlertCircle className="w-4 h-4" />;
      case 'approved':
        return <CheckCircle2 className="w-4 h-4" />;
      case 'paid':
        return <Banknote className="w-4 h-4" />;
      case 'denied':
        return <XCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  }

  function getTierColor(tier: string): string {
    if (tier.includes('Tier 3')) return 'text-amber-700';
    if (tier.includes('Tier 2')) return 'text-blue-700';
    if (tier.includes('Tier 1')) return 'text-green-700';
    if (tier.includes('Over Target') || tier.includes('No Bonus')) return 'text-red-600';
    return 'text-gray-700';
  }

  const filteredBonuses = bonuses
    .filter(b => {
      // Status filter
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;

      // Search filter (customer name or order number)
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesCustomer = b.contact_name.toLowerCase().includes(query);
        const matchesOrder = b.order_number.toLowerCase().includes(query);
        if (!matchesCustomer && !matchesOrder) return false;
      }

      // Date range filter
      if (startDate) {
        const bonusDate = new Date(b.evaluation_date);
        const filterDate = new Date(startDate);
        if (bonusDate < filterDate) return false;
      }
      if (endDate) {
        const bonusDate = new Date(b.evaluation_date);
        const filterDate = new Date(endDate);
        if (bonusDate > filterDate) return false;
      }

      return true;
    })
    .sort((a, b) => {
      let comparison = 0;

      if (sortBy === 'date') {
        comparison = new Date(a.evaluation_date).getTime() - new Date(b.evaluation_date).getTime();
      } else if (sortBy === 'amount') {
        const aAmount = getUserBonusAmount(a);
        const bAmount = getUserBonusAmount(b);
        comparison = aAmount - bAmount;
      } else if (sortBy === 'status') {
        const statusOrder = { paid: 0, approved: 1, provisional: 2, denied: 3 };
        comparison = (statusOrder[a.status as keyof typeof statusOrder] || 99) -
                     (statusOrder[b.status as keyof typeof statusOrder] || 99);
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

  const activeFiltersCount =
    (statusFilter !== 'all' ? 1 : 0) +
    (searchQuery ? 1 : 0) +
    (startDate ? 1 : 0) +
    (endDate ? 1 : 0);

  const clearAllFilters = () => {
    setStatusFilter('all');
    setSearchQuery('');
    setStartDate('');
    setEndDate('');
    setSortBy('date');
    setSortOrder('desc');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Clock className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
          <p className="text-gray-600">Loading your bonuses...</p>
        </div>
      </div>
    );
  }

  if (bonuses.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Award className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Bonuses Yet</h3>
          <p className="text-gray-600">
            Bonuses will appear here after the 90-day Test & Tune period for projects you work on.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Performance Chart */}
      <BonusPerformanceChart bonuses={bonuses} profileId={profile?.id || ''} />

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-3 sm:p-4">
            <div className="flex items-center justify-between mb-1 sm:mb-2">
              <span className="text-xs sm:text-sm font-medium text-blue-900">Total Bonuses</span>
              <Award className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-blue-900">{stats.total_bonuses}</div>
          </div>

          <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 border border-yellow-200 rounded-lg p-3 sm:p-4">
            <div className="flex items-center justify-between mb-1 sm:mb-2">
              <span className="text-xs sm:text-sm font-medium text-yellow-900">Pending</span>
              <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-yellow-900">{stats.pending_count}</div>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-3 sm:p-4">
            <div className="flex items-center justify-between mb-1 sm:mb-2">
              <span className="text-xs sm:text-sm font-medium text-green-900">Approved</span>
              <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-green-900">{stats.approved_count}</div>
          </div>

          <div className="bg-gradient-to-br from-cyan-50 to-cyan-100 border border-cyan-200 rounded-lg p-3 sm:p-4">
            <div className="flex items-center justify-between mb-1 sm:mb-2">
              <span className="text-xs sm:text-sm font-medium text-cyan-900">Paid</span>
              <Banknote className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-600" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-cyan-900">{stats.paid_count}</div>
          </div>

          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-lg p-3 sm:p-4">
            <div className="flex items-center justify-between mb-1 sm:mb-2">
              <span className="text-xs sm:text-sm font-medium text-emerald-900">Total Earned</span>
              <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-emerald-900">
              ${stats.total_earnings.toLocaleString()}
            </div>
          </div>

          <div className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-lg p-3 sm:p-4">
            <div className="flex items-center justify-between mb-1 sm:mb-2">
              <span className="text-xs sm:text-sm font-medium text-amber-900">Pending</span>
              <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-amber-900">
              ${stats.pending_earnings.toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* Advanced Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="space-y-4">
          {/* Search and Filter Toggle Row */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search Input */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by customer name or order number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Filter Toggle Button */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                showFilters
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span className="hidden sm:inline">Filters</span>
              {activeFiltersCount > 0 && (
                <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${
                  showFilters ? 'bg-white text-blue-600' : 'bg-blue-100 text-blue-700'
                }`}>
                  {activeFiltersCount}
                </span>
              )}
            </button>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2">
              <select
                value={`${sortBy}-${sortOrder}`}
                onChange={(e) => {
                  const [newSortBy, newSortOrder] = e.target.value.split('-');
                  setSortBy(newSortBy as 'date' | 'amount' | 'status');
                  setSortOrder(newSortOrder as 'asc' | 'desc');
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              >
                <option value="date-desc">Date (Newest First)</option>
                <option value="date-asc">Date (Oldest First)</option>
                <option value="amount-desc">Amount (High to Low)</option>
                <option value="amount-asc">Amount (Low to High)</option>
                <option value="status-asc">Status (Paid First)</option>
                <option value="status-desc">Status (Pending First)</option>
              </select>
              <ArrowUpDown className="w-4 h-4 text-gray-400" />
            </div>
          </div>

          {/* Expanded Filters */}
          {showFilters && (
            <div className="pt-4 border-t border-gray-200 space-y-4">
              {/* Status Filter Pills */}
              <div>
                <span className="text-sm font-medium text-gray-700 mb-2 block">Status:</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setStatusFilter('all')}
                    className={`px-3 py-1 text-sm font-medium rounded-full transition-colors ${
                      statusFilter === 'all'
                        ? 'bg-gray-900 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    All ({stats?.total_bonuses || 0})
                  </button>
                  <button
                    onClick={() => setStatusFilter('provisional')}
                    className={`px-3 py-1 text-sm font-medium rounded-full transition-colors ${
                      statusFilter === 'provisional'
                        ? 'bg-yellow-600 text-white'
                        : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                    }`}
                  >
                    Pending ({stats?.pending_count || 0})
                  </button>
                  <button
                    onClick={() => setStatusFilter('approved')}
                    className={`px-3 py-1 text-sm font-medium rounded-full transition-colors ${
                      statusFilter === 'approved'
                        ? 'bg-green-600 text-white'
                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                    }`}
                  >
                    Approved ({stats?.approved_count || 0})
                  </button>
                  <button
                    onClick={() => setStatusFilter('paid')}
                    className={`px-3 py-1 text-sm font-medium rounded-full transition-colors ${
                      statusFilter === 'paid'
                        ? 'bg-blue-600 text-white'
                        : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    }`}
                  >
                    Paid ({stats?.paid_count || 0})
                  </button>
                  {stats && stats.denied_count > 0 && (
                    <button
                      onClick={() => setStatusFilter('denied')}
                      className={`px-3 py-1 text-sm font-medium rounded-full transition-colors ${
                        statusFilter === 'denied'
                          ? 'bg-red-600 text-white'
                          : 'bg-red-100 text-red-700 hover:bg-red-200'
                      }`}
                    >
                      Denied ({stats.denied_count})
                    </button>
                  )}
                </div>
              </div>

              {/* Date Range Filter */}
              <div>
                <span className="text-sm font-medium text-gray-700 mb-2 block">Evaluation Date Range:</span>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-gray-600 mb-1 block">From:</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-gray-600 mb-1 block">To:</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Clear Filters Button */}
              {activeFiltersCount > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                >
                  Clear All Filters
                </button>
              )}
            </div>
          )}

          {/* Results Count */}
          <div className="flex items-center justify-between text-sm text-gray-600 pt-2 border-t border-gray-200">
            <span>
              Showing <span className="font-semibold text-gray-900">{filteredBonuses.length}</span> of{' '}
              <span className="font-semibold text-gray-900">{bonuses.length}</span> bonuses
            </span>
            {activeFiltersCount > 0 && (
              <span className="text-blue-600">
                {activeFiltersCount} filter{activeFiltersCount > 1 ? 's' : ''} active
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Bonus Cards or Empty State */}
      {filteredBonuses.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-8">
          <div className="text-center">
            <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No bonuses found</h3>
            <p className="text-gray-600 mb-4">
              No bonuses match your current filters. Try adjusting your search or filter criteria.
            </p>
            {activeFiltersCount > 0 && (
              <button
                onClick={clearAllFilters}
                className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
              >
                Clear All Filters
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredBonuses.map((bonus) => {
          const userAmount = getUserBonusAmount(bonus);
          const userRole = getUserRole(bonus);
          const isExpanded = expandedBonus === bonus.id;

          return (
            <div
              key={bonus.id}
              className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
            >
              <div className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-4 gap-3">
                  <div className="flex-1">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2">
                      <h3 className="text-base sm:text-lg font-semibold text-gray-900">
                        {bonus.contact_name}
                      </h3>
                      <span className={`inline-flex items-center gap-1 px-3 py-1 text-xs sm:text-sm font-medium rounded-full border w-fit ${getStatusColor(bonus.status)}`}>
                        {getStatusIcon(bonus.status)}
                        {bonus.status === 'provisional' ? 'Pending Approval' : bonus.status.charAt(0).toUpperCase() + bonus.status.slice(1)}
                      </span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs sm:text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3 sm:w-4 sm:h-4" />
                        #{bonus.order_number}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 sm:w-4 sm:h-4" />
                        {new Date(bonus.evaluation_date).toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3 sm:w-4 sm:h-4" />
                        {userRole}
                      </span>
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="text-2xl sm:text-3xl font-bold text-green-600">
                      ${userAmount.toLocaleString()}
                    </div>
                    <div className={`text-xs sm:text-sm font-medium ${getTierColor(bonus.bonus_tier)}`}>
                      {bonus.bonus_tier}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4">
                  <div className="bg-gray-50 rounded-lg p-2 sm:p-3">
                    <div className="text-xs text-gray-600 mb-1">Field Target</div>
                    <div className="text-base sm:text-lg font-semibold text-gray-900">
                      {bonus.field_labor_target.toFixed(1)}h
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2 sm:p-3">
                    <div className="text-xs text-gray-600 mb-1">Actual Used</div>
                    <div className={`text-base sm:text-lg font-semibold ${
                      bonus.total_field_hours > bonus.field_labor_target ? 'text-red-600' : 'text-gray-900'
                    }`}>
                      {bonus.total_field_hours.toFixed(1)}h
                    </div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-2 sm:p-3">
                    <div className="text-xs text-green-700 mb-1">Hours Saved</div>
                    <div className="text-base sm:text-lg font-semibold text-green-700 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" />
                      {bonus.labor_savings_hours.toFixed(1)}h
                    </div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-2 sm:p-3">
                    <div className="text-xs text-green-700 mb-1">Dollar Savings</div>
                    <div className="text-base sm:text-lg font-semibold text-green-700">
                      ${bonus.total_savings_amount.toLocaleString()}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setExpandedBonus(isExpanded ? null : bonus.id)}
                  className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  {isExpanded ? (
                    <>
                      <ChevronUp className="w-4 h-4" />
                      Hide Details
                    </>
                  ) : (
                    <>
                      <ChevronDown className="w-4 h-4" />
                      Show Details
                    </>
                  )}
                </button>

                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-gray-600 mb-1">Office Location</div>
                        <div className="text-sm font-medium text-gray-900">{bonus.office_name}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-600 mb-1">Labor Burden Rate</div>
                        <div className="text-sm font-medium text-gray-900">${bonus.labor_burden_rate}/hr</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-600 mb-1">Bonus Percentage</div>
                        <div className="text-sm font-medium text-gray-900">{bonus.bonus_percentage}%</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-600 mb-1">Total Bonus Pool</div>
                        <div className="text-sm font-medium text-gray-900">
                          ${bonus.total_bonus_amount.toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {bonus.lead_technician_id === profile?.id && bonus.project_manager_id === profile?.id && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                        <div className="text-sm font-medium text-blue-900 mb-2">Bonus Breakdown (You are both Lead Tech & PM):</div>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <span className="text-blue-700">Lead Tech portion:</span>
                            <span className="font-semibold text-blue-900 ml-2">
                              ${bonus.tech_bonus_amount.toLocaleString()}
                            </span>
                          </div>
                          <div>
                            <span className="text-blue-700">PM portion:</span>
                            <span className="font-semibold text-blue-900 ml-2">
                              ${bonus.pm_bonus_amount.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {bonus.reviewed_by_name && (
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="text-xs text-gray-600 mb-1">Reviewed By</div>
                        <div className="text-sm font-medium text-gray-900">{bonus.reviewed_by_name}</div>
                        {bonus.review_date && (
                          <div className="text-xs text-gray-600">
                            on {new Date(bonus.review_date).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    )}

                    {bonus.override_reason && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <div className="text-xs text-amber-700 font-medium mb-1">Override Reason</div>
                        <div className="text-sm text-amber-900">{bonus.override_reason}</div>
                      </div>
                    )}

                    {bonus.notes && (
                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="text-xs text-gray-600 font-medium mb-1">Notes</div>
                        <div className="text-sm text-gray-900">{bonus.notes}</div>
                      </div>
                    )}

                    {bonus.status === 'denied' && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <div className="text-sm font-medium text-red-900">
                          This bonus was denied and will not be paid.
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        </div>
      )}

      {/* Travel Bonuses Section */}
      <div className="pt-2 border-t border-gray-200">
        <div className="flex items-center gap-2 mb-4">
          <Navigation className="w-5 h-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">Travel Bonuses</h3>
          {travelBonuses.length > 0 && (
            <span className="text-sm text-gray-500">({travelBonuses.length})</span>
          )}
        </div>

        {travelBonuses.length === 0 ? (
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-8 text-center">
            <MapPin className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No travel bonuses yet. They are created automatically when you clock into a work order that qualifies.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {travelBonuses.map(tb => {
              const finalAmount = tb.adjusted_amount ?? tb.bonus_amount;
              const statusColors: Record<string, string> = {
                approved: 'bg-green-100 text-green-800 border-green-300',
                pending:  'bg-gray-100 text-gray-800 border-gray-300',
                denied:   'bg-red-100 text-red-800 border-red-300',
                adjusted: 'bg-yellow-100 text-yellow-800 border-yellow-300',
                paid:     'bg-blue-100 text-blue-800 border-blue-300',
              };
              const statusColor = statusColors[tb.status] || statusColors.pending;

              return (
                <div key={tb.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Work order + date */}
                      <div className="flex items-center gap-2 flex-wrap mb-3">
                        <span className="font-semibold text-gray-900 text-sm">
                          {tb.work_order?.title || 'Work Order'}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusColor}`}>
                          {tb.status.charAt(0).toUpperCase() + tb.status.slice(1)}
                        </span>
                        <span className="text-xs text-gray-400 ml-auto">
                          {new Date(tb.created_at).toLocaleDateString()}
                        </span>
                      </div>

                      {/* Route display */}
                      <div className="flex items-start gap-2 mb-3">
                        <div className="flex flex-col gap-0.5 flex-1 text-sm">
                          <div className="flex items-center gap-2">
                            {tb.from_type === 'previous_job' ? (
                              <Navigation className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                            ) : (
                              <Building2 className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                            )}
                            <span className="text-gray-600 truncate">{tb.from_address || 'Home Office'}</span>
                            {tb.from_type === 'previous_job' && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300 flex-shrink-0">
                                Prior Job
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 pl-1 text-gray-400">
                            <ArrowRight className="w-3 h-3" />
                          </div>
                          <div className="flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                            <span className="text-gray-600 truncate">{tb.job_address}</span>
                          </div>
                        </div>
                      </div>

                      {/* Stats row */}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                        <span>{tb.total_distance_miles.toFixed(1)} mi total</span>
                        <span>{tb.eligible_miles.toFixed(1)} mi eligible</span>
                        <span>${tb.rate_per_mile.toFixed(2)}/mi</span>
                        <span className="capitalize">{tb.calculation_method.replace('_', ' ')}{tb.from_type === 'previous_job' ? ' (job-to-job)' : ''}</span>
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <div className={`text-2xl font-bold ${tb.status === 'denied' ? 'text-red-400 line-through' : 'text-green-600'}`}>
                        ${finalAmount.toFixed(2)}
                      </div>
                      {tb.adjusted_amount !== null && tb.adjusted_amount !== tb.bonus_amount && (
                        <div className="text-xs text-gray-400 line-through">${tb.bonus_amount.toFixed(2)}</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
