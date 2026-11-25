import { mountLeadForm } from './lead-form.js';
const mounted = new Set();
let turnstileLoader;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!turnstileLoader) turnstileLoader = new Promise((resolve,reject)=>{
    const tag=document.createElement('script');
    tag.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    tag.async=true;
    const timeout=setTimeout(()=>{tag.remove();reject(new Error('Verification unavailable'));},15000);
    tag.onload=()=>{clearTimeout(timeout);window.turnstile?resolve(window.turnstile):reject(new Error('Verification unavailable'));};
    tag.onerror=()=>{clearTimeout(timeout);tag.remove();reject(new Error('Verification unavailable'));};
    document.head.append(tag);
  }).catch(error=>{turnstileLoader=undefined;throw error;});
  return turnstileLoader;
}
async function botToken(container, sitekey) {
  const api=await loadTurnstile();
  return new Promise((resolve,reject)=>{
    let widget;
    const finish=(error,token)=>{clearTimeout(timer);if(widget!==undefined)api.remove(widget);error?reject(error):resolve(token);};
    const timer=setTimeout(()=>finish(new Error('Verification timed out')),120000);
    try { widget=api.render(container,{sitekey,action:'website_lead',callback:token=>finish(null,token),'error-callback':()=>finish(new Error('Verification failed')),'expired-callback':()=>finish(new Error('Verification expired'))}); }
    catch(error){finish(error);}
  });
}
export async function mountWidget({ kind, id, endpoint, script }) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return;
  const key = kind + ':' + id;
  if (mounted.has(key)) return;
  mounted.add(key);
  try {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid endpoint');
    url.searchParams.set('id', id); url.searchParams.set('kind', kind);
    const response = await fetch(url, { credentials: 'omit', cache: 'no-store', redirect: 'error' });
    if (!response.ok) throw new Error('Unavailable');
    const config = await response.json();
    if (config.kind !== kind) throw new Error('Invalid configuration');
    if(kind === 'portal') {
      const destination = new URL(config.portalUrl);
      if(destination.protocol !== 'https:' || destination.username || destination.password) return;
      const host=document.createElement('div');
      const root=host.attachShadow({mode:'open'});
      const link=document.createElement('a');
      link.href=destination.href; link.textContent='Customer portal';
      link.style.cssText='display:inline-block;padding:12px 18px;border-radius:8px;background:#172033;color:white;font:600 16px system-ui,sans-serif;text-decoration:underline';
      root.append(link);script.after(host);return;
    }
    if(kind !== 'sales-lead' || typeof config.turnstileSiteKey !== 'string' || !config.turnstileSiteKey) return;
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    const style=document.createElement('style');
    style.textContent=':host{display:block;color:#172033;font:16px system-ui,sans-serif}form{box-sizing:border-box;max-width:560px;margin:auto;padding:20px;background:white;border:1px solid #d7dce4;border-radius:12px;display:grid;gap:14px}h2{margin:0;font-size:1.4rem}label{display:grid;gap:5px}input,select,button{box-sizing:border-box;font:inherit;padding:10px;border:1px solid #aab3c0;border-radius:6px;width:100%;min-width:0}input[type=checkbox]{width:auto;justify-self:start}button{background:#172033;color:white;cursor:pointer}button:disabled{opacity:.6}p{margin:0;overflow-wrap:anywhere}';
    root.append(style);
    mountLeadForm(root,{...config,getBotToken:container=>botToken(container,config.turnstileSiteKey)},endpoint,id);
    script.after(host);
  } catch { mounted.delete(key); }
}
