import { build } from 'esbuild';
import { mkdtemp,readFile,readdir,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const dir=await mkdtemp(join(tmpdir(),'mjv-themes-'));
const fixture=`export const profile={id:'test',ui_theme:'dark',role:'admin'};export const useAuth=()=>({profile});
window.failSave=false;
const result=(table,single,update)=>new Promise(resolve=>setTimeout(()=>resolve({data:single?{}:[],error:update&&window.failSave?{code:'network'}:null,count:0}),update?80:0));
export const supabase={removeChannel:()=>{},rpc:()=>Promise.resolve({data:[],error:null}),channel:()=>({on(){return this},subscribe(){return this},unsubscribe(){}}),from(table){let single=false,update=false;const q=new Proxy({},{get(_,key){if(key==='then')return(a,b)=>result(table,single,update).then(a,b);if(key==='single'||key==='maybeSingle')return()=>{single=true;return q};if(key==='update')return()=>{update=true;return q};return()=>q}});return q}};
export const checkPushSubscription=async()=>false;export const subscribeToPushNotifications=async()=>false;export const unsubscribeFromPushNotifications=async()=>true;
export const UserBusinessCardEditor=()=>null;export const RewardsDashboard=()=>null;`;
const source=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{ThemeProvider}from'./src/contexts/ThemeContext';import{UserPreferences}from'./src/components/Settings/UserPreferences';import ProjectsList from'./src/components/Projects/ProjectsList';import{FinanceDashboard}from'./src/components/Finance/FinanceDashboard';import{DispatchDashboard}from'./src/components/Dispatch/DispatchDashboard';import ConfirmModal from'./src/components/ui/ConfirmModal';import{PlatformFooter}from'./src/components/Layout/PlatformFooter';import{TasksView}from'./src/components/Tasks/TasksView';
function App(){const[modal,setModal]=useState(false);return <ThemeProvider><main className="theme-workspace workspace-shell min-h-screen p-3 sm:p-6 space-y-6"><header className="theme-chrome theme-header bg-canvas text-primary p-3"><span>MyJobView</span><span className="text-brand ml-3">Navigation</span></header><UserPreferences/><section id="tasks-fixture"><TasksView/></section><section aria-label="Legacy contrast fixtures" className="space-y-3"><div className="bg-white p-3"><p className="text-gray-300">Legacy white panel helper</p><p className="text-gray-900">Legacy white panel heading</p><input placeholder="Legacy input placeholder" defaultValue="Entered text"/><textarea placeholder="Legacy notes"/><select defaultValue="one"><option value="one">Selected option</option></select></div><div className="bg-gray-800 p-3"><p className="text-gray-700">Legacy dark panel label</p><p className="text-white">Legacy panel content</p></div><div className="bg-blue-900 bg-opacity-30 p-3"><p className="text-blue-300">Transparent badge</p></div><div className="bg-blue-600 p-3"><div className="bg-canvas p-3"><p>Nested neutral panel text</p></div></div><div className="bg-purple-100 p-3"><p className="text-purple-400">Pastel badge</p></div><div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-3"><p className="text-gray-300">Pastel gradient helper</p></div><button className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-3 py-2">Gradient action</button><button className="bg-cyan-600 text-white px-3 py-2">Colored action</button><button className="bg-gray-200 text-gray-700 hover:bg-gray-300 px-3 py-2">Secondary action</button><div data-theme-fixed className="bg-white text-black p-3">Brand artwork</div></section><ProjectsList projects={['planning','active','complete','closed'].map((status,i)=>({id:String(i),title:'Long customer project title for theme checks',project_number:'PR-123',status,contacts:{full_name:'Customer'},sales_orders:{order_number:12,contract_total:1000,status},work_orders:[]}))} onSelectProject={()=>{}}/><FinanceDashboard/><DispatchDashboard/><button className="bg-blue-600 text-white rounded-lg px-3 py-2" onClick={()=>setModal(true)}>Open confirmation</button><ConfirmModal isOpen={modal} title="Confirm change" message="Please check this change before continuing." variant="warning" onConfirm={()=>setModal(false)} onCancel={()=>setModal(false)}/><PlatformFooter onTellUs={()=>{}}/></main></ThemeProvider>}createRoot(document.getElementById('root')).render(<App/>);`;
let browser;
const server=createServer(async(req,res)=>{const f=req.url==='/app.js'?'app.js':req.url==='/style.css'?'style.css':'index.html';res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':'text/html');res.end(await readFile(join(dir,f)));});
try{
 await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'iife',jsx:'automatic',outfile:join(dir,'app.js'),plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/(?:^|\/)supabase(?:\.ts)?$|AuthContext$|lib\/pushNotifications$|BusinessCard\/UserBusinessCardEditor$|Rewards\/RewardsDashboard$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture}));}}]});
 const css=(await readdir('dist/assets')).find(x=>x.startsWith('index-')&&x.endsWith('.css'));await writeFile(join(dir,'style.css'),await readFile('dist/assets/'+css));await writeFile(join(dir,'index.html'),'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,headless:true,args:['--no-sandbox']});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});
 for(const width of [320,375,390,430,1280]){await page.setViewportSize({width,height:900});await page.goto('http://127.0.0.1:'+server.address().port);await page.getByRole('heading',{name:'Appearance',exact:true}).waitFor();
 for(const theme of ['classic','light','dark','mjv']){await page.getByRole('button',{name:theme==='classic'?/Classic Gradient/:new RegExp('^'+theme,'i')}).click();await page.waitForFunction(()=>!document.querySelector('[aria-label="Color theme"]').getAttribute('aria-busy')||document.querySelector('[aria-label="Color theme"]').getAttribute('aria-busy')==='false');
 assert.equal(await page.locator('[aria-label="Color theme"] [aria-pressed="true"]').count(),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 if(width<640)assert.equal(await page.locator('[aria-label="Preferences sections"]').evaluate(el=>el.scrollWidth>el.clientWidth),false);
 const boxes=await page.locator('[aria-label="Color theme"] button').evaluateAll(bs=>bs.map(b=>{const r=b.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}}));assert.ok(boxes.every(b=>b.h>=44));assert.equal(boxes[0].y,boxes[1].y);assert.equal(boxes[2].y,boxes[3].y);assert.equal(boxes[0].w,boxes[1].w);assert.equal(width<640,boxes[0].y!==boxes[2].y);
 await page.getByRole('button',{name:/^New(?: Task)?$/}).click();await page.getByRole('button',{name:'Create Task',exact:true}).waitFor();
 const contrastIssues=()=>page.evaluate(()=>{
   const rgb=value=>{const c=(value.match(/[\d.]+/g)||[]).map(Number);if(c.length===3)c.push(1);return c;};
   const blend=(front,back)=>back.map((v,i)=>front[i]*(front[3]??1)+v*(1-(front[3]??1)));
   const lum=c=>c.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
   const out=[];
   for(const el of document.querySelectorAll('h1,h2,h3,p,label,td,th,button,span,div,input,textarea,select')){
     const control=el.matches('input,textarea,select');
     if(!((control&&(el.value||el.placeholder))||[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))||!el.getBoundingClientRect().height)continue;
     const style=getComputedStyle(el);const foreground=rgb(getComputedStyle(el,control&&!el.value?'::placeholder':null).color);
     const layers=[];for(let parent=el;parent;parent=parent.parentElement)layers.push(getComputedStyle(parent));
     let backgrounds=[[255,255,255]];
     for(const layer of layers.reverse()){
       const solid=rgb(layer.backgroundColor);backgrounds=backgrounds.map(bg=>blend(solid,bg));
       const stops=(layer.backgroundImage.match(/rgba?\([^)]+\)/g)||[]).map(rgb);
       if(stops.length){
         const samples=[...stops];for(let i=1;i<stops.length;i++)for(const t of [.25,.5,.75])samples.push(stops[i-1].map((v,j)=>v*(1-t)+stops[i][j]*t));
         backgrounds=backgrounds.flatMap(bg=>samples.map(stop=>blend(stop,bg)));
       }
       if(solid[3]===1&&!stops.length)backgrounds=[solid.slice(0,3)];
     }
     const ratio=Math.min(...backgrounds.map(bg=>{const a=lum(blend(foreground,bg)),b=lum(bg);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);}));
     const large=parseFloat(style.fontSize)>=24||(parseFloat(style.fontSize)>=18.66&&parseInt(style.fontWeight)>=700);
     if(ratio<(large?3:4.5))out.push({text:(control?el.value||el.placeholder:el.textContent).trim().slice(0,60),ratio:ratio.toFixed(2),classes:el.className});
   }return out;
 });const issues=await contrastIssues();assert.deepEqual(issues,[],JSON.stringify({width,theme,issues}));
 await page.getByRole('button',{name:'Close dialog',exact:true}).click();await page.getByRole('button',{name:'Secondary action',exact:true}).hover();assert.deepEqual(await contrastIssues(),[],JSON.stringify({width,theme,hover:true}));assert.deepEqual(await page.locator('[data-theme-fixed]').last().evaluate(el=>[getComputedStyle(el).color,getComputedStyle(el).backgroundColor]),['rgb(0, 0, 0)','rgb(255, 255, 255)']);await page.getByRole('button',{name:'Open confirmation',exact:true}).click();assert.deepEqual(await contrastIssues(),[],JSON.stringify({width,theme,dialog:true}));await page.getByRole('button',{name:'Cancel',exact:true}).click();
 if(process.env.THEME_SCREENSHOT_DIR&&width===390){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:join(process.env.THEME_SCREENSHOT_DIR,theme+'.png')});await page.locator('#tasks-fixture').screenshot({path:join(process.env.THEME_SCREENSHOT_DIR,theme+'-tasks.png')});}
 }console.log(width+'px: four theme choices, layout and text contrast pass');}
 await page.getByRole('button',{name:/^MJV/}).click();await page.waitForFunction(()=>document.documentElement.dataset.theme==='mjv');await page.emulateMedia({colorScheme:'dark'});assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'mjv');assert.equal(await page.evaluate(()=>document.documentElement.style.colorScheme),'light');assert.equal(await page.getByRole('button',{name:/^System/}).count(),0);
 await page.evaluate(()=>localStorage.setItem('mjv-theme-test','system'));await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.theme==='mjv');assert.equal(await page.evaluate(()=>localStorage.getItem('mjv-theme-test')),'mjv');
 await page.getByRole('button',{name:/^Light/}).click();await page.waitForFunction(()=>document.querySelector('[aria-busy]').getAttribute('aria-busy')==='false');await page.reload();await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
 await page.evaluate(()=>window.failSave=true);await page.getByRole('button',{name:/^Dark/}).click();await page.getByRole('alert').waitFor();assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'light');assert.equal(await page.evaluate(()=>localStorage.getItem('mjv-theme-test')),'light');
 await page.getByRole('button',{name:'Open confirmation',exact:true}).click();assert.equal(await page.locator('.confirm-panel').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(248, 250, 252)');await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.deepEqual(errors,[]);console.log('MJV palette, legacy preference migration, saved preference, rollback and themed confirmation pass');
}finally{await browser?.close();server.close();await rm(dir,{recursive:true,force:true});}
