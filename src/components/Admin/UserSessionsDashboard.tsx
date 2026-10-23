import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { Monitor, Smartphone, Tablet, RefreshCw, Search, Settings, ChevronDown, ChevronRight, Pencil, Check, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { sessionDeviceKey, sessionStatus } from '../../lib/sessionDevices';
const AdvancedTools = lazy(() => import('./UserSessionsViewerEnhanced').then(m => ({ default: m.SessionAdvancedTools })));
type Person = { id: string; full_name: string; email: string; role: string; is_active: boolean };
type Session = { id: string; user_id: string; device_signature: string | null; device_type: string | null; browser_name: string | null; os_name: string | null; device_model: string | null; session_start: string; session_end: string | null; last_activity: string; is_active: boolean; city: string | null; region: string | null; ip_city: string | null; ip_region: string | null; ip_address: string | null; current_page: string | null };
type Nickname = { id: string; device_signature: string; nickname: string };
type IPLabel = { ip_address: string; nickname: string; location_classification: 'office' | 'remote' | 'unknown' };
const panel = 'rounded-xl border border-subtle bg-surface p-4';
const button = 'min-h-[44px] rounded-lg border border-subtle px-3 py-2 text-sm hover:bg-elevated disabled:opacity-50';
function ago(value: string | null) {
  if (!value) return 'No recent activity';
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}
function deviceLabel(s: Session) { return [s.device_model || (s.device_type === 'mobile' ? 'Phone' : s.device_type === 'tablet' ? 'Tablet' : s.device_type === 'desktop' ? 'Computer' : 'Unknown device'), s.browser_name, s.os_name].filter(Boolean).join(' · '); }
function DeviceIcon({ session }: { session: Session }) { const Icon = session.device_type === 'mobile' ? Smartphone : session.device_type === 'tablet' ? Tablet : Monitor; return <Icon className="h-5 w-5 shrink-0 text-muted" aria-hidden="true" />; }
function Badge({ session }: { session: Session }) { const status = sessionStatus(session); return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${status === 'Online' ? 'bg-successSoft text-success' : status === 'Idle' ? 'bg-warningSoft text-warning' : 'bg-canvas text-muted'}`}>{status}</span>; }
export function UserSessionsDashboard() {
  const { profile } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [nicknames, setNicknames] = useState<Nickname[]>([]);
  const [ipLabels, setIpLabels] = useState<IPLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState<string | null>(null);
  const [tab, setTab] = useState<'people' | 'devices' | 'history' | 'work'>('people');
  const [workUserId, setWorkUserId] = useState('');
  const [search, setSearch] = useState('');
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [historyDays, setHistoryDays] = useState(7);
  const [historyLimit, setHistoryLimit] = useState(25);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const busy = useRef(false);
  const load = useCallback(async () => {
    if (!profile?.organization_id || busy.current) return;
    busy.current = true; setRefreshing(true);
    try {
      const org = profile.organization_id;
      const [users, names, locations] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email, role, is_active').eq('organization_id', org).order('full_name'),
        supabase.from('device_nicknames').select('id, device_signature, nickname').eq('organization_id', org),
        supabase.from('ip_nicknames').select('ip_address, nickname, location_classification').eq('organization_id', org),
      ]);
      if (users.error) throw users.error;
      if (names.error) throw names.error;
      if (locations.error) throw locations.error;
      const rows: Session[] = [];
      const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
      for (let offset = 0; ; offset += 1000) {
        const result = await supabase.from('user_sessions').select('*').eq('organization_id', org).gte('last_activity', cutoff).order('last_activity', { ascending: false }).order('id').range(offset, offset + 999);
        if (result.error) throw result.error;
        rows.push(...(result.data || []));
        if ((result.data?.length || 0) < 1000) break;
      }
      setPeople(users.data || []); setNicknames(names.data || []); setIpLabels(locations.data || []); setSessions(rows);
      setUpdated(new Date().toISOString()); setError('');
    } catch (e) { setError(`Could not load session data. ${e instanceof Error ? e.message : 'Please try refreshing.'}`); }
    finally { busy.current = false; setRefreshing(false); setLoading(false); }
  }, [profile?.organization_id]);
  useEffect(() => { void load(); const timer = setInterval(() => void load(), 30000); return () => clearInterval(timer); }, [load]);
  const personMap = useMemo(() => new Map(people.map(p => [p.id, p])), [people]);
  const nameMap = useMemo(() => new Map(nicknames.map(n => [n.device_signature, n])), [nicknames]);
  function nickname(s: Session) { const n = s.device_signature ? nameMap.get(s.device_signature)?.nickname : null; return n && n !== s.device_signature ? n : null; }
  function matches(s: Session) { const p = personMap.get(s.user_id); return [p?.full_name, p?.email, nickname(s), deviceLabel(s)].join(' ').toLowerCase().includes(search.toLowerCase()); }
  useEffect(() => setHistoryLimit(25), [historyDays, search, tab]);
  const groups = useMemo(() => {
    const result = new Map<string, Session[]>();
    sessions.forEach(s => { const key = sessionDeviceKey(s); result.set(key, [...(result.get(key) || []), s]); });
    return [...result.entries()];
  }, [sessions]);
  const historyRows = sessions.filter(s => Date.parse(s.last_activity) >= Date.now() - historyDays * 86400000 && matches(s));
  const online = sessions.filter(s => sessionStatus(s) === 'Online');
  const onlineUsers = new Set(online.map(s => s.user_id));
  const currentDevices = groups.filter(([, rows]) => rows[0].device_signature);
  const visiblePeople = people.filter(p => p.is_active !== false && (!onlineOnly || onlineUsers.has(p.id)) && ([p.full_name, p.email].join(' ').toLowerCase().includes(search.toLowerCase()) || sessions.some(s => s.user_id === p.id && matches(s))));
  async function saveName(s: Session) {
    if (!s.device_signature || !name.trim()) return;
    setSaving(true); setError('');
    try {
      const existing = nameMap.get(s.device_signature);
      if (!existing) throw new Error('Device record is missing. Refresh and try again.');
      const { data, error: saveError } = await supabase.from('device_nicknames').update({ nickname: name.trim() }).eq('id', existing.id).eq('organization_id', profile!.organization_id).select('id, device_signature, nickname').single();
      if (saveError) throw saveError;
      if (!data) throw new Error('The device name was not saved.');
      setNicknames(current => current.map(n => n.id === data.id ? data : n)); setEditing(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save device name.'); }
    finally { setSaving(false); }
  }
  const ipMap = new Map(ipLabels.map(location => [location.ip_address, location]));
  function locationLabel(s: Session) {
    const known = s.ip_address ? ipMap.get(s.ip_address) : null;
    const classification = known?.location_classification === 'office' ? 'Office' : known?.location_classification === 'remote' ? 'Remote' : 'Unknown';
    return { name: known?.nickname || 'Unlabeled network', classification };
  }
  function centralDate(value: string): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(value));
  }
  function dailySessions(userId: string): [string, number, number][] {
    const now = Date.now();
    const cutoff = now - 7 * 86400000;
    const intervals = sessions.filter(s => s.user_id === userId).map(s => ({
      start: Math.max(cutoff, Date.parse(s.session_start)),
      end: Math.min(now, Date.parse(s.session_end || s.last_activity)),
    })).filter(x => Number.isFinite(x.start) && Number.isFinite(x.end) && x.end > x.start);
    const boundaries = new Set<number>([cutoff, now]);
    // Probe hourly to discover Chicago calendar transitions, including DST.
    let previous = centralDate(new Date(cutoff).toISOString());
    for (let t = cutoff + 3600000; t <= now + 3600000; t += 3600000) {
      const probe = Math.min(t, now);
      const day = centralDate(new Date(probe).toISOString());
      if (day !== previous) {
        let low = Math.max(cutoff, probe - 3600000), high = probe;
        while (high - low > 1000) {
          const mid = Math.floor((low + high) / 2);
          if (centralDate(new Date(mid).toISOString()) === previous) low = mid;
          else high = mid;
        }
        boundaries.add(high);
      }
      previous = day;
    }
    const points = [...boundaries].sort((a, b) => a - b);
    const result: [string, number, number][] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const dayStart = points[i], dayEnd = points[i + 1];
      const day = centralDate(new Date(dayStart).toISOString());
      const clipped = intervals.map(x => ({ start: Math.max(dayStart, x.start), end: Math.min(dayEnd, x.end) }))
        .filter(x => x.end > x.start).sort((a, b) => a.start - b.start);
      let covered = 0, lastEnd = dayStart;
      for (const x of clipped) {
        covered += Math.max(0, x.end - Math.max(x.start, lastEnd));
        lastEnd = Math.max(lastEnd, x.end);
      }
      result.push([day, covered, clipped.length]);
    }
    return result.reverse();
  }
  function sessionCoverage(rows: Session[]): number {
    const cutoff = Date.now() - 7 * 86400000;
    const windows = rows.map(s => [Math.max(cutoff, Date.parse(s.session_start)), Math.min(Date.now(), Date.parse(s.session_end || s.last_activity))] as const)
      .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start)
      .sort((a, b) => a[0] - b[0]);
    let total = 0;
    let latestEnd = 0;
    for (const [start, end] of windows) {
      total += Math.max(0, end - Math.max(start, latestEnd));
      latestEnd = Math.max(latestEnd, end);
    }
    return total;
  }
  function SessionRow({ session: s }: { session: Session }) {
    return <div className="grid gap-2 border-t border-subtle py-3 sm:grid-cols-[1fr_auto]">
      <div className="min-w-0"><p className="text-sm font-medium break-words">{nickname(s) || deviceLabel(s)}</p><p className="text-xs text-muted">{new Date(s.session_start).toLocaleString()} · Last activity {ago(s.last_activity)}</p>
        <p className="text-xs text-muted break-words">{[s.city || s.ip_city, s.region || s.ip_region].filter(Boolean).join(', ') || 'Location unavailable'}{s.current_page ? ` · ${s.current_page}` : ''}</p>
      </div><div><Badge session={s} /></div>
    </div>;
  }
  return <div className="space-y-4 text-primary">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">User Sessions</h2><p className="mt-1 text-sm text-muted">Who is using MyJobView, which browser they use, and when they were last active.</p></div><button className={button} disabled={refreshing} onClick={() => void load()}><RefreshCw className={`mr-2 inline h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Refresh</button></header>
    {error && <div role="alert" className="rounded-lg border border-danger p-3 text-sm text-danger">{error}</div>}
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{[['Online people', onlineUsers.size], ['Online browsers', new Set(online.map(sessionDeviceKey)).size], ['Browsers seen in 30 days', currentDevices.length]].map(([label, count]) => <div key={label} className={panel}><p className="text-xs text-muted">{label}</p><p className="mt-1 text-2xl font-semibold">{count}</p></div>)}</div>
    <div className={panel}>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Session views">{(['people', 'devices', 'history', 'work'] as const).map(t => <button key={t} role="tab" aria-selected={tab === t} className={`${button} ${tab === t ? 'bg-infoSoft border-brand text-brand' : ''}`} onClick={() => { setTab(t); setExpanded(null); }}>{t === 'people' ? 'People' : t === 'devices' ? 'Devices' : t === 'history' ? 'Session history' : 'Work Activity'}</button>)}</div>
      <div className="mt-4 flex flex-wrap items-center gap-3"><label className="relative min-w-0 flex-1"><span className="sr-only">Search people or devices</span><Search className="absolute left-3 top-3 h-4 w-4 text-muted" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search people or devices" className="min-h-[44px] w-full rounded-lg border border-subtle bg-canvas py-2 pl-9 pr-3" /></label>
        {tab === 'people' && <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={onlineOnly} onChange={e => setOnlineOnly(e.target.checked)} />Online only</label>}
        {tab === 'history' && <select aria-label="History period" className={`${button} bg-canvas`} value={historyDays} onChange={e => setHistoryDays(Number(e.target.value))}><option value={1}>Last 24 hours</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option></select>}
      </div>
      <p className="mt-3 text-xs text-muted">Online: activity within 6 minutes. Idle: 6–30 minutes. Ended: signed out or no recent heartbeat. {updated ? `Updated ${ago(updated)}.` : ''}</p>
    </div>
    {loading ? <p role="status" className="py-8 text-center text-muted">Loading session data…</p> : <>
      {tab === 'people' && <div className="space-y-3">{visiblePeople.map(p => { const rows = sessions.filter(s => s.user_id === p.id); const latest = rows[0]; const live = rows.filter(s => sessionStatus(s) !== 'Ended'); const isOpen = expanded === p.id;
        return <article key={p.id} className={panel}><button className="flex min-h-[44px] w-full items-start gap-3 text-left" aria-expanded={isOpen} onClick={() => setExpanded(isOpen ? null : p.id)}>{isOpen ? <ChevronDown className="mt-1 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-1 h-4 w-4 shrink-0" />}<div className="min-w-0 flex-1"><h3 className="font-semibold break-words">{p.full_name || p.email}</h3><p className="text-xs text-muted break-words">{p.email}</p><p className="mt-2 text-sm">{latest ? nickname(latest) || deviceLabel(latest) : 'No sessions in the last 30 days'}</p><p className="text-xs text-muted">Last activity {ago(latest?.last_activity || null)}{live.length > 1 ? ` · ${live.length} open browsers` : ''}</p></div><span className="shrink-0 rounded-full bg-canvas px-2 py-1 text-xs">{onlineUsers.has(p.id) ? 'Online' : live.length ? 'Idle' : 'Offline'}</span></button>{isOpen && <div className="mt-3"><p className="text-xs text-muted">Recent sessions for {p.full_name}. Select Devices to rename a browser.</p>{rows.slice(0, 10).map(s => <SessionRow key={s.id} session={s} />)}{!rows.length && <p className="mt-3 text-sm text-muted">No recent sessions.</p>}</div>}</article>;
      })}{!visiblePeople.length && <p className={`${panel} text-muted`}>No people match these filters.</p>}</div>}
      {tab === 'devices' && <><p className="text-sm text-muted">Names belong to one user's browser installation. Different browsers appear separately. Clearing site data creates a new identity. Older records are grouped and cannot identify a specific computer.</p><div className="grid gap-3 md:grid-cols-2">{groups.filter(([, rows]) => matches(rows[0])).map(([key, rows]) => { const s = rows[0]; const p = personMap.get(s.user_id); const isEditing = editing === key;
        return <article className={panel} key={key}><div className="flex items-start gap-3"><DeviceIcon session={s} /><div className="min-w-0 flex-1"><h3 className="font-semibold break-words">{nickname(s) || deviceLabel(s)}</h3><p className="text-sm text-muted break-words">{p?.full_name || p?.email || 'Former user'}</p>{nickname(s) && <p className="text-xs text-muted">{deviceLabel(s)}</p>}</div><Badge session={s} /></div><p className="mt-3 text-xs text-muted">{s.device_signature ? 'Recognized browser' : 'Legacy browser group'} · {rows.length} sessions in the last 30 days · Last seen {ago(s.last_activity)}</p>{s.device_signature && (isEditing ? <form className="mt-3 flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); void saveName(s); }}><input aria-label="Device nickname" className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-subtle bg-canvas px-3" maxLength={80} value={name} onChange={e => setName(e.target.value)} autoFocus /><button className={button} disabled={saving || !name.trim()} type="submit"><Check className="inline h-4 w-4" /> Save</button><button className={button} type="button" disabled={saving} onClick={() => setEditing(null)}><X className="inline h-4 w-4" /> Cancel</button></form> : <button className={`${button} mt-3`} onClick={() => { setEditing(key); setName(nickname(s) || ''); }}><Pencil className="mr-2 inline h-4 w-4" />{nickname(s) ? 'Rename device' : 'Name device'}</button>)}</article>;
      })}</div>{!groups.filter(([, rows]) => matches(rows[0])).length && <p className={`${panel} text-muted`}>No devices match these filters.</p>}</>}
      {tab === 'work' && <div className={panel}>
        <h3 className="font-semibold">Employee Work Activity</h3>
        <p className="mt-1 text-sm text-muted">Session windows in MyJobView over the last 7 days. These are not verified work hours: idle time, work in other apps, and overlapping browsers cannot be measured from session history.</p>
        <label className="mt-3 block text-sm">Employee
          <select aria-label="Employee for work activity" className={`${button} mt-1 block w-full max-w-md bg-canvas`} value={workUserId} onChange={e => setWorkUserId(e.target.value)}>
            <option value="">Select an employee</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
          </select>
        </label>
        {workUserId && <div className="mt-4 space-y-2">
          <div aria-label="Session activity by Central date" className="space-y-1">
            {dailySessions(workUserId).map(([day, rows]) => <div key={day} className="rounded border border-subtle p-2 text-sm">{day} (Central): {rows.length} session(s) started</div>)}
          </div>
          <p className="text-xs text-muted">Days group session starts; cross-midnight sessions may span more than one day. Daily duration totals are withheld until intervals are split at midnight.</p>
          <p className="rounded-lg bg-canvas p-3 text-sm">Recorded session window coverage, with overlapping browsers counted once: <strong>{Math.round(sessionCoverage(sessions.filter(s => s.user_id === workUserId && Date.parse(s.last_activity) >= Date.now() - 7 * 86400000)) / 60000)} minutes</strong>. This is not verified work time.</p>
          {sessions.filter(s => s.user_id === workUserId && Date.parse(s.session_start) >= Date.now() - 7 * 86400000).sort((a, b) => Date.parse(b.session_start) - Date.parse(a.session_start)).map(s => <div key={s.id} className="rounded-lg border border-subtle p-3">
            <p className="font-medium">{new Date(s.session_start).toLocaleDateString()}</p>
            <p className="text-sm">{new Date(s.session_start).toLocaleTimeString()} – {s.session_end ? new Date(s.session_end).toLocaleTimeString() : 'No recorded end'}</p>
            <p className="text-xs text-muted">{locationLabel(s).name} · {locationLabel(s).classification} (network label, not verified presence) · {s.ip_address || 'IP unavailable'}</p>
          </div>)}
          {!sessions.some(s => s.user_id === workUserId && Date.parse(s.session_start) >= Date.now() - 7 * 86400000) && <p className="text-sm text-muted">No session records for this employee in the last 7 days.</p>}
        </div>}
      </div>}
      {tab === 'history' && <><p className="text-sm text-muted">Session activity shows app use, not time worked. Locations are approximate.</p><div className={panel}>{historyRows.slice(0, historyLimit).map(s => <div key={s.id}><p className="pt-3 text-sm font-semibold">{personMap.get(s.user_id)?.full_name || 'Former user'}</p><SessionRow session={s} /></div>)}{historyRows.length > historyLimit && <button className={`${button} mt-4`} onClick={() => setHistoryLimit(historyLimit + 25)}>Show more sessions ({historyRows.length - historyLimit} remaining)</button>}{!historyRows.length && <p className="text-sm text-muted">No sessions match these filters.</p>}</div></>}
    </>}
    <div className={panel}><button className="flex min-h-[44px] w-full items-center gap-2 text-left text-sm font-medium" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}><Settings className="h-4 w-4" />Logout settings & usage reports{advanced ? <ChevronDown className="ml-auto h-4 w-4" /> : <ChevronRight className="ml-auto h-4 w-4" />}</button>{advanced && <div className="mt-4"><Suspense fallback={<p>Loading settings…</p>}><AdvancedTools /></Suspense></div>}</div>
  </div>;
}
