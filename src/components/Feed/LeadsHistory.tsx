import { useEffect, useState, useCallback } from 'react';
import { Clock, User, Building2, AlertCircle, Plus, Printer, Search, SlidersHorizontal, Users, CircleUser as UserCircle, RefreshCw, ChevronRight, Mail, Phone, TrendingUp, CheckCircle2, XCircle, Layers, Zap, CalendarClock, Award, ArrowRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { LeadWithDetails, Profile } from '../../lib/types';
import { formatDistanceToNow } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import { LeadForm } from '../Leads/LeadForm';
import PrintLeadsView from '../Leads/PrintLeadsView';

interface LeadsHistoryProps {
  onLeadClick: (leadId: string) => void;
}

type ViewTab = 'all' | 'recently_claimed';

export function LeadsHistory({ onLeadClick }: LeadsHistoryProps) {
  const { profile, loading: authLoading } = useAuth();
  const [leads, setLeads] = useState<LeadWithDetails[]>([]);
  const [recentlyClaimed, setRecentlyClaimed] = useState<LeadWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [recentlyClaimedLoading, setRecentlyClaimedLoading] = useState(true);
  const [salesReps, setSalesReps] = useState<Profile[]>([]);
  const [selectedRep, setSelectedRep] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [viewFilter, setViewFilter] = useState<'my' | 'all'>('my');
  const [showPrint, setShowPrint] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'name' | 'priority'>('newest');
  const [activeTab, setActiveTab] = useState<ViewTab>('all');
  const [recentlyClaimedDays, setRecentlyClaimedDays] = useState<7 | 14 | 30>(7);

  const isAdminOrManager = profile?.role === 'admin' || profile?.role === 'manager' || profile?.role === 'sales_manager';

  useEffect(() => {
    if (authLoading) return;
    if (!profile) { setLoading(false); return; }
    loadLeads();
    loadSalesReps();
    loadRecentlyClaimed();

    const channel = supabase
      .channel('leads_history')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        loadLeads();
        loadRecentlyClaimed();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [authLoading, profile]);

  useEffect(() => {
    if (authLoading || !profile) return;
    loadLeads();
  }, [selectedRep, statusFilter, viewFilter, authLoading, profile]);

  useEffect(() => {
    if (authLoading || !profile) return;
    loadRecentlyClaimed();
  }, [recentlyClaimedDays, authLoading, profile]);

  async function loadSalesReps() {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, role, avatar_url')
        .in('role', ['sales', 'admin', 'manager'])
        .eq('is_active', true)
        .order('full_name');
      if (data) setSalesReps(data);
    } catch (error) {
      console.error('Error loading sales reps:', error);
    }
  }

  async function loadLeads() {
    try {
      setLoading(true);
      let query = supabase
        .from('leads')
        .select(`
          *,
          profiles!leads_created_by_fkey (full_name, avatar_url),
          assigned_profile:profiles!leads_assigned_to_fkey (full_name)
        `);

      if (viewFilter === 'my') {
        query = query.or(`created_by.eq.${profile!.id},assigned_to.eq.${profile!.id}`);
      }
      if (selectedRep !== 'all') {
        if (selectedRep === 'unassigned') query = query.is('assigned_to', null);
        else query = query.eq('assigned_to', selectedRep);
      }
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setLeads(data || []);
    } catch (error) {
      console.error('Error loading leads:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadRecentlyClaimed() {
    try {
      setRecentlyClaimedLoading(true);
      const since = new Date();
      since.setDate(since.getDate() - recentlyClaimedDays);

      const { data, error } = await supabase
        .from('leads')
        .select(`
          *,
          profiles!leads_created_by_fkey (full_name, avatar_url),
          assigned_profile:profiles!leads_assigned_to_fkey (full_name)
        `)
        .eq('status', 'claimed')
        .not('claimed_at', 'is', null)
        .gte('claimed_at', since.toISOString())
        .order('claimed_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setRecentlyClaimed(data || []);
    } catch (error) {
      console.error('Error loading recently claimed leads:', error);
    } finally {
      setRecentlyClaimedLoading(false);
    }
  }

  function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 24) { const days = Math.floor(hours / 24); return `${days}d ${hours % 24}h`; }
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  function getSpeedLabel(seconds: number): { label: string; color: string } {
    if (seconds < 300)  return { label: 'Lightning',  color: 'text-yellow-600 bg-yellow-50 border-yellow-200' };
    if (seconds < 1800) return { label: 'Fast',        color: 'text-green-700 bg-green-50 border-green-200' };
    if (seconds < 7200) return { label: 'Good',        color: 'text-blue-700 bg-blue-50 border-blue-200' };
    if (seconds < 86400) return { label: 'Slow',       color: 'text-orange-700 bg-orange-50 border-orange-200' };
    return { label: 'Very Slow', color: 'text-red-700 bg-red-50 border-red-200' };
  }

  function getUnclaimedDuration(lead: LeadWithDetails): string {
    if (lead.status !== 'unclaimed') return '';
    const seconds = Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 1000);
    return formatDuration(seconds);
  }

  const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

  function getPriorityInfo(priority: string) {
    switch (priority) {
      case 'urgent': return { label: 'Urgent', dotColor: 'bg-red-500', badgeColor: 'bg-red-50 text-red-700 border-red-200', timeframe: 'within hours' };
      case 'high':   return { label: 'High',   dotColor: 'bg-orange-500', badgeColor: 'bg-orange-50 text-orange-700 border-orange-200', timeframe: 'within 1 day' };
      case 'medium': return { label: 'Medium', dotColor: 'bg-amber-400', badgeColor: 'bg-amber-50 text-amber-700 border-amber-200', timeframe: 'within 3 days' };
      case 'low':    return { label: 'Low',    dotColor: 'bg-green-500', badgeColor: 'bg-green-50 text-green-700 border-green-200', timeframe: 'within 1 week' };
      default:       return { label: 'Medium', dotColor: 'bg-amber-400', badgeColor: 'bg-amber-50 text-amber-700 border-amber-200', timeframe: 'within 3 days' };
    }
  }

  function getStatusConfig(status: string) {
    switch (status) {
      case 'unclaimed':   return { label: 'Unclaimed',   color: 'bg-gray-100 text-gray-600',    icon: <Layers className="w-3 h-3" /> };
      case 'claimed':     return { label: 'Claimed',     color: 'bg-blue-100 text-blue-700',    icon: <User className="w-3 h-3" /> };
      case 'in_progress': return { label: 'In Progress', color: 'bg-amber-100 text-amber-700',  icon: <TrendingUp className="w-3 h-3" /> };
      case 'escalated':   return { label: 'Escalated',   color: 'bg-orange-100 text-orange-700', icon: <AlertCircle className="w-3 h-3" /> };
      case 'closed_won':  return { label: 'Closed Won',  color: 'bg-green-100 text-green-700',  icon: <CheckCircle2 className="w-3 h-3" /> };
      case 'closed_lost': return { label: 'Closed Lost', color: 'bg-red-100 text-red-700',      icon: <XCircle className="w-3 h-3" /> };
      default:            return { label: status,        color: 'bg-gray-100 text-gray-600',    icon: null };
    }
  }

  const filteredLeads = useCallback(() => {
    let list = [...leads];
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      list = list.filter(l =>
        (l.contact_name || '').toLowerCase().includes(q) ||
        (l.company_name || '').toLowerCase().includes(q) ||
        (l.email || '').toLowerCase().includes(q) ||
        (l.phone || '').toLowerCase().includes(q)
      );
    }
    if (sortBy === 'name') {
      list.sort((a, b) => (a.contact_name || '').localeCompare(b.contact_name || ''));
    } else if (sortBy === 'priority') {
      list.sort((a, b) => (PRIORITY_ORDER[a.priority || 'medium'] ?? 2) - (PRIORITY_ORDER[b.priority || 'medium'] ?? 2));
    }
    return list;
  }, [leads, searchQuery, sortBy]);

  const displayed = filteredLeads();

  // Stats for recently claimed panel
  const avgClaimSeconds = recentlyClaimed.length > 0
    ? Math.round(recentlyClaimed.reduce((sum, l) => sum + (l.time_to_claim_seconds || 0), 0) / recentlyClaimed.filter(l => l.time_to_claim_seconds).length)
    : null;

  const repCounts: Record<string, { name: string; count: number }> = {};
  recentlyClaimed.forEach(l => {
    if (l.assigned_profile?.full_name) {
      const name = l.assigned_profile.full_name;
      if (!repCounts[name]) repCounts[name] = { name, count: 0 };
      repCounts[name].count++;
    }
  });
  const topClaimers = Object.values(repCounts).sort((a, b) => b.count - a.count).slice(0, 3);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-slate-700 to-slate-800 px-5 py-4 sm:px-6 sm:py-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex-shrink-0 w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-white leading-tight">Leads</h1>
                <p className="text-sm text-slate-300">
                  {activeTab === 'all'
                    ? (loading ? 'Loading...' : `${displayed.length} lead${displayed.length !== 1 ? 's' : ''}${viewFilter === 'all' ? ' — All Reps' : ' — My Leads'}`)
                    : (recentlyClaimedLoading ? 'Loading...' : `${recentlyClaimed.length} claimed in last ${recentlyClaimedDays} days`)
                  }
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setShowPrint(true)}
                title="Print Report"
                className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
              >
                <Printer className="w-4 h-4" />
              </button>
              <button
                onClick={() => { loadLeads(); loadRecentlyClaimed(); }}
                title="Refresh"
                className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowLeadForm(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-white text-slate-800 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New Lead</span>
                <span className="sm:hidden">New</span>
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 bg-white px-4 sm:px-6">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'all'
                ? 'border-slate-700 text-slate-800'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Layers className="w-4 h-4" />
            All Leads
          </button>
          <button
            onClick={() => setActiveTab('recently_claimed')}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'recently_claimed'
                ? 'border-slate-700 text-slate-800'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Zap className="w-4 h-4" />
            Recently Claimed
            {recentlyClaimed.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
                {recentlyClaimed.length}
              </span>
            )}
          </button>
        </div>

        {/* Toolbar — All Leads tab */}
        {activeTab === 'all' && (
          <div className="px-4 py-3 sm:px-6 border-b border-gray-100 bg-gray-50">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex gap-1.5 flex-shrink-0">
                <button
                  onClick={() => setViewFilter('my')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    viewFilter === 'my'
                      ? 'bg-slate-700 text-white'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <UserCircle className="w-3.5 h-3.5" />
                  Mine
                </button>
                <button
                  onClick={() => setViewFilter('all')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    viewFilter === 'all'
                      ? 'bg-slate-700 text-white'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  All Reps
                </button>
              </div>

              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search leads..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white"
                />
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                <SlidersHorizontal className="w-4 h-4 text-gray-400" />
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as typeof sortBy)}
                  className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                >
                  <option value="newest">Newest First</option>
                  <option value="name">Name A–Z</option>
                  <option value="priority">By Priority</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                >
                  <option value="all">All Statuses</option>
                  <option value="unclaimed">Unclaimed</option>
                  <option value="claimed">Claimed</option>
                  <option value="in_progress">In Progress</option>
                  <option value="escalated">Escalated</option>
                  <option value="closed_won">Closed Won</option>
                  <option value="closed_lost">Closed Lost</option>
                </select>
              </div>

              {isAdminOrManager && viewFilter === 'all' && (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <select
                    value={selectedRep}
                    onChange={e => setSelectedRep(e.target.value)}
                    className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                  >
                    <option value="all">All Reps</option>
                    <option value="unassigned">Unassigned</option>
                    {salesReps.map(rep => (
                      <option key={rep.id} value={rep.id}>{rep.full_name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Toolbar — Recently Claimed tab */}
        {activeTab === 'recently_claimed' && (
          <div className="px-4 py-3 sm:px-6 border-b border-gray-100 bg-gray-50">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500 font-medium flex-shrink-0">Show last:</span>
              <div className="flex gap-1.5">
                {([7, 14, 30] as const).map(d => (
                  <button
                    key={d}
                    onClick={() => setRecentlyClaimedDays(d)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      recentlyClaimedDays === d
                        ? 'bg-slate-700 text-white'
                        : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {d} days
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── ALL LEADS TAB ── */}
      {activeTab === 'all' && (
        <>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-600 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">Loading leads...</p>
              </div>
            </div>
          ) : displayed.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
              <TrendingUp className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500 font-medium">No leads found</p>
              <p className="text-gray-400 text-sm mt-1">
                {searchQuery ? 'Try adjusting your search.' : 'Create your first lead to get started.'}
              </p>
              {!searchQuery && (
                <button
                  onClick={() => setShowLeadForm(true)}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  New Lead
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {displayed.map(lead => {
                const isUnclaimed = lead.status === 'unclaimed' || lead.status === 'fishbowl';
                const unclaimedTime = isUnclaimed ? getUnclaimedDuration(lead) : null;
                const priorityInfo = getPriorityInfo(lead.priority || 'medium');
                const statusConfig = getStatusConfig(lead.status);

                return (
                  <div
                    key={lead.id}
                    onClick={() => onLeadClick(lead.id)}
                    className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all cursor-pointer group"
                  >
                    <div className="p-4 pb-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="flex-shrink-0 w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center group-hover:bg-slate-200 transition-colors">
                            <User className="w-4 h-4 text-slate-600" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-gray-900 text-sm leading-tight truncate">
                              {lead.contact_name}
                            </h3>
                            {lead.company_name && (
                              <p className="text-xs text-gray-500 truncate flex items-center gap-1">
                                <Building2 className="w-3 h-3 flex-shrink-0" />
                                {lead.company_name}
                              </p>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-slate-500 transition-colors flex-shrink-0 mt-1" />
                      </div>

                      <div className="space-y-1">
                        {lead.email && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-600 min-w-0">
                            <Mail className="w-3 h-3 text-gray-400 flex-shrink-0" />
                            <span className="truncate">{lead.email}</span>
                          </div>
                        )}
                        {lead.phone && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-600">
                            <Phone className="w-3 h-3 text-gray-400 flex-shrink-0" />
                            <span>{lead.phone}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 text-xs text-gray-400">
                          <Clock className="w-3 h-3 flex-shrink-0" />
                          <span>{formatDistanceToNow(lead.created_at)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mx-4 mb-3 flex flex-wrap items-center gap-1.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.color}`}>
                        {statusConfig.icon}
                        {statusConfig.label}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium ${priorityInfo.badgeColor}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${priorityInfo.dotColor} flex-shrink-0`} />
                        {priorityInfo.label}
                      </span>
                      {isUnclaimed && unclaimedTime && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200">
                          <Clock className="w-3 h-3" />
                          {unclaimedTime} unclaimed
                        </span>
                      )}
                    </div>

                    <div className="mx-4 mb-3 grid grid-cols-2 gap-2">
                      {lead.assigned_profile ? (
                        <div className="p-2 bg-blue-50 border border-blue-200 rounded-lg">
                          <p className="text-xs font-semibold text-blue-800 mb-0.5">Assigned To</p>
                          <p className="text-xs text-blue-700 truncate">{lead.assigned_profile.full_name}</p>
                        </div>
                      ) : (
                        <div className="p-2 bg-gray-50 border border-gray-200 rounded-lg">
                          <p className="text-xs font-semibold text-gray-500 mb-0.5">Assignment</p>
                          <p className="text-xs text-gray-400 italic">Fishbowl</p>
                        </div>
                      )}

                      {lead.time_to_claim_seconds !== null && !isUnclaimed ? (
                        <div className="p-2 bg-green-50 border border-green-200 rounded-lg">
                          <p className="text-xs font-semibold text-green-800 mb-0.5">Claimed In</p>
                          <p className="text-xs text-green-700">{formatDuration(lead.time_to_claim_seconds)}</p>
                        </div>
                      ) : (
                        <div className="p-2 bg-gray-50 border border-gray-200 rounded-lg">
                          <p className="text-xs font-semibold text-gray-500 mb-0.5">Priority</p>
                          <p className="text-xs text-gray-600">{priorityInfo.timeframe}</p>
                        </div>
                      )}
                    </div>

                    {lead.opportunity_description && (
                      <div className="mx-4 mb-4 p-2.5 bg-gray-50 border border-gray-200 rounded-lg">
                        <p className="text-xs text-gray-600 line-clamp-2">{lead.opportunity_description}</p>
                      </div>
                    )}

                    {!lead.opportunity_description && <div className="pb-1" />}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── RECENTLY CLAIMED TAB ── */}
      {activeTab === 'recently_claimed' && (
        <div className="space-y-4">
          {/* Summary stats */}
          {!recentlyClaimedLoading && recentlyClaimed.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{recentlyClaimed.length}</p>
                  <p className="text-xs text-gray-500">Leads Claimed</p>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Zap className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {avgClaimSeconds !== null ? formatDuration(avgClaimSeconds) : '—'}
                  </p>
                  <p className="text-xs text-gray-500">Avg. Claim Speed</p>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Award className="w-4 h-4 text-amber-500" />
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Top Claimers</p>
                </div>
                {topClaimers.length > 0 ? (
                  <div className="space-y-1">
                    {topClaimers.map((rep, i) => (
                      <div key={rep.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-bold ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-gray-400' : 'text-amber-700'}`}>
                            #{i + 1}
                          </span>
                          <span className="text-xs text-gray-700 truncate max-w-[120px]">{rep.name}</span>
                        </div>
                        <span className="text-xs font-semibold text-gray-900">{rep.count}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">No data</p>
                )}
              </div>
            </div>
          )}

          {/* Lead list */}
          {recentlyClaimedLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-600 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">Loading recently claimed leads...</p>
              </div>
            </div>
          ) : recentlyClaimed.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
              <CalendarClock className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500 font-medium">No claimed leads in this period</p>
              <p className="text-gray-400 text-sm mt-1">Try extending the date range above.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="divide-y divide-gray-100">
                {recentlyClaimed.map((lead, idx) => {
                  const priorityInfo = getPriorityInfo(lead.priority || 'medium');
                  const speed = lead.time_to_claim_seconds ? getSpeedLabel(lead.time_to_claim_seconds) : null;

                  return (
                    <div
                      key={lead.id}
                      onClick={() => onLeadClick(lead.id)}
                      className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 cursor-pointer transition-colors group"
                    >
                      {/* Index */}
                      <div className="flex-shrink-0 w-7 text-center">
                        <span className="text-sm font-bold text-gray-300">#{idx + 1}</span>
                      </div>

                      {/* Avatar */}
                      <div className="flex-shrink-0 w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center group-hover:bg-slate-200 transition-colors">
                        <User className="w-4 h-4 text-slate-500" />
                      </div>

                      {/* Main info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900 text-sm">{lead.contact_name}</span>
                          {lead.company_name && (
                            <span className="text-xs text-gray-500 flex items-center gap-0.5">
                              <Building2 className="w-3 h-3" />
                              {lead.company_name}
                            </span>
                          )}
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium ${priorityInfo.badgeColor}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${priorityInfo.dotColor}`} />
                            {priorityInfo.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          {lead.email && (
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              {lead.email}
                            </span>
                          )}
                          {lead.phone && (
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {lead.phone}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Claim info */}
                      <div className="flex-shrink-0 hidden sm:flex flex-col items-end gap-1.5">
                        {lead.assigned_profile && (
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 bg-slate-200 rounded-full flex items-center justify-center">
                              <User className="w-3 h-3 text-slate-600" />
                            </div>
                            <span className="text-xs font-medium text-gray-700">{lead.assigned_profile.full_name}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          {speed && (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium ${speed.color}`}>
                              <Zap className="w-3 h-3" />
                              {speed.label}
                            </span>
                          )}
                          {lead.time_to_claim_seconds !== null && (
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDuration(lead.time_to_claim_seconds)}
                            </span>
                          )}
                        </div>
                        {lead.claimed_at && (
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <CalendarClock className="w-3 h-3" />
                            {formatDistanceToNow(lead.claimed_at)}
                          </span>
                        )}
                      </div>

                      {/* Mobile claim info */}
                      <div className="flex-shrink-0 sm:hidden flex flex-col items-end gap-1">
                        {lead.time_to_claim_seconds !== null && (
                          <span className="text-xs text-gray-500">{formatDuration(lead.time_to_claim_seconds)}</span>
                        )}
                        {lead.claimed_at && (
                          <span className="text-xs text-gray-400">{formatDistanceToNow(lead.claimed_at)}</span>
                        )}
                      </div>

                      <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-slate-500 transition-colors flex-shrink-0" />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {showLeadForm && (
        <LeadForm
          onClose={() => setShowLeadForm(false)}
          onSuccess={() => { setShowLeadForm(false); loadLeads(); }}
        />
      )}

      {showPrint && (
        <PrintLeadsView
          leads={leads.map(l => ({
            ...l,
            company_name: l.company_name || '',
            email: l.email || '',
            phone: l.phone || '',
            priority: (l as any).priority || 'medium',
            estimated_value: (l as any).estimated_value || '',
            last_contact_date: (l as any).last_contact_date || '',
            assigned_to: l.assigned_to || '',
            assigned_rep: l.assigned_profile
              ? { id: l.assigned_profile.id, full_name: l.assigned_profile.full_name }
              : undefined,
          }))}
          repName={viewFilter === 'all' ? 'All Reps' : (profile?.full_name || 'My Leads')}
          viewMode={viewFilter}
          onClose={() => setShowPrint(false)}
          salesReps={salesReps}
          isAdminOrManager={isAdminOrManager}
        />
      )}
    </div>
  );
}
