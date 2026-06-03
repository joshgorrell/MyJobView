import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { ContactDetail } from '../Contacts/ContactDetail';
import { ContactForm } from '../Contacts/ContactForm';
import { LeadDetail } from '../Leads/LeadDetail';
import { LeadForm } from '../Leads/LeadForm';
import ConnectionForm from '../Connections/ConnectionForm';
import PrintLeadsView from '../Leads/PrintLeadsView';
import PrintProspectsView from '../Leads/PrintProspectsView';
import { formatDistanceToNow } from '../../lib/utils';
import { Clock, User, Phone, Mail, Calendar, Eye, EyeOff, CreditCard as Edit, ChevronRight, Filter, Users, CircleUser as UserCircle, X, Plus, Search, Building2, CalendarClock, Settings, Check, HelpCircle, Printer } from 'lucide-react';

interface Contact {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  created_at: string;
  created_by: string;
  is_prospect?: boolean;
  prospect_competitor_relationships?: Array<{
    id: string;
    relationship_type: string;
    relationship_strength?: string;
    competitors: {
      id: string;
      name: string;
    };
  }>;
  last_connection?: {
    connection_date: string;
    connection_type: string;
  };
  next_scheduled_connection?: {
    scheduled_date: string;
    connection_type: string;
  };
}

interface Connection {
  id: string;
  contact_id: string;
  user_id: string;
  connection_type: string;
  connection_date: string;
  notes: string;
  created_at: string;
  contacts?: Contact;
}

interface Lead {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string;
  status: string;
  priority: string;
  estimated_value: string;
  created_at: string;
  last_contact_date: string;
  assigned_to: string;
  assigned_to_name?: string;
  is_fishbowl: boolean;
}

interface PipelineStage {
  id: string;
  name: string;
  color: string;
  bgColor: string;
  borderColor: string;
  items: any[];
  count: number;
}

export function PipelineBoard() {
  const { profile, loading: authLoading } = useAuth();
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [viewMode, setViewMode] = useState<'my' | 'all'>('my');
  const [timeFilter, setTimeFilter] = useState<number>(14);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [canViewAllPipeline, setCanViewAllPipeline] = useState(false);
  const [showProspects, setShowProspects] = useState(() => {
    const saved = localStorage.getItem('pipeline_show_prospects');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [selectedContact, setSelectedContact] = useState<any | null>(null);
  const [selectedLead, setSelectedLead] = useState<string | null>(null);
  const [showContactForm, setShowContactForm] = useState(false);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [showConnectionForm, setShowConnectionForm] = useState(false);
  const [showFishbowlForm, setShowFishbowlForm] = useState(false);
  const [showClaimConfirm, setShowClaimConfirm] = useState(false);
  const [leadToClaim, setLeadToClaim] = useState<{ id: string; name: string } | null>(null);
  const [showWidgetSettings, setShowWidgetSettings] = useState(false);
  const [selectedWidgets, setSelectedWidgets] = useState<string[]>(['contacts', 'connections', 'leads', 'fishbowl']);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showPrintLeads, setShowPrintLeads] = useState(false);
  const [showPrintProspects, setShowPrintProspects] = useState(false);
  const [salesReps, setSalesReps] = useState<Array<{ id: string; full_name: string; role: string }>>([]);

  // All available widget definitions
  const allWidgetDefinitions = [
    {
      id: 'contacts',
      name: 'Contacts',
      description: 'New contacts',
      color: 'text-gray-700',
      bgColor: 'bg-gray-50',
      borderColor: 'border-gray-300'
    },
    {
      id: 'connections',
      name: 'Connections',
      description: 'New connections',
      color: 'text-blue-700',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-300'
    },
    {
      id: 'prospects',
      name: 'Prospects',
      description: 'Prospective customers',
      color: 'text-purple-700',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-300'
    },
    {
      id: 'leads',
      name: 'Leads',
      description: viewMode === 'my' ? 'My leads & unclaimed' : 'All active leads',
      color: 'text-green-700',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-300'
    },
    {
      id: 'fishbowl',
      name: 'Fishbowl',
      description: 'Available to claim',
      color: 'text-teal-700',
      bgColor: 'bg-teal-50',
      borderColor: 'border-teal-300'
    }
  ];

  // Filter to only show selected widgets
  const stageDefinitions = allWidgetDefinitions.filter(widget =>
    selectedWidgets.includes(widget.id)
  );

  useEffect(() => {
    // Wait for auth to complete before attempting to load
    if (authLoading) {
      return;
    }

    if (!profile) {
      setLoading(false);
      return;
    }

    const initializePreferences = async () => {
      await checkPermissions();
      await loadWidgetPreferences();
      await loadSalesReps();
      setPreferencesLoaded(true);
    };

    initializePreferences();
  }, [profile, authLoading]);

  useEffect(() => {
    // Wait for auth AND preferences to load before loading pipeline data
    if (authLoading || !profile || !preferencesLoaded) {
      return;
    }

    loadPipelineData();

    // Set up real-time subscriptions
    const contactsChannel = supabase
      .channel('pipeline_contacts')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contacts' },
        () => {
          loadPipelineData();
        }
      )
      .subscribe();

    const connectionsChannel = supabase
      .channel('pipeline_connections')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'connections' },
        () => {
          loadPipelineData();
        }
      )
      .subscribe();

    const leadsChannel = supabase
      .channel('pipeline_leads')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads' },
        () => {
          loadPipelineData();
        }
      )
      .subscribe();

    // Cleanup subscriptions
    return () => {
      supabase.removeChannel(contactsChannel);
      supabase.removeChannel(connectionsChannel);
      supabase.removeChannel(leadsChannel);
    };
  }, [viewMode, timeFilter, profile, authLoading, preferencesLoaded, selectedWidgets]);

  async function checkPermissions() {
    if (!profile?.id) return;

    try {
      const { data } = await supabase
        .from('profiles')
        .select('can_view_all_pipeline')
        .eq('id', profile.id)
        .maybeSingle();

      setCanViewAllPipeline(data?.can_view_all_pipeline ?? false);

      if (!data?.can_view_all_pipeline) {
        setViewMode('my');
      }
    } catch (error) {
      console.error('Error checking permissions:', error);
    }
  }

  async function loadWidgetPreferences() {
    if (!profile?.id) return;

    try {
      const { data } = await supabase
        .from('profiles')
        .select('pipeline_widgets')
        .eq('id', profile.id)
        .maybeSingle();

      if (data?.pipeline_widgets) {
        setSelectedWidgets(data.pipeline_widgets as string[]);
      }
    } catch (error) {
      console.error('Error loading widget preferences:', error);
    }
  }

  async function saveWidgetPreferences(widgets: string[]) {
    if (!profile?.id) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ pipeline_widgets: widgets })
        .eq('id', profile.id);

      if (error) throw error;

      setSelectedWidgets(widgets);
      setShowWidgetSettings(false);
    } catch (error) {
      console.error('Error saving widget preferences:', error);
      alert('Failed to save widget preferences');
    }
  }

  async function loadSalesReps() {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .in('role', ['sales', 'admin', 'manager', 'sales_v2'])
        .eq('is_active', true)
        .order('full_name');
      if (data) setSalesReps(data);
    } catch (error) {
      console.error('Error loading sales reps:', error);
    }
  }

  function toggleProspects() {
    const newValue = !showProspects;
    setShowProspects(newValue);
    localStorage.setItem('pipeline_show_prospects', JSON.stringify(newValue));
  }

  function getDateCutoff() {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - timeFilter);
    return cutoff.toISOString();
  }

  async function loadPipelineData() {
    try {
      const dateCutoff = getDateCutoff();
      const showAll = viewMode === 'all' && canViewAllPipeline;

      // Load Contacts with competitor and connection data (only if contacts or prospects widget is selected)
      let contacts: any[] = [];
      if (selectedWidgets.includes('contacts') || selectedWidgets.includes('prospects')) {
        let contactsQuery = supabase
          .from('contacts')
          .select(`
            *,
            prospect_competitor_relationships!prospect_competitor_relationships_prospect_id_fkey(
              id,
              relationship_type,
              relationship_strength,
              competitors:competitors(id, name)
            )
          `)
          .gte('created_at', dateCutoff)
          .order('created_at', { ascending: false });

        if (!showAll && profile?.id) {
          contactsQuery = contactsQuery.eq('created_by', profile.id);
        }

        const { data } = await contactsQuery;
        contacts = data || [];
      }

      // Batch-fetch last connection and next scheduled connection for all contacts
      if (contacts && contacts.length > 0) {
        const contactIds = contacts.map((c: any) => c.id);

        // Batch: all connections for these contacts (we'll pick the latest per contact in JS)
        const [{ data: allConnections }, { data: allScheduled }] = await Promise.all([
          supabase
            .from('connections')
            .select('contact_id, connection_date, connection_type')
            .in('contact_id', contactIds)
            .order('connection_date', { ascending: false }),
          supabase
            .from('scheduled_connection_occurrences')
            .select(`
              prospect_id,
              scheduled_date,
              scheduled_connections!inner(connection_type)
            `)
            .in('prospect_id', contactIds)
            .eq('is_completed', false)
            .eq('is_skipped', false)
            .gte('scheduled_date', new Date().toISOString().split('T')[0])
            .order('scheduled_date', { ascending: true })
        ]);

        // Build lookup maps (keep first/earliest per contact since results are ordered)
        const lastConnectionMap = new Map<string, any>();
        for (const conn of (allConnections || [])) {
          if (!lastConnectionMap.has(conn.contact_id)) {
            lastConnectionMap.set(conn.contact_id, {
              connection_date: conn.connection_date,
              connection_type: conn.connection_type
            });
          }
        }
        const nextScheduledMap = new Map<string, any>();
        for (const sched of (allScheduled || [])) {
          if (!nextScheduledMap.has(sched.prospect_id)) {
            nextScheduledMap.set(sched.prospect_id, {
              scheduled_date: sched.scheduled_date,
              connection_type: (sched.scheduled_connections as any)?.connection_type
            });
          }
        }

        for (const contact of contacts) {
          const lc = lastConnectionMap.get(contact.id);
          if (lc) contact.last_connection = lc;
          const ns = nextScheduledMap.get(contact.id);
          if (ns) contact.next_scheduled_connection = ns;
        }
      }

      // Load Connections (only if widget is selected)
      let connections: any[] = [];
      if (selectedWidgets.includes('connections')) {
        let connectionsQuery = supabase
          .from('connections')
          .select(`
            *,
            contacts:contact_id (
              contact_type,
              company_name,
              contact_name,
              email,
              phone
            )
          `)
          .gte('created_at', dateCutoff)
          .order('created_at', { ascending: false });

        if (!showAll && profile?.id) {
          connectionsQuery = connectionsQuery.eq('user_id', profile.id);
        }

        const { data } = await connectionsQuery;
        connections = data || [];
      }

      // Load Leads (only if widget is selected)
      let leads: any[] = [];
      if (selectedWidgets.includes('leads')) {
        let leadsQuery = supabase
          .from('leads')
          .select(`
            *,
            assigned_rep:profiles!leads_assigned_to_fkey(id, full_name)
          `)
          .eq('is_fishbowl', false)
          .order('created_at', { ascending: false });

        // Filter based on view mode
        if (!showAll && profile?.id) {
          // My Pipeline: Show my assigned leads OR unclaimed leads
          leadsQuery = leadsQuery.or(`assigned_to.eq.${profile.id},assigned_to.is.null`);
        }
        // All Pipeline: Show all non-fishbowl leads (no additional filter needed)

        const { data } = await leadsQuery;
        leads = data || [];
      }

      // Load Fishbowl (unclaimed leads marked as fishbowl) (only if widget is selected)
      let fishbowl: any[] = [];
      if (selectedWidgets.includes('fishbowl')) {
        let fishbowlQuery = supabase
          .from('leads')
          .select('*')
          .eq('is_fishbowl', true)
          .or('status.eq.unclaimed,assigned_to.is.null')
          .order('created_at', { ascending: false });

        const { data } = await fishbowlQuery;
        fishbowl = data || [];
      }

      // Build stages based on selected widgets
      const stagesData = [];

      // Add stages in the order they appear in stageDefinitions (which respects selectedWidgets order)
      for (const def of stageDefinitions) {
        if (def.id === 'contacts') {
          // Filter out prospects from contacts widget
          const nonProspectContacts = contacts.filter((c: any) => c.contact_type !== 'prospect' && c.contact_type !== 'lead');
          stagesData.push({
            ...def,
            items: nonProspectContacts,
            count: nonProspectContacts.length
          });
        } else if (def.id === 'prospects') {
          // Only show prospects in prospects widget
          const prospectContacts = contacts.filter((c: any) => c.contact_type === 'prospect');
          stagesData.push({
            ...def,
            items: prospectContacts,
            count: prospectContacts.length
          });
        } else if (def.id === 'connections') {
          stagesData.push({
            ...def,
            items: connections,
            count: connections.length
          });
        } else if (def.id === 'leads') {
          stagesData.push({
            ...def,
            items: leads,
            count: leads.length
          });
        } else if (def.id === 'fishbowl') {
          stagesData.push({
            ...def,
            items: fishbowl,
            count: fishbowl.length
          });
        }
      }

      setStages(stagesData);
    } catch (error) {
      console.error('Error loading pipeline data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function claimLead() {
    if (!leadToClaim) return;

    try {
      const { error } = await supabase
        .from('leads')
        .update({
          assigned_to: profile?.id,
          status: 'claimed',
          is_fishbowl: false,
          claimed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', leadToClaim.id);

      if (error) throw error;

      await supabase.from('activity_feed').insert({
        type: 'lead_claimed',
        user_id: profile?.id,
        metadata: { lead_id: leadToClaim.id }
      });

      setShowClaimConfirm(false);
      setLeadToClaim(null);
      loadPipelineData();
    } catch (error) {
      console.error('Error claiming lead:', error);
      alert('Failed to claim lead. Please try again.');
    }
  }

  function handleClaimClick(leadId: string, leadName: string) {
    setLeadToClaim({ id: leadId, name: leadName });
    setShowClaimConfirm(true);
  }

  const getDaysOld = (createdAt: string) => {
    const date = new Date(createdAt);
    const today = new Date();
    const diffTime = Math.abs(today.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Filter items based on search query
  const filterItems = (item: any, stageId: string) => {
    if (!searchQuery.trim()) return true;

    const query = searchQuery.toLowerCase();

    if (stageId === 'contacts') {
      return (
        item.company_name?.toLowerCase().includes(query) ||
        item.contact_name?.toLowerCase().includes(query) ||
        item.email?.toLowerCase().includes(query) ||
        item.phone?.toLowerCase().includes(query)
      );
    }

    if (stageId === 'connections') {
      const contact = item.contacts || {};
      return (
        contact.company_name?.toLowerCase().includes(query) ||
        contact.contact_name?.toLowerCase().includes(query) ||
        item.connection_type?.toLowerCase().includes(query) ||
        item.notes?.toLowerCase().includes(query)
      );
    }

    // Leads and Fishbowl
    return (
      item.company_name?.toLowerCase().includes(query) ||
      item.contact_name?.toLowerCase().includes(query) ||
      item.email?.toLowerCase().includes(query) ||
      item.phone?.toLowerCase().includes(query) ||
      item.assigned_rep?.full_name?.toLowerCase().includes(query)
    );
  };

  // Filter stages based on search
  const filteredStages = stages.map(stage => {
    let filteredItems = stage.items.filter(item => filterItems(item, stage.id));

    return {
      ...stage,
      items: filteredItems,
      count: filteredItems.length
    };
  });

  function handleAddNew(stageId: string) {
    switch (stageId) {
      case 'contacts':
      case 'prospects':
        setShowContactForm(true);
        break;
      case 'connections':
        setShowConnectionForm(true);
        break;
      case 'leads':
        setShowLeadForm(true);
        break;
      case 'fishbowl':
        setShowFishbowlForm(true);
        break;
    }
  }

  async function handleContactClick(contactId: string) {
    console.log('Contact clicked:', contactId);
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select(`
          *,
          creator:profiles!contacts_created_by_fkey(id, full_name),
          assigned_rep:profiles!contacts_assigned_to_fkey(id, full_name),
          office:company_offices(id, office_name, city, state)
        `)
        .eq('id', contactId)
        .maybeSingle();

      if (error) {
        console.error('Query error:', error);
        throw error;
      }

      if (!data) {
        console.error('Contact not found');
        alert('Contact not found');
        return;
      }

      console.log('Contact loaded successfully:', data);
      setSelectedContact(data);
    } catch (error: any) {
      console.error('Error loading contact:', error);
      alert(`Failed to load contact: ${error.message || 'Unknown error'}`);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading pipeline...</p>
        </div>
      </div>
    );
  }

  const totalItems = filteredStages.reduce((sum, stage) => sum + stage.count, 0);
  const originalTotalItems = stages.reduce((sum, stage) => sum + stage.count, 0);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-white mb-1 sm:mb-2">
                Pipeline Board
              </h2>
              <p className="text-sm sm:text-base text-gray-300">
                {searchQuery ? `${totalItems} of ${originalTotalItems} items` : `${totalItems} items`}
              </p>
            </div>
            <button
              onClick={() => setShowTutorial(true)}
              className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              title="Learn about Pipeline concepts"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search and Filter Row */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
          {/* Search Box */}
          <div className="relative flex-1 sm:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search contacts, leads, companies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-gray-300 rounded-lg text-gray-700 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all touch-manipulation"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded transition-colors"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            )}
          </div>

          {/* View Mode and Time Filter */}
          <div className="flex items-center gap-2 sm:gap-3">
            {canViewAllPipeline && (
              <div className="flex items-center gap-1 bg-white rounded-lg p-1">
                <button
                  onClick={() => setViewMode('my')}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors touch-manipulation ${
                    viewMode === 'my'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 hover:bg-gray-100 active:bg-gray-200'
                  }`}
                >
                  <UserCircle className="w-4 h-4" />
                  <span className="hidden sm:inline">My Pipeline</span>
                  <span className="sm:hidden">My</span>
                </button>
                <button
                  onClick={() => setViewMode('all')}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors touch-manipulation ${
                    viewMode === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 hover:bg-gray-100 active:bg-gray-200'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span className="hidden sm:inline">All Pipeline</span>
                  <span className="sm:hidden">All</span>
                </button>
              </div>
            )}

            <select
              value={timeFilter}
              onChange={(e) => setTimeFilter(Number(e.target.value))}
              className="px-3 py-2.5 text-sm bg-white border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 active:bg-gray-100 transition-colors focus:ring-2 focus:ring-blue-500 focus:border-transparent touch-manipulation"
            >
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={60}>Last 60 days</option>
              <option value={90}>Last 90 days</option>
            </select>

            {/* Widget Customization Button */}
            <button
              onClick={() => setShowWidgetSettings(true)}
              className="flex items-center gap-2 px-3 py-2.5 text-sm bg-white border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 active:bg-gray-100 transition-colors touch-manipulation"
              title="Customize widgets"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden sm:inline">Widgets</span>
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto pb-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
          {filteredStages.map(stage => (
            <div key={stage.id} className="flex flex-col">
              <div className={`${stage.bgColor} border-2 ${stage.borderColor} rounded-t-lg p-3 sm:p-4`}>
                <div className="flex items-center justify-between mb-1">
                  <h3 className={`text-sm sm:text-base font-semibold ${stage.color}`}>
                    {stage.name}
                  </h3>
                  <div className="flex items-center gap-1">
                    {(stage.id === 'leads' || stage.id === 'prospects') && (
                      <button
                        onClick={() => {
                          if (stage.id === 'leads') setShowPrintLeads(true);
                          else setShowPrintProspects(true);
                        }}
                        className="p-1.5 hover:bg-white/50 active:bg-white/70 rounded transition-colors touch-manipulation"
                        title={`Print ${stage.name} report`}
                      >
                        <Printer className="w-4 h-4 text-gray-600" />
                      </button>
                    )}
                    <button
                      onClick={() => handleAddNew(stage.id)}
                      className="p-1.5 hover:bg-white/50 active:bg-white/70 rounded transition-colors touch-manipulation"
                      title={`Add new ${stage.name.toLowerCase()}`}
                    >
                      <Plus className="w-4 h-4 text-gray-700" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-gray-600 mb-2">{stage.description}</p>
                <div className="text-xs sm:text-sm">
                  <span className="text-gray-700 font-medium">
                    {stage.count} item{stage.count !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              <div className="bg-gray-50 border-l-2 border-r-2 border-b-2 border-gray-200 rounded-b-lg p-2 space-y-2 min-h-[500px] max-h-[600px] overflow-y-auto">
                {stage.count === 0 ? (
                  <div className="text-center py-8 text-sm text-gray-400">
                    No items
                  </div>
                ) : (
                  stage.items.map(item => {
                    const daysOld = getDaysOld(item.created_at);
                    const isNew = daysOld <= 14;

                    // Render different card types based on stage
                    if (stage.id === 'contacts' || stage.id === 'prospects') {
                      const isProspect = item.contact_type === 'prospect';
                      const currentCompetitors = item.prospect_competitor_relationships?.filter(
                        (rel: any) => rel.relationship_type === 'current_supplier'
                      );

                      return (
                        <div
                          key={item.id}
                          onClick={() => handleContactClick(item.id)}
                          className={`bg-white rounded-lg border-2 p-3 hover:shadow-md hover:border-blue-400 active:bg-gray-50 transition-all cursor-pointer touch-manipulation ${
                            isProspect ? 'border-purple-300 bg-purple-50/30' : 'border-gray-200'
                          }`}
                        >
                          <div className="mb-2">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <h4 className="font-semibold text-gray-900 text-sm truncate">
                                {item.contact_type === 'person'
                                  ? (item.contact_name || item.company_name)
                                  : (item.company_name || item.contact_name)}
                              </h4>
                              <div className="flex items-center gap-1">
                                {isNew && (
                                  <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs font-bold rounded-full">
                                    NEW
                                  </span>
                                )}
                                {isProspect && (
                                  <span className="px-2 py-0.5 bg-purple-100 text-purple-800 text-xs font-bold rounded-full">
                                    PROSPECT
                                  </span>
                                )}
                              </div>
                            </div>
                            {item.contact_type === 'person' ? (
                              item.company_name && (
                                <p className="text-xs text-gray-600">
                                  {item.company_name}
                                </p>
                              )
                            ) : (
                              item.contact_name && (
                                <p className="text-xs text-gray-600">
                                  {item.contact_name}
                                </p>
                              )
                            )}
                          </div>

                          {/* Competitor Information - Prominent for Prospects */}
                          {isProspect && currentCompetitors && currentCompetitors.length > 0 && (
                            <div className="mb-2 p-2 bg-orange-50 border border-orange-200 rounded">
                              <div className="flex items-start gap-1.5">
                                <Building2 className="w-3.5 h-3.5 text-orange-600 mt-0.5 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-orange-900 mb-0.5">
                                    Current Supplier:
                                  </p>
                                  {currentCompetitors.map((rel: any) => (
                                    <p key={rel.id} className="text-xs text-orange-800 truncate">
                                      {rel.competitors?.name}
                                      {rel.relationship_strength && (
                                        <span className="ml-1 text-orange-600">
                                          ({rel.relationship_strength})
                                        </span>
                                      )}
                                    </p>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Last Connection - Prominent for Prospects */}
                          {isProspect && item.last_connection && (
                            <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded">
                              <div className="flex items-start gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-blue-600 mt-0.5 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-blue-900 mb-0.5">
                                    Last Contact:
                                  </p>
                                  <p className="text-xs text-blue-800">
                                    {formatDistanceToNow(item.last_connection.connection_date)} ago
                                    <span className="text-blue-600 ml-1">
                                      ({item.last_connection.connection_type.replace('_', ' ')})
                                    </span>
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Next Scheduled Connection - Prominent for Prospects */}
                          {isProspect && item.next_scheduled_connection && (
                            <div className="mb-2 p-2 bg-green-50 border border-green-200 rounded">
                              <div className="flex items-start gap-1.5">
                                <CalendarClock className="w-3.5 h-3.5 text-green-600 mt-0.5 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-green-900 mb-0.5">
                                    Next Scheduled:
                                  </p>
                                  <p className="text-xs text-green-800">
                                    {new Date(item.next_scheduled_connection.scheduled_date).toLocaleDateString()}
                                    <span className="text-green-600 ml-1">
                                      ({item.next_scheduled_connection.connection_type.replace('_', ' ')})
                                    </span>
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}

                          {item.email && (
                            <div className="flex items-center gap-1 text-xs text-gray-600 mb-1">
                              <Mail className="w-3 h-3" />
                              <span className="truncate">{item.email}</span>
                            </div>
                          )}
                          {item.phone && (
                            <div className="flex items-center gap-1 text-xs text-gray-600 mb-2">
                              <Phone className="w-3 h-3" />
                              <span>{item.phone}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1 text-xs text-gray-500">
                              <Clock className="w-3 h-3" />
                              <span>{formatDistanceToNow(item.created_at)}</span>
                            </div>
                            <Eye className="w-4 h-4 text-gray-400" />
                          </div>
                        </div>
                      );
                    }

                    if (stage.id === 'connections') {
                      const contact = item.contacts || {};
                      return (
                        <div
                          key={item.id}
                          onClick={() => handleContactClick(item.contact_id)}
                          className="bg-white rounded-lg border-2 border-gray-200 p-3 hover:shadow-md hover:border-blue-400 active:bg-gray-50 transition-all cursor-pointer touch-manipulation"
                        >
                          <div className="mb-2">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <h4 className="font-semibold text-gray-900 text-sm truncate">
                                {contact.contact_type === 'person'
                                  ? (contact.contact_name || contact.company_name)
                                  : (contact.company_name || contact.contact_name)}
                              </h4>
                              {isNew && (
                                <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs font-bold rounded-full">
                                  NEW
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-600">
                              {item.connection_type?.replace('_', ' ')}
                            </p>
                          </div>
                          {item.notes && (
                            <p className="text-xs text-gray-600 mb-2 line-clamp-2">
                              {item.notes}
                            </p>
                          )}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1 text-xs text-gray-500">
                              <Clock className="w-3 h-3" />
                              <span>{formatDistanceToNow(item.created_at)}</span>
                            </div>
                            <Eye className="w-4 h-4 text-gray-400" />
                          </div>
                        </div>
                      );
                    }

                    // Leads and Fishbowl
                    const isAssignedToMe = item.assigned_to === profile?.id;
                    const isAssigned = !!item.assigned_to;

                    return (
                      <div
                        key={item.id}
                        onClick={() => setSelectedLead(item.id)}
                        className={`bg-white rounded-lg border-2 p-3 hover:shadow-md active:shadow-lg transition-all cursor-pointer touch-manipulation ${
                          isAssignedToMe
                            ? 'border-blue-500 bg-blue-50/30'
                            : 'border-gray-200 hover:border-blue-400 active:bg-gray-50'
                        }`}
                      >
                        <div className="mb-2">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <h4 className="font-semibold text-gray-900 text-sm truncate">
                              {item.contact_name}
                            </h4>
                            <div className="flex items-center gap-1">
                              {isNew && (
                                <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs font-bold rounded-full">
                                  NEW
                                </span>
                              )}
                              {isAssignedToMe && (
                                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs font-bold rounded-full">
                                  MINE
                                </span>
                              )}
                            </div>
                          </div>
                          {item.company_name && item.company_name.toLowerCase() !== 'unknown' && (
                            <p className="text-xs text-gray-600 mb-1">
                              {item.company_name}
                            </p>
                          )}
                          {item.lead_source === 'kiosk' && (
                            <div className="flex items-center gap-1 text-blue-600 text-xs font-semibold mb-1">
                              <span>📱 Kiosk Entry</span>
                            </div>
                          )}
                        </div>
                        {item.email && (
                          <div className="flex items-center gap-1 text-xs text-gray-600 mb-1">
                            <Mail className="w-3 h-3" />
                            <span className="truncate">{item.email}</span>
                          </div>
                        )}
                        {item.phone && (
                          <div className="flex items-center gap-1 text-xs text-gray-600 mb-2">
                            <Phone className="w-3 h-3" />
                            <span>{item.phone}</span>
                          </div>
                        )}
                        {item.priority && (
                          <div className="mb-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              item.priority === 'critical'
                                ? 'bg-red-100 text-red-800'
                                : item.priority === 'high'
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {item.priority}
                            </span>
                          </div>
                        )}
                        {/* Show assigned rep info */}
                        {isAssigned && !isAssignedToMe && item.assigned_rep?.full_name && (
                          <div className="flex items-center gap-1 text-xs text-gray-600 mb-2 bg-gray-50 px-2 py-1 rounded">
                            <User className="w-3 h-3" />
                            <span className="truncate">{item.assigned_rep.full_name}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <Clock className="w-3 h-3" />
                            <span>{formatDistanceToNow(item.created_at)}</span>
                          </div>
                          <Eye className="w-4 h-4 text-gray-400" />
                        </div>
                        {(!item.assigned_to || item.status === 'unclaimed') && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleClaimClick(item.id, item.contact_name);
                            }}
                            className="w-full px-3 py-2.5 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 active:bg-blue-800 transition-colors mt-2 touch-manipulation"
                          >
                            Claim Lead
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Pipeline Insights {searchQuery && <span className="text-sm text-gray-500 font-normal">(filtered)</span>}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {selectedWidgets.includes('contacts') && (
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">New Contacts</p>
              <p className="text-2xl font-bold text-gray-700">
                {filteredStages.find(s => s.id === 'contacts')?.count || 0}
              </p>
            </div>
          )}
          {selectedWidgets.includes('connections') && (
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">New Connections</p>
              <p className="text-2xl font-bold text-blue-600">
                {filteredStages.find(s => s.id === 'connections')?.count || 0}
              </p>
            </div>
          )}
          {selectedWidgets.includes('prospects') && (
            <div className="p-4 bg-purple-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Prospects</p>
              <p className="text-2xl font-bold text-purple-600">
                {filteredStages.find(s => s.id === 'prospects')?.count || 0}
              </p>
            </div>
          )}
          {selectedWidgets.includes('leads') && (
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Leads</p>
              <p className="text-2xl font-bold text-green-600">
                {filteredStages.find(s => s.id === 'leads')?.count || 0}
              </p>
            </div>
          )}
          {selectedWidgets.includes('fishbowl') && (
            <div className="p-4 bg-teal-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Fishbowl Items</p>
              <p className="text-2xl font-bold text-teal-600">
                {filteredStages.find(s => s.id === 'fishbowl')?.count || 0}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Detail View Modals */}
      {selectedContact && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-gray-50 rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-xl font-bold text-gray-900">Contact Details</h2>
              <button
                onClick={() => {
                  setSelectedContact(null);
                  loadPipelineData();
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <ContactDetail
              contact={selectedContact}
              onBack={() => {
                setSelectedContact(null);
                loadPipelineData();
              }}
              onConverted={() => {
                setSelectedContact(null);
                loadPipelineData();
              }}
            />
          </div>
        </div>
      )}

      {selectedLead && (
        <LeadDetail
          leadId={selectedLead}
          onClose={() => {
            setSelectedLead(null);
            loadPipelineData();
          }}
        />
      )}

      {/* Create Forms */}
      {showContactForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-full sm:max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-xl font-bold text-gray-900">New Contact</h2>
              <button
                onClick={() => setShowContactForm(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6">
              <ContactForm
                onClose={() => setShowContactForm(false)}
                onSuccess={() => {
                  setShowContactForm(false);
                  loadPipelineData();
                }}
              />
            </div>
          </div>
        </div>
      )}

      {showLeadForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-full sm:max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-xl font-bold text-gray-900">New Lead</h2>
              <button
                onClick={() => setShowLeadForm(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6">
              <LeadForm
                onClose={() => setShowLeadForm(false)}
                onSuccess={() => {
                  setShowLeadForm(false);
                  loadPipelineData();
                }}
              />
            </div>
          </div>
        </div>
      )}

      {showConnectionForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-full sm:max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-xl font-bold text-gray-900">New Connection</h2>
              <button
                onClick={() => setShowConnectionForm(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6">
              <ConnectionForm
                onClose={() => setShowConnectionForm(false)}
                onSuccess={() => {
                  setShowConnectionForm(false);
                  loadPipelineData();
                }}
              />
            </div>
          </div>
        </div>
      )}

      {showFishbowlForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-full sm:max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-xl font-bold text-gray-900">New Fishbowl Entry</h2>
              <button
                onClick={() => setShowFishbowlForm(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6">
              <LeadForm
                onClose={() => setShowFishbowlForm(false)}
                onSuccess={() => {
                  setShowFishbowlForm(false);
                  loadPipelineData();
                }}
              />
            </div>
          </div>
        </div>
      )}

      {showClaimConfirm && leadToClaim && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Claim This Lead?</h3>
            <p className="text-gray-600 mb-2">
              Are you sure you want to claim <strong>{leadToClaim.name}</strong>?
            </p>
            <p className="text-sm text-gray-500 mb-6">
              This will assign the lead to you and move it from the Fishbowl to your Leads list.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowClaimConfirm(false);
                  setLeadToClaim(null);
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={claimLead}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                Yes, Claim Lead
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Widget Settings Modal */}
      {showWidgetSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Customize Pipeline Widgets</h3>
                <button
                  onClick={() => setShowWidgetSettings(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <p className="text-sm text-gray-600 mt-1">Select up to 4 widgets to display</p>
            </div>

            <div className="p-6 space-y-3">
              {allWidgetDefinitions.map(widget => {
                const isSelected = selectedWidgets.includes(widget.id);
                const canToggle = isSelected || selectedWidgets.length < 4;

                return (
                  <button
                    key={widget.id}
                    onClick={() => {
                      if (!canToggle && !isSelected) return;

                      const newWidgets = isSelected
                        ? selectedWidgets.filter(w => w !== widget.id)
                        : [...selectedWidgets, widget.id];

                      setSelectedWidgets(newWidgets);
                    }}
                    disabled={!canToggle && !isSelected}
                    className={`w-full flex items-center justify-between p-4 rounded-lg border-2 transition-all ${
                      isSelected
                        ? `${widget.borderColor} ${widget.bgColor}`
                        : canToggle
                        ? 'border-gray-200 bg-white hover:border-gray-300'
                        : 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex-1 text-left">
                      <div className={`font-semibold ${isSelected ? widget.color : 'text-gray-700'}`}>
                        {widget.name}
                      </div>
                      <div className="text-sm text-gray-600">{widget.description}</div>
                    </div>
                    {isSelected && (
                      <div className={`flex items-center justify-center w-6 h-6 rounded-full ${widget.color.replace('text-', 'bg-')} bg-opacity-20`}>
                        <Check className={`w-4 h-4 ${widget.color}`} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-lg flex gap-3">
              <button
                onClick={() => {
                  setShowWidgetSettings(false);
                  loadWidgetPreferences();
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-white transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => saveWidgetPreferences(selectedWidgets)}
                disabled={selectedWidgets.length === 0}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
              >
                Save ({selectedWidgets.length}/4)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Modals */}
      {showPrintLeads && (() => {
        const leadsStage = filteredStages.find(s => s.id === 'leads');
        return (
          <PrintLeadsView
            leads={leadsStage?.items || []}
            repName={viewMode === 'all' ? 'All Reps' : (profile?.full_name || 'Unknown Rep')}
            viewMode={viewMode}
            onClose={() => setShowPrintLeads(false)}
            salesReps={salesReps}
            isAdminOrManager={profile?.role === 'admin' || profile?.role === 'manager'}
          />
        );
      })()}

      {showPrintProspects && (() => {
        const prospectsStage = filteredStages.find(s => s.id === 'prospects');
        return (
          <PrintProspectsView
            prospects={prospectsStage?.items || []}
            repName={viewMode === 'all' ? 'All Reps' : (profile?.full_name || 'Unknown Rep')}
            viewMode={viewMode}
            onClose={() => setShowPrintProspects(false)}
            salesReps={salesReps}
            isAdminOrManager={profile?.role === 'admin' || profile?.role === 'manager'}
          />
        );
      })()}

      {/* Tutorial Modal */}
      {showTutorial && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-full sm:max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 flex items-center justify-between z-10 rounded-t-lg">
              <div className="flex items-center gap-3">
                <HelpCircle className="w-6 h-6" />
                <h2 className="text-xl font-bold">Pipeline Board Tutorial</h2>
              </div>
              <button
                onClick={() => setShowTutorial(false)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-gray-700 leading-relaxed">
                  The Pipeline Board gives you a kanban-style view of your entire sales pipeline — from new contacts
                  to hot leads ready to close. Here's what each column means:
                </p>
              </div>

              {/* Contacts */}
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                    <UserCircle className="w-6 h-6 text-gray-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Contacts</h3>
                    <p className="text-gray-700 leading-relaxed mb-3">
                      A <strong>Contact</strong> is a person or company in your database. Contacts can be classified
                      as a <strong>Customer</strong> (existing client), a <strong>Prospect</strong> (future opportunity being nurtured),
                      or a <strong>Lead</strong> (hot inbound inquiry). They are the foundation of your CRM and every
                      interaction is tracked against them.
                    </p>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <p className="text-sm text-gray-600">
                        <strong>Example:</strong> A homeowner you installed a system for last year (Customer), or a new
                        business you met at a networking event (Prospect or Lead depending on their buying intent).
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Prospects */}
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Prospects</h3>
                    <p className="text-gray-700 leading-relaxed mb-3">
                      A <strong>Prospect</strong> is a future opportunity that needs long-term nurturing — someone
                      who is not ready to buy right now but has potential down the road. You can track which competitors
                      they currently use and the strength of those relationships, so you know when and how to make your move.
                      A Lead can be downgraded to a Prospect if the timing isn't right yet.
                    </p>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-sm text-gray-600">
                        <strong>Example:</strong> A property manager locked into a contract with a competitor for another
                        year. You stay in touch and track the competitor relationship so you're top of mind when they\'re
                        ready to switch.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Leads */}
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <User className="w-6 h-6 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Leads</h3>
                    <p className="text-gray-700 leading-relaxed mb-3">
                      A <strong>Lead</strong> is a hot opportunity — someone ready to buy now or very soon. Leads have
                      a priority level (Urgent, High, Medium, Low), a temperature rating, and are assigned to a specific
                      salesperson once claimed. An unclaimed lead sits in the <strong>Fishbowl</strong> until a rep
                      picks it up. Once claimed, it appears in that rep's active pipeline. Leads close as
                      either <strong>Won</strong> or <strong>Lost</strong>.
                    </p>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <p className="text-sm text-gray-600">
                        <strong>Example:</strong> Someone who called in requesting a quote today. Priority: High,
                        Temperature: Hot. Claimed by and assigned to Sarah — she works it until it closes.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Connections */}
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                    <CalendarClock className="w-6 h-6 text-orange-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Connections</h3>
                    <p className="text-gray-700 leading-relaxed mb-3">
                      A <strong>Connection</strong> is a logged interaction with a contact — a call, email, meeting,
                      site visit, or any other touchpoint. Every connection is dated, typed, and can include notes and
                      a follow-up flag. This column shows your most recent connections so you can see who you've been
                      in touch with and who needs attention.
                    </p>
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                      <p className="text-sm text-gray-600">
                        <strong>Example:</strong> "Called Mike on 2/20 to check in — he wants to revisit pricing next
                        quarter. Follow-up reminder set for 5/1."
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Fishbowl */}
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
                    <Users className="w-6 h-6 text-teal-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Fishbowl</h3>
                    <p className="text-gray-700 leading-relaxed mb-3">
                      The <strong>Fishbowl</strong> is the pool of unclaimed leads available for any salesperson to pick up.
                      A lead enters the Fishbowl when it hasn't been assigned to anyone yet — whether it came in through
                      a web form, was entered manually, or was released back by a rep. When you claim a lead from the
                      Fishbowl, it's assigned to you and moves into your active Leads pipeline.
                    </p>
                    <div className="bg-teal-50 border border-teal-200 rounded-lg p-3">
                      <p className="text-sm text-gray-600">
                        <strong>Example:</strong> Three new inbound inquiries came in overnight. They sit in the Fishbowl
                        until a rep claims one — first come, first served.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* How it all works together */}
              <div className="bg-gradient-to-r from-blue-50 to-green-50 border border-blue-200 rounded-lg p-5">
                <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <ChevronRight className="w-5 h-5 text-blue-600" />
                  How It All Works Together
                </h3>
                <div className="space-y-3 text-gray-700">
                  <div>
                    <p className="text-sm font-semibold text-blue-700 uppercase tracking-wide mb-1">Nurture Path</p>
                    <div className="space-y-1.5 pl-1">
                      <p className="flex items-start gap-2 text-sm">
                        <span className="text-blue-600 font-bold">1.</span>
                        <span>You meet someone and add them as a <strong>Contact</strong>.</span>
                      </p>
                      <p className="flex items-start gap-2 text-sm">
                        <span className="text-blue-600 font-bold">2.</span>
                        <span>They're not ready to buy yet, so you mark them as a <strong>Prospect</strong> and log regular <strong>Connections</strong> to stay on their radar.</span>
                      </p>
                      <p className="flex items-start gap-2 text-sm">
                        <span className="text-blue-600 font-bold">3.</span>
                        <span>When they're finally ready, you create a <strong>Lead</strong> and work it to close.</span>
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-green-700 uppercase tracking-wide mb-1">Inbound / Fishbowl Path</p>
                    <div className="space-y-1.5 pl-1">
                      <p className="flex items-start gap-2 text-sm">
                        <span className="text-green-600 font-bold">1.</span>
                        <span>A new inquiry comes in and lands in the <strong>Fishbowl</strong> as an unclaimed Lead.</span>
                      </p>
                      <p className="flex items-start gap-2 text-sm">
                        <span className="text-green-600 font-bold">2.</span>
                        <span>A rep claims it — the Lead is now assigned to them and active in their pipeline.</span>
                      </p>
                      <p className="flex items-start gap-2 text-sm">
                        <span className="text-green-600 font-bold">3.</span>
                        <span>The rep logs <strong>Connections</strong> as they work the opportunity and closes it as Won or Lost.</span>
                      </p>
                      <p className="flex items-start gap-2 text-sm">
                        <span className="text-green-600 font-bold">4.</span>
                        <span>If the timing isn't right, the Lead can be downgraded to a <strong>Prospect</strong> for long-term nurturing.</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pro Tip */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center text-yellow-900 font-bold text-sm">
                      !
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900 mb-1">Pro Tip</h4>
                    <p className="text-sm text-gray-700">
                      Use the <strong>My Pipeline</strong> toggle to focus only on contacts, leads, and connections
                      assigned to or owned by you. Use the <strong>search bar</strong> to quickly find anyone by name,
                      company, or phone. Keep your pipeline healthy by logging connections after every touchpoint and
                      claiming Fishbowl leads promptly — speed to contact wins deals.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-lg flex justify-end">
              <button
                onClick={() => setShowTutorial(false)}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Got It!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
