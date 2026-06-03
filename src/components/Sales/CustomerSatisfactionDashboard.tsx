import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { BarChart, Bar, PieChart, Pie, Cell, Tooltip, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { ThumbsUp, AlertCircle, Users, TrendingUp, CheckCircle, Clock, Lock, Eye, EyeOff, MessageSquare, CheckCheck, RotateCcw } from 'lucide-react';

interface SatisfactionRecord {
  id: string;
  customer_name: string;
  customer_email: string;
  sales_rep_name: string;
  lead_tech_name: string;
  rating: string | null;
  comment: string | null;
  comment_public: boolean;
  sent_at: string;
  responded_at: string | null;
  follow_up_cleared_at: string | null;
  follow_up_cleared_by: string | null;
}

type DateRange = '30' | '90' | 'all';

const RATING_CONFIG = {
  excellent: { label: 'Excellent', color: '#16a34a', bg: 'bg-green-900/30', text: 'text-green-400', border: 'border-green-700/50' },
  good: { label: 'Good', color: '#2563eb', bg: 'bg-blue-900/30', text: 'text-blue-400', border: 'border-blue-700/50' },
  okay: { label: 'Okay', color: '#d97706', bg: 'bg-amber-900/30', text: 'text-amber-400', border: 'border-amber-700/50' },
  needs_attention: { label: 'Needs Attention', color: '#dc2626', bg: 'bg-red-900/30', text: 'text-red-400', border: 'border-red-700/50' },
};

function scorePercent(counts: { excellent: number; good: number; okay: number; needs_attention: number }): number {
  const total = counts.excellent + counts.good + counts.okay + counts.needs_attention;
  if (total === 0) return 0;
  const weighted = counts.excellent * 4 + counts.good * 3 + counts.okay * 2 + counts.needs_attention * 1;
  return Math.round((weighted / (total * 4)) * 100);
}

function scoreColor(pct: number) {
  if (pct >= 80) return 'text-green-400';
  if (pct >= 60) return 'text-amber-400';
  return 'text-red-400';
}

const RADIAN = Math.PI / 180;
function renderCustomPieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: {
  cx: number; cy: number; midAngle: number; innerRadius: number; outerRadius: number; percent: number; name: string;
}) {
  if (percent < 0.05) return null;
  const radius = outerRadius + 28;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="#9ca3af" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize={11}>
      {name} {(percent * 100).toFixed(0)}%
    </text>
  );
}

export function CustomerSatisfactionDashboard() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [records, setRecords] = useState<SatisfactionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>('30');
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [clearingId, setClearingId] = useState<string | null>(null);
  const [showCleared, setShowCleared] = useState(false);

  useEffect(() => {
    loadRecords();
  }, [dateRange]);

  async function loadRecords() {
    setLoading(true);
    try {
      let query = supabase
        .from('customer_satisfaction')
        .select('id, customer_name, customer_email, sales_rep_name, lead_tech_name, rating, comment, comment_public, sent_at, responded_at, follow_up_cleared_at, follow_up_cleared_by')
        .order('sent_at', { ascending: false });

      if (dateRange !== 'all') {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - parseInt(dateRange));
        query = query.gte('sent_at', cutoff.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      setRecords(data || []);
    } catch (error) {
      console.error('Error loading satisfaction records:', error);
    } finally {
      setLoading(false);
    }
  }

  async function toggleCommentVisibility(record: SatisfactionRecord) {
    setTogglingId(record.id);
    try {
      const { error } = await supabase
        .from('customer_satisfaction')
        .update({ comment_public: !record.comment_public })
        .eq('id', record.id);
      if (error) throw error;
      setRecords(prev => prev.map(r => r.id === record.id ? { ...r, comment_public: !r.comment_public } : r));
    } catch (err) {
      console.error('Error toggling comment visibility:', err);
    } finally {
      setTogglingId(null);
    }
  }

  async function clearFollowUp(id: string) {
    setClearingId(id);
    try {
      const { error } = await supabase
        .from('customer_satisfaction')
        .update({ follow_up_cleared_at: new Date().toISOString(), follow_up_cleared_by: profile?.id })
        .eq('id', id);
      if (error) throw error;
      setRecords(prev => prev.map(r => r.id === id
        ? { ...r, follow_up_cleared_at: new Date().toISOString(), follow_up_cleared_by: profile?.id ?? null }
        : r
      ));
    } catch (err) {
      console.error('Error clearing follow-up:', err);
    } finally {
      setClearingId(null);
    }
  }

  async function unclearFollowUp(id: string) {
    setClearingId(id);
    try {
      const { error } = await supabase
        .from('customer_satisfaction')
        .update({ follow_up_cleared_at: null, follow_up_cleared_by: null })
        .eq('id', id);
      if (error) throw error;
      setRecords(prev => prev.map(r => r.id === id
        ? { ...r, follow_up_cleared_at: null, follow_up_cleared_by: null }
        : r
      ));
    } catch (err) {
      console.error('Error reopening follow-up:', err);
    } finally {
      setClearingId(null);
    }
  }

  const responded = records.filter(r => r.rating);
  const totalSent = records.length;
  const totalResponded = responded.length;
  const responseRate = totalSent > 0 ? Math.round((totalResponded / totalSent) * 100) : 0;

  const counts = {
    excellent: responded.filter(r => r.rating === 'excellent').length,
    good: responded.filter(r => r.rating === 'good').length,
    okay: responded.filter(r => r.rating === 'okay').length,
    needs_attention: responded.filter(r => r.rating === 'needs_attention').length,
  };

  const overallScore = scorePercent(counts);

  const pieData = [
    { name: 'Excellent', value: counts.excellent, color: '#16a34a' },
    { name: 'Good', value: counts.good, color: '#2563eb' },
    { name: 'Okay', value: counts.okay, color: '#d97706' },
    { name: 'Needs Attention', value: counts.needs_attention, color: '#dc2626' },
  ].filter(d => d.value > 0);

  const barData = [
    { name: 'Excellent', value: counts.excellent, fill: '#16a34a' },
    { name: 'Good', value: counts.good, fill: '#2563eb' },
    { name: 'Okay', value: counts.okay, fill: '#d97706' },
    { name: 'Needs Attention', value: counts.needs_attention, fill: '#dc2626' },
  ];

  function buildPersonTable(groupKey: 'sales_rep_name' | 'lead_tech_name') {
    const map: Record<string, { excellent: number; good: number; okay: number; needs_attention: number }> = {};
    for (const r of responded) {
      const name = r[groupKey]?.trim() || 'Unassigned';
      if (!map[name]) map[name] = { excellent: 0, good: 0, okay: 0, needs_attention: 0 };
      if (r.rating === 'excellent') map[name].excellent++;
      else if (r.rating === 'good') map[name].good++;
      else if (r.rating === 'okay') map[name].okay++;
      else if (r.rating === 'needs_attention') map[name].needs_attention++;
    }
    return Object.entries(map)
      .map(([name, c]) => ({ name, ...c, score: scorePercent(c) }))
      .sort((a, b) => b.score - a.score);
  }

  const salesRepTable = buildPersonTable('sales_rep_name');
  const leadTechTable = buildPersonTable('lead_tech_name');

  const allNeedsAttention = responded.filter(r => r.rating === 'okay' || r.rating === 'needs_attention');
  const needsAttentionRecords = allNeedsAttention.filter(r => !r.follow_up_cleared_at);
  const clearedRecords = allNeedsAttention.filter(r => r.follow_up_cleared_at);

  const commentsRecords = isAdmin
    ? records.filter(r => r.comment)
    : records.filter(r => r.comment && r.comment_public);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Date Range Filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-400">Date range:</span>
        {(['30', '90', 'all'] as DateRange[]).map(r => (
          <button
            key={r}
            onClick={() => setDateRange(r)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              dateRange === r
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
            }`}
          >
            {r === 'all' ? 'All Time' : `Last ${r} days`}
          </button>
        ))}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">Surveys Sent</span>
            <Users className="w-5 h-5 text-gray-500" />
          </div>
          <div className="text-3xl font-bold text-white">{totalSent}</div>
          <div className="text-xs text-gray-500 mt-1">{totalResponded} responded</div>
        </div>

        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">Response Rate</span>
            <TrendingUp className="w-5 h-5 text-blue-400" />
          </div>
          <div className="text-3xl font-bold text-white">{responseRate}%</div>
          <div className="text-xs text-gray-500 mt-1">{totalResponded} of {totalSent}</div>
        </div>

        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">Satisfaction Score</span>
            <CheckCircle className="w-5 h-5 text-green-400" />
          </div>
          <div className={`text-3xl font-bold ${scoreColor(overallScore)}`}>{overallScore}%</div>
          <div className="text-xs text-gray-500 mt-1">weighted 4-point scale</div>
        </div>

        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">Needs Attention</span>
            <AlertCircle className="w-5 h-5 text-red-400" />
          </div>
          <div className="text-3xl font-bold text-red-400">{counts.okay + counts.needs_attention}</div>
          <div className="text-xs text-gray-500 mt-1">Okay + Needs Attention</div>
        </div>
      </div>

      {/* Rating Breakdown Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {(Object.entries(RATING_CONFIG) as [keyof typeof RATING_CONFIG, typeof RATING_CONFIG[keyof typeof RATING_CONFIG]][]).map(([key, cfg]) => (
          <div key={key} className={`${cfg.bg} rounded-xl p-4 border ${cfg.border}`}>
            <div className={`text-2xl font-bold ${cfg.text}`}>{counts[key]}</div>
            <div className="text-sm text-gray-300 mt-0.5">{cfg.label}</div>
            {totalResponded > 0 && (
              <div className="text-xs text-gray-500 mt-1">
                {Math.round((counts[key] / totalResponded) * 100)}%
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Charts */}
      {totalResponded > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pie Chart */}
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h3 className="text-white font-semibold mb-4">Rating Distribution</h3>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart margin={{ top: 20, right: 40, bottom: 20, left: 40 }}>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  labelLine={{ stroke: '#6b7280', strokeWidth: 1 }}
                  label={renderCustomPieLabel}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#f9fafb' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Bar Chart */}
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h3 className="text-white font-semibold mb-4">Response Count by Rating</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={barData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: '8px', color: '#f9fafb' }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {barData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Performance Tables */}
      {totalResponded > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Sales Rep Table */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-700">
              <h3 className="text-white font-semibold">By Sales Rep</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Rep</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-green-400 uppercase">Exc</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-blue-400 uppercase">Good</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-amber-400 uppercase">Okay</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-red-400 uppercase">Attn</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {salesRepTable.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500 text-sm">No data</td>
                    </tr>
                  ) : salesRepTable.map(row => (
                    <tr key={row.name} className="hover:bg-gray-750">
                      <td className="px-4 py-3 text-white font-medium">{row.name}</td>
                      <td className="px-3 py-3 text-center text-green-400">{row.excellent}</td>
                      <td className="px-3 py-3 text-center text-blue-400">{row.good}</td>
                      <td className="px-3 py-3 text-center text-amber-400">{row.okay}</td>
                      <td className="px-3 py-3 text-center text-red-400">{row.needs_attention}</td>
                      <td className={`px-4 py-3 text-right font-bold ${scoreColor(row.score)}`}>{row.score}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Lead Tech Table */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-700">
              <h3 className="text-white font-semibold">By Lead Tech</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Tech</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-green-400 uppercase">Exc</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-blue-400 uppercase">Good</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-amber-400 uppercase">Okay</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-red-400 uppercase">Attn</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {leadTechTable.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500 text-sm">No data</td>
                    </tr>
                  ) : leadTechTable.map(row => (
                    <tr key={row.name} className="hover:bg-gray-750">
                      <td className="px-4 py-3 text-white font-medium">{row.name}</td>
                      <td className="px-3 py-3 text-center text-green-400">{row.excellent}</td>
                      <td className="px-3 py-3 text-center text-blue-400">{row.good}</td>
                      <td className="px-3 py-3 text-center text-amber-400">{row.okay}</td>
                      <td className="px-3 py-3 text-center text-red-400">{row.needs_attention}</td>
                      <td className={`px-4 py-3 text-right font-bold ${scoreColor(row.score)}`}>{row.score}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Comments Card */}
      {commentsRecords.length > 0 && (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-400" />
              <h3 className="text-white font-semibold">Customer Comments</h3>
              <span className="text-xs text-gray-500 bg-gray-700 px-2 py-0.5 rounded-full">{commentsRecords.length}</span>
            </div>
            {isAdmin && (
              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" /> Toggle visibility to share with your team
              </p>
            )}
          </div>
          <div className="divide-y divide-gray-700/60">
            {commentsRecords.map(r => {
              const ratingCfg = r.rating ? RATING_CONFIG[r.rating as keyof typeof RATING_CONFIG] : null;
              const isToggling = togglingId === r.id;
              return (
                <div key={r.id} className="px-5 py-4 group">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className="text-white font-medium text-sm">{r.customer_name || 'Unknown Customer'}</span>
                        {ratingCfg && (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${ratingCfg.bg} ${ratingCfg.text} border ${ratingCfg.border}`}>
                            {ratingCfg.label}
                          </span>
                        )}
                        {isAdmin && (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1 ${
                            r.comment_public
                              ? 'bg-green-900/30 text-green-400 border border-green-700/50'
                              : 'bg-gray-700 text-gray-400 border border-gray-600'
                          }`}>
                            {r.comment_public ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                            {r.comment_public ? 'Public' : 'Private'}
                          </span>
                        )}
                        {!isAdmin && r.comment_public && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-900/30 text-green-400 border border-green-700/50 flex items-center gap-1">
                            <Eye className="w-3 h-3" /> Public
                          </span>
                        )}
                      </div>
                      <blockquote className="text-gray-300 text-sm italic border-l-2 border-gray-600 pl-3 leading-relaxed">
                        "{r.comment}"
                      </blockquote>
                      <div className="flex gap-4 text-xs text-gray-500 mt-2">
                        {r.sales_rep_name && <span>Sales: <span className="text-gray-400">{r.sales_rep_name}</span></span>}
                        {r.lead_tech_name && <span>Tech: <span className="text-gray-400">{r.lead_tech_name}</span></span>}
                        {r.responded_at && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(r.responded_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>

                    {isAdmin && (
                      <button
                        onClick={() => toggleCommentVisibility(r)}
                        disabled={isToggling}
                        title={r.comment_public ? 'Make private (hide from team)' : 'Make public (show to team)'}
                        className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                          r.comment_public
                            ? 'bg-green-900/20 text-green-400 border-green-700/50 hover:bg-red-900/20 hover:text-red-400 hover:border-red-700/50'
                            : 'bg-gray-700 text-gray-400 border-gray-600 hover:bg-green-900/20 hover:text-green-400 hover:border-green-700/50'
                        } ${isToggling ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {isToggling ? (
                          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : r.comment_public ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                        {r.comment_public ? 'Hide' : 'Show'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Needs Attention List */}
      {allNeedsAttention.length > 0 && (
        <div className="bg-gray-800 rounded-xl border border-red-900/40 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <h3 className="text-white font-semibold">
                Needs Follow-Up
                {needsAttentionRecords.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-red-400">{needsAttentionRecords.length} open</span>
                )}
                {clearedRecords.length > 0 && (
                  <span className="ml-1 text-sm font-normal text-gray-500">&middot; {clearedRecords.length} cleared</span>
                )}
              </h3>
            </div>
            {isAdmin && clearedRecords.length > 0 && (
              <button
                onClick={() => setShowCleared(v => !v)}
                className="text-xs text-gray-400 hover:text-white flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-gray-700 transition-colors"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                {showCleared ? 'Hide cleared' : 'Show cleared'}
              </button>
            )}
          </div>

          {needsAttentionRecords.length === 0 && !showCleared && (
            <div className="px-5 py-8 text-center text-gray-500 text-sm">
              <CheckCheck className="w-8 h-8 mx-auto mb-2 text-green-500 opacity-60" />
              All follow-ups have been cleared.
            </div>
          )}

          <div className="divide-y divide-gray-700">
            {needsAttentionRecords.map(r => {
              const cfg = RATING_CONFIG[r.rating as keyof typeof RATING_CONFIG];
              const isClearing = clearingId === r.id;
              return (
                <div key={r.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-white font-medium">{r.customer_name || 'Unknown Customer'}</p>
                      <p className="text-gray-400 text-sm">{r.customer_email}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
                        {cfg.label}
                      </span>
                      <span className="text-gray-500 text-xs flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {r.responded_at ? new Date(r.responded_at).toLocaleDateString() : new Date(r.sent_at).toLocaleDateString()}
                      </span>
                      {isAdmin && (
                        <button
                          onClick={() => clearFollowUp(r.id)}
                          disabled={isClearing}
                          title="Mark follow-up as cleared"
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all
                            bg-gray-700 text-gray-300 border-gray-600 hover:bg-green-900/30 hover:text-green-400 hover:border-green-700/50
                            ${isClearing ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {isClearing ? (
                            <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <CheckCheck className="w-3.5 h-3.5" />
                          )}
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-4 text-xs text-gray-500">
                    {r.sales_rep_name && <span>Sales: <span className="text-gray-300">{r.sales_rep_name}</span></span>}
                    {r.lead_tech_name && <span>Tech: <span className="text-gray-300">{r.lead_tech_name}</span></span>}
                  </div>
                  {isAdmin && r.comment && (
                    <p className="mt-2 text-sm text-gray-400 bg-gray-900 rounded-lg px-3 py-2 italic">
                      "{r.comment}"
                    </p>
                  )}
                  {!isAdmin && r.comment && !r.comment_public && (
                    <p className="mt-2 text-sm text-gray-600 flex items-center gap-1.5">
                      <Lock className="w-3 h-3" /> Customer feedback visible to admins only
                    </p>
                  )}
                  {!isAdmin && r.comment && r.comment_public && (
                    <p className="mt-2 text-sm text-gray-400 bg-gray-900 rounded-lg px-3 py-2 italic">
                      "{r.comment}"
                    </p>
                  )}
                </div>
              );
            })}

            {/* Cleared entries */}
            {showCleared && clearedRecords.map(r => {
              const cfg = RATING_CONFIG[r.rating as keyof typeof RATING_CONFIG];
              const isClearing = clearingId === r.id;
              return (
                <div key={r.id} className="px-5 py-4 opacity-60">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-gray-400 font-medium line-through">{r.customer_name || 'Unknown Customer'}</p>
                        <span className="flex items-center gap-1 text-xs text-green-500 no-underline" style={{ textDecoration: 'none' }}>
                          <CheckCheck className="w-3.5 h-3.5" />
                          Cleared {r.follow_up_cleared_at ? new Date(r.follow_up_cleared_at).toLocaleDateString() : ''}
                        </span>
                      </div>
                      <p className="text-gray-500 text-sm">{r.customer_email}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
                        {cfg.label}
                      </span>
                      {isAdmin && (
                        <button
                          onClick={() => unclearFollowUp(r.id)}
                          disabled={isClearing}
                          title="Reopen follow-up"
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all
                            bg-gray-700 text-gray-400 border-gray-600 hover:bg-amber-900/30 hover:text-amber-400 hover:border-amber-700/50
                            ${isClearing ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {isClearing ? (
                            <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <RotateCcw className="w-3.5 h-3.5" />
                          )}
                          Reopen
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-4 text-xs text-gray-500">
                    {r.sales_rep_name && <span>Sales: <span className="text-gray-300">{r.sales_rep_name}</span></span>}
                    {r.lead_tech_name && <span>Tech: <span className="text-gray-300">{r.lead_tech_name}</span></span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {totalSent === 0 && (
        <div className="text-center py-16 text-gray-500">
          <ThumbsUp className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">No surveys sent yet</p>
          <p className="text-sm mt-1">Send a Customer Satisfaction survey from the Send Request tab.</p>
        </div>
      )}
    </div>
  );
}
