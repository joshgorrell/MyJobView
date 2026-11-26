import {useEffect,useState} from 'react';
import {supabase} from '../../lib/supabase';
import {websiteWidgetEmbed,type WebsiteWidgetKind} from '../../lib/websiteWidgets';

type Row={kind:WebsiteWidgetKind;public_id:string;enabled:boolean;allowed_origins:string[]};
const placement:Record<WebsiteWidgetKind,string>={
 'sales-lead':'Sales Leads — contact or project inquiry page',
 chat:'Live Chat — a visible contact area on pages where visitors need assistance',
 service:'Service Requests — support or service page',
 feedback:'Customer Feedback — feedback page',
 portal:'Customer Portal — customer resources or login page',
 analytics:'Conversion Analytics — site-wide custom code, once per page',
};
export function WebsiteInstallationGuide({organizationId,rows}:{organizationId:string;rows:Row[]}){
 const [dealer,setDealer]=useState<{name:string;subdomain:string;logo_url:string|null}|null>(null);
 const [status,setStatus]=useState('');
 useEffect(()=>{let active=true;setDealer(null);void supabase.from('organizations').select('name,subdomain,logo_url').eq('id',organizationId).maybeSingle().then(({data,error})=>{if(active&&!error&&data)setDealer(data);});return()=>{active=false;};},[organizationId]);
 const released=import.meta.env.VITE_WEBSITE_WIDGET_ACTIVATION==='true';
 const entries=rows.map(row=>{let code='';try{code=websiteWidgetEmbed(row.kind,row.public_id,import.meta.env.VITE_WEBSITE_WIDGET_ASSET_ORIGIN||window.location.origin,import.meta.env.VITE_SUPABASE_URL);}catch{}return {...row,code};});
 const instructions=[
 'In MJV, open Admin → Integrations → Website Widgets. Configure branding, routing and notification recipients as applicable.',
 'Enter every exact HTTPS website origin, including www and non-www separately if both are used. Save each widget and enable only those you intend to install.',
 'Paste the complete script into a custom HTML or code block at the desired placement. Do not paste it into a plain text block. Install each selected widget only once per page.',
 'WordPress: use a Custom HTML block or an administrator-approved code injection plugin. Wix: use supported custom code or an HTML embed only if its actual execution origin is approved. Squarespace: use a Code block or Code Injection. GoDaddy: use an HTML section where supported. Custom sites: paste into the page HTML. Platform plans and iframe restrictions vary; if scripts are stripped or sandboxed, ask your web developer for direct script hosting.',
 'Publish to an approved test origin first. Check desktop and mobile, submit labeled test inquiries, confirm staff receipt and chat replies, and verify portal login and analytics. Never use real customer information for testing.',
 'If a widget fails, check exact origin, saved activation, script MIME/CORS, browser console, content security policy and bot verification. Check connection in MJV verifies assets, not real submissions.',
 'To disable a widget, turn it off in MJV and save; remove its script if desired. No dealer Supabase credentials or Cloudflare secret keys belong in website code.',
 ];
 function printGuide(){
  const win=window.open('','_blank');if(!win){setStatus('Allow pop-ups to print or save the guide as PDF.');return;}win.opener=null;
  const d=win.document;d.title=(dealer?.name||'Dealer')+' — Website integration guide';
  const add=(tag:string,value:string)=>{const el=d.createElement(tag);el.textContent=value;d.body.appendChild(el);return el;};
  const style=d.createElement('style');style.textContent='body{font:14px system-ui;margin:32px;color:#172033}h1{font-size:26px}h2{font-size:18px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f2f4f7;padding:12px}section{break-inside:avoid}img{max-width:160px;max-height:70px}';d.head.appendChild(style);
  if(dealer?.logo_url){try{const url=new URL(dealer.logo_url);if(url.protocol==='https:'&&url.origin===new URL(import.meta.env.VITE_SUPABASE_URL).origin){const img=d.createElement('img');img.src=url.href;img.alt=dealer.name;d.body.appendChild(img);}}catch{}}
  add('h1',(dealer?.name||'Dealer')+' — Website integration guide');
  add('p',released?'Use enabled widgets only.':'Preview only — do not install until activation is released.');
  if(dealer?.subdomain&&/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(dealer.subdomain))add('p','Customer portal: https://'+dealer.subdomain+'.myjobview.com/portal');
  instructions.forEach((s,i)=>add('p',(i+1)+'. '+s));
  entries.forEach(e=>{const section=d.createElement('section');d.body.appendChild(section);for(const [tag,value] of [['h2',placement[e.kind]],['p',e.enabled&&released?'Enabled':'Disabled / preview'],['p','Approved origins: '+(e.allowed_origins.join(', ')||'None')],['pre',e.code||'Code unavailable']]){const el=d.createElement(tag);el.textContent=value;section.appendChild(el);}});
  add('p','Use your browser Print → Save as PDF to share this guide with your web developer.');
  const button=d.createElement('button');button.textContent='Print / Save as PDF';button.onclick=()=>win.print();d.body.appendChild(button);
  const printStyle=d.createElement('style');printStyle.textContent='@media print{button{display:none}}';d.head.appendChild(printStyle);
  setStatus('Guide opened. Choose Print / Save as PDF.');
 }
 return <details className="border rounded-lg p-4 space-y-3"><summary className="font-semibold cursor-pointer">Installation Guide</summary><p className="text-sm">Instructions for your website developer. Includes saved dealer-specific codes and approved origins.</p><ol className="list-decimal pl-5 space-y-2 text-sm">{instructions.map(s=><li key={s}>{s}</li>)}</ol><ul className="text-sm space-y-1">{Object.values(placement).map(s=><li key={s}>{s}</li>)}</ul><button type="button" disabled={!dealer} onClick={printGuide} className="border rounded px-3 py-2">Print / Save integration guide as PDF</button><p role="status">{status}</p></details>;
}
