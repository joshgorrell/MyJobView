import {build} from 'esbuild';
import {mkdtemp,readFile,readdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const directory=await mkdtemp(join(tmpdir(),'service-intake-'));
const fixture=`import React from 'react';window.calls=[];
export const useAuth=()=>({profile:{id:'staff',role:'service_manager'}});
export const AddressAutocomplete=({value,onChange,...props})=><input {...props} value={value} onChange={e=>onChange(e.target.value)}/>;
export const supabase={from(table){let payload;const q={select:()=>q,in:()=>q,eq:()=>q,order:()=>q,limit:()=>q,or:query=>{window.calls.push(['search',query]);return q;},insert:value=>{payload=value;window.calls.push([table,value]);return q;},single:async()=>({data:{id:'saved'},error:null}),then:resolve=>Promise.resolve({data:table==='contacts'?[{id:'c1',full_name:'John Smith',phone:'5551234567',street_address:'123 Main St',city:'Topeka'}]:table==='profiles'?[{id:'tech',full_name:'JP'}]:[],error:null}).then(resolve)};return q;}};`;
const source=`import React from 'react';import{createRoot}from'react-dom/client';import{ServiceRequestForm}from'./src/components/Service/ServiceRequestForm';createRoot(document.getElementById('root')).render(<ServiceRequestForm onClose={()=>{}}/>);`;
let browser;
const server=createServer(async(req,res)=>{const name=req.url.includes('app.js')?'app.js':req.url.includes('style.css')?'style.css':'index.html';res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await readFile(join(directory,name)));});
try{
await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'iife',jsx:'automatic',outfile:join(directory,'app.js'),plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/lib\/supabase$|contexts\/AuthContext$|Shared\/AddressAutocomplete$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture,loader:'tsx',resolveDir:process.cwd()}));}}]});
const css=(await readdir('dist/assets')).find(p=>p.startsWith('index-')&&p.endsWith('.css'));await writeFile(join(directory,'style.css'),await readFile('dist/assets/'+css));
await writeFile(join(directory,'index.html'),'<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="style.css"><div id="root"></div><script src="app.js"></script>');
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
for(const width of [375,390,430,1280]){
 const page=await browser.newPage({viewport:{width,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.getByPlaceholder('Search name, company, phone, or email...').waitFor();
 assert.equal(await page.evaluate(()=>window.calls.filter(c=>c[0]==='search').length),0);
 await page.getByPlaceholder('Search name, company, phone, or email...').fill('John');
 await page.getByRole('button').filter({hasText:'John Smith'}).click();
 await page.getByPlaceholder('What needs to be done? *').fill('TV has no sound');
 const send=page.getByRole('button',{name:'Send to Service',exact:true});assert.equal(await send.isEnabled(),true);
 const box=await send.boundingBox();assert.ok(box.y+box.height<=844,`Submit visible at ${width}`);
 assert.equal(await page.evaluate(()=>document.querySelector('[role=dialog]').scrollWidth>document.querySelector('[role=dialog]').clientWidth),false);
 await send.click();const request=await page.evaluate(()=>window.calls.find(c=>c[0]==='service_requests')?.[1]);assert.equal(request.customer_contact_instruction,'dispatch');assert.equal(request.job_description,'TV has no sound');assert.deepEqual(request.requested_tech_ids,[]);assert.equal(request.earliest_date,null);assert.deepEqual(errors,[]);await page.close();
}
console.log('Migration validation and 375/390/430/1280px intake fast-path submission passed.');
}finally{await browser?.close();server.close();await rm(directory,{recursive:true,force:true});}
