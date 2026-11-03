import {build} from 'esbuild';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const directory=await mkdtemp(join(tmpdir(),'mjv-routes-'));
const app=await readFile('src/App.tsx','utf8');
const names=new Set([...app.matchAll(/import\s*\{([^}]+)\}/g)].flatMap(m=>m[1].split(',').map(s=>s.trim())).concat([...app.matchAll(/default: m\.(\w+)/g)].map(m=>m[1])));
const special=['useAuth','useDepartments','useTenant','useNotificationCount','syncVisitEvents','offlineStorage','syncManager','supabase','isValidReturnHost','getBusinessCardSlugFromLocation','resolveLegacyPage','pageFromLocation','workspacePage','workspaceUrl','isPortalProposalRoute'];
const fixture=`import React from 'react';
function Stub(props){return props.children||<div data-page={props.label}>Page</div>}
export const useAuth=()=>({user:window.mode==='signed-out'?null:{id:'user'},profile:window.mode==='signed-out'?null:{id:'user',role:'admin',is_active:true,organization_id:'org'},loading:false,isPortalUser:window.mode==='portal',signOut:async()=>{}});
export const useDepartments=()=>({starredModules:[],hasModuleAccess:key=>!window.permissions||window.permissions.includes(key),modules:[],loading:false});
export const useTenant=()=>({});export const useNotificationCount=()=>0;
export const syncVisitEvents=async()=>{};export const offlineStorage={init(){}};export const syncManager={startAutoSync(){}};export const supabase={rpc:()=>Promise.resolve({}),from(){const q={select:()=>q,eq:()=>q,maybeSingle:()=>Promise.resolve({data:{portal_proposals_enabled:true}})};return q;}};
${[...names].filter(n=>!special.includes(n)&&n!=='default'&&/^\w+$/.test(n)).map(n=>`export const ${n}=${n==='Header'?"(p)=><nav>{['feed','leads','proposals'].map(t=><button key={t} onClick={()=>p.onTabChange(t)}>{t}</button>)}</nav>":`(p)=>p.children||<div data-page="${n}">Page</div>`};`).join('\n')}
export default Stub;`;
let browser;
const server=createServer(async(req,res)=>{const file=req.url.startsWith('/app.js')?'app.js':'index.html';res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'text/html');res.end(await readFile(join(directory,file)));});
try{
 await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import App from './src/App';window.mode=sessionStorage.getItem('mode')||'staff';window.permissions=JSON.parse(sessionStorage.getItem('permissions')||'null');createRoot(document.getElementById('root')).render(<App/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,jsx:'automatic',outfile:join(directory,'app.js'),plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/^\.\//},args=>{if(args.importer.endsWith('/src/App.tsx')&&!['./components/Shared/WorkspaceTabs','./lib/workspaceRoutes','./lib/permissionCatalog','./lib/businessCardLinks','./lib/crossDomainAuth'].includes(args.path))return{path:args.path,namespace:'fixture'};});b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:fixture.replace('export default Stub;',`export default function Page(p){return <div data-page="${args.path.split('/').at(-1)}">{p.children||'Page'}</div>}`),loader:'tsx',resolveDir:process.cwd()}));}}]});
 await writeFile(join(directory,'index.html'),'<div id="root"></div><script src="/app.js"></script>');await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,headless:true,args:['--no-sandbox']});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});const base='http://127.0.0.1:'+server.address().port;
 await page.goto(base+'/?tab=leads&leadId=record#detail');await page.waitForURL('**/leads?leadId=record#detail');
 await page.getByRole('button',{name:'proposals',exact:true}).click();await page.waitForURL('**/proposals?leadId=record#detail');assert.equal(await page.locator('[data-page="PortalProposals"]').count(),0);
 await page.reload();await page.getByRole('button',{name:'feed',exact:true}).waitFor();
 await page.getByRole('button',{name:'feed',exact:true}).click();await page.waitForURL('**/flow?leadId=record#detail');
 await page.goBack();await page.waitForURL('**/proposals?leadId=record#detail');await page.goForward();await page.waitForURL('**/flow?leadId=record#detail');
 await page.evaluate(()=>sessionStorage.setItem('mode','signed-out'));await page.goto(base+'/leads?leadId=record');await page.waitForTimeout(100);assert.equal(new URL(page.url()).pathname,'/leads');assert.equal(new URL(page.url()).search,'?leadId=record');assert.equal(await page.getByRole('button',{name:'feed',exact:true}).count(),0);
 await page.evaluate(()=>sessionStorage.setItem('mode','portal'));await page.goto(base+'/proposals');await page.locator('[data-page="PortalProposals"]').waitFor();
 await page.goto(base+'/portal/proposals');await page.locator('[data-page="PortalProposals"]').waitFor();
 await page.evaluate(()=>sessionStorage.setItem('mode','staff'));await page.goto(base+'/proposals?portal_token=token');await page.locator('[data-page="PortalProposals"]').waitFor();assert.equal(new URL(page.url()).searchParams.get('portal_token'),'token');
 await page.goto(base+'/pipeline-board');await page.getByRole('tab',{name:'Board',exact:true}).waitFor();
 await page.getByRole('tab',{name:'Leads',exact:true}).click();await page.waitForURL('**/leads');await page.locator('[data-page="LeadsHistory"]').waitFor();
 await page.getByRole('tab',{name:'Fishbowl',exact:true}).click();await page.waitForURL('**/fishbowl');await page.reload();await page.getByRole('tab',{name:'Fishbowl',exact:true}).waitFor();assert.equal(await page.getByRole('tab',{name:'Fishbowl',exact:true}).getAttribute('aria-selected'),'true');
 await page.goBack();await page.waitForURL('**/leads');assert.equal(await page.getByRole('tab',{name:'Leads',exact:true}).getAttribute('aria-selected'),'true');
 await page.goto(base+'/payroll');await page.getByRole('tab',{name:'Payroll',exact:true}).click();await page.getByRole('tab',{name:'Review',exact:true}).click();await page.waitForURL('**/time-approval');
 await page.evaluate(()=>sessionStorage.setItem('permissions',JSON.stringify(['time_approval'])));await page.reload();await page.getByRole('tab',{name:'Review',exact:true}).waitFor();assert.equal(await page.getByRole('tab',{name:'Payroll',exact:true}).count(),0);
 await page.evaluate(()=>sessionStorage.setItem('permissions',JSON.stringify(['leads'])));await page.goto(base+'/leads');await page.getByRole('tab',{name:'Leads',exact:true}).waitFor();assert.equal(await page.getByRole('tab').count(),1);
 console.log('Actual workspace tabs: Pipeline selection/history/reload and Review-only/Leads-only permissions pass');
 assert.deepEqual(errors,[]);console.log('Actual App: clean/legacy routes, refresh, back/forward, unsigned record retention, and portal proposals pass');
}finally{await browser?.close();server.close();await rm(directory,{recursive:true,force:true});}
