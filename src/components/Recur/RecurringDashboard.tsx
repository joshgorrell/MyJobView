import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import { DollarSign, Users, TrendingUp, AlertCircle, Calendar, Shield, Award, Receipt } from 'lucide-react';

interface DashboardStats {
  totalActiveSubscriptions: number;
  monthlyRecurringRevenue: number;
  upcomingBillings: number;
  overdueInvoices: number;
  avgSubscriptionValue: number;
  newThisMonth: number;
  annualSubscriptions: number;
  monthlySubscriptions: number;
  annualRevenue: number;
  monthlyRevenue: number;
  combinedInvoices: number;
}

interface TypeStats {
  activeSubscriptions: number;
  monthlyRecurringRevenue: number;
  avgSubscriptionValue: number;
}

export default function RecurringDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalActiveSubscriptions: 0,
    monthlyRecurringRevenue: 0,
    upcomingBillings: 0,
    overdueInvoices: 0,
    avgSubscriptionValue: 0,
    newThisMonth: 0,
    annualSubscriptions: 0,
    monthlySubscriptions: 0,
    annualRevenue: 0,
    monthlyRevenue: 0,
    combinedInvoices: 0,
  });
  const [securityStats, setSecurityStats] = useState<TypeStats>({
    activeSubscriptions: 0,
    monthlyRecurringRevenue: 0,
    avgSubscriptionValue: 0,
  });
  const [vipStats, setVipStats] = useState<TypeStats>({
    activeSubscriptions: 0,
    monthlyRecurringRevenue: 0,
    avgSubscriptionValue: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardStats();
  }, []);

  async function loadDashboardStats() {
    try {
      setLoading(true);

      const { data: subscriptions, error: subsError } = await supabase
        .from('recurring_subscriptions')
        .select('*, recurring_plans(billing_frequency, amount, plan_type)')
        .eq('status', 'active');

      if (subsError) throw subsError;

      const totalActive = subscriptions?.length || 0;

      const calculateMRR = (amount: number, frequency: string) => {
        if (frequency === 'monthly') return amount;
        if (frequency === 'yearly') return amount / 12;
        if (frequency === 'quarterly') return amount / 3;
        if (frequency === 'weekly') return amount * 4.33;
        if (frequency === 'daily') return amount * 30;
        return 0;
      };

      let mrr = 0;
      let securityMRR = 0;
      let vipMRR = 0;
      let securityCount = 0;
      let vipCount = 0;

      subscriptions?.forEach((sub: any) => {
        const amount = sub.custom_amount || sub.recurring_plans?.amount || 0;
        const frequency = sub.recurring_plans?.billing_frequency || 'monthly';
        const planType = sub.recurring_plans?.plan_type;
        const subMRR = calculateMRR(amount, frequency);

        mrr += subMRR;

        if (planType === 'security_contract') {
          securityMRR += subMRR;
          securityCount++;
        } else if (planType === 'vip_plan') {
          vipMRR += subMRR;
          vipCount++;
        }
      });

      const avgValue = totalActive > 0 ? mrr / totalActive : 0;

      setSecurityStats({
        activeSubscriptions: securityCount,
        monthlyRecurringRevenue: securityMRR,
        avgSubscriptionValue: securityCount > 0 ? securityMRR / securityCount : 0,
      });

      setVipStats({
        activeSubscriptions: vipCount,
        monthlyRecurringRevenue: vipMRR,
        avgSubscriptionValue: vipCount > 0 ? vipMRR / vipCount : 0,
      });

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: newSubs } = await supabase
        .from('recurring_subscriptions')
        .select('id')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .eq('status', 'active');

      const today = new Date().toISOString().split('T')[0];
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const { data: upcoming } = await supabase
        .from('recurring_subscriptions')
        .select('id')
        .eq('status', 'active')
        .gte('next_billing_date', today)
        .lte('next_billing_date', thirtyDaysFromNow.toISOString().split('T')[0]);

      // Load billing preference breakdown
      const { data: prefs } = await supabase
        .from('customer_billing_preferences')
        .select('billing_preference');
      const annualCount = prefs?.filter((p: any) => p.billing_preference === 'annual').length || 0;
      const monthlyCount = prefs?.filter((p: any) => p.billing_preference === 'monthly').length || 0;

      // Count combined invoices (invoices with multiple line items from recurring billing)
      const { count: combinedCount } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('invoice_type', 'recurring')
        .gte('created_at', thirtyDaysAgo.toISOString());

      setStats({
        totalActiveSubscriptions: totalActive,
        monthlyRecurringRevenue: mrr,
        upcomingBillings: upcoming?.length || 0,
        overdueInvoices: 0,
        avgSubscriptionValue: avgValue,
        newThisMonth: newSubs?.length || 0,
        annualSubscriptions: annualCount,
        monthlySubscriptions: monthlyCount,
        annualRevenue: annualCount * (mrr / Math.max(totalActive, 1)) * 12,
        monthlyRevenue: monthlyCount * (mrr / Math.max(totalActive, 1)),
        combinedInvoices: combinedCount || 0,
      });
    } catch (error) {
      console.error('Error loading dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading dashboard...</div>
      </div>
    );
  }

  const statCards = [
    {
      title: 'Monthly Recurring Revenue',
      value: formatCurrency(stats.monthlyRecurringRevenue),
      icon: DollarSign,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
    },
    {
      title: 'Active Subscriptions',
      value: stats.totalActiveSubscriptions.toString(),
      icon: Users,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/10',
    },
    {
      title: 'Avg Subscription Value',
      value: formatCurrency(stats.avgSubscriptionValue),
      icon: TrendingUp,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
    },
    {
      title: 'New This Month',
      value: stats.newThisMonth.toString(),
      icon: Users,
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-500/10',
    },
    {
      title: 'Upcoming Billings (30d)',
      value: stats.upcomingBillings.toString(),
      icon: Calendar,
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-500/10',
    },
    {
      title: 'Combined Invoices (30d)',
      value: stats.combinedInvoices.toString(),
      icon: Receipt,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-4">Combined Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {statCards.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <div
                key={index}
                className="bg-gray-800 rounded-lg p-6 border border-gray-700"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-gray-400 text-sm mb-2">{stat.title}</p>
                    <p className="text-2xl font-bold text-white">{stat.value}</p>
                  </div>
                  <div className={`${stat.bgColor} ${stat.color} p-3 rounded-lg`}>
                    <Icon size={24} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gradient-to-br from-blue-900/50 to-blue-800/30 rounded-lg p-6 border border-blue-700/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-blue-500/20 p-3 rounded-lg">
              <Shield className="w-6 h-6 text-blue-400" />
            </div>
            <h3 className="text-xl font-bold text-white">Security Contracts</h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-300">Active Contracts</span>
              <span className="text-2xl font-bold text-white">{securityStats.activeSubscriptions}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-300">Monthly Revenue</span>
              <span className="text-2xl font-bold text-green-400">{formatCurrency(securityStats.monthlyRecurringRevenue)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-300">Avg Contract Value</span>
              <span className="text-xl font-semibold text-blue-300">{formatCurrency(securityStats.avgSubscriptionValue)}</span>
            </div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-purple-900/50 to-purple-800/30 rounded-lg p-6 border border-purple-700/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-purple-500/20 p-3 rounded-lg">
              <Award className="w-6 h-6 text-purple-400" />
            </div>
            <h3 className="text-xl font-bold text-white">VIP Plans</h3>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-gray-300">Active Plans</span>
              <span className="text-2xl font-bold text-white">{vipStats.activeSubscriptions}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-300">Monthly Revenue</span>
              <span className="text-2xl font-bold text-green-400">{formatCurrency(vipStats.monthlyRecurringRevenue)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-300">Avg Plan Value</span>
              <span className="text-xl font-semibold text-purple-300">{formatCurrency(vipStats.avgSubscriptionValue)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Billing Preference Breakdown */}
      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">Billing Preference Breakdown</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-blue-900/30 border border-blue-700/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-blue-300 text-sm font-medium">Monthly Billing</span>
              <span className="text-2xl font-bold text-white">{stats.monthlySubscriptions}</span>
            </div>
            <p className="text-gray-400 text-xs">Est. Monthly Revenue: {formatCurrency(stats.monthlyRevenue)}</p>
          </div>
          <div className="bg-green-900/30 border border-green-700/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-green-300 text-sm font-medium">Annual Billing</span>
              <span className="text-2xl font-bold text-white">{stats.annualSubscriptions}</span>
            </div>
            <p className="text-gray-400 text-xs">Est. Annual Revenue: {formatCurrency(stats.annualRevenue)}</p>
          </div>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-lg transition-colors">
            Create New Plan
          </button>
          <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg transition-colors">
            Add Subscription
          </button>
          <button className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-3 rounded-lg transition-colors">
            Process Billing
          </button>
          <button className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-3 rounded-lg transition-colors">
            View Reports
          </button>
        </div>
      </div>
    </div>
  );
}
