import {build} from 'esbuild';
import {mkdtemp,readFile,readdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const directory=await mkdtemp(join(tmpdir(),'billing-'));
const fixture=`import React from 'react';window.saved=[];
const contact={contact_name:'Customer',first_name:'Customer',last_name:'Test',tax_rate:0.1,default_payment_terms:'net_30',state:'KS'};
const orders=['a','b'].map((id,i)=>({id,work_order_number:'WO-'+id,title:'Service',type:'service',status:'completed',contact_id:'customer',is_billable:true,work_order_group_id:'group',contacts:contact}));
let parts=['part-a','part-b'].map(id=>({id,work_order_id:id==='part-a'?'a':'b',part_name:'Catalog part',quantity:1,unit_price:100,unit_cost:20,part_sku:'SKU',product_id:'product',notes:'Internal part note'}));
export const AddPartsModal=({onSuccess})=><button onClick={()=>{parts.push({...parts[0],id:'part-c'});onSuccess();}}>Add catalog item</button>;
export const TaxRulesBadge=()=>null;
export const computeInvoiceTax=({lineItems})=>({subtotal:lineItems.reduce((s,l)=>s+l.amount,0),taxAmount:0,total:lineItems.reduce((s,l)=>s+l.amount,0)});
export const supabase={rpc:async(name,args)=>{window.saved.push({name,args});return{data:'invoice',error:null};},from(table){let selection='';let eqs={};const q={select:s=>{selection=s;return q;},eq:(key,value)=>{eqs[key]=value;return q;},neq:()=>q,in:()=>q,order:()=>q,limit:()=>q,maybeSingle:async()=>({data:table==='company_settings'?{default_labor_rate:100,portal_invoices_enabled:true}:null,error:null}),single:async()=>({data:null,error:null}),then:resolve=>Promise.resolve({data:table==='work_orders'?(eqs.id?orders.filter(w=>w.id===eqs.id):orders):table==='service_parts_used'?parts:table==='time_entries'?[{id:'t1',technician_id:'tech1',work_order_id:'a',total_hours:2,clock_out:'2026-10-05',status:'draft',profiles:{first_name:'Tech',last_name:'One'}},{id:'t2',technician_id:'tech2',work_order_id:'b',total_hours:2.13,clock_out:'2026-10-05',status:'submitted',profiles:{first_name:'Tech',last_name:'Two'}}]:table==='job_completions'?[{tech_notes:'Internal visit notes'}]:[],error:null}).then(resolve)};return q;}};`;
const source=`import React from 'react';import{createRoot}from'react-dom/client';import{CreateInvoiceFromWorkOrderModal}from'./src/components/Invoices/CreateInvoiceFromWorkOrderModal';createRoot(document.getElementById('root')).render(<CreateInvoiceFromWorkOrderModal preSelectedWorkOrderId="a" onClose={()=>{}} onSuccess={()=>{}}/>);`;
let browser;
const server=createServer(async(req,res)=>{const name=req.url.includes('app.js')?'app.js':req.url.includes('style.css')?'style.css':'index.html';res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(await readFile(join(directory,name)));});
try {
 await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,format:'iife',jsx:'automatic',outfile:join(directory,'app.js'),plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/lib\/supabase$|lib\/taxCalculations$|Production\/AddPartsModal$|Shared\/TaxRulesBadge$/},()=>({path:'fixture',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:fixture,loader:'tsx',resolveDir:process.cwd()}));}}]});
 const css=(await readdir('dist/assets')).find(p=>p.startsWith('index-')&&p.endsWith('.css'));await writeFile(join(directory,'style.css'),await readFile('dist/assets/'+css));await writeFile(join(directory,'index.html'),'<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="style.css"><div id="root"></div><script src="app.js"></script>');
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 for(const width of [390,1280]) {
  const page=await browser.newPage({viewport:{width,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{errors.push(d.message());await d.accept();});await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByText('Actual labor: 4.13 hours',{exact:true}).waitFor();await page.getByText('Billable labor: 4.25 hours',{exact:true}).waitFor();assert.equal(await page.getByPlaceholder('Description').count(),3,'Parts entered by both technicians are retained');
  await page.getByRole('button',{name:'Use Actual',exact:true}).click();await page.getByText('Billable labor: 4.13 hours',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Round Up to ¼ Hour',exact:true}).click();await page.getByText('Billable labor: 4.25 hours',{exact:true}).waitFor();
  await page.getByRole('button',{name:/Catalog Parts/}).click();await page.getByRole('button',{name:'Add catalog item',exact:true}).click();assert.equal(await page.getByPlaceholder('Description').count(),4,'Another identical catalog item is not dropped');
  const labor=page.getByPlaceholder('Description').filter({hasText:'Service labor'});const descriptions=await page.getByPlaceholder('Description').evaluateAll(nodes=>nodes.map(n=>n.value));const index=descriptions.indexOf('Service labor');await page.getByPlaceholder('Qty',{exact:true}).nth(index).fill('4.5');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,`No horizontal page overflow at ${width}`);
  await page.getByRole('button',{name:'Submit Invoice',exact:true}).click();const saved=await page.evaluate(()=>window.saved);assert.equal(saved.length,1);assert.deepEqual(saved[0].args.p_work_order_ids,['a','b']);assert.equal(saved[0].args.p_portal,true);assert.equal(saved[0].args.p_publish,true);assert.equal(saved[0].args.p_lines.find(l=>l.item_type==='labor').quantity,4.5);assert.deepEqual(saved[0].args.p_lines.filter(l=>l.source_part_id).map(l=>l.source_part_id),['part-a','part-b','part-c']);assert.ok(saved[0].args.p_lines.filter(l=>l.source_part_id).every(l=>l.unit_price===100&&l.notes_visible_on_invoice===false));assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Mobile/desktop linked visit review, editable hours, catalog additions, selling prices and portal publication passed.');
}finally{await browser?.close();server.close();await rm(directory,{recursive:true,force:true});}
