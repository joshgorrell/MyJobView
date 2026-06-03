import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { SalesDashboard } from './SalesDashboard';
import { PipelineBoard } from './PipelineBoard';
import { SalesActivity } from './SalesActivity';
import { SalesPerformance } from './SalesPerformance';
import { ContactsView } from '../Contacts/ContactsView';
import ProposalsView from '../Proposals/ProposalsView';
import ProjectsView from '../Projects/ProjectsView';
import { SalesBillingDashboard } from './SalesBillingDashboard';
import { SalesServiceRequestsView } from './SalesServiceRequestsView';
import { StaffSalesComparison } from './StaffSalesComparison';
import { CommissionDashboard } from '../Commissions/CommissionDashboard';
import VideoLibrary from './VideoLibrary';
import {
  LayoutDashboard,
  Target,
  Activity,
  TrendingUp,
  Users,
  FileText,
  FolderOpen,
  DollarSign,
  TrendingDown,
  Percent,
  Receipt,
  PhoneCall,
  LineChart,
  Film
} from 'lucide-react';

interface SalesViewProps {
  initialView?: string;
}

interface QuickStats {
  pipelineValue: number;
  openOpportunities: number;
  proposalsOut: number;
  conversionRate: number;
  monthlyRevenue: number;
  monthlyGoal: number;
  serviceRequestsAwaitingContact: number;
}

export function SalesView({ initialView = 'dashboard' }: SalesViewProps) {
  const { profile } = useAuth();
  const [activeView, setActiveView] = useState(initialView);
  const [quickStats, setQuickStats] = useState<QuickStats>({
    pipelineValue: 0,
    openOpportunities: 0,
    proposalsOut: 0,
    conversionRate: 0,
    monthlyRevenue: 0,
    monthlyGoal: 100000,
    serviceRequestsAwaitingContact: 0
  });

  useEffect(() => {
    loadQuickStats();

    const channel = supabase
      .channel('sales-quick-stats')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'leads'
      }, loadQuickStats)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'proposals'
      }, loadQuickStats)
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, []);

  async function loadQuickStats() {
    try {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const isManager = profile?.role === 'sales_manager' || profile?.role === 'admin';

      let leadsQuery = supabase.from('leads').select('*');
      let proposalsQuery = supabase.from('proposals').select('*');
      let srQuery = supabase
        .from('service_requests')
        .select('id', { count: 'exact', head: true })
        .is('customer_contact_confirmed_at', null)
        .not('status', 'in', '("cancelled","closed")');

      if (!isManager && profile?.id) {
        leadsQuery = leadsQuery.eq('assigned_to', profile.id);
        proposalsQuery = proposalsQuery.eq('created_by', profile.id);
        srQuery = srQuery.eq('created_by', profile.id);
      }

      const [leadsResult, proposalsResult, srResult] = await Promise.all([
        leadsQuery,
        proposalsQuery,
        srQuery
      ]);

      const leads = leadsResult.data || [];
      const proposals = proposalsResult.data || [];

      const openLeads = leads.filter(l =>
        l.status && !['closed_won', 'closed_lost', 'disqualified'].includes(l.status.toLowerCase())
      );

      const pipelineValue = openLeads.reduce((sum, lead) =>
        sum + parseFloat(lead.estimated_value || '0'), 0
      );

      const monthlyProposals = proposals.filter(p =>
        new Date(p.created_at) >= startOfMonth
      );

      const wonLeads = leads.filter(l => l.status?.toLowerCase() === 'closed_won');
      const lostLeads = leads.filter(l => l.status?.toLowerCase() === 'closed_lost');
      const totalClosed = wonLeads.length + lostLeads.length;

      const conversionRate = totalClosed > 0
        ? Math.round((wonLeads.length / totalClosed) * 100)
        : 0;

      const monthlyWon = wonLeads.filter(l =>
        l.closed_date && new Date(l.closed_date) >= startOfMonth
      );

      const monthlyRevenue = monthlyWon.reduce((sum, lead) =>
        sum + parseFloat(lead.estimated_value || '0'), 0
      );

      setQuickStats({
        pipelineValue,
        openOpportunities: openLeads.length,
        proposalsOut: monthlyProposals.length,
        conversionRate,
        monthlyRevenue,
        monthlyGoal: 100000,
        serviceRequestsAwaitingContact: srResult.count || 0
      });
    } catch (error) {
      console.error('Error loading quick stats:', error);
    }
  }

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`;
    }
    return `$${value.toFixed(0)}`;
  };

  const targetProgress = Math.min(
    Math.round((quickStats.monthlyRevenue / quickStats.monthlyGoal) * 100),
    100
  );

  const allViews = [
    {
      id: 'dashboard',
      name: 'Dashboard',
      icon: LayoutDashboard,
      component: SalesDashboard,
      badge: 0
    },
    {
      id: 'pipeline',
      name: 'Pipeline',
      icon: Target,
      component: PipelineBoard,
      badge: 0
    },
    {
      id: 'activity',
      name: 'Activity',
      icon: Activity,
      component: SalesActivity,
      badge: 0
    },
    {
      id: 'performance',
      name: 'Performance',
      icon: TrendingUp,
      component: SalesPerformance,
      badge: 0
    },
    {
      id: 'contacts',
      name: 'Contacts',
      icon: Users,
      component: ContactsView,
      badge: 0
    },
    {
      id: 'proposals',
      name: 'Proposals',
      icon: FileText,
      component: ProposalsView,
      badge: quickStats.proposalsOut
    },
    {
      id: 'projects',
      name: 'Projects',
      icon: FolderOpen,
      component: ProjectsView,
      badge: 0
    },
    {
      id: 'billing',
      name: 'Billing',
      icon: Receipt,
      component: SalesBillingDashboard,
      badge: 0
    },
    {
      id: 'service_requests',
      name: 'Service Requests',
      icon: PhoneCall,
      component: SalesServiceRequestsView,
      badge: quickStats.serviceRequestsAwaitingContact
    },
    // Monthly Sales tab - only visible to admin/manager/sales_manager/finance
    ...(profile?.role && ['admin', 'manager', 'sales_manager', 'finance'].includes(profile.role) ? [{
      id: 'monthly_sales',
      name: 'Monthly Sales',
      icon: LineChart,
      component: StaffSalesComparison,
      badge: 0
    }] : []),
    // Commissions tab - visible to all sales-eligible roles (personal view of own commissions)
    ...(profile?.role && !['admin', 'manager', 'service_manager'].includes(profile.role) ? [{
      id: 'commissions',
      name: 'My Commissions',
      icon: DollarSign,
      component: CommissionDashboard,
      badge: 0
    }] : []),
    {
      id: 'video_library',
      name: 'Video Library',
      icon: Film,
      component: VideoLibrary,
      badge: 0
    }
  ];

  const views = allViews;

  const ActiveComponent = views.find(v => v.id === activeView)?.component || SalesDashboard;

  return (
    <div className="h-full flex flex-col">
      <div className="border-b border-gray-200 bg-white">
        <div className="px-6">
          <nav className="flex gap-1 overflow-x-auto">
            {views.map(view => {
              const Icon = view.icon;
              return (
                <button
                  key={view.id}
                  onClick={() => setActiveView(view.id)}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap relative ${
                    activeView === view.id
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {view.name}
                  {view.badge > 0 && (
                    <span className="absolute -top-1 -right-1 px-2 py-0.5 bg-blue-500 text-white text-xs font-bold rounded-full min-w-[1.25rem] text-center">
                      {view.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="p-6">
          <ActiveComponent />
        </div>
      </div>
    </div>
  );
}
