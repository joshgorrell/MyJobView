import { useConversationHeight } from './useConversationHeight';
import { WeeklyProposalActivity } from './WeeklyProposalActivity';
import { ServiceRequestFlowDetail } from './ServiceRequestFlowDetail';
import { proposalActivityPath } from '../../lib/proposalActivityLinks';
import { Fragment, ReactNode, useEffect, useId, useMemo, useRef, useState, useLayoutEffect } from 'react';
import { Activity, Calendar, Check, CheckCheck, ChevronDown, ChevronRight, Filter, MessageSquare, Package, Plus, Search, User, Wrench, X, DollarSign, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useDepartments } from '../../contexts/DepartmentContext';
import { useFlow } from '../../lib/flow/useFlow';
import { dayLabel, FLOW_CATEGORIES, FlowEvent, FlowFilters, FlowScope, FlowTarget, scopeFilters, targetScope } from '../../lib/flow/types';
import { FlowCreateModal } from './FlowCreateModal';
import { FlowTargetPicker } from './FlowTargetPicker';
import { FlowWaveIcon } from './FlowWaveIcon';
import './flow.css';
import { CustomerConversations, CustomerConversationsProps } from './CustomerConversations';
import { PhoneVoicemailFlowInbox } from './PhoneVoicemailFlowInbox';

type Option = { id: string; name: string };
const FLOW_KINDS: Record<string, string> = { messages: 'Messages', discussions: 'Team', updates: 'Updates', tasks: 'Assignments', activity: 'Other activity' };
type FlowView = 'all' | 'activity' | 'messages' | 'tasks' | 'voicemails';
type MessageFilter = 'all' | 'customer' | 'coworkers' | 'unread';
const FLOW_VIEWS: { id: FlowView; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'activity', label: 'Activity' }, { id: 'messages', label: 'Messages' },
];
const TASKS_LABEL = 'Assignments';
const MESSAGE_FILTERS: { id: MessageFilter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'customer', label: 'Customer' },
  { id: 'coworkers', label: 'Coworkers' }, { id: 'unread', label: 'Unread' },
];
function matchesView(event: FlowEvent, view: FlowView, filter: MessageFilter) {
  if (view === 'all') return true;
  if (view === 'activity') return !['messages', 'discussion_posts'].includes(event.source_table);
  // Customer conversations are rendered by the shared inbox below.
  return filter !== 'customer' && event.source_table === 'discussion_posts'
    && (filter !== 'unread' || !event.viewed);
}
function eventKind(event: FlowEvent): string {
  if (event.source_table === 'messages') return event.is_internal ? 'Internal message' : 'Customer message';
  if (event.source_table === 'discussion_posts') return event.audience_type === 'direct' ? 'Direct message' : event.audience_type === 'department' ? 'Department message' : 'Company message';
  if (['connections','activity_feed'].includes(event.source_table)) return 'Interaction';
  if (event.source_table === 'tasks' || event.source_table === 'task_comments') return 'Task';
  if (event.category === 'update') return 'Update';
  return 'Activity';
}
const ICONS = { work: Wrench, service: Wrench, sales: FileText, materials: Package, scheduling: Calendar, customer: User, financial: DollarSign, update: MessageSquare, communication: MessageSquare };

export default function Flow({ contactId, projectId, workOrderId, dark = false, createRequested, onCreateOpened, tasksContent, initialTaskView = false, ...conversationProps }: FlowScope & { dark?: boolean; tasksContent?: ReactNode; initialTaskView?: boolean } & CustomerConversationsProps) {
  const controlId = useId();
  const searchId = `${controlId}-search`;
  const filtersId = `${controlId}-filters`;
  const { profile } = useAuth();
  const { hasModuleAccess } = useDepartments();
  const scoped = !!(contactId || projectId || workOrderId);
  const [canViewVoicemail, setCanViewVoicemail] = useState(false);
  useEffect(() => {
    if (scoped || !profile?.id || typeof supabase.functions?.invoke !== 'function') { setCanViewVoicemail(false); return; }
    let cancelled = false;
    setCanViewVoicemail(false);
    void supabase.functions.invoke('phone-voicemail-inbox', { method: 'GET' })
      .then(({ error }) => { if (!cancelled) setCanViewVoicemail(!error); })
      .catch(() => { if (!cancelled) setCanViewVoicemail(false); });
    return () => { cancelled = true; };
  }, [scoped, profile?.id]);
  const focusUpdateId = !scoped ? new URLSearchParams(window.location.search).get('flowUpdateId') : null;
  const [view, setView] = useState<FlowView>(initialTaskView || (!hasModuleAccess('feed') && !hasModuleAccess('messages') && !!tasksContent) ? 'tasks' : conversationProps.openThreadId ? 'messages' : 'all');
  const workspaceSize = useConversationHeight(view === 'messages' && !scoped);
  // Preserve the outer workspace position while the tab body changes.
  const scrollHost = useRef<HTMLElement | null>(null);
  const savedScroll = useRef(0);
  const changeView = (next: FlowView) => {
    const host = scrollHost.current;
    if (host) savedScroll.current = host.scrollTop;
    setView(next);
  };
  useLayoutEffect(() => {
    const host = scrollHost.current;
    if (host) host.scrollTop = savedScroll.current;
  }, [view]);
  useEffect(() => {
    const root = workspaceSize.ref.current;
    scrollHost.current = root?.closest('main') ?? null;
  }, [workspaceSize.ref]);
  const [messageRequest, setMessageRequest] = useState(0);
  const [messageFilter, setMessageFilter] = useState<MessageFilter>('all');
  const [threadId, setThreadId] = useState<string | null>(null);
  const canMessageCustomers = hasModuleAccess('messages');
  useEffect(() => {
    if (!initialTaskView && conversationProps.openThreadId) { setView('messages'); setMessageFilter('customer'); setThreadId(null); }
  }, [conversationProps.openThreadId, initialTaskView]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [newOnly] = useState(true);
  const [createdRequestId, setCreatedRequestId] = useState<string | null>(() => !scoped ? window.sessionStorage.getItem('mjv-new-service-request') : null);
  useEffect(() => {
    if (scoped) return;
    const handleCreated = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (id) setCreatedRequestId(id);
    };
    window.addEventListener('mjv-service-request-created', handleCreated);
    return () => window.removeEventListener('mjv-service-request-created', handleCreated);
  }, [scoped]);
  const [mentionsOnly, setMentionsOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (showSearch) searchInput.current?.focus(); }, [showSearch]);
  const [category, setCategory] = useState('');
  const [kind, setKind] = useState('');
  const [office, setOffice] = useState('');
  const [actor, setActor] = useState('');
  const [location, setLocation] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [target, setTarget] = useState<FlowTarget | null>(null);
  const [pickingTarget, setPickingTarget] = useState(false);
  const [offices, setOffices] = useState<Option[]>([]);
  const [people, setPeople] = useState<Option[]>([]);
  const [locations, setLocations] = useState<Option[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [createMode,setCreateMode]=useState<'choose'|'chat'|null>(null);
  const [marking, setMarking] = useState(false);
  const scope = useMemo(() => ({ contactId, projectId, workOrderId }), [contactId, projectId, workOrderId]);
  const chosenScope = target ? { ...scope, ...targetScope(target) } : scope;
  const filters = useMemo<FlowFilters>(() => {
    const until = to ? new Date(`${to}T00:00:00`) : null;
    if (until) until.setDate(until.getDate() + 1);
    return { ...scopeFilters(target ? { ...scope, ...targetScope(target) } : scope),
      source_id: focusUpdateId || undefined, search: debouncedSearch, my_work: false, new_only: newOnly, mentions_only: mentionsOnly, category, kind, office_id: office, actor_id: actor, location_id: location,
      since: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
      until: until?.toISOString(),
    };
  }, [scope, target, focusUpdateId, debouncedSearch, newOnly, mentionsOnly, category, kind, office, actor, location, from, to]);
  const flow = useFlow(filters);
  useEffect(() => {
    if (!createdRequestId) return;
    window.sessionStorage.removeItem('mjv-new-service-request');
    setView('all');
    setSearch('');
    setDebouncedSearch('');
    void flow.refresh();
  }, [createdRequestId]);
  const scopeModule = workOrderId ? 'work_orders' : projectId ? 'projects' : contactId ? 'contacts' : null;
  const canPost = scopeModule ? hasModuleAccess(scopeModule) : ['contacts', 'projects', 'work_orders'].some(hasModuleAccess);
  useEffect(() => {
    if (createRequested && canPost) {
      setCreateMode('choose');
      onCreateOpened?.();
    }
  }, [createRequested, canPost, onCreateOpened]);
  useEffect(() => { const timer = setTimeout(() => setDebouncedSearch(search), 250); return () => clearTimeout(timer); }, [search]);
  useEffect(() => {
    if (!profile?.organization_id) return;
    let cancelled = false;
    void Promise.all([
      supabase.from('company_offices').select('id,office_name').eq('organization_id', profile.organization_id).order('office_name'),
      supabase.from('profiles').select('id,full_name').eq('organization_id', profile.organization_id).order('full_name'),
    ]).then(([o, p]) => {
      if (cancelled) return;
      setOffices((o.data || []).map(row => ({ id: row.id, name: row.office_name })));
      setPeople((p.data || []).map(row => ({ id: row.id, name: row.full_name })));
    });
    return () => { cancelled = true; };
  }, [profile?.id, profile?.organization_id]);
  const locationContact = contactId || (target?.kind === 'contact' ? target.id : undefined);
  useEffect(() => {
    let cancelled = false; setLocation(''); setLocations([]);
    if (locationContact) void supabase.from('customer_locations').select('id,name').eq('customer_contact_id', locationContact).order('name').then(({ data }) => { if (!cancelled) setLocations(data || []); });
    return () => { cancelled = true; };
  }, [locationContact]);
  const filterKey = JSON.stringify(filters);
  useEffect(() => { setExpanded(null); }, [filterKey]);

  const chips = [
    category && { label: FLOW_CATEGORIES[category], clear: () => setCategory('') },
    kind && { label: FLOW_KINDS[kind], clear: () => setKind('') },
    target && { label: target.label, clear: () => setTarget(null) },
    office && { label: offices.find(o => o.id === office)?.name || 'Office', clear: () => setOffice('') },
    actor && { label: people.find(p => p.id === actor)?.name || 'Person', clear: () => setActor('') },
    location && { label: locations.find(l => l.id === location)?.name || 'Location', clear: () => setLocation('') },
    from && { label: `From ${from}`, clear: () => setFrom('') }, to && { label: `Through ${to}`, clear: () => setTo('') },
  ].filter(Boolean) as { label: string; clear: () => void }[];

  function links(event: FlowEvent) {
    const result: { label: string; url: string }[] = [];
    if ((event.source_table === 'tasks' || event.source_table === 'task_comments') && hasModuleAccess('tasks')) result.push({ label: 'Open task and comments', url: `?tab=tasks&taskId=${event.task_id || event.source_id}` });
    if (event.source_table === 'discussion_posts' && hasModuleAccess('feed')) result.push({ label: 'Read full discussion', url: `?tab=feed&postId=${event.source_id}` });
    if (event.contact_id && hasModuleAccess('contacts')) result.push({ label: 'Open customer', url: `?tab=contacts&contactId=${event.contact_id}` });
    if (event.project_id && hasModuleAccess('projects')) result.push({ label: 'Open project', url: `?tab=projects&projectId=${event.project_id}` });
    if (event.work_order_id && hasModuleAccess('work_orders')) result.push({ label: 'Open work order', url: `?tab=work_orders&workOrderId=${event.work_order_id}` });
    if (event.source_table === 'proposals' && hasModuleAccess('proposals')) result.push(event.event_type === 'proposal_first_opened'
      ? { label: 'View Activity', url: proposalActivityPath(event.source_id) }
      : { label: 'Open proposal', url: `?tab=proposals&proposalId=${event.source_id}` });
    if (event.source_table === 'leads' && hasModuleAccess('leads')) result.push({ label: 'Open lead', url: `?tab=leads&leadId=${event.source_id}` });
    if (event.source_table === 'service_requests' && hasModuleAccess('service_requests')) result.push({ label: 'Open service request', url: `/service-requests?serviceRequestId=${encodeURIComponent(event.source_id)}` });
    if (event.source_table === 'change_orders' && hasModuleAccess('change_orders')) result.push({ label: 'Open change order', url: `?tab=change_orders&coId=${event.source_id}` });
    return result;
  }
  async function markAll() {
    setMarking(true);
    try { await flow.markAllViewed(scopeFilters(scope)); }
    finally { setMarking(false); }
  }
  const baseViews = scoped || hasModuleAccess('feed') || hasModuleAccess('messages') ? FLOW_VIEWS : [];
  const taskViews = tasksContent && !scoped && hasModuleAccess('tasks') ? [...baseViews, { id: 'tasks' as FlowView, label: TASKS_LABEL }] : baseViews;
  const views = !scoped && canViewVoicemail ? [...taskViews, { id: 'voicemails' as FlowView, label: 'Voicemails' }] : taskViews;
  useEffect(() => {
    if (view === 'voicemails' && !canViewVoicemail) setView('all');
  }, [view, canViewVoicemail]);
  // Keep the normal Flow chronology and presentation for every item, including new service requests.
  const visibleEvents = flow.events.filter(event => matchesView(event, view, messageFilter));
  const activeFilterCount = chips.length + Number(mentionsOnly);
  // Counts only items whose read status is actually known. Conversation,
  // assignment and voicemail counts require their own recipient read-state APIs.
  // Reuse the per-user notification read state rather than treating all
  // voicemail records or assignments as unread.
  const [notificationCounts, setNotificationCounts] = useState({ messages: 0, tasks: 0, voicemails: 0 });
  const [unreadCustomerMessages, setUnreadCustomerMessages] = useState(0);
  useEffect(() => {
    if (scoped || !profile?.id || !profile?.organization_id) return;
    let cancelled = false;
    const loadCounts = async () => {
      const { data, error } = await supabase.from('notifications')
        .select('type').eq('organization_id', profile.organization_id)
        .eq('user_id', profile.id).eq('is_read', false)
        .in('type', ['message', 'message_mention', 'discussion_post_mention',
          'flow_update_mention', 'task', 'task_assigned', 'work_order_assignment', 'phone_voicemail'])
        .limit(1000);
      if (cancelled || error) return;
      const counts = { messages: 0, tasks: 0, voicemails: 0 };
      for (const item of data ?? []) {
        if (item.type === 'phone_voicemail') counts.voicemails++;
        else if (['task', 'task_assigned', 'work_order_assignment'].includes(item.type)) counts.tasks++;
        else counts.messages++;
      }
      setNotificationCounts(counts);
    };
    void loadCounts();
    const refreshOnFocus = () => { if (!document.hidden) void loadCounts(); };
    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnFocus);
    const timer = window.setInterval(() => { if (!document.hidden) void loadCounts(); }, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnFocus);
    };
  }, [scoped, profile?.id, profile?.organization_id]);
  // Customer messages use their canonical message read flag, not notifications.
  // RLS restricts this count to customer threads visible to the current employee.
  useEffect(() => {
    if (scoped || !profile?.id || !profile?.organization_id || !canMessageCustomers) {
      setUnreadCustomerMessages(0);
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      const { data: threads, error: threadError } = await supabase.from('message_threads')
        .select('id').eq('organization_id', profile.organization_id);
      if (cancelled || threadError) return;
      const ids = (threads ?? []).map(thread => thread.id);
      if (!ids.length) { setUnreadCustomerMessages(0); return; }
      let total = 0;
      for (let i = 0; i < ids.length; i += 100) {
        const { count, error } = await supabase.from('messages')
          .select('id', { count: 'exact', head: true })
          .in('thread_id', ids.slice(i, i + 100))
          .eq('author_type', 'customer').eq('is_internal', false).eq('is_read', false);
        if (cancelled || error) return;
        total += count ?? 0;
      }
      if (!cancelled) setUnreadCustomerMessages(total);
    };
    void refresh();
    const onFocus = () => { if (!document.hidden) void refresh(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 30000);
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [scoped, profile?.id, profile?.organization_id, canMessageCustomers]);
  const tabCount = (id: FlowView) => id === 'all'
    ? unreadFlow
    : id === 'activity' ? unreadActivity
    : id === 'messages' ? Math.max(notificationCounts.messages, unreadCustomerMessages)
    : id === 'tasks' ? notificationCounts.tasks
    : canViewVoicemail ? notificationCounts.voicemails : 0;
  const unreadActivity = flow.events.filter(event => !event.viewed && matchesView(event, 'activity', 'all')).length;
  const unreadFlow = flow.events.filter(event => !event.viewed).length;
  return <div ref={workspaceSize.ref} style={view === 'messages' && !scoped ? { height: workspaceSize.height } : undefined} className={`${scoped ? 'flow-embedded' : 'flow-workspace'} ${view === 'messages' ? 'flow-messaging' : ''}`}><section className={`flow ${!scoped?'flow--workspace':''} ${dark ? 'flow--dark' : ''}`} aria-label="Activity Flow">
    <header className="flow-heading"><div><h2><FlowWaveIcon className="text-xl" />{workOrderId ? 'Work Order Flow' : projectId ? 'Project Flow' : contactId ? 'Customer Flow' : 'Flow'}</h2></div>
      {(canPost || (view === 'messages' && (canMessageCustomers || hasModuleAccess('feed')))) && <div className="flow-heading-actions">
        <button className={`flow-primary ${view === 'messages' ? 'flow-new-message' : 'flow-create-action'}`} aria-label={view === 'messages' ? 'New message' : 'Create in Flow'} title={view === 'messages' ? 'New message' : 'Create in Flow'} aria-haspopup="dialog" aria-expanded={createMode!==null} aria-controls={`${controlId}-create-options`}
          onClick={() => { if (view === 'messages') { setMessageFilter('all'); setMessageRequest(n => n + 1); } else setCreateMode('choose'); }}><Plus size={20} />{view === 'messages' && <span>New message</span>}</button>
      </div>}
    <div className="flow-toolbar">
      <div className="flow-view-tabs" role="tablist" aria-label="Flow view">{views.map(item => <button key={item.id} role="tab" aria-selected={view === item.id} className={view === item.id ? 'flow-selected' : ''} onClick={() => changeView(item.id)}>{item.label}{tabCount(item.id) > 0 && <span className="flow-tab-unread" aria-label={`${tabCount(item.id)} unread`}>{tabCount(item.id) > 99 ? '99+' : tabCount(item.id)}</span>}</button>)}</div>
      <select className="flow-view-select" aria-label="Flow view" value={view} onChange={e => changeView(e.target.value as FlowView)}>{views.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
      {view === 'messages' && <div className="flow-message-filters" role="group" aria-label="Message filters">{MESSAGE_FILTERS.map(item => <button key={item.id} aria-pressed={messageFilter === item.id} className={messageFilter === item.id ? 'flow-selected' : ''} onClick={() => { setMessageFilter(item.id); setThreadId(null); }}>{item.label}</button>)}</div>}
      {view !== 'tasks' && view !== 'messages' && view !== 'voicemails' && <>
      <button className={`flow-mentions ${mentionsOnly ? 'flow-selected' : ''}`} aria-pressed={mentionsOnly} onClick={() => setMentionsOnly(!mentionsOnly)}>@ Mentions</button>
      <button className="flow-filter-toggle" aria-controls={filtersId} aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}><Filter size={14} />Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}</button>
      <button className={`flow-search-toggle ${search ? 'flow-selected' : ''}`} aria-label={showSearch ? 'Hide activity search' : 'Search activity'} aria-expanded={showSearch || !!search} aria-controls={searchId} onClick={() => { if (showSearch || search) { setSearch(''); setShowSearch(false); } else setShowSearch(true); }}><Search size={16} /></button>
      <button className="flow-mark-shown" aria-label="Mark all Flow activity viewed" title="Mark all Flow activity viewed" onClick={() => void markAll()} disabled={marking || flow.loading}><CheckCheck size={16} /><span className="flow-mark-label">{marking ? 'Clearing…' : 'Mark All Viewed'}</span></button>
      {flow.pending > 0 && <button className="flow-pending-refresh" aria-label={`${flow.pending} new activities available; show updates`} title={`${flow.pending} new activities — show updates`} onClick={() => void flow.refresh()}><span className="flow-dot" /><span className="flow-pending-count">{flow.pending > 50 ? '50+' : flow.pending}</span></button>}
      <label className={`flow-search ${showSearch || search ? 'flow-search--open' : ''}`} id={searchId}><Search size={16} /><input ref={searchInput} aria-label="Search activity" placeholder="Search customer, job or activity…" value={search} onChange={e => setSearch(e.target.value)} />{search && <button onClick={() => setSearch('')} aria-label="Clear search"><X size={14} /></button>}</label>
      </>}
    </div>
     </header>
    {createMode&&<FlowCreateModal scope={chosenScope} initial={createMode} canInteract={hasModuleAccess('feed')&&canPost} onClose={()=>setCreateMode(null)} onSaved={()=>{setCreateMode(null);void flow.refresh();}}/>}

    <div className="flow-content">
    {!scoped && view === 'voicemails' && canViewVoicemail && <PhoneVoicemailFlowInbox />}
    {view === 'tasks' && hasModuleAccess('tasks') && tasksContent}
    {view !== 'tasks' && view !== 'messages' && view !== 'voicemails' && showFilters && <div className="flow-filters" id={filtersId}>
      <label>Content type<select aria-label="Show activity type" value={kind} onChange={e => setKind(e.target.value)}><option value="">All content types</option>{Object.entries(FLOW_KINDS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <div className="flow-filter-quick-controls"><button className={mentionsOnly ? 'flow-selected' : ''} aria-pressed={mentionsOnly} onClick={() => setMentionsOnly(!mentionsOnly)}>@ Mentions</button></div>
      <label>Activity<select value={category} onChange={e => setCategory(e.target.value)}><option value="">All types</option>{Object.entries(FLOW_CATEGORIES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>Office<select value={office} onChange={e => setOffice(e.target.value)}><option value="">All offices</option>{offices.map(o => <option value={o.id} key={o.id}>{o.name}</option>)}</select></label>
      <label>By<select value={actor} onChange={e => setActor(e.target.value)}><option value="">Anyone</option>{people.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
      {locations.length > 0 && <label>Location<select value={location} onChange={e => setLocation(e.target.value)}><option value="">All locations</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}
      <label>From<input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} /></label><label>Through<input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} /></label>
      {!projectId && !workOrderId && <button onClick={() => setPickingTarget(!pickingTarget)} aria-expanded={pickingTarget}>Choose customer / job</button>}
      {pickingTarget && <div className="flow-picker-slot"><FlowTargetPicker contactId={contactId} onSelect={t => { setTarget(t); setPickingTarget(false); }} /></div>}
    </div>}
    {view !== 'tasks' && view !== 'messages' && view !== 'voicemails' && !!chips.length && <div className="flow-chips">{chips.map((chip, i) => <button key={i} onClick={chip.clear}>{chip.label}<X size={12} /></button>)}</div>}
    {view === 'messages' && messageFilter === 'customer' && !canMessageCustomers && <p>You do not have customer messaging access.</p>}
    {view === 'messages' && messageFilter === 'coworkers' && !hasModuleAccess('feed') && <p>You do not have coworker messaging access.</p>}
    {(view === 'messages' && (canMessageCustomers || hasModuleAccess('feed'))) && <div className="flow-customer-inbox">
      <CustomerConversations key={`${messageFilter === 'customer' ? 'customer' : messageFilter === 'coworkers' ? 'coworkers' : 'all'}-${scoped ? 'scoped' : 'global'}`} fitScreen={!scoped} newMessageRequested={messageRequest} conversationType={messageFilter === 'customer' ? 'customer' : messageFilter === 'coworkers' ? 'coworkers' : 'all'} includeCustomers={canMessageCustomers} includeCoworkers={hasModuleAccess('feed')} unreadOnly={messageFilter === 'unread'} hideFilters {...conversationProps} {...chosenScope} openThreadId={threadId || conversationProps.openThreadId}
        onThreadSelected={id => { setThreadId(id); conversationProps.onThreadSelected?.(id); }} />
    </div>}
    {(view !== 'tasks' && view !== 'messages' && view !== 'voicemails') && <>
    {flow.error && <div className="flow-error" role="alert">{flow.error} <button onClick={() => void flow.refresh()}>Retry</button></div>}
    <div className="flow-column-head" aria-hidden="true"><span /><span>Time</span><span>Customer / job</span><span>Activity</span><span>By</span><span /></div>
    <div aria-busy={flow.loading}>
      {flow.loading ? <div className="flow-empty">Loading activity…</div> : !visibleEvents.length ? <div className="flow-empty"><Activity size={24} /><strong>{'You’re caught up for these filters.'}</strong><span>Try another view or change your filters.</span></div> : visibleEvents.map((event, index) => {
        const group = dayLabel(event.created_at);
        const showDay = index === 0 || group !== dayLabel(visibleEvents[index - 1].created_at);
        const Icon = ICONS[event.category as keyof typeof ICONS] || Activity;
        const open = expanded === event.id;
        const job = event.work_order_number ? `WO ${event.work_order_number}` : event.project_name;
        return <Fragment key={event.id}>
          {showDay && <h3 className="flow-day">{group}</h3>}
          <div className={`flow-row ${event.viewed ? '' : 'flow-row--new'} ${open ? 'flow-row--open' : ''}`}>
            <button className="flow-read-toggle" aria-label={event.viewed ? 'Mark as new' : 'Mark as viewed'} title={event.viewed ? 'Viewed — mark as new' : 'New — mark as viewed'} onClick={() => void flow.markViewed([event.id], !event.viewed)}>{event.viewed ? <Check size={13} /> : <span className="flow-dot" />}</button>
            <button className="flow-row-main" aria-expanded={open} aria-controls={`flow-detail-${event.id}`} title={`${event.summary}${event.source_table === 'service_requests' ? '' : event.preview ? '\n' + event.preview : event.details ? '\n' + event.details : ''}`} onClick={() => { if (!event.viewed) void flow.markViewed([event.id]); if (event.source_table === 'leads' && hasModuleAccess('leads')) { window.location.href = `?tab=leads&leadId=${encodeURIComponent(event.source_id)}`; return; } setExpanded(open ? null : event.id); }}>
              <time dateTime={event.created_at} title={new Date(event.created_at).toLocaleString()}>{new Date(event.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</time>
              <span className="flow-context" title={[event.customer_name, job, event.location_name].filter(Boolean).join(' · ')}>{event.customer_name}{job && <small> · {job}</small>}</span>
              <span className="flow-summary"><Icon size={15} className={`flow-icon flow-icon--${event.category}`} /><span><b className="flow-kind-label">{eventKind(event)}</b>{event.summary}{event.source_table !== 'service_requests' && event.preview && <small> · {event.preview}</small>}</span>{profile?.id && event.mentioned_user_ids?.includes(profile.id) && <strong className="flow-mention">@ You</strong>}</span>
              <span className="flow-actor" title={event.actor_name}>{event.actor_name}</span>
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          </div>
          {open && <div className="flow-detail" id={`flow-detail-${event.id}`}><strong>{eventKind(event)} · {event.summary}</strong><p>{[event.customer_name, event.project_name, event.work_order_number && `WO ${event.work_order_number}`, event.location_name].filter(Boolean).join(' · ')}</p>{event.source_table !== 'service_requests' && (event.preview ? <p className="flow-detail-body">{event.preview}</p> : event.details && <p className="flow-detail-body">{event.details}</p>)}<small>{event.actor_name} · {new Date(event.created_at).toLocaleString()} · Viewed</small>{event.event_type === 'proposal_activity_weekly' && <WeeklyProposalActivity reportId={event.source_id} />}{event.source_table === 'service_requests' && hasModuleAccess('service_requests') && <ServiceRequestFlowDetail requestId={event.source_id} />}<div className="flow-links">{event.thread_id && canMessageCustomers && <button onClick={() => { setThreadId(event.thread_id!); setView('messages'); setMessageFilter('customer'); }}>Read full conversation</button>}{links(event).map(link => <a key={link.label} href={link.url}>{link.label} ↗</a>)}</div></div>}
        </Fragment>;
      })}
    </div>
    {flow.hasMore && !flow.loading && <button className="flow-load-more" disabled={flow.loadingMore} onClick={() => void flow.loadMore()}>{flow.loadingMore ? 'Loading…' : 'Load older activity'}</button>}
    </>}
    </div>
  </section></div>;
}
