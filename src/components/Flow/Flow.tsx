import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Activity, Calendar, Check, CheckCheck, ChevronDown, ChevronRight, Filter, HelpCircle, MessageSquare, Package, Plus, RefreshCw, Search, User, Wrench, X, DollarSign, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useDepartments } from '../../contexts/DepartmentContext';
import { useFlow } from '../../lib/flow/useFlow';
import { dayLabel, FLOW_CATEGORIES, FlowEvent, FlowFilters, FlowScope, FlowTarget, scopeFilters, targetScope } from '../../lib/flow/types';
import { PostFlowUpdate } from './PostFlowUpdate';
import { FlowTargetPicker } from './FlowTargetPicker';
import { FlowWaveIcon } from './FlowWaveIcon';
import { DiscussionPostForm } from '../Feed/DiscussionPostForm';
import './flow.css';
import { CustomerConversations, CustomerConversationsProps } from './CustomerConversations';

type Option = { id: string; name: string };
const FLOW_KINDS: Record<string, string> = { messages: 'Messages', discussions: 'Team', updates: 'Updates', tasks: 'Tasks', activity: 'Other activity' };
type FlowView = 'all' | 'activity' | 'direct' | 'customers' | 'departments' | 'company';
const FLOW_VIEWS: { id: FlowView; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'activity', label: 'Activity' }, { id: 'direct', label: 'Direct' },
  { id: 'customers', label: 'Messages' }, { id: 'departments', label: 'Departments' }, { id: 'company', label: 'Company' },
];
function matchesView(event: FlowEvent, view: FlowView) {
  if (view === 'all') return true;
  if (view === 'direct') return event.source_table === 'discussion_posts' && event.audience_type === 'direct';
  if (view === 'customers') return event.source_table === 'messages' && !event.is_internal;
  if (view === 'departments') return event.source_table === 'discussion_posts' && event.audience_type === 'department';
  if (view === 'company') return event.source_table === 'discussion_posts' && event.audience_type === 'company';
  return event.source_table !== 'messages' && event.source_table !== 'discussion_posts';
}
function eventKind(event: FlowEvent): string {
  if (event.source_table === 'messages') return event.is_internal ? 'Internal message' : 'Customer message';
  if (event.source_table === 'discussion_posts') return event.audience_type === 'direct' ? 'Direct message' : event.audience_type === 'department' ? 'Department message' : 'Company message';
  if (event.source_table === 'tasks' || event.source_table === 'task_comments') return 'Task';
  if (event.category === 'update') return 'Update';
  return 'Activity';
}
const ICONS = { work: Wrench, service: Wrench, sales: FileText, materials: Package, scheduling: Calendar, customer: User, financial: DollarSign, update: MessageSquare, communication: MessageSquare };

export default function Flow({ contactId, projectId, workOrderId, dark = false, ...conversationProps }: FlowScope & { dark?: boolean } & CustomerConversationsProps) {
  const controlId = useId();
  const searchId = `${controlId}-search`;
  const filtersId = `${controlId}-filters`;
  const { profile } = useAuth();
  const { hasModuleAccess } = useDepartments();
  const scoped = !!(contactId || projectId || workOrderId);
  const focusUpdateId = !scoped ? new URLSearchParams(window.location.search).get('flowUpdateId') : null;
  const [view, setView] = useState<FlowView>(conversationProps.openThreadId || conversationProps.createRequested ? 'customers' : 'all');
  const [threadId, setThreadId] = useState<string | null>(null);
  const [createCustomer, setCreateCustomer] = useState(false);
  const canMessageCustomers = hasModuleAccess('messages');
  useEffect(() => {
    if (conversationProps.openThreadId || conversationProps.createRequested) { setView('customers'); setThreadId(null); }
  }, [conversationProps.openThreadId, conversationProps.createRequested]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [newOnly, setNewOnly] = useState(false);
  const [mentionsOnly, setMentionsOnly] = useState(false);
  const [todayOnly, setTodayOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
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
  const [composing, setComposing] = useState(false);
  const [messaging, setMessaging] = useState(false);
  const [choosingMessage, setChoosingMessage] = useState(false);
  const messageAction = useRef<HTMLButtonElement>(null);
  const messageChoices = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!choosingMessage) return;
    messageChoices.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setChoosingMessage(false); messageAction.current?.focus(); }
    };
    window.addEventListener('keydown', dismiss);
    return () => window.removeEventListener('keydown', dismiss);
  }, [choosingMessage]);
  const [marking, setMarking] = useState(false);
  const scope = useMemo(() => ({ contactId, projectId, workOrderId }), [contactId, projectId, workOrderId]);
  const chosenScope = target ? { ...scope, ...targetScope(target) } : scope;
  const filters = useMemo<FlowFilters>(() => {
    const until = to ? new Date(`${to}T00:00:00`) : null;
    if (until) until.setDate(until.getDate() + 1);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    return { ...scopeFilters(target ? { ...scope, ...targetScope(target) } : scope),
      source_id: focusUpdateId || undefined, search: debouncedSearch, my_work: false, new_only: newOnly, mentions_only: mentionsOnly, category, kind, office_id: office, actor_id: actor, location_id: location,
      since: todayOnly ? today.toISOString() : from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
      until: todayOnly ? tomorrow.toISOString() : until?.toISOString(),
    };
  }, [scope, target, focusUpdateId, debouncedSearch, newOnly, mentionsOnly, todayOnly, category, kind, office, actor, location, from, to]);
  const flow = useFlow(filters);
  const scopeModule = workOrderId ? 'work_orders' : projectId ? 'projects' : contactId ? 'contacts' : null;
  const canPost = scopeModule ? hasModuleAccess(scopeModule) : ['contacts', 'projects', 'work_orders'].some(hasModuleAccess);
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
    if (event.source_table === 'proposals' && hasModuleAccess('proposals')) result.push({ label: 'Open proposal', url: `?tab=proposals&proposalId=${event.source_id}` });
    if (event.source_table === 'change_orders' && hasModuleAccess('change_orders')) result.push({ label: 'Open change order', url: `?tab=change_orders&coId=${event.source_id}` });
    return result;
  }
  async function markShown() {
    setMarking(true); await flow.markViewed(visibleEvents.filter(e => !e.viewed).map(e => e.id)); setMarking(false);
  }
  const visibleEvents = flow.events.filter(event => matchesView(event, view));
  const newShown = visibleEvents.filter(e => !e.viewed).length;
  const activeFilterCount = chips.length + Number(todayOnly) + Number(mentionsOnly) + Number(newOnly);
  return <section className={`flow ${dark ? 'flow--dark' : ''}`} aria-label="Activity Flow">
    <header className="flow-heading"><div><h2><FlowWaveIcon className="text-xl" />{workOrderId ? 'Work Order Flow' : projectId ? 'Project Flow' : contactId ? 'Customer Flow' : 'Flow'}</h2><span className="flow-subtitle">{scoped ? 'All communication and activity for this record' : 'Communication, customers, projects & service'} · <span title={flow.connected ? 'Live connection active; checked periodically for missed updates' : 'Checking for updates every 30 seconds'}>{flow.connected ? 'Live' : 'Auto refresh'}</span></span></div>
      {(canPost || canMessageCustomers) && <div className="flow-heading-actions">
        <button className="flow-message-action" aria-label="New message" ref={messageAction} aria-expanded={choosingMessage} aria-controls={`${controlId}-message-destination`}
          onClick={() => {
            if (canPost && canMessageCustomers) setChoosingMessage(!choosingMessage);
            else if (canMessageCustomers) { setComposing(false); setCreateCustomer(true); setView('customers'); }
            else { setComposing(false); setMessaging(!messaging); }
          }}><MessageSquare size={15} /><span className="flow-desktop-label">New message</span><span className="flow-mobile-label">Message</span>{canPost && canMessageCustomers && <ChevronDown size={13} />}</button>
        {canPost && <button className="flow-primary" onClick={() => { setComposing(!composing); setMessaging(false); setChoosingMessage(false); }}><Plus size={15} /><span className="flow-desktop-label">Post update</span><span className="flow-mobile-label">Update</span></button>}
      </div>}
    </header>
    {composing && <PostFlowUpdate scope={chosenScope} onClose={() => setComposing(false)} onPosted={() => { setComposing(false); void flow.refresh(); }} />}
    {choosingMessage && <div ref={messageChoices} id={`${controlId}-message-destination`} className="flow-message-destinations" role="group" aria-label="Message destination">
      {canPost && <button onClick={() => { setChoosingMessage(false); setMessaging(true); setComposing(false); if (view === 'customers') setView('all'); }}><MessageSquare size={17} /><span><strong>Internal chat</strong><small>Teammates, departments or everyone</small></span></button>}
      {canMessageCustomers && <button onClick={() => { setChoosingMessage(false); setMessaging(false); setCreateCustomer(true); setView('customers'); }}><User size={17} /><span><strong>Customer message</strong><small>Start a customer conversation</small></span></button>}
      <button aria-label="Close message choices" onClick={() => { setChoosingMessage(false); messageAction.current?.focus(); }}><X size={16} /></button>
    </div>}
    {messaging && <div className="flow-message-composer"><DiscussionPostForm onSuccess={() => { setMessaging(false); void flow.refresh(); }} /></div>}
    <div className="flow-toolbar">
      <div className="flow-view-tabs" role="tablist" aria-label="Flow view">{FLOW_VIEWS.map(item => <button key={item.id} role="tab" aria-selected={view === item.id} className={view === item.id ? 'flow-selected' : ''} onClick={() => setView(item.id)}>{item.label}</button>)}</div>
      <select className="flow-view-select" aria-label="Flow view" value={view} onChange={e => setView(e.target.value as FlowView)}>{FLOW_VIEWS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
      {view !== 'customers' && <>
      <button className={`flow-today ${todayOnly ? 'flow-selected' : ''}`} aria-pressed={todayOnly} onClick={() => setTodayOnly(!todayOnly)}>Today</button>
      <button className={`flow-mentions ${mentionsOnly ? 'flow-selected' : ''}`} aria-pressed={mentionsOnly} onClick={() => setMentionsOnly(!mentionsOnly)}>@ Mentions</button>
      <button className={`flow-unread ${newOnly ? 'flow-selected' : ''}`} aria-pressed={newOnly} onClick={() => setNewOnly(!newOnly)}><span className="flow-dot" /><span className="flow-desktop-label">New only</span><span className="flow-mobile-label">New</span></button>
      <button className="flow-filter-toggle" aria-controls={filtersId} aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}><Filter size={14} />Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}</button>
      <button className={`flow-search-toggle ${search ? 'flow-selected' : ''}`} aria-label={showSearch ? 'Hide activity search' : 'Search activity'} aria-expanded={showSearch || !!search} aria-controls={searchId} onClick={() => { if (showSearch || search) { setSearch(''); setShowSearch(false); } else setShowSearch(true); }}><Search size={16} /></button>
      <button className="flow-refresh" aria-label="Refresh Flow" title="Refresh Flow" onClick={() => void flow.refresh()} disabled={flow.loading}><RefreshCw size={15} /></button>
      <label className={`flow-search ${showSearch || search ? 'flow-search--open' : ''}`} id={searchId}><Search size={16} /><input ref={searchInput} aria-label="Search activity" placeholder="Search customer, job or activity…" value={search} onChange={e => setSearch(e.target.value)} />{search && <button onClick={() => setSearch('')} aria-label="Clear search"><X size={14} /></button>}</label>
      </>}
    </div>

    {view !== 'customers' && showFilters && <div className="flow-filters" id={filtersId}>
      <label>Content type<select aria-label="Show activity type" value={kind} onChange={e => setKind(e.target.value)}><option value="">All content types</option>{Object.entries(FLOW_KINDS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <div className="flow-filter-quick-controls">
        <button className={todayOnly ? 'flow-selected' : ''} aria-pressed={todayOnly} onClick={() => setTodayOnly(!todayOnly)}>Today</button>
        <button className={mentionsOnly ? 'flow-selected' : ''} aria-pressed={mentionsOnly} onClick={() => setMentionsOnly(!mentionsOnly)}>@ Mentions</button>
        <button className={newOnly ? 'flow-selected' : ''} aria-pressed={newOnly} onClick={() => setNewOnly(!newOnly)}>New only</button>
      </div>
      <label>Activity<select value={category} onChange={e => setCategory(e.target.value)}><option value="">All types</option>{Object.entries(FLOW_CATEGORIES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>Office<select value={office} onChange={e => setOffice(e.target.value)}><option value="">All offices</option>{offices.map(o => <option value={o.id} key={o.id}>{o.name}</option>)}</select></label>
      <label>By<select value={actor} onChange={e => setActor(e.target.value)}><option value="">Anyone</option>{people.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
      {locations.length > 0 && <label>Location<select value={location} onChange={e => setLocation(e.target.value)}><option value="">All locations</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}
      <label>From<input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} /></label><label>Through<input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} /></label>
      {!projectId && !workOrderId && <button onClick={() => setPickingTarget(!pickingTarget)} aria-expanded={pickingTarget}>Choose customer / job</button>}
      {pickingTarget && <div className="flow-picker-slot"><FlowTargetPicker contactId={contactId} onSelect={t => { setTarget(t); setPickingTarget(false); }} /></div>}
    </div>}
    {!!chips.length && <div className="flow-chips">{chips.map((chip, i) => <button key={i} onClick={chip.clear}>{chip.label}<X size={12} /></button>)}</div>}
    {view === 'customers' && !canMessageCustomers && <p>You do not have customer messaging access.</p>}
    {canMessageCustomers && (view === 'customers' || threadId) && <div className="flow-customer-inbox">
      {threadId && view !== 'customers' && <button onClick={() => setThreadId(null)}>Close conversation</button>}
      <CustomerConversations {...conversationProps} {...chosenScope} openThreadId={threadId || conversationProps.openThreadId}
        createRequested={createCustomer || conversationProps.createRequested}
        onCreateOpened={() => { setCreateCustomer(false); conversationProps.onCreateOpened?.(); }}
        onThreadSelected={id => { setThreadId(id); conversationProps.onThreadSelected?.(id); }} />
    </div>}
    {view !== 'customers' && <>
    {flow.error && <div className="flow-error" role="alert">{flow.error} <button onClick={() => void flow.refresh()}>Retry</button></div>}
    {flow.pending > 0 && <button className="flow-new-banner" onClick={() => void flow.refresh()}>{flow.pending === 50 ? '50+' : flow.pending} new {flow.pending === 1 ? 'activity' : 'activities'} — show updates</button>}
    <div className="flow-list-meta"><span>{visibleEvents.length} shown · {newShown} new</span><div className="flow-meta-actions"><button aria-label="Mark shown viewed" title="Mark shown viewed" onClick={() => void markShown()} disabled={marking || !newShown || flow.loading}><CheckCheck size={14} /><span className="flow-desktop-label">{marking ? 'Saving…' : 'Mark shown viewed'}</span><span className="flow-mobile-label">{marking ? 'Saving…' : 'Viewed'}</span></button><button className="flow-help-toggle" aria-label="About Flow unread indicators" aria-expanded={showHelp} onClick={() => setShowHelp(!showHelp)}><HelpCircle size={15} /></button></div></div>
    <div className="flow-column-head" aria-hidden="true"><span /><span>Time</span><span>Customer / job</span><span>Activity</span><span>By</span><span /></div>
    <div aria-busy={flow.loading}>
      {flow.loading ? <div className="flow-empty">Loading activity…</div> : !visibleEvents.length ? <div className="flow-empty"><Activity size={24} /><strong>{newOnly ? 'You’re caught up for these filters.' : 'No activity to show yet.'}</strong><span>Try another view or change your filters.</span></div> : visibleEvents.map((event, index) => {
        const group = dayLabel(event.created_at);
        const showDay = index === 0 || group !== dayLabel(visibleEvents[index - 1].created_at);
        const Icon = ICONS[event.category as keyof typeof ICONS] || Activity;
        const open = expanded === event.id;
        const job = event.work_order_number ? `WO ${event.work_order_number}` : event.project_name;
        return <Fragment key={event.id}>
          {showDay && <h3 className="flow-day">{group}</h3>}
          <div className={`flow-row ${event.viewed ? '' : 'flow-row--new'} ${open ? 'flow-row--open' : ''}`}>
            <button className="flow-read-toggle" aria-label={event.viewed ? 'Mark as new' : 'Mark as viewed'} title={event.viewed ? 'Viewed — mark as new' : 'New — mark as viewed'} onClick={() => void flow.markViewed([event.id], !event.viewed)}>{event.viewed ? <Check size={13} /> : <span className="flow-dot" />}</button>
            <button className="flow-row-main" aria-expanded={open} aria-controls={`flow-detail-${event.id}`} title={`${event.summary}${event.preview ? '\n' + event.preview : event.details ? '\n' + event.details : ''}`} onClick={() => { setExpanded(open ? null : event.id); if (!open && !event.viewed) void flow.markViewed([event.id]); }}>
              <time dateTime={event.created_at} title={new Date(event.created_at).toLocaleString()}>{new Date(event.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</time>
              <span className="flow-context" title={[event.customer_name, job, event.location_name].filter(Boolean).join(' · ')}>{event.customer_name}{job && <small> · {job}</small>}</span>
              <span className="flow-summary"><Icon size={15} className={`flow-icon flow-icon--${event.category}`} /><span><b className="flow-kind-label">{eventKind(event)}</b>{event.summary}{event.preview && <small> · {event.preview}</small>}</span>{profile?.id && event.mentioned_user_ids?.includes(profile.id) && <strong className="flow-mention">@ You</strong>}</span>
              <span className="flow-actor" title={event.actor_name}>{event.actor_name}</span>
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          </div>
          {open && <div className="flow-detail" id={`flow-detail-${event.id}`}><strong>{eventKind(event)} · {event.summary}</strong><p>{[event.customer_name, event.project_name, event.work_order_number && `WO ${event.work_order_number}`, event.location_name].filter(Boolean).join(' · ')}</p>{event.preview ? <p className="flow-detail-body">{event.preview}</p> : event.details && <p className="flow-detail-body">{event.details}</p>}<small>{event.actor_name} · {new Date(event.created_at).toLocaleString()} · Viewed</small><div className="flow-links">{event.thread_id && canMessageCustomers && <button onClick={() => setThreadId(event.thread_id!)}>Read full conversation</button>}{links(event).map(link => <a key={link.label} href={link.url}>{link.label} ↗</a>)}</div></div>}
        </Fragment>;
      })}
    </div>
    {flow.hasMore && !flow.loading && <button className="flow-load-more" disabled={flow.loadingMore} onClick={() => void flow.loadMore()}>{flow.loadingMore ? 'Loading…' : 'Load older activity'}</button>}
    </>}
    <p className={`flow-footnote ${showHelp ? 'flow-footnote--open' : ''}`}>Blue dot = new to you. Hover for a preview; open an entry or use its dot to mark it viewed.</p>
  </section>;
}
