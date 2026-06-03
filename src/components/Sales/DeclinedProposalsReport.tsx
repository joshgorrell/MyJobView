import React, { useState, useEffect } from 'react';
import { Ban, RefreshCw, Filter, User, Calendar, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface DeclinedRow {
  id: string;
  proposal_number: string;
  status: 'declined' | 'cancelled';
  total: number;
  declined_at: string | null;
  decline_reason: string | null;
  decline_notes: string | null;
  declined_by: 'customer' | 'rep' | 'company' | null;
  created_by_name: string | null;
  contact_name: string | null;
  contact_company: string | null;
}

interface ReasonStat {
  reason: string;
  label: string;
  count: number;
  byCustomer: number;
  byRep: number;
}

const REASON_LABELS: Record<string, string> = {
  price_too_high: 'Price Too High',
  went_with_competitor: 'Went with a Competitor',
  project_cancelled: 'Project Cancelled',
  no_response: 'No Response / Unresponsive',
  timing: 'Not the Right Time',
  budget_cut: 'Budget Cut',
  scope_change: 'Scope Changed',
  changed_mind: 'Changed Mind',
  dont_want_rep: 'Rep Relationship Issue',
  dont_want_company: 'Company Relationship Issue',
  duplicate: 'Duplicate Proposal',
  customer_request: 'Customer Requested',
  error: 'Created in Error',
  replaced_by_revision: 'Replaced by Revision',
  other: 'Other',
};

const SENSITIVE_REASONS = new Set(['dont_want_rep', 'dont_want_company']);

type DateFilter = 'this_month' | 'last_month' | 'this_quarter' | 'this_year' | 'all_time';

export function DeclinedProposalsReport() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<DeclinedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>('this_year');
  const [repFilter, setRepFilter] = useState<string>('all');
  const [reasonFilter, setReasonFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'declined' | 'cancelled'>('all');
  const [reps, setReps] = useState<{ id: string; name: string }[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const isAdmin = profile?.role && ['admin', 'manager', 'sales_manager', 'finance'].includes(profile.role);

  useEffect(() => {
    if (isAdmin) {
      loadData();
      loadReps();
    }
  }, [dateFilter, repFilter, reasonFilter, statusFilter]);

  async function loadReps() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, first_name, last_name')
      .eq('organization_id', profile!.organization_id)
      .eq('is_active', true)
      .order('full_name');
    if (data) {
      setReps(data.map(p => ({
        id: p.id,
        name: p.full_name || [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown',
      })));
    }
  }

  async function loadData() {
    if (!profile?.organization_id) return;
    setRefreshing(true);
    try {
      const now = new Date();
      let startDate: string | null = null;
      switch (dateFilter) {
        case 'this_month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
          break;
        case 'last_month':
          startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
          break;
        case 'this_quarter':
          startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1).toISOString();
          break;
        case 'this_year':
          startDate = new Date(now.getFullYear(), 0, 1).toISOString();
          break;
        case 'all_time':
        default:
          startDate = null;
      }

      let query = supabase
        .from('proposals')
        .select(`
          id, proposal_number, status, total, declined_at, decline_reason, decline_notes, declined_by, created_by_name,
          contact:contacts!proposals_contact_id_fkey(full_name, company_name)
        `)
        .eq('organization_id', profile.organization_id)
        .in('status', statusFilter === 'all' ? ['declined', 'cancelled'] : [statusFilter])
        .order('declined_at', { ascending: false, nullsFirst: false });

      if (startDate) {
        query = query.gte('declined_at', startDate);
      }
      if (repFilter !== 'all') {
        query = query.eq('created_by', repFilter);
      }
      if (reasonFilter !== 'all') {
        query = query.eq('decline_reason', reasonFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      const mapped: DeclinedRow[] = (data || []).map((r: any) => ({
        id: r.id,
        proposal_number: r.proposal_number,
        status: r.status,
        total: parseFloat(r.total || '0'),
        declined_at: r.declined_at,
        decline_reason: r.decline_reason,
        decline_notes: r.decline_notes,
        declined_by: r.declined_by,
        created_by_name: r.created_by_name,
        contact_name: r.contact?.full_name || null,
        contact_company: r.contact?.company_name || null,
      }));
      setRows(mapped);
    } catch (err) {
      console.error('Error loading declined proposals:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  if (!isAdmin) return null;

  // Compute reason stats
  const reasonStats = new Map<string, ReasonStat>();
  rows.forEach(r => {
    const key = r.decline_reason || 'other';
    if (!reasonStats.has(key)) {
      reasonStats.set(key, { reason: key, label: REASON_LABELS[key] || key, count: 0, byCustomer: 0, byRep: 0 });
    }
    const s = reasonStats.get(key)!;
    s.count++;
    if (r.declined_by === 'customer') s.byCustomer++;
    else s.byRep++;
  });
  const sortedReasons = Array.from(reasonStats.values()).sort((a, b) => b.count - a.count);
  const totalDeclined = rows.filter(r => r.status === 'declined').length;
  const totalCancelled = rows.filter(r => r.status === 'cancelled').length;
  const totalValue = rows.reduce((s, r) => s + r.total, 0);
  const byCustomerCount = rows.filter(r => r.declined_by === 'customer').length;
  const byRepCount = rows.filter(r => r.declined_by !== 'customer').length;

  function formatCurrency(n: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
  }

  const DATE_LABELS: Record<DateFilter, string> = {
    this_month: 'This Month',
    last_month: 'Last Month',
    this_quarter: 'This Quarter',
    this_year: 'This Year',
    all_time: 'All Time',
  };

  return (
    <div className="p-5 space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Filter className="w-4 h-4 text-gray-400 flex-shrink-0" />
        {/* Date */}
        <select
          value={dateFilter}
          onChange={e => setDateFilter(e.target.value as DateFilter)}
          className="px-3 py-1.5 bg-gray-900 border border-gray-700 text-white rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-rose-500"
        >
          {(Object.keys(DATE_LABELS) as DateFilter[]).map(k => (
            <option key={k} value={k}>{DATE_LABELS[k]}</option>
          ))}
        </select>
        {/* Status */}
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as 'all' | 'declined' | 'cancelled')}
          className="px-3 py-1.5 bg-gray-900 border border-gray-700 text-white rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-rose-500"
        >
          <option value="all">Declined + Cancelled</option>
          <option value="declined">Declined Only</option>
          <option value="cancelled">Cancelled Only</option>
        </select>
        {/* Rep */}
        <select
          value={repFilter}
          onChange={e => setRepFilter(e.target.value)}
          className="px-3 py-1.5 bg-gray-900 border border-gray-700 text-white rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-rose-500"
        >
          <option value="all">All Reps</option>
          {reps.map(r => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        {/* Reason */}
        <select
          value={reasonFilter}
          onChange={e => setReasonFilter(e.target.value)}
          className="px-3 py-1.5 bg-gray-900 border border-gray-700 text-white rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-rose-500"
        >
          <option value="all">All Reasons</option>
          {Object.entries(REASON_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button
          onClick={() => loadData()}
          disabled={refreshing}
          className="ml-auto p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-12 bg-gray-700/40 rounded-lg animate-pulse" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm">
          No lost deals found for the selected filters.
        </div>
      ) : (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-rose-950/30 border border-rose-900/40 rounded-lg p-3">
              <div className="text-xs text-rose-400/70 uppercase tracking-wide mb-1">Total Lost</div>
              <div className="text-2xl font-bold text-rose-400 tabular-nums">{rows.length}</div>
              <div className="text-xs text-rose-400/50 mt-0.5">{totalDeclined} declined · {totalCancelled} cancelled</div>
            </div>
            <div className="bg-gray-900/60 border border-gray-700/50 rounded-lg p-3">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Lost Value</div>
              <div className="text-lg font-bold text-white tabular-nums leading-tight">{formatCurrency(totalValue)}</div>
              <div className="text-xs text-gray-500 mt-0.5">total proposal value</div>
            </div>
            <div className="bg-gray-900/60 border border-gray-700/50 rounded-lg p-3">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">By Customer</div>
              <div className="text-2xl font-bold text-blue-400 tabular-nums">{byCustomerCount}</div>
              <div className="text-xs text-gray-500 mt-0.5">customer-initiated</div>
            </div>
            <div className="bg-gray-900/60 border border-gray-700/50 rounded-lg p-3">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">By Rep / Co.</div>
              <div className="text-2xl font-bold text-gray-300 tabular-nums">{byRepCount}</div>
              <div className="text-xs text-gray-500 mt-0.5">rep or company initiated</div>
            </div>
          </div>

          {/* Reason Breakdown Chart */}
          {sortedReasons.length > 0 && (
            <div className="bg-gray-900/40 border border-gray-700/50 rounded-lg p-4 space-y-2.5">
              <div className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-3">Reason Breakdown</div>
              {sortedReasons.map(s => {
                const pct = rows.length > 0 ? Math.round((s.count / rows.length) * 100) : 0;
                const isSensitive = SENSITIVE_REASONS.has(s.reason);
                return (
                  <div key={s.reason} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className={`font-medium ${isSensitive ? 'text-rose-300' : 'text-gray-300'}`}>
                        {s.label}
                        {isSensitive && <span className="ml-1.5 text-rose-500/70">(admin only)</span>}
                      </span>
                      <div className="flex items-center gap-3 text-gray-500">
                        {s.byCustomer > 0 && <span className="text-blue-400">{s.byCustomer}c</span>}
                        {s.byRep > 0 && <span>{s.byRep}r</span>}
                        <span className="text-white font-bold w-5 text-right tabular-nums">{s.count}</span>
                        <span className="text-gray-600 w-8 text-right tabular-nums">{pct}%</span>
                      </div>
                    </div>
                    <div className="relative h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`absolute inset-y-0 left-0 rounded-full transition-all duration-700 ${isSensitive ? 'bg-rose-600' : 'bg-rose-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Full List */}
          <div className="space-y-1.5">
            <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide px-1 mb-2">
              All Lost Deals ({rows.length})
            </div>
            {rows.map(row => {
              const expanded = expandedId === row.id;
              const isSensitiveReason = row.decline_reason && SENSITIVE_REASONS.has(row.decline_reason);
              return (
                <div
                  key={row.id}
                  className={`rounded-lg border transition-colors ${
                    row.status === 'declined'
                      ? 'bg-rose-950/20 border-rose-900/30 hover:border-rose-800/50'
                      : 'bg-gray-900/40 border-gray-700/50 hover:border-gray-600/50'
                  }`}
                >
                  <button
                    onClick={() => setExpandedId(expanded ? null : row.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono text-gray-400">{row.proposal_number}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          row.status === 'declined'
                            ? 'bg-rose-500/20 text-rose-400'
                            : 'bg-gray-600/40 text-gray-400'
                        }`}>
                          {row.status}
                        </span>
                        {row.declined_by && (
                          <span className="text-xs text-gray-600">
                            by {row.declined_by}
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-medium text-white mt-0.5">
                        {row.contact_name || row.contact_company || 'Unknown Customer'}
                        {row.contact_company && row.contact_name && (
                          <span className="text-gray-500 font-normal text-xs ml-1">· {row.contact_company}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-bold text-white tabular-nums">{formatCurrency(row.total)}</div>
                      {row.declined_at && (
                        <div className="text-xs text-gray-500">
                          {new Date(row.declined_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                      )}
                    </div>
                    <div className="flex-shrink-0 ml-1">
                      {expanded
                        ? <ChevronUp className="w-4 h-4 text-gray-500" />
                        : <ChevronDown className="w-4 h-4 text-gray-500" />}
                    </div>
                  </button>

                  {expanded && (
                    <div className="px-4 pb-3 pt-0 border-t border-gray-700/30 space-y-1.5 mt-0">
                      <div className="flex items-center gap-2 pt-2">
                        {row.created_by_name && (
                          <div className="flex items-center gap-1.5 text-xs">
                            <User className="w-3.5 h-3.5 text-gray-500" />
                            <span className="text-gray-400">Rep:</span>
                            <span className="text-white">{row.created_by_name}</span>
                          </div>
                        )}
                        {row.declined_at && (
                          <div className="flex items-center gap-1.5 text-xs ml-4">
                            <Calendar className="w-3.5 h-3.5 text-gray-500" />
                            <span className="text-gray-400">Date:</span>
                            <span className="text-white">
                              {new Date(row.declined_at).toLocaleDateString('en-US', {
                                month: 'short', day: 'numeric', year: 'numeric'
                              })}
                            </span>
                          </div>
                        )}
                      </div>
                      {row.decline_reason && (
                        <div className="text-xs">
                          <span className="text-gray-500">Reason: </span>
                          <span className={isSensitiveReason ? 'text-rose-300 font-medium' : 'text-gray-200'}>
                            {REASON_LABELS[row.decline_reason] || row.decline_reason}
                          </span>
                          {isSensitiveReason && (
                            <span className="ml-1.5 text-rose-500/70">(admin only)</span>
                          )}
                        </div>
                      )}
                      {row.decline_notes && (
                        <div className="text-xs italic text-gray-400">
                          "{row.decline_notes}"
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
