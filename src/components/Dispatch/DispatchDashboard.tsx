import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Users,
  ClipboardList,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  DollarSign,
  ArrowRight
} from 'lucide-react';

interface DispatchStats {
  availableTechs: number;
  clockedInTechs: number;
  activeJobs: number;
  unassignedJobs: number;
  travelBonusQueue: number;
  todayCompletions: number;
  utilization: number;
  inProgressJobs: number;
  pendingJobs: number;
  assignedJobs: number;
  clockedInNames: string[];
  clockedInOnJobNames: string[];
}

interface DispatchDashboardProps {
  onNavigate?: (tab: string) => void;
}

export function DispatchDashboard({ onNavigate }: DispatchDashboardProps) {
  const [stats, setStats] = useState<DispatchStats>({
    availableTechs: 0,
    clockedInTechs: 0,
    activeJobs: 0,
    unassignedJobs: 0,
    travelBonusQueue: 0,
    todayCompletions: 0,
    utilization: 0,
    inProgressJobs: 0,
    pendingJobs: 0,
    assignedJobs: 0,
    clockedInNames: [],
    clockedInOnJobNames: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();

    const channel = supabase
      .channel('dispatch-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, loadStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'travel_bonus_requests' }, loadStats)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_clock_entries' }, loadStats)
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, []);

  async function loadStats() {
    try {
      const today = new Date().toISOString().split('T')[0];

      const [
        workOrdersResult,
        travelBonusResult,
        completedTodayResult,
        clockedInResult,
        inProgressResult
      ] = await Promise.all([
        supabase
          .from('work_orders')
          .select('id, status, assigned_to')
          .in('status', ['assigned', 'in_progress', 'pending'])
          .eq('is_archived', false),

        supabase
          .from('travel_bonus_requests')
          .select('id')
          .eq('status', 'pending'),

        supabase
          .from('work_orders')
          .select('id')
          .eq('status', 'completed')
          .gte('updated_at', today),

        supabase
          .from('daily_clock_entries')
          .select('id, technician_id, total_hours, profiles!daily_clock_entries_technician_id_fkey(full_name)')
          .eq('entry_date', today)
          .is('clock_out', null),

        supabase
          .from('work_orders')
          .select('id, assigned_to, profiles!work_orders_assigned_to_fkey(full_name)')
          .eq('status', 'in_progress')
      ]);

      const workOrders = workOrdersResult.data || [];
      const unassignedJobs = workOrders.filter(wo => !wo.assigned_to).length;
      const pendingJobs = workOrders.filter(wo => wo.status === 'pending').length;
      const assignedJobs = workOrders.filter(wo => wo.status === 'assigned').length;
      const activeJobs = workOrders.length;

      const travelBonusQueue = travelBonusResult.data?.length || 0;
      const todayCompletions = completedTodayResult.data?.length || 0;

      const clockedInRows = clockedInResult.data || [];
      const clockedInTechs = clockedInRows.length;
      const clockedInNames = clockedInRows
        .map((r: any) => r.profiles?.full_name || 'Unknown')
        .filter(Boolean)
        .sort();

      const inProgressRows = inProgressResult.data || [];
      const inProgressJobs = inProgressRows.length;
      const clockedInOnJobNames = inProgressRows
        .map((r: any) => r.profiles?.full_name || 'Unknown')
        .filter(Boolean)
        .sort();

      const availableTechs = Math.max(0, clockedInTechs - inProgressJobs);

      const utilization = clockedInTechs > 0
        ? Math.round((inProgressJobs / clockedInTechs) * 100)
        : 0;

      setStats({
        availableTechs,
        clockedInTechs,
        activeJobs,
        unassignedJobs,
        travelBonusQueue,
        todayCompletions,
        utilization,
        inProgressJobs,
        pendingJobs,
        assignedJobs,
        clockedInNames,
        clockedInOnJobNames
      });
    } catch (error) {
      console.error('Error loading dispatch stats:', error);
    } finally {
      setLoading(false);
    }
  }

  const statCards = [
    {
      title: 'Available Techs',
      value: stats.availableTechs,
      icon: Users,
      color: 'text-success',
      bgColor: 'bg-successSoft',
      borderColor: 'border-green-200',
      subtitle: `${stats.clockedInTechs} clocked in today`,
      alert: false
    },
    {
      title: 'Active Work Orders',
      value: stats.activeJobs,
      icon: ClipboardList,
      color: 'text-info',
      bgColor: 'bg-infoSoft',
      borderColor: 'border-blue-200',
      subtitle: `${stats.inProgressJobs} in progress`,
      alert: false
    },
    {
      title: 'Unassigned Jobs',
      value: stats.unassignedJobs,
      icon: AlertCircle,
      color: stats.unassignedJobs > 0 ? 'text-danger' : 'text-muted',
      bgColor: stats.unassignedJobs > 0 ? 'bg-dangerSoft' : 'bg-surface',
      borderColor: stats.unassignedJobs > 0 ? 'border-red-300' : 'border-subtle',
      subtitle: 'Needs assignment',
      alert: stats.unassignedJobs > 0
    },
    {
      title: 'Travel Bonus Queue',
      value: stats.travelBonusQueue,
      icon: DollarSign,
      color: stats.travelBonusQueue > 0 ? 'text-attention' : 'text-muted',
      bgColor: stats.travelBonusQueue > 0 ? 'bg-attentionSoft' : 'bg-surface',
      borderColor: stats.travelBonusQueue > 0 ? 'border-orange-300' : 'border-subtle',
      subtitle: 'Pending approval',
      alert: false
    },
    {
      title: "Today's Completions",
      value: stats.todayCompletions,
      icon: CheckCircle,
      color: 'text-success',
      bgColor: 'bg-successSoft',
      borderColor: 'border-emerald-200',
      subtitle: 'Completed today',
      alert: false
    },
    {
      title: 'Tech Utilization',
      value: `${stats.utilization}%`,
      icon: TrendingUp,
      color: stats.utilization >= 80 ? 'text-success' : stats.utilization >= 50 ? 'text-warning' : 'text-muted',
      bgColor: stats.utilization >= 80 ? 'bg-successSoft' : stats.utilization >= 50 ? 'bg-warningSoft' : 'bg-surface',
      borderColor: stats.utilization >= 80 ? 'border-green-200' : stats.utilization >= 50 ? 'border-amber-200' : 'border-subtle',
      subtitle: `${stats.inProgressJobs} of ${stats.clockedInTechs} on jobs`,
      alert: false
    }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted text-sm">Loading dispatch dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-primary mb-1">Dispatch Dashboard</h2>
        <p className="text-muted text-sm">Real-time field operations overview</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.title}
              className={`bg-canvas rounded-xl border-2 ${card.borderColor} p-4 transition-all hover:shadow-md ${
                card.alert ? 'ring-2 ring-red-400 ring-opacity-60 shadow-sm' : 'shadow-sm'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className={`${card.bgColor} p-2 rounded-lg`}>
                  <Icon className={`w-4 h-4 ${card.color}`} />
                </div>
                {card.alert && (
                  <span className="w-2 h-2 bg-red-500 rounded-full mt-1 animate-pulse" />
                )}
              </div>
              <p className={`text-2xl font-bold ${card.color} leading-none mb-1`}>
                {card.value}
              </p>
              <p className="text-xs font-medium text-secondary leading-tight">{card.title}</p>
              <p className="text-xs text-muted mt-0.5">{card.subtitle}</p>
            </div>
          );
        })}
      </div>

      {/* Alert Banner */}
      {(stats.unassignedJobs > 0 || stats.travelBonusQueue > 0) && (
        <div className="bg-warningSoft border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-warning mb-1">Action Required</p>
              <div className="text-sm text-warning space-y-0.5">
                {stats.unassignedJobs > 0 && (
                  <p>{stats.unassignedJobs} job{stats.unassignedJobs !== 1 ? 's' : ''} waiting for assignment</p>
                )}
                {stats.travelBonusQueue > 0 && (
                  <p>{stats.travelBonusQueue} travel bonus request{stats.travelBonusQueue !== 1 ? 's' : ''} pending approval</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <div className="bg-canvas rounded-xl border border-subtle shadow-sm p-6">
          <h3 className="text-base font-semibold text-primary mb-4">Quick Actions</h3>
          <div className="space-y-2">
            <button
              onClick={() => onNavigate?.('schedule_board')}
              className="w-full flex items-center justify-between px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
            >
              <span>Dispatch Scheduler</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => onNavigate?.('travel_bonus')}
              className="w-full flex items-center justify-between px-4 py-3 bg-orange-700 text-white rounded-lg hover:bg-orange-800 transition-colors font-medium text-sm"
            >
              <span>Approve Travel Bonuses</span>
              {stats.travelBonusQueue > 0 && (
                <span className="bg-canvas text-attention text-xs font-bold px-2 py-0.5 rounded-full">
                  {stats.travelBonusQueue}
                </span>
              )}
            </button>
            <button
              onClick={() => onNavigate?.('daily_clock')}
              className="w-full flex items-center justify-between px-4 py-3 bg-elevated text-primary rounded-lg hover:bg-surface transition-colors font-medium text-sm"
            >
              <span>Time Clock History</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Today's Breakdown */}
        <div className="bg-canvas rounded-xl border border-subtle shadow-sm p-6">
          <h3 className="text-base font-semibold text-primary mb-4">Today at a Glance</h3>

          {/* Utilization Bar */}
          <div className="mb-5">
            <div className="flex justify-between text-xs text-muted mb-1.5">
              <span>Tech Utilization</span>
              <span className="font-medium text-secondary">{stats.utilization}%</span>
            </div>
            <div className="w-full bg-surface rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full transition-all ${
                  stats.utilization >= 80 ? 'bg-green-500' :
                  stats.utilization >= 50 ? 'bg-amber-400' : 'bg-gray-400'
                }`}
                style={{ width: `${Math.min(stats.utilization, 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted mt-1">
              {stats.inProgressJobs} of {stats.clockedInTechs} clocked-in techs currently on a job
            </p>
          </div>

          {/* Work Order Status Breakdown */}
          <div className="mb-5">
            <p className="text-xs font-medium text-muted uppercase tracking-wide mb-2">Work Order Status</p>
            <div className="space-y-1.5">
              {[
                { label: 'In Progress', value: stats.inProgressJobs, color: 'bg-blue-500' },
                { label: 'Assigned', value: stats.assignedJobs, color: 'bg-sky-400' },
                { label: 'Pending / Unassigned', value: stats.pendingJobs, color: 'bg-amber-400' },
                { label: 'Completed Today', value: stats.todayCompletions, color: 'bg-successSoft0' }
              ].map(row => (
                <div key={row.label} className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${row.color}`} />
                  <span className="text-xs text-muted flex-1">{row.label}</span>
                  <span className="text-xs font-semibold text-primary">{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Who is clocked in */}
          <div>
            <p className="text-xs font-medium text-muted uppercase tracking-wide mb-2">
              Clocked In ({stats.clockedInTechs})
            </p>
            {stats.clockedInNames.length === 0 ? (
              <p className="text-xs text-muted italic">No techs clocked in</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {stats.clockedInNames.map(name => {
                  const onJob = stats.clockedInOnJobNames.includes(name);
                  return (
                    <span
                      key={name}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        onJob
                          ? 'bg-infoSoft text-info'
                          : 'bg-successSoft text-success'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${onJob ? 'bg-blue-500' : 'bg-green-500'}`} />
                      {name}
                    </span>
                  );
                })}
              </div>
            )}
            {stats.clockedInNames.length > 0 && (
              <div className="flex gap-3 mt-2">
                <span className="flex items-center gap-1 text-xs text-muted">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  On job
                </span>
                <span className="flex items-center gap-1 text-xs text-muted">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  Available
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
