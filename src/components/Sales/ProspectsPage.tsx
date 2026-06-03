import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { ContactDetail } from '../Contacts/ContactDetail';
import { ContactForm } from '../Contacts/ContactForm';
import ConnectionForm from '../Connections/ConnectionForm';
import PrintProspectsView from '../Leads/PrintProspectsView';
import { CreateAppointmentModal } from '../Appointments/CreateAppointmentModal';
import { CompetitorsList } from './CompetitorsList';
import { Target, Plus, Search, Printer, Users, User, Building2, Mail, Phone, Clock, CalendarClock, ChevronRight, SlidersHorizontal, RefreshCw, AlertCircle, TrendingUp, CircleUser as UserCircle, CalendarPlus, Zap } from 'lucide-react';

interface ProspectRelationship {
  id: string;
  relationship_type: string;
  relationship_strength?: string;
  competitors: { id: string; name: string };
}

interface Prospect {
  id: string;
  company_name: string;
  contact_name: string;
  title?: string;
  email: string;
  phone: string;
  created_at: string;
  created_by: string;
  is_prospect: boolean;
  contact_type?: string;
  notes?: string;
  electrician_name?: string;
  electrician_notes?: string;
  prospect_competitor_relationships?: ProspectRelationship[];
  last_connection?: { connection_date: string; connection_type: string };
  next_scheduled_connection?: { scheduled_date: string; connection_type: string };
}

interface SalesRep {
  id: string;
  full_name: string;
  role: string;
}

export function ProspectsPage() {
  const { profile, loading: authLoading } = useAuth();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'my' | 'all'>('my');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [pageTab, setPageTab] = useState<'prospects' | 'competitors'>('prospects');
  const [showContactForm, setShowContactForm] = useState(false);
  const [showConnectionForm, setShowConnectionForm] = useState(false);
  const [connectionProspect, setConnectionProspect] = useState<Prospect | null>(null);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [appointmentProspect, setAppointmentProspect] = useState<Prospect | null>(null);
  const [showPrint, setShowPrint] = useState(false);
  const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
  const [canViewAll, setCanViewAll] = useState(false);
  const [sortBy, setSortBy] = useState<'newest' | 'name' | 'last_contact'>('newest');

  const isAdminOrManager = profile?.role === 'admin' || profile?.role === 'manager';

  useEffect(() => {
    if (authLoading || !profile) return;
    checkPermissions();
    loadSalesReps();
  }, [profile, authLoading]);

  useEffect(() => {
    if (authLoading || !profile) return;
    loadProspects();

    const channel = supabase
      .channel('prospects_page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts' }, () => {
        loadProspects();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connections' }, () => {
        loadProspects();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile, authLoading, viewMode]);

  async function checkPermissions() {
    if (!profile) return;
    if (profile.role === 'admin' || profile.role === 'manager') {
      setCanViewAll(true);
      return;
    }
    const { data } = await supabase
      .from('profiles')
      .select('can_view_all_pipeline')
      .eq('id', profile.id)
      .maybeSingle();
    setCanViewAll(!!data?.can_view_all_pipeline);
  }

  async function loadSalesReps() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .in('role', ['sales', 'admin', 'manager', 'sales_v2'])
      .eq('is_active', true)
      .order('full_name');
    if (data) setSalesReps(data);
  }

  async function loadProspects() {
    try {
      setLoading(true);
      const showAll = viewMode === 'all' && canViewAll;

      let query = supabase
        .from('contacts')
        .select(`
          id,
          company_name,
          contact_name,
          title,
          email,
          phone,
          created_at,
          created_by,
          contact_type,
          notes,
          electrician_name,
          electrician_notes,
          prospect_competitor_relationships!prospect_competitor_relationships_prospect_id_fkey(
            id,
            relationship_type,
            relationship_strength,
            competitors:competitors(id, name)
          )
        `)
        .eq('contact_type', 'prospect')
        .order('created_at', { ascending: false });

      if (!showAll && profile?.id) {
        query = query.eq('created_by', profile.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      const results: Prospect[] = data || [];

      if (results.length > 0) {
        const ids = results.map(p => p.id);
        const today = new Date().toISOString().split('T')[0];

        // Bulk-fetch latest connection per prospect (two queries instead of N*2)
        const { data: allConns } = await supabase
          .from('connections')
          .select('contact_id, connection_date, connection_type')
          .in('contact_id', ids)
          .order('connection_date', { ascending: false });

        const lastConnMap: Record<string, { connection_date: string; connection_type: string }> = {};
        (allConns || []).forEach(c => {
          if (!lastConnMap[c.contact_id]) {
            lastConnMap[c.contact_id] = { connection_date: c.connection_date, connection_type: c.connection_type };
          }
        });

        // Bulk-fetch next scheduled occurrence per prospect
        const { data: allSched } = await supabase
          .from('scheduled_connection_occurrences')
          .select('prospect_id, scheduled_date, scheduled_connections!inner(connection_type)')
          .in('prospect_id', ids)
          .eq('is_completed', false)
          .eq('is_skipped', false)
          .gte('scheduled_date', today)
          .order('scheduled_date', { ascending: true });

        const nextSchedMap: Record<string, { scheduled_date: string; connection_type: string }> = {};
        (allSched || []).forEach(s => {
          if (!nextSchedMap[s.prospect_id]) {
            nextSchedMap[s.prospect_id] = {
              scheduled_date: s.scheduled_date,
              connection_type: (s.scheduled_connections as any)?.connection_type,
            };
          }
        });

        results.forEach(p => {
          if (lastConnMap[p.id]) p.last_connection = lastConnMap[p.id];
          if (nextSchedMap[p.id]) p.next_scheduled_connection = nextSchedMap[p.id];
        });
      }

      setProspects(results);
    } catch (err) {
      console.error('Error loading prospects:', err);
    } finally {
      setLoading(false);
    }
  }

  const filteredProspects = useCallback(() => {
    let list = [...prospects];
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      list = list.filter(p =>
        (p.contact_name || '').toLowerCase().includes(q) ||
        (p.company_name || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q) ||
        (p.phone || '').toLowerCase().includes(q)
      );
    }
    if (sortBy === 'name') {
      list.sort((a, b) => {
        const an = primaryName(a).toLowerCase();
        const bn = primaryName(b).toLowerCase();
        return an < bn ? -1 : an > bn ? 1 : 0;
      });
    } else if (sortBy === 'last_contact') {
      list.sort((a, b) => {
        const ad = a.last_connection?.connection_date || '0';
        const bd = b.last_connection?.connection_date || '0';
        return bd < ad ? -1 : bd > ad ? 1 : 0;
      });
    }
    return list;
  }, [prospects, searchQuery, sortBy]);

  function primaryName(p: Prospect) {
    return p.contact_type === 'person'
      ? p.contact_name || p.company_name || '—'
      : p.company_name || p.contact_name || '—';
  }

  function secondaryName(p: Prospect) {
    return p.contact_type === 'person' ? p.company_name : p.contact_name;
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function getDaysSince(dateStr: string) {
    const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return '1 day ago';
    return `${days} days ago`;
  }

  function typeLabel(t: string) {
    return t ? t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : '';
  }

  function strengthColor(s: string | undefined) {
    if (s === 'very_strong' || s === 'strong') return 'bg-red-100 text-red-700';
    if (s === 'moderate') return 'bg-amber-100 text-amber-700';
    return 'bg-green-100 text-green-700';
  }

  function strengthLabel(s: string | undefined) {
    if (!s) return null;
    const map: Record<string, string> = {
      very_strong: 'Very Strong', strong: 'Strong', moderate: 'Moderate',
      weak: 'Weak', very_weak: 'Very Weak',
    };
    return map[s] || s.replace(/_/g, ' ');
  }

  const displayed = filteredProspects();

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (selectedProspect) {
    return (
      <ContactDetail
        contact={selectedProspect as any}
        onBack={() => setSelectedProspect(null)}
        onConverted={() => {
          setSelectedProspect(null);
          loadProspects();
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Page tab bar */}
      {profile?.can_view_prospects && (
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => setPageTab('prospects')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              pageTab === 'prospects'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Target className="w-4 h-4" />
            Prospects
          </button>
          <button
            onClick={() => setPageTab('competitors')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              pageTab === 'competitors'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Building2 className="w-4 h-4" />
            Competitors
          </button>
        </div>
      )}

      {/* Competitors view */}
      {pageTab === 'competitors' && profile?.can_view_prospects && (
        <CompetitorsList />
      )}

      {/* Prospects content */}
      {pageTab === 'prospects' && (
      <>
      {/* Page header */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-slate-700 to-slate-800 px-5 py-4 sm:px-6 sm:py-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex-shrink-0 w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">
                <Target className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-white leading-tight">Prospects</h1>
                <p className="text-sm text-slate-300">
                  {loading ? 'Loading...' : `${displayed.length} prospect${displayed.length !== 1 ? 's' : ''}`}
                  {viewMode === 'all' ? ' — All Reps' : ' — My Pipeline'}
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
                onClick={() => loadProspects()}
                title="Refresh"
                className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowContactForm(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-white text-slate-800 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New Prospect</span>
                <span className="sm:hidden">New</span>
              </button>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="px-4 py-3 sm:px-6 border-b border-gray-100 bg-gray-50">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* View toggle */}
            <div className="flex gap-1.5 flex-shrink-0">
              <button
                onClick={() => setViewMode('my')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  viewMode === 'my'
                    ? 'bg-slate-700 text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                }`}
              >
                <UserCircle className="w-3.5 h-3.5" />
                Mine
              </button>
              {(canViewAll || isAdminOrManager) && (
                <button
                  onClick={() => setViewMode('all')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    viewMode === 'all'
                      ? 'bg-slate-700 text-white'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  All Reps
                </button>
              )}
            </div>

            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search prospects..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-slate-500 focus:border-transparent bg-white"
              />
            </div>

            {/* Sort */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <SlidersHorizontal className="w-4 h-4 text-gray-400 hidden sm:block" />
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as typeof sortBy)}
                className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-slate-500 focus:border-transparent w-full sm:w-auto"
              >
                <option value="newest">Newest First</option>
                <option value="name">Name A–Z</option>
                <option value="last_contact">Last Contact</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Prospect list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-600 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Loading prospects...</p>
          </div>
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Target className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 font-medium">No prospects found</p>
          <p className="text-gray-400 text-sm mt-1">
            {searchQuery ? 'Try adjusting your search.' : 'Add your first prospect to get started.'}
          </p>
          {!searchQuery && (
            <button
              onClick={() => setShowContactForm(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Prospect
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {displayed.map(prospect => {
            const currentSuppliers = prospect.prospect_competitor_relationships?.filter(
              r => r.relationship_type === 'current_supplier'
            ) || [];

            return (
              <div
                key={prospect.id}
                onClick={() => setSelectedProspect(prospect)}
                className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-slate-300 active:bg-gray-50 transition-all cursor-pointer group touch-manipulation"
              >
                {/* Card header */}
                <div className="p-4 pb-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex-shrink-0 w-9 h-9 bg-slate-100 rounded-full flex items-center justify-center group-hover:bg-slate-200 transition-colors">
                        {prospect.contact_type === 'person'
                          ? <User className="w-4 h-4 text-slate-600" />
                          : <Building2 className="w-4 h-4 text-slate-600" />
                        }
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 text-sm leading-tight truncate">
                          {primaryName(prospect)}
                        </h3>
                        {secondaryName(prospect) && (
                          <p className="text-xs text-gray-500 truncate">{secondaryName(prospect)}</p>
                        )}
                        {prospect.title && (
                          <p className="text-xs text-gray-400 truncate">{prospect.title}</p>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-slate-500 transition-colors flex-shrink-0 mt-1" />
                  </div>

                  {/* Contact info */}
                  <div className="space-y-1">
                    {prospect.email && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-600 min-w-0">
                        <Mail className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        <span className="truncate">{prospect.email}</span>
                      </div>
                    )}
                    {prospect.phone && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-600">
                        <Phone className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        <span>{prospect.phone}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <Clock className="w-3 h-3 flex-shrink-0" />
                      <span>Added {formatDate(prospect.created_at)}</span>
                    </div>
                  </div>
                </div>

                {/* Current supplier */}
                {currentSuppliers.length > 0 && (
                  <div className="mx-4 mb-3 p-2.5 bg-orange-50 border border-orange-200 rounded-lg">
                    <div className="flex items-start gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-orange-500 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-orange-800 mb-1">Current Supplier</p>
                        <div className="flex flex-wrap gap-1.5">
                          {currentSuppliers.map(rel => (
                            <div key={rel.id} className="flex items-center gap-1">
                              <span className="text-xs font-medium text-orange-700">
                                {rel.competitors?.name}
                              </span>
                              {rel.relationship_strength && (
                                <span className={`text-xs px-1 py-0.5 rounded font-medium ${strengthColor(rel.relationship_strength)}`}>
                                  {strengthLabel(rel.relationship_strength)}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Electrician */}
                {prospect.electrician_name && (
                  <div className="mx-4 mb-3 p-2.5 bg-sky-50 border border-sky-200 rounded-lg">
                    <div className="flex items-start gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-sky-500 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-sky-800 mb-0.5">Electrician Used</p>
                        <p className="text-xs font-medium text-sky-700 truncate">{prospect.electrician_name}</p>
                        {prospect.electrician_notes && (
                          <p className="text-xs text-sky-500 mt-0.5 truncate">{prospect.electrician_notes}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Connection info + action buttons */}
                <div className="mx-4 mb-4 grid grid-cols-2 xs:grid-cols-2 gap-2">
                  {/* Last Contact column */}
                  <div className="flex flex-col gap-1.5">
                    {prospect.last_connection ? (
                      <div className="p-2 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-xs font-semibold text-blue-800 mb-0.5">Last Contact</p>
                        <p className="text-xs text-blue-700">
                          {getDaysSince(prospect.last_connection.connection_date)}
                        </p>
                        <p className="text-xs text-blue-500">{typeLabel(prospect.last_connection.connection_type)}</p>
                      </div>
                    ) : (
                      <div className="p-2 bg-gray-50 border border-gray-200 rounded-lg">
                        <p className="text-xs font-semibold text-gray-500 mb-0.5">Last Contact</p>
                        <p className="text-xs text-gray-400 italic">None logged</p>
                      </div>
                    )}
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setConnectionProspect(prospect);
                        setShowConnectionForm(true);
                      }}
                      className="flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 active:bg-slate-100 transition-colors touch-manipulation"
                    >
                      <TrendingUp className="w-3.5 h-3.5" />
                      Log Connection
                    </button>
                  </div>

                  {/* Next Scheduled column */}
                  <div className="flex flex-col gap-1.5">
                    {prospect.next_scheduled_connection ? (
                      <div className="p-2 bg-green-50 border border-green-200 rounded-lg">
                        <p className="text-xs font-semibold text-green-800 mb-0.5">Next Scheduled</p>
                        <p className="text-xs text-green-700">
                          {formatDate(prospect.next_scheduled_connection.scheduled_date)}
                        </p>
                        <p className="text-xs text-green-500">{typeLabel(prospect.next_scheduled_connection.connection_type)}</p>
                      </div>
                    ) : (
                      <div className="p-2 bg-gray-50 border border-gray-200 rounded-lg">
                        <p className="text-xs font-semibold text-gray-500 mb-0.5">Next Scheduled</p>
                        <p className="text-xs text-gray-400 italic">None scheduled</p>
                      </div>
                    )}
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setAppointmentProspect(prospect);
                        setShowAppointmentModal(true);
                      }}
                      className="flex items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium text-green-700 border border-green-200 rounded-lg hover:bg-green-50 active:bg-green-100 transition-colors touch-manipulation"
                    >
                      <CalendarPlus className="w-3.5 h-3.5" />
                      Schedule Appt
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New prospect form */}
      {showContactForm && (
        <ContactForm
          onClose={() => setShowContactForm(false)}
          onSuccess={() => {
            setShowContactForm(false);
            loadProspects();
          }}
          initialSalesStatus="prospect"
        />
      )}

      {/* Log connection form */}
      {showConnectionForm && connectionProspect && (
        <ConnectionForm
          contactId={connectionProspect.id}
          onClose={() => {
            setShowConnectionForm(false);
            setConnectionProspect(null);
          }}
          onSuccess={() => {
            setShowConnectionForm(false);
            setConnectionProspect(null);
            loadProspects();
          }}
        />
      )}

      {/* Schedule appointment modal */}
      {showAppointmentModal && appointmentProspect && (
        <CreateAppointmentModal
          contactId={appointmentProspect.id}
          calendarContext="technicians"
          onClose={() => {
            setShowAppointmentModal(false);
            setAppointmentProspect(null);
          }}
          onSuccess={() => {
            setShowAppointmentModal(false);
            setAppointmentProspect(null);
            loadProspects();
          }}
        />
      )}

      {/* Print modal */}
      {showPrint && (
        <PrintProspectsView
          prospects={displayed}
          repName={viewMode === 'all' ? 'All Reps' : (profile?.full_name || 'My Pipeline')}
          viewMode={viewMode}
          salesReps={salesReps}
          isAdminOrManager={isAdminOrManager}
          onClose={() => setShowPrint(false)}
        />
      )}
      </>
      )}
    </div>
  );
}
