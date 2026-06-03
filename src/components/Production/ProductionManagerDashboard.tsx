import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { WorkOrderDetail } from './WorkOrderDetail';
import {
  Activity,
  CheckCircle,
  Clock,
  AlertTriangle,
  Wrench,
  Award,
  Users,
  TrendingUp,
  AlertCircle,
  Package,
  Camera,
  PlayCircle,
  PauseCircle,
  CheckSquare,
  XCircle,
  BarChart2,
  Star
} from 'lucide-react';

interface DashboardStats {
  activeJobs: number;
  completedToday: number;
  inProgress: number;
  pendingParts: number;
  pendingQA: number;
  avgCompletionTime: number;
  avgQualityScore: number;
  jobsPastDue: number;
}

interface WorkOrder {
  id: string;
  work_order_number: string;
  title: string;
  status: string;
  priority: string;
  target_completion_date: string;
  contact_id: string | null;
  contact: {
    company_name: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;
  project: {
    name: string;
  } | null;
  technician: {
    full_name: string;
  } | null;
}

interface ProductRequest {
  id: string;
  request_type: string;
  priority: string;
  notes: string | null;
  work_order_id: string | null;
  work_order: {
    work_order_number: string;
    title: string;
  } | null;
  requester: {
    full_name: string;
  } | null;
  items: { product_name: string; quantity: number }[];
}

interface TopPerformer {
  id: string;
  full_name: string;
  completions: number;
  avg_quality: number;
  photos_count: number;
}

interface WeeklyStats {
  totalCompleted: number;
  totalJobPhotos: number;
  techCount: number;
  avgQualityScore: number;
}

export function ProductionManagerDashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    activeJobs: 0,
    completedToday: 0,
    inProgress: 0,
    pendingParts: 0,
    pendingQA: 0,
    avgCompletionTime: 0,
    avgQualityScore: 0,
    jobsPastDue: 0
  });
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [pendingParts, setPendingParts] = useState<ProductRequest[]>([]);
  const [topPerformers, setTopPerformers] = useState<TopPerformer[]>([]);
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStats>({
    totalCompleted: 0,
    totalJobPhotos: 0,
    techCount: 0,
    avgQualityScore: 0
  });
  const [loading, setLoading] = useState(true);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    loadDashboardData();
  }, []);

  async function loadDashboardData() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const [
        activeJobsResult,
        completedTodayResult,
        inProgressResult,
        pendingPartsResult,
        pendingQAResult,
        avgQualityResult,
        pastDueResult,
        workOrdersResult,
        partsResult,
        weeklyCompletedResult,
        weeklyPhotosResult,
        techCountResult
      ] = await Promise.all([
        supabase
          .from('work_orders')
          .select('id', { count: 'exact', head: true })
          .in('status', ['assigned', 'in_progress', 'pending'])
          .eq('is_archived', false),
        supabase
          .from('work_orders')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'completed')
          .gte('actual_completion_date', today),
        supabase
          .from('work_orders')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'in_progress')
          .eq('is_archived', false),
        supabase
          .from('product_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        supabase
          .from('job_completions')
          .select('id', { count: 'exact', head: true })
          .eq('flagged_for_review', true),
        supabase
          .from('job_completions')
          .select('quality_score')
          .gte('completed_at', weekAgo),
        supabase
          .from('work_orders')
          .select('id', { count: 'exact', head: true })
          .in('status', ['assigned', 'in_progress'])
          .lt('target_completion_date', today)
          .eq('is_archived', false),
        supabase
          .from('work_orders')
          .select(`
            id,
            work_order_number,
            title,
            status,
            priority,
            target_completion_date,
            contact_id,
            contact:contacts(company_name, first_name, last_name),
            project:projects(name),
            technician:profiles!assigned_to(full_name)
          `)
          .in('status', ['assigned', 'in_progress', 'pending'])
          .eq('is_archived', false)
          .order('target_completion_date', { ascending: true, nullsFirst: false })
          .limit(20),
        supabase
          .from('product_requests')
          .select(`
            id,
            request_type,
            priority,
            notes,
            work_order_id,
            work_order:work_orders(work_order_number, title),
            requester:profiles!requested_by(full_name),
            items:product_request_items(product_name, quantity)
          `)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('work_orders')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'completed')
          .gte('actual_completion_date', weekAgo.split('T')[0]),
        supabase
          .from('job_photos')
          .select('id', { count: 'exact', head: true })
          .gte('captured_at', weekAgo),
        supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .in('role', ['tech', 'technician', 'lead_technician'])
      ]);

      const avgQuality = avgQualityResult.data && avgQualityResult.data.length > 0
        ? avgQualityResult.data.reduce((sum: number, c: { quality_score: number }) => sum + (c.quality_score || 0), 0) / avgQualityResult.data.length
        : 0;

      setStats({
        activeJobs: activeJobsResult.count || 0,
        completedToday: completedTodayResult.count || 0,
        inProgress: inProgressResult.count || 0,
        pendingParts: pendingPartsResult.count || 0,
        pendingQA: pendingQAResult.count || 0,
        avgCompletionTime: 0,
        avgQualityScore: Math.round(avgQuality * 10) / 10,
        jobsPastDue: pastDueResult.count || 0
      });

      setWorkOrders((workOrdersResult.data as WorkOrder[]) || []);
      setPendingParts((partsResult.data as ProductRequest[]) || []);

      setWeeklyStats({
        totalCompleted: weeklyCompletedResult.count || 0,
        totalJobPhotos: weeklyPhotosResult.count || 0,
        techCount: techCountResult.count || 0,
        avgQualityScore: Math.round(avgQuality * 10) / 10
      });

      await loadTopPerformers();
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadTopPerformers() {
    try {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data: completionsData } = await supabase
        .from('job_completions')
        .select(`
          technician_id,
          quality_score,
          technician:profiles!technician_id(id, full_name)
        `)
        .gte('completed_at', weekAgo);

      const { data: photosData } = await supabase
        .from('job_photos')
        .select('technician_id')
        .gte('captured_at', weekAgo);

      if (!completionsData || completionsData.length === 0) {
        const { data: techProfiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('role', ['tech', 'technician', 'lead_technician'])
          .limit(5);

        if (techProfiles && techProfiles.length > 0) {
          const photosMap: Record<string, number> = {};
          (photosData || []).forEach((p: { technician_id: string }) => {
            if (p.technician_id) {
              photosMap[p.technician_id] = (photosMap[p.technician_id] || 0) + 1;
            }
          });

          setTopPerformers(
            techProfiles.map(p => ({
              id: p.id,
              full_name: p.full_name || 'Unknown',
              completions: 0,
              avg_quality: 0,
              photos_count: photosMap[p.id] || 0
            }))
          );
        }
        return;
      }

      const photosMap: Record<string, number> = {};
      (photosData || []).forEach((p: { technician_id: string }) => {
        if (p.technician_id) {
          photosMap[p.technician_id] = (photosMap[p.technician_id] || 0) + 1;
        }
      });

      const techMap: Record<string, { id: string; full_name: string; scores: number[]; count: number }> = {};
      completionsData.forEach((c: { technician_id: string; quality_score: number; technician: { id: string; full_name: string } | null }) => {
        if (!c.technician_id) return;
        if (!techMap[c.technician_id]) {
          techMap[c.technician_id] = {
            id: c.technician_id,
            full_name: c.technician?.full_name || 'Unknown',
            scores: [],
            count: 0
          };
        }
        techMap[c.technician_id].count++;
        if (c.quality_score) techMap[c.technician_id].scores.push(c.quality_score);
      });

      const performers: TopPerformer[] = Object.values(techMap)
        .map(t => ({
          id: t.id,
          full_name: t.full_name,
          completions: t.count,
          avg_quality: t.scores.length > 0
            ? Math.round((t.scores.reduce((a, b) => a + b, 0) / t.scores.length) * 10) / 10
            : 0,
          photos_count: photosMap[t.id] || 0
        }))
        .sort((a, b) => b.completions - a.completions || b.avg_quality - a.avg_quality)
        .slice(0, 5);

      setTopPerformers(performers);
    } catch (error) {
      console.error('Error loading top performers:', error);
    }
  }

  async function handleApprovePart(partId: string) {
    try {
      const { error } = await supabase
        .from('product_requests')
        .update({
          status: 'approved',
          assigned_to: profile?.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', partId);

      if (error) throw error;
      loadDashboardData();
    } catch (error) {
      console.error('Error approving part request:', error);
      alert('Failed to approve request');
    }
  }

  async function handleRejectPart(partId: string) {
    const reason = prompt('Rejection reason (optional):');
    try {
      const { error } = await supabase
        .from('product_requests')
        .update({
          status: 'rejected',
          assigned_to: profile?.id,
          notes: reason || 'Rejected by manager',
          updated_at: new Date().toISOString()
        })
        .eq('id', partId);

      if (error) throw error;
      loadDashboardData();
    } catch (error) {
      console.error('Error rejecting part request:', error);
      alert('Failed to reject request');
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'assigned':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'pending':
        return 'bg-gray-100 text-gray-800 border-gray-300';
      case 'on_hold':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  }

  function getPriorityBorder(priority: string) {
    switch (priority) {
      case 'urgent':
        return 'border-l-4 border-red-500';
      case 'high':
        return 'border-l-4 border-orange-500';
      case 'medium':
        return 'border-l-4 border-yellow-400';
      default:
        return 'border-l-4 border-gray-200';
    }
  }

  function getContactDisplay(wo: WorkOrder) {
    if (wo.contact?.company_name) return wo.contact.company_name;
    if (wo.contact?.first_name || wo.contact?.last_name) {
      return [wo.contact.first_name, wo.contact.last_name].filter(Boolean).join(' ');
    }
    if (wo.project?.name) return wo.project.name;
    return null;
  }

  function isOverdue(wo: WorkOrder) {
    if (!wo.target_completion_date) return false;
    return new Date(wo.target_completion_date) < new Date();
  }

  const filteredWorkOrders = statusFilter === 'all'
    ? workOrders
    : workOrders.filter(wo => wo.status === statusFilter);

  if (selectedWorkOrderId) {
    return (
      <WorkOrderDetail
        workOrderId={selectedWorkOrderId}
        onBack={() => {
          setSelectedWorkOrderId(null);
          loadDashboardData();
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3" />
        <span className="text-gray-500">Loading dashboard...</span>
      </div>
    );
  }

  const hasAlerts = stats.pendingParts > 0 || stats.pendingQA > 0 || stats.jobsPastDue > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Production Dashboard</h1>
        <p className="text-gray-300">Real-time overview of all production activity</p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <StatCard
          icon={<Activity className="w-4 h-4 text-blue-500" />}
          label="Active Jobs"
          value={stats.activeJobs}
          color="text-blue-600"
          bg="bg-blue-50"
        />
        <StatCard
          icon={<CheckCircle className="w-4 h-4 text-green-500" />}
          label="Completed"
          value={stats.completedToday}
          sub="Today"
          color="text-green-600"
          bg="bg-green-50"
        />
        <StatCard
          icon={<PlayCircle className="w-4 h-4 text-sky-500" />}
          label="In Progress"
          value={stats.inProgress}
          color="text-sky-600"
          bg="bg-sky-50"
        />
        <StatCard
          icon={<Package className="w-4 h-4 text-orange-500" />}
          label="Parts Requests"
          value={stats.pendingParts}
          color={stats.pendingParts > 0 ? 'text-orange-600' : 'text-gray-700'}
          bg={stats.pendingParts > 0 ? 'bg-orange-50' : 'bg-gray-50'}
          highlight={stats.pendingParts > 0}
        />
        <StatCard
          icon={<CheckSquare className="w-4 h-4 text-amber-500" />}
          label="Needs QA"
          value={stats.pendingQA}
          color={stats.pendingQA > 0 ? 'text-amber-600' : 'text-gray-700'}
          bg={stats.pendingQA > 0 ? 'bg-amber-50' : 'bg-gray-50'}
          highlight={stats.pendingQA > 0}
        />
        <StatCard
          icon={<Star className="w-4 h-4 text-yellow-500" />}
          label="Avg Quality"
          value={stats.avgQualityScore > 0 ? `${stats.avgQualityScore.toFixed(1)}` : '--'}
          sub="This week"
          color="text-yellow-600"
          bg="bg-yellow-50"
        />
        <StatCard
          icon={<AlertTriangle className="w-4 h-4 text-red-500" />}
          label="Past Due"
          value={stats.jobsPastDue}
          color={stats.jobsPastDue > 0 ? 'text-red-600' : 'text-gray-700'}
          bg={stats.jobsPastDue > 0 ? 'bg-red-50' : 'bg-gray-50'}
          highlight={stats.jobsPastDue > 0}
        />
        <StatCard
          icon={<Users className="w-4 h-4 text-gray-500" />}
          label="Technicians"
          value={weeklyStats.techCount}
          sub="Active"
          color="text-gray-700"
          bg="bg-gray-50"
        />
      </div>

      {/* Alerts Banner */}
      {hasAlerts && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-amber-900 mb-1">Action Required</h3>
            <ul className="text-sm text-amber-800 space-y-0.5">
              {stats.pendingParts > 0 && (
                <li>• {stats.pendingParts} parts request{stats.pendingParts > 1 ? 's' : ''} awaiting approval</li>
              )}
              {stats.pendingQA > 0 && (
                <li>• {stats.pendingQA} job{stats.pendingQA > 1 ? 's' : ''} flagged for QA review</li>
              )}
              {stats.jobsPastDue > 0 && (
                <li>• {stats.jobsPastDue} job{stats.jobsPastDue > 1 ? 's are' : ' is'} past the due date</li>
              )}
            </ul>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Active Jobs + Parts */}
        <div className="lg:col-span-2 space-y-6">

          {/* Active Jobs Board */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-gray-600" />
                <h2 className="text-lg font-bold text-gray-900">Active Jobs</h2>
                <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full text-xs font-medium">
                  {filteredWorkOrders.length}
                </span>
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="assigned">Assigned</option>
                <option value="in_progress">In Progress</option>
              </select>
            </div>

            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
              {filteredWorkOrders.length === 0 ? (
                <div className="text-center py-14">
                  <CheckCircle className="w-14 h-14 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No active jobs</p>
                  <p className="text-gray-400 text-sm mt-1">All caught up!</p>
                </div>
              ) : (
                filteredWorkOrders.map(wo => {
                  const overdue = isOverdue(wo);
                  const contactDisplay = getContactDisplay(wo);
                  return (
                    <button
                      key={wo.id}
                      onClick={() => setSelectedWorkOrderId(wo.id)}
                      className={`w-full text-left rounded-lg p-3.5 hover:bg-gray-50 transition-colors border border-gray-100 ${getPriorityBorder(wo.priority)} ${overdue ? 'bg-red-50/40' : 'bg-white'}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-semibold text-gray-900 text-sm">{wo.work_order_number}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(wo.status)}`}>
                              {wo.status.replace(/_/g, ' ')}
                            </span>
                            {wo.priority === 'urgent' && (
                              <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">Urgent</span>
                            )}
                            {overdue && (
                              <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">Overdue</span>
                            )}
                          </div>
                          <p className="text-gray-900 font-medium text-sm truncate">{wo.title}</p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                            {contactDisplay && <span>{contactDisplay}</span>}
                            {wo.technician && (
                              <>
                                {contactDisplay && <span>·</span>}
                                <span className="flex items-center gap-1">
                                  <Users className="w-3 h-3" />
                                  {wo.technician.full_name}
                                </span>
                              </>
                            )}
                            {wo.target_completion_date && (
                              <>
                                <span>·</span>
                                <span className={overdue ? 'text-red-600 font-medium' : ''}>
                                  Due {new Date(wo.target_completion_date).toLocaleDateString()}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        {wo.priority === 'urgent' && (
                          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Pending Parts / Product Requests */}
          {pendingParts.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Package className="w-5 h-5 text-orange-600" />
                <h2 className="text-lg font-bold text-gray-900">Pending Parts Requests</h2>
                <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                  {pendingParts.length}
                </span>
              </div>
              <div className="space-y-3">
                {pendingParts.map(req => {
                  const itemSummary = req.items && req.items.length > 0
                    ? req.items.map(i => `${i.product_name}${i.quantity > 1 ? ` (x${i.quantity})` : ''}`).join(', ')
                    : req.request_type || 'Parts request';

                  return (
                    <div key={req.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="font-semibold text-gray-900 text-sm truncate">{itemSummary}</h3>
                            {req.priority === 'urgent' && (
                              <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">Urgent</span>
                            )}
                            {req.priority === 'high' && (
                              <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">High</span>
                            )}
                          </div>
                          {req.work_order && (
                            <p className="text-sm text-gray-600">
                              Job: <span className="font-medium">{req.work_order.work_order_number}</span> — {req.work_order.title}
                            </p>
                          )}
                          {req.requester && (
                            <p className="text-xs text-gray-500 mt-1">Requested by: {req.requester.full_name}</p>
                          )}
                          {req.notes && (
                            <p className="text-xs text-gray-500 mt-1 italic">{req.notes}</p>
                          )}
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => handleApprovePart(req.id)}
                            className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 font-medium transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleRejectPart(req.id)}
                            className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 font-medium transition-colors"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right: Top Performers + Week Summary */}
        <div className="space-y-6">

          {/* Top Performers */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-bold text-gray-900">Top Performers</h2>
              <span className="text-xs text-gray-500 ml-auto">This week</span>
            </div>

            {topPerformers.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-500 font-medium">No completions yet</p>
                <p className="text-xs text-gray-400 mt-1">Technician rankings appear once jobs are completed</p>
              </div>
            ) : (
              <div className="space-y-2">
                {topPerformers.map((performer, index) => (
                  <div
                    key={performer.id}
                    className={`flex items-center gap-3 p-3 rounded-lg ${index === 0 ? 'bg-amber-50 border border-amber-100' : 'bg-gray-50'}`}
                  >
                    <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                      index === 0 ? 'bg-amber-400 text-white' :
                      index === 1 ? 'bg-gray-400 text-white' :
                      index === 2 ? 'bg-orange-400 text-white' :
                      'bg-gray-200 text-gray-700'
                    }`}>
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{performer.full_name}</p>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                        <span className="flex items-center gap-0.5">
                          <CheckCircle className="w-3 h-3 text-green-500" />
                          {performer.completions} jobs
                        </span>
                        {performer.avg_quality > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Star className="w-3 h-3 text-yellow-500" />
                            {performer.avg_quality.toFixed(1)}
                          </span>
                        )}
                        {performer.photos_count > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Camera className="w-3 h-3 text-blue-500" />
                            {performer.photos_count}
                          </span>
                        )}
                      </div>
                    </div>
                    {index === 0 && <Award className="w-5 h-5 text-amber-500 flex-shrink-0" />}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* This Week Summary */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <BarChart2 className="w-5 h-5 text-gray-600" />
              <h3 className="font-bold text-gray-900">This Week Summary</h3>
            </div>
            <div className="space-y-3">
              <SummaryRow label="Jobs Completed" value={weeklyStats.totalCompleted} />
              <SummaryRow label="Active Technicians" value={weeklyStats.techCount} />
              <SummaryRow
                label="Avg Quality Score"
                value={weeklyStats.avgQualityScore > 0 ? `${weeklyStats.avgQualityScore.toFixed(1)} / 5` : '—'}
              />
              <SummaryRow label="Photos Taken" value={weeklyStats.totalJobPhotos} />
              <div className="border-t border-gray-100 pt-3 mt-3">
                <SummaryRow
                  label="Completion Rate"
                  value={stats.activeJobs + weeklyStats.totalCompleted > 0
                    ? `${Math.round((weeklyStats.totalCompleted / (stats.activeJobs + weeklyStats.totalCompleted)) * 100)}%`
                    : '—'}
                  highlight
                />
              </div>
            </div>
          </div>

          {/* Job Photo Activity */}
          {weeklyStats.totalJobPhotos > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <Camera className="w-5 h-5 text-gray-600" />
                <h3 className="font-bold text-gray-900">Photo Activity</h3>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-3xl font-bold text-gray-900">{weeklyStats.totalJobPhotos}</span>
                <span className="text-sm text-gray-500">photos this week</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon, label, value, sub, color, bg, highlight
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  sub?: string;
  color: string;
  bg: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl border ${highlight ? 'border-current shadow-sm' : 'border-gray-200'} bg-white p-4`}>
      <div className={`inline-flex items-center gap-1.5 text-xs text-gray-500 mb-2 ${bg} rounded-full px-2 py-0.5`}>
        {icon}
        <span className="font-medium">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function SummaryRow({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-600">{label}</span>
      <span className={`font-semibold ${highlight ? 'text-blue-600' : 'text-gray-900'}`}>{value}</span>
    </div>
  );
}
