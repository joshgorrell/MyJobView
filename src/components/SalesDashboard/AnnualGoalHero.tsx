import { Target, TrendingUp, TrendingDown, Minus, Trophy } from 'lucide-react';
import { computeGoalProgress } from '../../lib/salesDashboardCalculations';
import type { SalesDashboardResult } from '../../lib/salesDashboardTypes';

interface AnnualGoalHeroProps {
  data: SalesDashboardResult;
  teamRank?: { rank: number; total: number } | null;
}

function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export function AnnualGoalHero({ data, teamRank }: AnnualGoalHeroProps) {
  const goal = computeGoalProgress(data);

  if (!goal.hasQuota) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-gray-50 to-gray-100 p-8">
        <div className="flex items-center gap-3 mb-2">
          <Target className="w-6 h-6 text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-700">Annual Goal Not Configured</h2>
        </div>
        <p className="text-sm text-gray-500">
          You have booked {formatCurrency(goal.ytdSales)} in sales, but no annual sales goal has been set.
          Contact your manager to configure your sales quota.
        </p>
      </div>
    );
  }

  const fillPct = Math.min(100, goal.pctAchieved);
  const pacePct = goal.pacePct;
  const isAhead = goal.aheadBehind >= 0;
  const TrendIcon = isAhead ? TrendingUp : TrendingDown;
  const statusColor = goal.status === 'ahead' ? 'text-green-600' : goal.status === 'on_track' ? 'text-blue-600' : 'text-red-600';
  const statusBg = goal.status === 'ahead' ? 'bg-green-50' : goal.status === 'on_track' ? 'bg-blue-50' : 'bg-red-50';
  const statusLabel = goal.status === 'ahead' ? 'Ahead of Pace' : goal.status === 'on_track' ? 'On Track' : 'Behind Pace';

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 shadow-sm">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        {/* Left: Goal summary */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-5 h-5 text-blue-600" />
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide">Annual Sales Goal</h2>
          </div>
          <div className="flex items-baseline gap-3 mb-2">
            <span className="text-3xl sm:text-4xl font-bold text-gray-900">{formatCurrency(goal.ytdSales)}</span>
            <span className="text-lg text-gray-400">/ {formatCurrency(goal.annualQuota)}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-2xl font-bold ${statusColor}`}>{goal.pctAchieved}%</span>
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${statusBg} ${statusColor}`}>
              {goal.status !== 'on_track' && <TrendIcon className="w-3 h-3" />}
              {statusLabel}
            </span>
            {teamRank && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                <Trophy className="w-3 h-3" />
                #{teamRank.rank} of {teamRank.total}
              </span>
            )}
          </div>
        </div>

        {/* Right: Pace and forecast stats */}
        <div className="grid grid-cols-2 gap-4 lg:gap-6 lg:flex lg:gap-8">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Pace</p>
            <p className="text-lg font-semibold text-gray-700">{pacePct.toFixed(0)}%</p>
            <p className={`text-xs ${isAhead ? 'text-green-600' : 'text-red-600'}`}>
              {isAhead ? '+' : ''}{formatCurrency(goal.aheadBehind)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Remaining</p>
            <p className="text-lg font-semibold text-gray-700">{formatCurrency(goal.remainingGoal)}</p>
            <p className="text-xs text-gray-400">{goal.weeksRemaining} weeks left</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Required / Week</p>
            <p className="text-lg font-semibold text-gray-700">{formatCurrency(goal.requiredWeeklySales)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Forecast</p>
            <p className="text-lg font-semibold text-gray-700">{formatCurrency(goal.forecast)}</p>
            <p className="text-xs text-gray-400">90-day run rate</p>
          </div>
        </div>
      </div>

      {/* Progress bar with pace marker */}
      <div className="mt-6 relative">
        <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              goal.status === 'ahead' ? 'bg-green-500' : goal.status === 'on_track' ? 'bg-blue-500' : 'bg-amber-500'
            }`}
            style={{ width: `${fillPct}%` }}
          />
        </div>
        {/* Pace marker */}
        <div
          className="absolute top-0 h-3 w-0.5 bg-gray-700"
          style={{ left: `${Math.min(100, pacePct)}%` }}
          title={`Pace: ${pacePct.toFixed(0)}%`}
        />
        <div className="flex justify-between mt-1.5 text-xs text-gray-400">
          <span>0%</span>
          <span className="font-medium text-gray-500">Pace: {pacePct.toFixed(0)}%</span>
          <span>100%</span>
        </div>
      </div>
    </div>
  );
}
