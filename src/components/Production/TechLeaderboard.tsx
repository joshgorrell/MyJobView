import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Trophy,
  Medal,
  TrendingUp,
  Clock,
  DollarSign,
  Award,
  Crown,
  Star,
  Target,
  BarChart3
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { TestTunePermissions } from '../../lib/testTunePermissions';

interface LeaderboardEntry {
  user_id: string;
  user_name: string;
  role: string;
  projects_count: number;
  projects_on_track: number;
  total_hours_saved: number;
  avg_efficiency_pct: number;
  total_bonus_earned: number;
  total_bonus_pending: number;
  avg_hours_saved_per_project: number;
  win_rate: number;
}

interface TechLeaderboardProps {
  permissions: TestTunePermissions;
}

type PeriodFilter = '30' | '60' | '90';
type MetricSort = 'hours_saved' | 'efficiency' | 'bonus' | 'win_rate';

const MEDAL_CONFIG = [
  { rank: 1, icon: Trophy, gradient: 'from-amber-400 to-yellow-500', text: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', label: 'Champion' },
  { rank: 2, icon: Medal, gradient: 'from-gray-300 to-slate-400', text: 'text-gray-600', bg: 'bg-gray-50 border-gray-200', label: 'Runner-up' },
  { rank: 3, icon: Award, gradient: 'from-orange-300 to-amber-400', text: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', label: 'Third' },
];

export function TechLeaderboard({ permissions }: TechLeaderboardProps) {
  const { profile } = useAuth();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodFilter>('90');
  const [metricSort, setMetricSort] = useState<MetricSort>('hours_saved');
  const [activeView, setActiveView] = useState<'techs' | 'pms'>('techs');

  useEffect(() => {
    loadLeaderboard();
  }, [period, activeView]);

  async function loadLeaderboard() {
    try {
      setLoading(true);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - parseInt(period));
      const cutoffStr = cutoffDate.toISOString().split('T')[0];

      const roleField = activeView === 'techs' ? 'lead_technician_id' : 'project_manager_id';
      const nameField = activeView === 'techs' ? 'lead_tech:profiles!lead_technician_id(full_name)' : 'pm:profiles!project_manager_id(full_name)';
      const bonusAmtField = activeView === 'techs' ? 'tech_bonus_amount' : 'pm_bonus_amount';

      const { data: bonusData, error: bonusError } = await supabase
        .from('test_tune_bonus_calculations')
        .select(`
          ${roleField},
          ${nameField},
          total_field_hours,
          field_labor_target,
          labor_savings_hours,
          total_estimated_labor,
          ${bonusAmtField},
          status,
          evaluation_date
        `)
        .gte('evaluation_date', cutoffStr)
        .not(roleField, 'is', null);

      if (bonusError) throw bonusError;

      const { data: activeData, error: activeError } = await supabase
        .rpc('get_test_tune_projects_for_user', {
          p_user_id: profile?.id,
          include_expired: false
        });

      if (activeError) {
        console.warn('Could not load active projects for leaderboard:', activeError);
      }

      const userMap = new Map<string, LeaderboardEntry>();

      (bonusData || []).forEach((row: any) => {
        const userId = row[roleField];
        if (!userId) return;

        const userName = activeView === 'techs'
          ? row.lead_tech?.full_name || 'Unknown'
          : row.pm?.full_name || 'Unknown';

        const bonusAmt = row[bonusAmtField] || 0;
        const hoursSaved = row.labor_savings_hours || 0;
        const fieldTarget = row.field_labor_target || 0;
        const fieldUsed = row.total_field_hours || 0;
        const estLabor = row.total_estimated_labor || 0;

        if (!userMap.has(userId)) {
          userMap.set(userId, {
            user_id: userId,
            user_name: userName,
            role: activeView === 'techs' ? 'Lead Technician' : 'Project Manager',
            projects_count: 0,
            projects_on_track: 0,
            total_hours_saved: 0,
            avg_efficiency_pct: 0,
            total_bonus_earned: 0,
            total_bonus_pending: 0,
            avg_hours_saved_per_project: 0,
            win_rate: 0
          });
        }

        const entry = userMap.get(userId)!;
        entry.projects_count++;

        if (hoursSaved > 0) entry.projects_on_track++;
        entry.total_hours_saved += hoursSaved;

        const efficiencyPct = fieldTarget > 0 ? (fieldUsed / fieldTarget) * 100 : 100;
        entry.avg_efficiency_pct = ((entry.avg_efficiency_pct * (entry.projects_count - 1)) + efficiencyPct) / entry.projects_count;

        if (row.status === 'paid') {
          entry.total_bonus_earned += bonusAmt;
        } else if (row.status === 'provisional' || row.status === 'approved') {
          entry.total_bonus_pending += bonusAmt;
        }
      });

      userMap.forEach(entry => {
        entry.avg_hours_saved_per_project = entry.projects_count > 0
          ? entry.total_hours_saved / entry.projects_count
          : 0;
        entry.win_rate = entry.projects_count > 0
          ? (entry.projects_on_track / entry.projects_count) * 100
          : 0;
      });

      let sorted = Array.from(userMap.values());

      if (metricSort === 'hours_saved') {
        sorted.sort((a, b) => b.total_hours_saved - a.total_hours_saved);
      } else if (metricSort === 'efficiency') {
        sorted.sort((a, b) => a.avg_efficiency_pct - b.avg_efficiency_pct);
      } else if (metricSort === 'bonus') {
        sorted.sort((a, b) => (b.total_bonus_earned + b.total_bonus_pending) - (a.total_bonus_earned + a.total_bonus_pending));
      } else if (metricSort === 'win_rate') {
        sorted.sort((a, b) => b.win_rate - a.win_rate);
      }

      setLeaderboard(sorted);
    } catch (error) {
      console.error('Error loading leaderboard:', error);
    } finally {
      setLoading(false);
    }
  }

  const myEntry = leaderboard.find(e => e.user_id === profile?.id);
  const myRank = myEntry ? leaderboard.indexOf(myEntry) + 1 : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="text-center">
          <Clock className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
          <p className="text-gray-600 text-sm">Loading leaderboard...</p>
        </div>
      </div>
    );
  }

  const getEfficiencyColor = (pct: number) => {
    if (pct <= 75) return 'text-green-600';
    if (pct <= 100) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getBarWidth = (value: number, max: number) => {
    if (max === 0) return 0;
    return Math.min(100, (value / max) * 100);
  };

  const maxHoursSaved = Math.max(...leaderboard.map(e => e.total_hours_saved), 1);
  const maxBonus = Math.max(...leaderboard.map(e => e.total_bonus_earned + e.total_bonus_pending), 1);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2">
          {(['techs', 'pms'] as const).map(view => (
            <button
              key={view}
              onClick={() => setActiveView(view)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                activeView === view
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {view === 'techs' ? 'Technicians' : 'Project Managers'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {(['30', '60', '90'] as PeriodFilter[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  period === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {p}d
              </button>
            ))}
          </div>

          <select
            value={metricSort}
            onChange={(e) => {
              setMetricSort(e.target.value as MetricSort);
              const sorted = [...leaderboard];
              if (e.target.value === 'hours_saved') sorted.sort((a, b) => b.total_hours_saved - a.total_hours_saved);
              else if (e.target.value === 'efficiency') sorted.sort((a, b) => a.avg_efficiency_pct - b.avg_efficiency_pct);
              else if (e.target.value === 'bonus') sorted.sort((a, b) => (b.total_bonus_earned + b.total_bonus_pending) - (a.total_bonus_earned + a.total_bonus_pending));
              else if (e.target.value === 'win_rate') sorted.sort((a, b) => b.win_rate - a.win_rate);
              setLeaderboard(sorted);
            }}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="hours_saved">Rank by Hours Saved</option>
            <option value="efficiency">Rank by Efficiency</option>
            <option value="bonus">Rank by Bonus Earned</option>
            <option value="win_rate">Rank by Win Rate</option>
          </select>
        </div>
      </div>

      {/* My rank banner */}
      {myEntry && myRank && (
        <div className={`rounded-xl border-2 p-4 ${
          myRank === 1 ? 'bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-300' :
          myRank === 2 ? 'bg-gradient-to-r from-gray-50 to-slate-50 border-gray-300' :
          myRank === 3 ? 'bg-gradient-to-r from-orange-50 to-amber-50 border-orange-300' :
          'bg-gradient-to-r from-blue-50 to-sky-50 border-blue-200'
        }`}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                myRank === 1 ? 'bg-amber-400 text-white' :
                myRank === 2 ? 'bg-gray-400 text-white' :
                myRank === 3 ? 'bg-orange-400 text-white' :
                'bg-blue-500 text-white'
              }`}>
                {myRank <= 3 ? (
                  myRank === 1 ? <Crown className="w-5 h-5" /> :
                  myRank === 2 ? <Star className="w-5 h-5" /> :
                  <Award className="w-5 h-5" />
                ) : myRank}
              </div>
              <div>
                <div className="font-semibold text-gray-900">Your Ranking</div>
                <div className="text-xs text-gray-600">
                  #{myRank} of {leaderboard.length} {activeView === 'techs' ? 'technicians' : 'PMs'}
                  {myRank === 1 && ' — Top Performer!'}
                  {myRank > 1 && leaderboard[0] && (
                    <span> — {(leaderboard[0].total_hours_saved - myEntry.total_hours_saved).toFixed(1)}h behind {leaderboard[0].user_name}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3 sm:gap-6 text-sm flex-wrap justify-end">
              <div className="text-center">
                <div className="font-bold text-gray-900">{myEntry.total_hours_saved.toFixed(1)}h</div>
                <div className="text-xs text-gray-500">Saved</div>
              </div>
              <div className="text-center hidden xs:block sm:block">
                <div className={`font-bold ${getEfficiencyColor(myEntry.avg_efficiency_pct)}`}>
                  {myEntry.avg_efficiency_pct.toFixed(1)}%
                </div>
                <div className="text-xs text-gray-500">Efficiency</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-green-700">{myEntry.win_rate.toFixed(0)}%</div>
                <div className="text-xs text-gray-500">Win Rate</div>
              </div>
              {permissions.can_view_bonus_amounts && (
                <div className="text-center">
                  <div className="font-bold text-amber-700">
                    ${(myEntry.total_bonus_earned + myEntry.total_bonus_pending).toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500">Bonuses</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {leaderboard.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg py-12 text-center">
          <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No leaderboard data</p>
          <p className="text-gray-400 text-sm mt-1">No evaluated bonuses found in the last {period} days.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {/* Top 3 podium */}
          {leaderboard.length >= 3 && (
            <div className="border-b border-gray-200 bg-gradient-to-b from-gray-50 to-white">
              {/* Mobile: horizontal scrollable podium */}
              <div className="flex items-end justify-center gap-1 px-2 pt-3 pb-0 overflow-x-auto">
                {[1, 0, 2].map((idx) => {
                  const entry = leaderboard[idx];
                  if (!entry) return null;
                  const rank = idx + 1;
                  const config = MEDAL_CONFIG[idx];
                  const isMe = entry.user_id === profile?.id;
                  // center podium is tallest; order: 2nd, 1st, 3rd
                  const barHeightClass = idx === 0 ? 'h-20 sm:h-28' : idx === 1 ? 'h-28 sm:h-36' : 'h-16 sm:h-24';

                  return (
                    <div
                      key={entry.user_id}
                      className={`flex flex-col items-center flex-shrink-0 w-24 sm:w-32 pb-0 ${
                        idx === 0 ? 'order-2' : idx === 1 ? 'order-1' : 'order-3'
                      } ${isMe ? 'ring-2 ring-blue-400 ring-inset rounded-t-lg' : ''}`}
                    >
                      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center bg-gradient-to-br ${config.gradient} shadow-md mb-1.5 relative flex-shrink-0`}>
                        <config.icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                        {isMe && (
                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                            <span className="text-white text-xs font-bold">Y</span>
                          </div>
                        )}
                      </div>
                      <div className="text-center mb-1.5 px-1">
                        <div className={`text-xs sm:text-sm font-bold ${isMe ? 'text-blue-700' : 'text-gray-900'} truncate w-full`}>
                          {entry.user_name.split(' ')[0]}
                        </div>
                        <div className="text-xs text-gray-500 truncate">{config.label}</div>
                      </div>
                      <div className={`${barHeightClass} w-full rounded-t-lg bg-gradient-to-t ${config.gradient} flex items-start justify-center pt-2`}>
                        <span className="text-white font-bold text-base sm:text-lg">#{rank}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Full table */}
          <div className="divide-y divide-gray-100">
            {leaderboard.map((entry, index) => {
              const rank = index + 1;
              const isMe = entry.user_id === profile?.id;
              const config = MEDAL_CONFIG[index];

              return (
                <div
                  key={entry.user_id}
                  className={`px-4 py-3 hover:bg-gray-50 transition-colors ${isMe ? 'bg-blue-50 hover:bg-blue-50' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    {/* Rank */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      rank <= 3
                        ? `bg-gradient-to-br ${config.gradient} shadow-sm`
                        : 'bg-gray-100'
                    }`}>
                      {rank <= 3 ? (
                        <config.icon className="w-4 h-4 text-white" />
                      ) : (
                        <span className="text-xs font-bold text-gray-600">{rank}</span>
                      )}
                    </div>

                    {/* Name and stats */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-sm font-semibold ${isMe ? 'text-blue-700' : 'text-gray-900'} truncate`}>
                          {entry.user_name}
                          {isMe && <span className="ml-1 text-xs font-normal text-blue-500">(you)</span>}
                        </span>
                        <span className="text-xs text-gray-500 hidden sm:inline">
                          {entry.projects_count} project{entry.projects_count !== 1 ? 's' : ''}
                        </span>
                      </div>

                      {/* Progress bar for primary metric */}
                      <div className="hidden sm:block w-full bg-gray-100 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all ${
                            rank === 1 ? 'bg-amber-400' : rank === 2 ? 'bg-gray-400' : rank === 3 ? 'bg-orange-400' : 'bg-blue-400'
                          }`}
                          style={{ width: `${getBarWidth(entry.total_hours_saved, maxHoursSaved)}%` }}
                        />
                      </div>
                    </div>

                    {/* Metrics */}
                    <div className="flex items-center gap-2 sm:gap-4 md:gap-6 flex-shrink-0">
                      <div className="text-center">
                        <div className="text-sm font-bold text-gray-900">{entry.total_hours_saved.toFixed(1)}h</div>
                        <div className="text-xs text-gray-500">Saved</div>
                      </div>
                      <div className="text-center hidden sm:block">
                        <div className={`text-sm font-bold ${getEfficiencyColor(entry.avg_efficiency_pct)}`}>
                          {entry.avg_efficiency_pct.toFixed(0)}%
                        </div>
                        <div className="text-xs text-gray-500">Efficiency</div>
                      </div>
                      <div className="text-center">
                        <div className="text-sm font-bold text-green-700">{entry.win_rate.toFixed(0)}%</div>
                        <div className="text-xs text-gray-500">Win Rate</div>
                      </div>
                      {permissions.can_view_bonus_amounts && (
                        <div className="text-center">
                          <div className="text-sm font-bold text-amber-700">
                            ${(entry.total_bonus_earned + entry.total_bonus_pending).toLocaleString()}
                          </div>
                          <div className="text-xs text-gray-500">Bonus</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 text-center">
        Ranking based on evaluated bonuses from the last {period} days. Only completed projects appear here.
      </p>
    </div>
  );
}
