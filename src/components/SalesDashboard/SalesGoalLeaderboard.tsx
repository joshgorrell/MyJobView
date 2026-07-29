import { Trophy, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { LeaderboardResult, LeaderboardEntry } from '../../lib/salesDashboardTypes';

interface SalesGoalLeaderboardProps {
  data: LeaderboardResult | null;
  loading: boolean;
}

export function SalesGoalLeaderboard({ data, loading }: SalesGoalLeaderboardProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="w-5 h-5 text-amber-500" />
          <h3 className="text-sm font-medium text-gray-700">Goal Attainment Leaderboard</h3>
        </div>
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 rounded-lg bg-gray-100 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || !data.leaderboard || data.leaderboard.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="w-5 h-5 text-amber-500" />
          <h3 className="text-sm font-medium text-gray-700">Goal Attainment Leaderboard</h3>
        </div>
        <p className="text-sm text-gray-400 py-6 text-center">No leaderboard data available.</p>
      </div>
    );
  }

  const entries = data.leaderboard;
  const currentUserId = data.currentUserId;

  // Show top 5, plus current user if they're below 5th
  const top5 = entries.slice(0, 5);
  const currentUserEntry = entries.find((e) => e.isCurrentUser);
  const showCurrentUserExtra = currentUserEntry && currentUserEntry.rank > 5;

  function renderRow(entry: LeaderboardEntry) {
    const TrendIcon = entry.trend === 'up' ? TrendingUp : entry.trend === 'down' ? TrendingDown : Minus;
    const trendColor = entry.trend === 'up' ? 'text-green-500' : entry.trend === 'down' ? 'text-red-500' : 'text-gray-400';
    const isCurrentUser = entry.repDisplayName.includes(currentUserId) || entry.isCurrentUser;
    const rankColor = entry.rank === 1 ? 'text-amber-500' : entry.rank === 2 ? 'text-gray-400' : entry.rank === 3 ? 'text-orange-600' : 'text-gray-500';

    return (
      <div
        key={entry.rank}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
          isCurrentUser ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
        }`}
      >
        <span className={`text-lg font-bold ${rankColor} w-7 text-center`}>{entry.rank}</span>
        <span className="flex-1 text-sm font-medium text-gray-700 truncate">
          {entry.repDisplayName}
          {isCurrentUser && <span className="ml-2 text-xs text-blue-600 font-semibold">(You)</span>}
        </span>
        <span className="text-sm font-semibold text-gray-900">{entry.attainmentPct.toFixed(1)}%</span>
        <TrendIcon className={`w-4 h-4 ${trendColor}`} />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="w-5 h-5 text-amber-500" />
        <h3 className="text-sm font-medium text-gray-700">Goal Attainment Leaderboard</h3>
      </div>
      <div className="space-y-1">
        {top5.map(renderRow)}
        {showCurrentUserExtra && currentUserEntry && (
          <>
            <div className="border-t border-dashed border-gray-200 my-1" />
            {renderRow(currentUserEntry)}
          </>
        )}
      </div>
    </div>
  );
}
