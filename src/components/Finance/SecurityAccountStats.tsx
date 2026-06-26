import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import { Shield, Home, Building2, DollarSign, Clock, TrendingUp, RefreshCw } from 'lucide-react';

interface ContractRow {
  id: string;
  account_type: 'residential' | 'commercial' | null;
  account_services: string[] | null;
  monthly_price: number | null;
  term_months: number | null;
  renewal_term_months: number | null;
  status: string;
}

const SERVICE_LABELS: Record<string, string> = {
  monitored_alarm: 'Monitored Alarm',
  testing_inspection: 'Testing & Inspection',
  service_agreement: 'Service Agreement',
  video_monitoring: 'Video / CCTV',
  access_control: 'Access Control',
  other: 'Other',
};

const SERVICE_COLORS: Record<string, string> = {
  monitored_alarm: 'bg-blue-500',
  testing_inspection: 'bg-teal-500',
  service_agreement: 'bg-amber-500',
  video_monitoring: 'bg-rose-500',
  access_control: 'bg-violet-500',
  other: 'bg-gray-400',
};

function StatCard({ icon: Icon, label, value, sub, color = 'blue' }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600',
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4">
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0 ${colorMap[color] ?? colorMap.blue}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-900 leading-none">{value}</div>
        <div className="text-sm font-medium text-gray-700 mt-1">{label}</div>
        {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

function HBar({ leftLabel, leftCount, rightLabel, rightCount, leftColor, rightColor }: {
  leftLabel: string;
  leftCount: number;
  rightLabel: string;
  rightCount: number;
  leftColor: string;
  rightColor: string;
}) {
  const total = leftCount + rightCount;
  const leftPct = total > 0 ? Math.round((leftCount / total) * 100) : 0;
  const rightPct = total > 0 ? 100 - leftPct : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-2 text-sm">
        <span className="font-medium text-gray-700">{leftLabel} <span className="text-gray-500">({leftCount})</span></span>
        <span className="font-medium text-gray-700">{rightLabel} <span className="text-gray-500">({rightCount})</span></span>
      </div>
      <div className="flex h-4 rounded-full overflow-hidden">
        {leftPct > 0 && (
          <div
            className={`${leftColor} transition-all duration-500 flex items-center justify-center text-white text-xs font-semibold`}
            style={{ width: `${leftPct}%` }}
          >
            {leftPct >= 10 ? `${leftPct}%` : ''}
          </div>
        )}
        {rightPct > 0 && (
          <div
            className={`${rightColor} transition-all duration-500 flex items-center justify-center text-white text-xs font-semibold`}
            style={{ width: `${rightPct}%` }}
          >
            {rightPct >= 10 ? `${rightPct}%` : ''}
          </div>
        )}
        {total === 0 && <div className="bg-gray-200 w-full" />}
      </div>
      <div className="flex justify-between mt-1 text-xs text-gray-500">
        <span>{leftPct}%</span>
        <span>{rightPct}%</span>
      </div>
    </div>
  );
}

export default function SecurityAccountStats() {
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('security_contracts')
        .select('id, account_type, account_services, monthly_price, term_months, renewal_term_months, status')
        .in('status', ['active', 'pending_approval', 'approved', 'cancelled', 'pending_customer', 'draft']);

      if (error) throw error;
      setContracts(data || []);
    } catch (err) {
      console.error('Error loading contract stats:', err);
    } finally {
      setLoading(false);
    }
  }

  const active = contracts.filter(c => c.status === 'active');
  const totalActive = active.length;

  const residentialCount = active.filter(c => c.account_type === 'residential').length;
  const commercialCount = active.filter(c => c.account_type === 'commercial').length;
  const unclassifiedCount = totalActive - residentialCount - commercialCount;

  const totalMrr = active.reduce((sum, c) => sum + (c.monthly_price ?? 0), 0);
  const residentialMrr = active
    .filter(c => c.account_type === 'residential')
    .reduce((sum, c) => sum + (c.monthly_price ?? 0), 0);
  const commercialMrr = active
    .filter(c => c.account_type === 'commercial')
    .reduce((sum, c) => sum + (c.monthly_price ?? 0), 0);

  // Service type counts — an account can have multiple
  const serviceCounts = Object.keys(SERVICE_LABELS).reduce((acc, key) => {
    acc[key] = active.filter(c => (c.account_services ?? []).includes(key)).length;
    return acc;
  }, {} as Record<string, number>);

  // Initial term distribution
  const termBuckets = [12, 24, 36, 48, 60];
  const initialTermDist = termBuckets.reduce((acc, t) => {
    acc[t] = active.filter(c => c.term_months === t).length;
    return acc;
  }, {} as Record<number, number>);
  const otherInitialTerm = active.filter(c => c.term_months && !termBuckets.includes(c.term_months)).length;

  // Renewal term distribution
  const renewalTermDist = termBuckets.reduce((acc, t) => {
    acc[t] = active.filter(c => c.renewal_term_months === t).length;
    return acc;
  }, {} as Record<number, number>);
  const otherRenewalTerm = active.filter(c => c.renewal_term_months && !termBuckets.includes(c.renewal_term_months)).length;

  const maxServiceCount = Math.max(...Object.values(serviceCounts), 1);
  const maxTermCount = Math.max(...Object.values(initialTermDist), otherInitialTerm, 1);
  const maxRenewalTermCount = Math.max(...Object.values(renewalTermDist), otherRenewalTerm, 1);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
          <p className="text-gray-500 text-sm">Loading stats...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Account Statistics</h2>
          <p className="text-sm text-gray-500 mt-0.5">Active monitoring accounts summary</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Top stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Shield} label="Total Active Accounts" value={totalActive} color="blue" />
        <StatCard icon={Home} label="Residential" value={residentialCount}
          sub={totalActive > 0 ? `${Math.round((residentialCount / totalActive) * 100)}% of active` : undefined}
          color="emerald" />
        <StatCard icon={Building2} label="Commercial" value={commercialCount}
          sub={totalActive > 0 ? `${Math.round((commercialCount / totalActive) * 100)}% of active` : undefined}
          color="blue" />
        <StatCard icon={DollarSign} label="Total Monthly RMR" value={formatCurrency(totalMrr)}
          sub={`Avg ${formatCurrency(totalActive > 0 ? totalMrr / totalActive : 0)}/acct`}
          color="amber" />
      </div>

      {/* Residential vs Commercial breakdown */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Residential vs. Commercial</h3>
        <HBar
          leftLabel="Residential"
          leftCount={residentialCount}
          rightLabel="Commercial"
          rightCount={commercialCount}
          leftColor="bg-emerald-500"
          rightColor="bg-blue-500"
        />
        {unclassifiedCount > 0 && (
          <p className="text-xs text-gray-400 mt-3">{unclassifiedCount} account{unclassifiedCount !== 1 ? 's' : ''} not yet classified</p>
        )}
        <div className="grid grid-cols-2 gap-4 mt-5 pt-4 border-t border-gray-100">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Residential MRR</div>
            <div className="text-lg font-bold text-emerald-700">${residentialMrr.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Commercial MRR</div>
            <div className="text-lg font-bold text-blue-700">${commercialMrr.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          </div>
        </div>
      </div>

      {/* Service type breakdown */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Accounts by Service Type</h3>
        <p className="text-xs text-gray-500 mb-4">One account may have multiple services</p>
        <div className="space-y-3">
          {Object.entries(SERVICE_LABELS).map(([key, label]) => {
            const count = serviceCounts[key] ?? 0;
            const pct = totalActive > 0 ? (count / totalActive) * 100 : 0;
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-700">{label}</span>
                  <span className="text-sm font-semibold text-gray-900">{count} <span className="text-gray-400 font-normal text-xs">({pct.toFixed(0)}%)</span></span>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${SERVICE_COLORS[key] ?? 'bg-gray-400'}`}
                    style={{ width: `${maxServiceCount > 0 ? (count / maxServiceCount) * 100 : 0}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Term distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Initial term */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-gray-500" />
            <h3 className="text-base font-semibold text-gray-900">Initial Contract Term</h3>
          </div>
          <div className="space-y-2">
            {termBuckets.map(months => {
              const count = initialTermDist[months] ?? 0;
              return (
                <div key={months} className="flex items-center gap-3">
                  <div className="w-14 text-xs text-gray-500 text-right flex-shrink-0">{months} mo</div>
                  <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded transition-all duration-500 flex items-center pl-2"
                      style={{ width: `${maxTermCount > 0 ? (count / maxTermCount) * 100 : 0}%`, minWidth: count > 0 ? '1.5rem' : '0' }}
                    >
                      {count > 0 && <span className="text-white text-xs font-semibold">{count}</span>}
                    </div>
                  </div>
                  {count === 0 && <span className="text-xs text-gray-400">0</span>}
                </div>
              );
            })}
            {otherInitialTerm > 0 && (
              <div className="flex items-center gap-3">
                <div className="w-14 text-xs text-gray-500 text-right flex-shrink-0">Other</div>
                <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
                  <div
                    className="h-full bg-gray-400 rounded transition-all duration-500 flex items-center pl-2"
                    style={{ width: `${(otherInitialTerm / maxTermCount) * 100}%`, minWidth: '1.5rem' }}
                  >
                    <span className="text-white text-xs font-semibold">{otherInitialTerm}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Renewal term */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-gray-500" />
            <h3 className="text-base font-semibold text-gray-900">Renewal Term</h3>
          </div>
          <div className="space-y-2">
            {termBuckets.map(months => {
              const count = renewalTermDist[months] ?? 0;
              return (
                <div key={months} className="flex items-center gap-3">
                  <div className="w-14 text-xs text-gray-500 text-right flex-shrink-0">{months} mo</div>
                  <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
                    <div
                      className="h-full bg-teal-500 rounded transition-all duration-500 flex items-center pl-2"
                      style={{ width: `${maxRenewalTermCount > 0 ? (count / maxRenewalTermCount) * 100 : 0}%`, minWidth: count > 0 ? '1.5rem' : '0' }}
                    >
                      {count > 0 && <span className="text-white text-xs font-semibold">{count}</span>}
                    </div>
                  </div>
                  {count === 0 && <span className="text-xs text-gray-400">0</span>}
                </div>
              );
            })}
            {otherRenewalTerm > 0 && (
              <div className="flex items-center gap-3">
                <div className="w-14 text-xs text-gray-500 text-right flex-shrink-0">Other</div>
                <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
                  <div
                    className="h-full bg-gray-400 rounded transition-all duration-500 flex items-center pl-2"
                    style={{ width: `${(otherRenewalTerm / maxRenewalTermCount) * 100}%`, minWidth: '1.5rem' }}
                  >
                    <span className="text-white text-xs font-semibold">{otherRenewalTerm}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {totalActive === 0 && (
        <div className="text-center py-12 text-gray-400">
          <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No active accounts yet. Stats will appear as contracts are activated.</p>
        </div>
      )}
    </div>
  );
}
