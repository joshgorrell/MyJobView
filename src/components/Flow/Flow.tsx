import { Fragment, useEffect, useMemo, useState } from 'react';
import { Activity, Calendar, Check, CheckCheck, ChevronDown, ChevronRight, Filter, MessageSquare, Package, Plus, RefreshCw, Search, User, Wrench, X, DollarSign, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useDepartments } from '../../contexts/DepartmentContext';
import { useFlow } from '../../lib/flow/useFlow';
import { dayLabel, FLOW_CATEGORIES, FlowEvent, FlowFilters, FlowScope, FlowTarget, scopeFilters, targetScope } from '../../lib/flow/types';
import { PostFlowUpdate } from './PostFlowUpdate';
import { FlowTargetPicker } from './FlowTargetPicker';
import './flow.css';

type Option = { id: string; name: string };
const ICONS = { work: Wrench, service: Wrench, sales: FileText, materials: Package, scheduling: Calendar, customer: User, financial: DollarSign, update: MessageSquare };

export default function Flow({ contactId, projectId, workOrderId, dark = false }: FlowScope & { dark?: boolean }) {
  const { profile } = useAuth();
  const { hasModuleAccess } = useDepartments();
  const scoped = !!(contactId || projectId || workOrderId);
  const [myWork, setMyWork] = useState(!scoped);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [newOnly, setNewOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [category, setCategory] = useState('');
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
  const [marking, setMarking] = useState(false);
  const scope = useMemo(() => ({ contactId, projectId, workOrderId }), [contactId, projectId, workOrderId]);
  const chosenScope = target ? { ...scope, ...targetScope(target) } : scope;
  const filters = useMemo<FlowFilters>(() => {
    const until = to ? new Date(`${to}T00:00:00`) : null;
    if (until) until.setDate(until.getDate() + 1);
    return { ...scopeFilters(target ? { ...scope, ...targetScope(target) } : scope),
      search: debouncedSearch, my_work: myWork, new_only: newOnly, category, office_id: office, actor_id: actor, location_id: location,
      since: from ? new Date(`${from}T00:00:00`).toISOString() : undefined, until: until?.toISOString(),
    };
  }, [scope, target, debouncedSearch, myWork, newOnly, category, office, actor, location, from, to]);
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
    target && { label: target.label, clear: () => setTarget(null) },
    office && { label: offices.find(o => o.id === office)?.name || 'Office', clear: () => setOffice('') },
    actor && { label: people.find(p => p.id === actor)?.name || 'Person', clear: () => setActor('') },
    location && { label: locations.find(l => l.id === location)?.name || 'Location', clear: () => setLocation('') },
    from && { label: `From ${from}`, clear: () => setFrom('') }, to && { label: `Through ${to}`, clear: () => setTo('') },
  ].filter(Boolean) as { label: string; clear: () => void }[];

  function links(event: FlowEvent) {
    const result: { label: string; url: string }[] = [];
    if (event.contact_id && hasModuleAccess('contacts')) result.push({ label: 'Open customer', url: `?tab=contacts&contactId=${event.contact_id}` });
    if (event.project_id && hasModuleAccess('projects')) result.push({ label: 'Open project', url: `?tab=projects&projectId=${event.project_id}` });
    if (event.work_order_id && hasModuleAccess('work_orders')) result.push({ label: 'Open work order', url: `?tab=work_orders&workOrderId=${event.work_order_id}` });
    if (event.source_table === 'proposals' && hasModuleAccess('proposals')) result.push({ label: 'Open proposal', url: `?tab=proposals&proposalId=${event.source_id}` });
    if (event.source_table === 'change_orders' && hasModuleAccess('change_orders')) result.push({ label: 'Open change order', url: `?tab=change_orders&coId=${event.source_id}` });
    return result;
  }
  async function markShown() {
    setMarking(true); await flow.markViewed(flow.events.filter(e => !e.viewed).map(e => e.id)); setMarking(false);
  }
  const newShown = flow.events.filter(e => !e.viewed).length;
  return <section className={`flow ${dark ? 'flow--dark' : ''}`} aria-label="Activity Flow">
    <header className="flow-heading"><div><h2><Activity size={20} />{workOrderId ? 'Work Order Flow' : projectId ? 'Project Flow' : contactId ? 'Customer Flow' : 'Flow'}</h2><span className="flow-subtitle">{scoped ? 'Activity for this record' : 'Customers, projects & service'} · <span title={flow.connected ? 'Live connection active; checked periodically for missed updates' : 'Checking for updates every 30 seconds'}>{flow.connected ? 'Live' : 'Auto refresh'}</span></span></div>
      {canPost && <button className="flow-primary" onClick={() => setComposing(!composing)}><Plus size={15} />Post update</button>}
    </header>
    {composing && <PostFlowUpdate scope={chosenScope} onClose={() => setComposing(false)} onPosted={() => { setComposing(false); void flow.refresh(); }} />}
    <div className="flow-toolbar">
      {!scoped && <div className="flow-segment" aria-label="Activity scope"><button aria-pressed={myWork} onClick={() => setMyWork(true)}>My Work</button><button aria-pressed={!myWork} onClick={() => setMyWork(false)}>All Activity</button></div>}
      <label className="flow-search"><Search size={16} /><input aria-label="Search activity" placeholder="Search customer, job or activity…" value={search} onChange={e => setSearch(e.target.value)} />{search && <button onClick={() => setSearch('')} aria-label="Clear search"><X size={14} /></button>}</label>
      <button className={newOnly ? 'flow-selected' : ''} aria-pressed={newOnly} onClick={() => setNewOnly(!newOnly)}><span className="flow-dot" />New only</button>
      <button aria-expanded={showFilters} onClick={() => setShowFilters(!showFilters)}><Filter size={14} />Filters{chips.length ? ` (${chips.length})` : ''}</button>
      <button aria-label="Refresh Flow" title="Refresh Flow" onClick={() => void flow.refresh()} disabled={flow.loading}><RefreshCw size={15} /></button>
    </div>
    {showFilters && <div className="flow-filters">
      <label>Activity<select value={category} onChange={e => setCategory(e.target.value)}><option value="">All types</option>{Object.entries(FLOW_CATEGORIES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>Office<select value={office} onChange={e => setOffice(e.target.value)}><option value="">All offices</option>{offices.map(o => <option value={o.id} key={o.id}>{o.name}</option>)}</select></label>
      <label>By<select value={actor} onChange={e => setActor(e.target.value)}><option value="">Anyone</option>{people.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
      {locations.length > 0 && <label>Location<select value={location} onChange={e => setLocation(e.target.value)}><option value="">All locations</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}
      <label>From<input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} /></label><label>Through<input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} /></label>
      {!projectId && !workOrderId && <button onClick={() => setPickingTarget(!pickingTarget)} aria-expanded={pickingTarget}>Choose customer / job</button>}
      {pickingTarget && <div className="flow-picker-slot"><FlowTargetPicker contactId={contactId} onSelect={t => { setTarget(t); setPickingTarget(false); }} /></div>}
    </div>}
    {!!chips.length && <div className="flow-chips">{chips.map((chip, i) => <button key={i} onClick={chip.clear}>{chip.label}<X size={12} /></button>)}</div>}
    {flow.error && <div className="flow-error" role="alert">{flow.error} <button onClick={() => void flow.refresh()}>Retry</button></div>}
    {flow.pending > 0 && <button className="flow-new-banner" onClick={() => void flow.refresh()}>{flow.pending === 50 ? '50+' : flow.pending} new {flow.pending === 1 ? 'activity' : 'activities'} — show updates</button>}
    <div className="flow-list-meta"><span>{flow.events.length} shown · {newShown} new</span><button onClick={() => void markShown()} disabled={marking || !newShown || flow.loading}><CheckCheck size={14} />{marking ? 'Saving…' : 'Mark shown viewed'}</button></div>
    <div className="flow-column-head" aria-hidden="true"><span /><span>Time</span><span>Customer / job</span><span>Activity</span><span>By</span><span /></div>
    <div aria-busy={flow.loading}>
      {flow.loading ? <div className="flow-empty">Loading activity…</div> : !flow.events.length ? <div className="flow-empty"><Activity size={24} /><strong>{newOnly ? 'You’re caught up for these filters.' : 'No activity to show yet.'}</strong><span>{myWork ? 'Try All Activity or change your filters.' : 'New customer and job actions will appear here.'}</span></div> : flow.events.map((event, index) => {
        const group = dayLabel(event.created_at);
        const showDay = index === 0 || group !== dayLabel(flow.events[index - 1].created_at);
        const Icon = ICONS[event.category as keyof typeof ICONS] || Activity;
        const open = expanded === event.id;
        const job = event.work_order_number ? `WO ${event.work_order_number}` : event.project_name;
        return <Fragment key={event.id}>
          {showDay && <h3 className="flow-day">{group}</h3>}
          <div className={`flow-row ${event.viewed ? '' : 'flow-row--new'} ${open ? 'flow-row--open' : ''}`}>
            <button className="flow-read-toggle" aria-label={event.viewed ? 'Mark as new' : 'Mark as viewed'} title={event.viewed ? 'Viewed — mark as new' : 'New — mark as viewed'} onClick={() => void flow.markViewed([event.id], !event.viewed)}>{event.viewed ? <Check size={13} /> : <span className="flow-dot" />}</button>
            <button className="flow-row-main" aria-expanded={open} aria-controls={`flow-detail-${event.id}`} title={`${event.summary}${event.details ? '\n' + event.details : ''}`} onClick={() => { setExpanded(open ? null : event.id); if (!open && !event.viewed) void flow.markViewed([event.id]); }}>
              <time dateTime={event.created_at} title={new Date(event.created_at).toLocaleString()}>{new Date(event.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</time>
              <span className="flow-context" title={[event.customer_name, job, event.location_name].filter(Boolean).join(' · ')}>{event.customer_name}{job && <small> · {job}</small>}</span>
              <span className="flow-summary"><Icon size={15} className={`flow-icon flow-icon--${event.category}`} /><span>{event.summary}</span></span>
              <span className="flow-actor" title={event.actor_name}>{event.actor_name}</span>
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          </div>
          {open && <div className="flow-detail" id={`flow-detail-${event.id}`}><strong>{event.summary}</strong><p>{[event.customer_name, event.project_name, event.work_order_number && `WO ${event.work_order_number}`, event.location_name].filter(Boolean).join(' · ')}</p>{event.details && <p className="flow-detail-body">{event.details}</p>}<small>{event.actor_name} · {new Date(event.created_at).toLocaleString()} · Viewed</small><div className="flow-links">{links(event).map(link => <a key={link.label} href={link.url}>{link.label} ↗</a>)}</div></div>}
        </Fragment>;
      })}
    </div>
    {flow.hasMore && !flow.loading && <button className="flow-load-more" disabled={flow.loadingMore} onClick={() => void flow.loadMore()}>{flow.loadingMore ? 'Loading…' : 'Load older activity'}</button>}
    <p className="flow-footnote">Blue dot = new to you. Hover for a preview; open an entry or use its dot to mark it viewed.</p>
  </section>;
}
