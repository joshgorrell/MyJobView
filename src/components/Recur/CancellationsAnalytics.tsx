import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { TrendingDown, AlertCircle, Calendar, User, FileText, BarChart3, Heart } from 'lucide-react';
import { formatCurrency } from '../../lib/utils';

interface CancellationRecord {
  id: string;
  cancellation_date: string;
  effective_date: string;
  reason_category: string;
  reason_details: string | null;
  will_continue_billing: boolean;
  subscription: {
    recurring_plans: {
      plan_name: string;
      amount: number;
      billing_frequency: string;
    };
  };
  contact: {
    first_name: string;
    last_name: string;
    company_name: string;
  };
  cancelled_by: {
    username: string;
  };
}

interface ReasonStats {
  reason: string;
  count: number;
  percentage: number;
}

const REASON_LABELS: Record<string, string> = {
  too_expensive: 'Too Expensive',
  not_using_service: 'Not Using Service',
  switching_provider: 'Switching Provider',
  service_quality: 'Service Quality Issues',
  moving_relocating: 'Moving/Relocating',
  business_closed: 'Business Closed',
  financial_reasons: 'Financial Reasons',
  no_longer_needed: 'No Longer Needed',
  other: 'Other',
};

export function CancellationsAnalytics() {
  const [cancellations, setCancellations] = useState<CancellationRecord[]>([]);
  const [reasonStats, setReasonStats] = useState<ReasonStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<'all' | '30' | '90' | '365'>('all');

  const dissatisfactionReasons = ['too_expensive', 'not_using_service', 'switching_provider', 'service_quality', 'financial_reasons', 'other'];

  const isRetentionOpportunity = (reason: string) => dissatisfactionReasons.includes(reason);

  useEffect(() => {
    loadCancellations();
  }, [timeFilter]);

  async function loadCancellations() {
    try {
      setLoading(true);

      let query = supabase
        .from('subscription_cancellations')
        .select(`
          id,
          cancellation_date,
          effective_date,
          reason_category,
          reason_details,
          will_continue_billing,
          subscription_id,
          recurring_subscriptions!subscription_id (
            recurring_plans (
              plan_name,
              amount,
              billing_frequency
            ),
            contacts!recurring_subscriptions_contact_id_fkey (
              first_name,
              last_name,
              company_name
            )
          ),
          profiles!cancelled_by_user_id (
            username
          )
        `)
        .order('cancellation_date', { ascending: false });

      if (timeFilter !== 'all') {
        const daysAgo = parseInt(timeFilter);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysAgo);
        query = query.gte('cancellation_date', cutoffDate.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;

      const formattedData = (data || []).map((item: any) => ({
        id: item.id,
        cancellation_date: item.cancellation_date,
        effective_date: item.effective_date,
        reason_category: item.reason_category,
        reason_details: item.reason_details,
        will_continue_billing: item.will_continue_billing,
        subscription: {
          recurring_plans: item.recurring_subscriptions?.recurring_plans || {},
        },
        contact: item.recurring_subscriptions?.contacts || {},
        cancelled_by: item.profiles || {},
      }));

      setCancellations(formattedData);

      const reasonCounts: Record<string, number> = {};
      formattedData.forEach((c) => {
        reasonCounts[c.reason_category] = (reasonCounts[c.reason_category] || 0) + 1;
      });

      const total = formattedData.length;
      const stats: ReasonStats[] = Object.entries(reasonCounts)
        .map(([reason, count]) => ({
          reason,
          count,
          percentage: total > 0 ? (count / total) * 100 : 0,
        }))
        .sort((a, b) => b.count - a.count);

      setReasonStats(stats);
    } catch (error) {
      console.error('Error loading cancellations:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-300">Loading cancellation data...</p>
        </div>
      </div>
    );
  }

  const totalCancellations = cancellations.length;
  const totalRevenueLost = cancellations.reduce((sum, c) => {
    const amount = c.subscription?.recurring_plans?.amount || 0;
    return sum + amount;
  }, 0);
  const retentionOpportunities = cancellations.filter(c => isRetentionOpportunity(c.reason_category)).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white">Cancellation Analytics</h2>
          <p className="text-gray-300">Track and analyze subscription cancellations</p>
        </div>
        <select
          value={timeFilter}
          onChange={(e) => setTimeFilter(e.target.value as any)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="all">All Time</option>
          <option value="30">Last 30 Days</option>
          <option value="90">Last 90 Days</option>
          <option value="365">Last Year</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <TrendingDown className="w-8 h-8 text-red-600" />
            <div>
              <p className="text-sm text-gray-600">Total Cancellations</p>
              <p className="text-2xl font-bold text-white">{totalCancellations}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <Heart className="w-8 h-8 text-blue-600" />
            <div>
              <p className="text-sm text-gray-600">Retention Opportunities</p>
              <p className="text-2xl font-bold text-blue-900">{retentionOpportunities}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <AlertCircle className="w-8 h-8 text-orange-600" />
            <div>
              <p className="text-sm text-gray-600">Revenue at Risk</p>
              <p className="text-2xl font-bold text-white">
                ${totalRevenueLost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 className="w-8 h-8 text-purple-600" />
            <div>
              <p className="text-sm text-gray-600">Top Reason</p>
              <p className="text-lg font-bold text-gray-900">
                {reasonStats.length > 0 ? REASON_LABELS[reasonStats[0].reason] : 'N/A'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Cancellation Reasons Breakdown</h3>
        {reasonStats.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No cancellation data available</p>
        ) : (
          <div className="space-y-3">
            {reasonStats.map((stat) => (
              <div key={stat.reason} className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700">
                      {REASON_LABELS[stat.reason]}
                    </span>
                    <span className="text-sm text-gray-600">
                      {stat.count} ({stat.percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{ width: `${stat.percentage}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Recent Cancellations</h3>
        </div>
        <div className="overflow-x-auto">
          {cancellations.length === 0 ? (
            <p className="text-gray-500 text-center py-12">No cancellations found</p>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Plan
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reason
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cancelled Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Effective Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {cancellations.map((cancellation) => {
                  const isRetention = isRetentionOpportunity(cancellation.reason_category);
                  return (
                    <tr
                      key={cancellation.id}
                      className={`hover:bg-gray-50 ${isRetention ? 'bg-blue-50' : ''}`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {isRetention && (
                            <Heart className="w-4 h-4 text-blue-600 flex-shrink-0" />
                          )}
                          <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {cancellation.contact?.first_name} {cancellation.contact?.last_name}
                            </div>
                            {cancellation.contact?.company_name && (
                              <div className="text-xs text-gray-500">
                                {cancellation.contact.company_name}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {cancellation.subscription?.recurring_plans?.plan_name || 'N/A'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatCurrency(cancellation.subscription?.recurring_plans?.amount || 0)} /{' '}
                          {cancellation.subscription?.recurring_plans?.billing_frequency}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            isRetention ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {REASON_LABELS[cancellation.reason_category]}
                          </span>
                          {isRetention && (
                            <span className="text-xs text-blue-700 font-medium">Retention Opportunity</span>
                          )}
                        </div>
                      </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {new Date(cancellation.cancellation_date).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(cancellation.effective_date).toLocaleDateString()}
                      {cancellation.will_continue_billing && (
                        <div className="text-xs text-orange-600 mt-1">Billing continues</div>
                      )}
                    </td>
                      <td className="px-6 py-4">
                        {cancellation.reason_details ? (
                          <div className="flex items-start gap-2 max-w-xs">
                            <FileText className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                              isRetention ? 'text-blue-500' : 'text-gray-400'
                            }`} />
                            <div>
                              <p className={`text-sm ${isRetention ? 'text-blue-900 font-medium' : 'text-gray-600'}`}>
                                {cancellation.reason_details}
                              </p>
                              {isRetention && (
                                <p className="text-xs text-blue-600 mt-1">Customer feedback provided</p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">No details</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
