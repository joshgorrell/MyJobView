import { WebsiteAnalyticsSummary } from './WebsiteAnalyticsSummary';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { normalizeWebsiteOrigin, websiteWidgetKinds, websiteWidgetEmbed, type WebsiteWidgetKind } from '../../lib/websiteWidgets';

const labels: Record<WebsiteWidgetKind, string> = {
  'sales-lead': 'Sales Leads', chat: 'Live Chat', service: 'Service Requests',
  feedback: 'Customer Feedback', portal: 'Customer Portal', analytics: 'Conversion Analytics',
};
type Settings = { kind: WebsiteWidgetKind; public_id: string; enabled: boolean; allowed_origins: string[]; branding: { name?: string; color?: string; theme?: string; showLogo?: boolean }; options?: { interests?: string[]; [key: string]: unknown } };
function WidgetEditor({ kind, organizationId, initial }: { kind: WebsiteWidgetKind; organizationId: string; initial?: Settings }) {
  const [saved, setSaved] = useState(initial);
  const [origins, setOrigins] = useState(initial?.allowed_origins.join('\n') ?? '');
  const [name, setName] = useState(initial?.branding.name ?? '');
  const [color, setColor] = useState(initial?.branding.color ?? '#2563eb');
  const [inheritColor,setInheritColor]=useState(!initial?.branding.color);
  const [showLogo,setShowLogo]=useState(initial?.branding.showLogo!==false);
  const [theme,setTheme]=useState(initial?.branding.theme??'light');
  const [interests, setInterests] = useState(initial?.options?.interests?.join('\n') ?? '');
  const [reviewUrl, setReviewUrl] = useState(typeof initial?.options?.review_url === 'string' ? initial.options.review_url : '');
  const [offlineMessage,setOfflineMessage]=useState(String(initial?.options?.offline_message??'Our team will reply when available.'));
  const [timezone,setTimezone]=useState(String(initial?.options?.timezone??'America/Chicago'));
  const [opens,setOpens]=useState(String(initial?.options?.opens??'08:00'));
  const [closes,setCloses]=useState(String(initial?.options?.closes??'17:00'));
  const [weekdays,setWeekdays]=useState<number[]>(Array.isArray(initial?.options?.weekdays)?initial.options.weekdays as number[]:[1,2,3,4,5]);
  const [recipients,setRecipients]=useState<string[]>(Array.isArray(initial?.options?.notification_recipients)?initial.options.notification_recipients as string[]:[]);
  const [officeId, setOfficeId] = useState(String(initial?.options?.office_id ?? ''));
  const [repId, setRepId] = useState(String(initial?.options?.rep_id ?? ''));
  const [offices, setOffices] = useState<{id:string;office_name:string}[]>([]);
  const [reps, setReps] = useState<{id:string;full_name:string}[]>([]);
  const [routingReady, setRoutingReady] = useState(false);
  const [dealerAppUrl,setDealerAppUrl]=useState('');
  useEffect(()=>{if(kind!=='portal')return;let cancelled=false;void supabase.from('organizations').select('subdomain').eq('id',organizationId).maybeSingle().then(({data,error})=>{if(!cancelled&&!error)setDealerAppUrl(data?.subdomain && /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(data.subdomain) ? 'https://'+data.subdomain+'.myjobview.com/portal' : '');});return()=>{cancelled=true;};},[kind,organizationId]);
  useEffect(() => {
    if (!['sales-lead','chat','service','feedback'].includes(kind)) return;
    let cancelled = false;
    void Promise.all([
      supabase.from('company_offices').select('id,office_name').eq('organization_id', organizationId).order('display_order'),
      supabase.from('profiles').select('id,full_name').eq('organization_id', organizationId).eq('is_active', true).is('contact_id',null).order('full_name'),
    ]).then(([o,r]) => {
      if (cancelled || o.error || r.error) return;
      setOffices(o.data ?? []); setReps(r.data ?? []); setRoutingReady(true);
    });
    return () => { cancelled = true; };
  }, [kind, organizationId]);
  const releaseEnabled = import.meta.env.VITE_WEBSITE_WIDGET_ACTIVATION === 'true';
  const [enabled,setEnabled]=useState(initial?.enabled??false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [code,setCode]=useState('');
  const [checking,setChecking]=useState(false);
  const [health,setHealth]=useState<string[]>([]);
  async function checkConnection(){
    setChecking(true);setHealth([]);
    const results:string[]=[];
    try{
      const asset=normalizeWebsiteOrigin(import.meta.env.VITE_WEBSITE_WIDGET_ASSET_ORIGIN||window.location.origin);
      const api=normalizeWebsiteOrigin(import.meta.env.VITE_SUPABASE_URL);
      const checks=await Promise.allSettled(['runtime',kind].map(async file=>{
        const response=await fetch(asset+'/website-widgets/'+file+'.js',{mode:'cors',credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
        if(!response.ok||!/javascript|ecmascript/i.test(response.headers.get('content-type')||''))throw Error('Asset unavailable');
        return file;
      }));
      checks.forEach((check,i)=>results.push((i===0?'Shared runtime':'Widget script')+': '+(check.status==='fulfilled'?'reachable':'unavailable or incorrect MIME type')));
      results.push('Configuration: '+(saved?'saved':'not saved'));
      results.push('Approved origins: '+(saved?.allowed_origins.length||0));
      results.push('Activation: '+(releaseEnabled&&saved?.enabled?'enabled in settings':'disabled'));
      results.push('API endpoint: '+api);
      results.push('Public origin, bot verification and actual submission must be tested on the approved website.');
    }catch{results.push('Invalid hosting configuration or connection unavailable.');}
    finally{setHealth(results);setChecking(false);}
  }
  async function save() {
    setBusy(true); setMessage('');
    try {
      const allowed_origins = [...new Set(origins.split(/\s+/).filter(Boolean).map(normalizeWebsiteOrigin))];
      if(releaseEnabled&&enabled&&!allowed_origins.length){setMessage('Add an approved website origin before enabling.');return;}
      const choices = [...new Set(interests.split('\n').map(v => v.trim()).filter(Boolean))];
      if (kind === 'sales-lead' && (choices.length > 30 || choices.some(v => v.length > 100))) { setMessage('Use up to 30 service choices, each at most 100 characters.'); return; }
      let portalDestination = '';
      if (kind === 'portal' && dealerAppUrl) {
        const url = new URL(dealerAppUrl);
        if (!dealerAppUrl || url.origin !== new URL(dealerAppUrl).origin) {setMessage('Use your dealer application domain for the portal.');return;}
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) { setMessage('Enter a secure portal URL without credentials or query parameters.'); return; }
        portalDestination = url.href;
      }
      if(kind==='portal' && releaseEnabled && enabled && !portalDestination){setMessage('Configure your dealer application URL before enabling the portal.');return;}
      if (kind === 'sales-lead' && (!routingReady || (officeId && !offices.some(o => o.id === officeId)) || (repId && !reps.some(r => r.id === repId)))) { setMessage('Check office and representative routing before saving.'); return; }
      let reviewDestination = '';
      if (kind === 'feedback' && reviewUrl.trim()) {
        const url = new URL(reviewUrl.trim());
        if (url.protocol !== 'https:' || url.username || url.password || !['g.page','search.google.com','maps.google.com','www.google.com'].includes(url.hostname)) { setMessage('Enter a valid HTTPS Google review link.'); return; }
        reviewDestination = url.href;
      }
      if(kind==='chat'){try{new Intl.DateTimeFormat('en-US',{timeZone:timezone}).format();}catch{setMessage('Invalid time zone.');return;}if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(opens)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(closes)||opens>=closes||!routingReady||recipients.some(id=>!reps.some(r=>r.id===id))){setMessage('Check business hours and notification recipients.');return;}}
      if(['service','feedback'].includes(kind)&&(!routingReady||recipients.some(id=>!reps.some(r=>r.id===id)))){setMessage('Check notification recipients before saving.');return;}
      const options = { ...saved?.options, ...(['service','feedback'].includes(kind)?{notification_recipients:recipients}:{}), ...(kind === 'chat' ? {offline_message:offlineMessage.trim().slice(0,300),timezone,opens,closes,weekdays,notification_recipients:recipients} : {}), ...(kind === 'feedback' ? { review_url: reviewDestination } : {}), ...(kind === 'portal' ? { portal_url: portalDestination } : {}), ...(kind === 'sales-lead' ? { interests: choices, office_id: officeId || null, rep_id: repId || null } : {}) };
      const { data, error } = await supabase.from('website_widget_settings').upsert({
        organization_id: organizationId, kind, allowed_origins, branding: { name: name.trim(), ...(inheritColor?{}:{color}), theme, showLogo }, options, enabled: releaseEnabled && enabled,
      }, { onConflict: 'organization_id,kind' }).select('kind,public_id,enabled,allowed_origins,branding,options').single();
      if (error) throw error;
      setSaved(data as Settings); setMessage(releaseEnabled?'Configuration saved.':'Configuration saved. Activation is not available yet.');
    } catch { setMessage('Unable to save. Check the HTTPS origins and try again.'); }
    finally { setBusy(false); }
  }
  return <section className="border rounded-lg p-4 space-y-3 min-w-0">
    <h4 className="font-semibold">{labels[kind]}</h4>
    <p className="text-sm">{saved?.enabled?'Enabled':'Disabled'}</p>{releaseEnabled&&<label className="block"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> Enable this widget</label>}
    <label className="block text-sm">Approved website origins (one per line)
      <textarea className="block w-full border rounded p-2" value={origins} onChange={e => setOrigins(e.target.value)} placeholder="https://example.com" />
    </label>
    <label className="block text-sm">Display name<input className="block w-full border rounded p-2" value={name} onChange={e => setName(e.target.value)} maxLength={100} /></label>
    <label className="block text-sm">Brand color <input type="color" disabled={inheritColor} value={color} onChange={e => setColor(e.target.value)} /></label>
    <label className="block text-sm"><input type="checkbox" checked={inheritColor} onChange={e=>setInheritColor(e.target.checked)}/> Use dealer brand color</label>
    <label className="block text-sm"><input type="checkbox" checked={showLogo} onChange={e=>setShowLogo(e.target.checked)}/> Show dealer logo on forms</label>
    <label className="block text-sm">Appearance<select className="block w-full border rounded p-2" value={theme} onChange={e=>setTheme(e.target.value)}><option value="light">Light</option><option value="dark">Dark</option><option value="auto">Match visitor preference</option></select></label>
    {kind === 'sales-lead' && <label className="block text-sm">Services offered (one per line)<textarea className="block w-full border rounded p-2" value={interests} onChange={e => setInterests(e.target.value)} placeholder="Home Theater" /><span className="text-xs">Customers can select multiple services. Leave blank to allow free text.</span></label>}
    {kind === 'chat' && <label className="block text-sm">Response expectation<textarea className="block w-full border rounded p-2" maxLength={300} value={offlineMessage} onChange={e=>setOfflineMessage(e.target.value)} /><span className="text-xs">Shown to visitors without promising an immediate response.</span></label>}
    {kind==='chat'&&<div className="space-y-2"><label>Time zone<input className="block w-full border rounded p-2" value={timezone} onChange={e=>setTimezone(e.target.value)}/></label><div className="flex flex-wrap gap-2">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d,i)=><label key={d}><input type="checkbox" checked={weekdays.includes(i)} onChange={e=>setWeekdays(old=>e.target.checked?[...old,i]:old.filter(v=>v!==i))}/>{d}</label>)}</div><label>Opens <input type="time" value={opens} onChange={e=>setOpens(e.target.value)}/></label><label>Closes <input type="time" value={closes} onChange={e=>setCloses(e.target.value)}/></label><fieldset><legend>New chat notifications (default: administrators)</legend>{reps.map(r=><label key={r.id} className="block"><input type="checkbox" checked={recipients.includes(r.id)} onChange={e=>setRecipients(old=>e.target.checked?[...old,r.id]:old.filter(v=>v!==r.id))}/>{r.full_name}</label>)}</fieldset></div>}
    {['service','feedback'].includes(kind)&&<fieldset><legend>{kind==='service'?'New service request notifications':'Feedback needing attention notifications'} (default: administrators)</legend>{!routingReady&&<p role="status">Loading staff…</p>}{reps.map(r=><label key={r.id} className="block"><input type="checkbox" checked={recipients.includes(r.id)} onChange={e=>setRecipients(old=>e.target.checked?[...old,r.id]:old.filter(v=>v!==r.id))}/>{r.full_name}</label>)}</fieldset>}
    {kind === 'feedback' && <label className="block text-sm">Google review link (optional)<input type="url" className="block w-full border rounded p-2" value={reviewUrl} onChange={e => setReviewUrl(e.target.value)} placeholder="https://g.page/..." /><span className="text-xs">Available to every visitor, regardless of feedback rating.</span></label>}
    {kind === 'portal' && <label className="block text-sm">Customer portal URL<input type="url" className="block w-full border rounded p-2" value={dealerAppUrl} readOnly placeholder={dealerAppUrl || "https://portal.example.com/login"} /><span className="text-xs">Automatically uses your registered dealer subdomain.</span></label>}
    {kind === 'sales-lead' && <div className="space-y-2">
      {!routingReady && <p role="status">Routing options unavailable or loading.</p>}
      <label className="block text-sm">Receiving office<select className="block w-full border rounded p-2" disabled={!routingReady} value={officeId} onChange={e => setOfficeId(e.target.value)}><option value="">Default office</option>{offices.map(o => <option key={o.id} value={o.id}>{o.office_name}</option>)}</select></label>
      <label className="block text-sm">Assigned representative<select className="block w-full border rounded p-2" disabled={!routingReady} value={repId} onChange={e => setRepId(e.target.value)}><option value="">Unassigned — shared Pipeline</option>{reps.map(r => <option key={r.id} value={r.id}>{r.full_name}</option>)}</select></label>
    </div>}
    {kind === 'analytics' && saved && <WebsiteAnalyticsSummary publicId={saved.public_id} organizationId={organizationId} />}
    <div className="border rounded p-3" aria-label="Branding preview" style={{background:theme==='dark'?'#171b23':'#ffffff',color:theme==='dark'?'#ffffff':'#172033'}}><strong>{name || 'Your company'}</strong><div className="mt-2 inline-block rounded px-3 py-2 text-white" style={{ backgroundColor: color }}>{labels[kind]}</div></div>
    <button type="button" disabled={busy} onClick={() => void save()} className="border rounded px-3 py-2">Save configuration</button>
    {saved && <button type="button" className="border rounded px-3 py-2 ml-2" onClick={async () => {
      try { const snippet=websiteWidgetEmbed(kind, saved.public_id, import.meta.env.VITE_WEBSITE_WIDGET_ASSET_ORIGIN || window.location.origin, import.meta.env.VITE_SUPABASE_URL);setCode(snippet);await navigator.clipboard.writeText(snippet); setMessage(releaseEnabled&&saved.enabled?'Installation code copied.':'Preview code copied. Do not install until runtime is released.'); }
      catch { setMessage('Unable to copy preview code.'); }
    }}>{releaseEnabled&&saved.enabled?'Copy installation code':'Copy preview code'}</button>}
    {code&&<label className="block text-sm">Installation HTML<textarea readOnly className="block w-full border rounded p-2 font-mono text-xs" value={code} onFocus={e=>e.target.select()}/></label>}
    <button type="button" disabled={checking} onClick={()=>void checkConnection()} className="border rounded px-3 py-2">{checking?'Checking…':'Check connection'}</button>
    {health.length>0&&<ul aria-live="polite" className="text-sm space-y-1">{health.map((item,i)=><li key={i}>{item}</li>)}</ul>}
    <p role="status" className="text-sm">{message}</p>
  </section>;
}
export function WebsiteWidgetSettings({ organizationId }: { organizationId: string }) {
  const [rows, setRows] = useState<Settings[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setRows(null); setError(false);
    void supabase.from('website_widget_settings').select('kind,public_id,enabled,allowed_origins,branding,options').eq('organization_id', organizationId).then(({ data, error }) => {
      if (!cancelled) { setError(!!error); if (!error) setRows(data as Settings[]); }
    });
    return () => { cancelled = true; };
  }, [organizationId]);
  if (error) return <p role="alert">Website widget settings are unavailable.</p>;
  if (!rows) return <p role="status">Loading website widgets…</p>;
  return <div className="space-y-4"><h3 className="text-lg font-semibold">Website Widgets</h3>
    <p className="text-sm">Configure each widget independently. Save your approved website origins and configure each widget before installation.</p>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{websiteWidgetKinds.map(kind => <WidgetEditor key={organizationId + kind} kind={kind} organizationId={organizationId} initial={rows.find(row => row.kind === kind)} />)}</div>
  </div>;
}
