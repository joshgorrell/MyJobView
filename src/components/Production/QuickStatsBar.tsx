import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Activity, PlayCircle, Clock, AlertCircle, Wrench, CheckSquare } from 'lucide-react';

interface QuickStats {
  activeJobs: number;
  inProgress: number;
  pendingActions: number;
  myJobs: number;
  pastDue: number;
  pendingParts: number;
}

export function QuickStatsBar() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<QuickStats>({
    activeJobs: 0,
    inProgress: 0,
    pendingActions: 0,
    myJobs: 0,
    pastDue: 0,
    pendingParts: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();

    const channel = supabase
      .channel('quick-stats-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'work_orders'
      }, loadStats)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'parts_requests'
      }, loadStats)
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [profile?.id]);

  async function loadStats() {
    try {
      const today = new Date().toISOString().split('T')[0];

      const queries = [];

      queries.push(
        supabase
          .from('work_orders')
          .select('id')
          .in('status', ['assigned', 'in_progress', 'pending'])
      );

      queries.push(
        supabase
          .from('work_orders')
          .select('id')
          .eq('status', 'in_progress')
      );

      queries.push(
        supabase
          .from('work_orders')
          .select('id')
          .in('status', ['assigned', 'in_progress'])
          .lt('target_completion_date', today)
      );

      queries.push(
        supabase
          .from('parts_requests')
          .select('id')
          .eq('status', 'pending')
      );

      if (profile?.role === 'tech') {
        queries.push(
          supabase
            .from('work_orders')
            .select('id')
            .eq('assigned_to', profile.id)
            .in('status', ['assigned', 'in_progress'])
        );
      }

      const results = await Promise.all(queries);

      const activeJobs = results[0].data?.length || 0;
      const inProgress = results[1].data?.length || 0;
      const pastDue = results[2].data?.length || 0;
      const pendingParts = results[3].data?.length || 0;
      const myJobs = results[4]?.data?.length || 0;

      const pendingActions = pendingParts;

      setStats({
        activeJobs,
        inProgress,
        pendingActions,
        myJobs,
        pastDue,
        pendingParts
      });
    } catch (error) {
      console.error('Error loading quick stats:', error);
    } finally {
      setLoading(false);
    }
  }

  const isTech = profile?.role === 'tech';
  const isManager = profile?.role === 'admin' || profile?.role === 'office_manager' || profile?.role === 'production_manager';

  if (loading) {
    return (
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="text-sm text-gray-500">Loading stats...</div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200 px-6 py-3">
      <div className="flex items-center gap-6 overflow-x-auto">
        {isTech ? (
          <>
            <div className="flex items-center gap-2 whitespace-nowrap">
              <Wrench className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">My Jobs:</span>
              <span className="text-lg font-bold text-blue-600">{stats.myJobs}</span>
            </div>
            <div className="h-6 w-px bg-gray-300" />
            <div className="flex items-center gap-2 whitespace-nowrap">
              <PlayCircle className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-gray-700">In Progress:</span>
              <span className="text-lg font-bold text-green-600">{stats.inProgress}</span>
            </div>
            {stats.pendingParts > 0 && (
              <>
                <div className="h-6 w-px bg-gray-300" />
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <CheckSquare className="w-4 h-4 text-orange-600" />
                  <span className="text-sm font-medium text-gray-700">Pending Parts:</span>
                  <span className="text-lg font-bold text-orange-600">{stats.pendingParts}</span>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 whitespace-nowrap">
              <Activity className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">Active Jobs:</span>
              <span className="text-lg font-bold text-blue-600">{stats.activeJobs}</span>
            </div>
            <div className="h-6 w-px bg-gray-300" />
            <div className="flex items-center gap-2 whitespace-nowrap">
              <PlayCircle className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-gray-700">In Progress:</span>
              <span className="text-lg font-bold text-green-600">{stats.inProgress}</span>
            </div>
            {stats.pendingActions > 0 && (
              <>
                <div className="h-6 w-px bg-gray-300" />
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <Clock className="w-4 h-4 text-orange-600" />
                  <span className="text-sm font-medium text-gray-700">Pending Actions:</span>
                  <span className="text-lg font-bold text-orange-600">{stats.pendingActions}</span>
                </div>
              </>
            )}
            {stats.pastDue > 0 && (
              <>
                <div className="h-6 w-px bg-gray-300" />
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <AlertCircle className="w-4 h-4 text-red-600" />
                  <span className="text-sm font-medium text-gray-700">Past Due:</span>
                  <span className="text-lg font-bold text-red-600">{stats.pastDue}</span>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
