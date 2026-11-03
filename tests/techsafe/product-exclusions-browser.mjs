import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';
const server=await createServer({configFile:'tests/techsafe/browser/vite.config.mjs',server:{port:0}});await server.listen();
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:process.env.CHROMIUM_ARGS?JSON.parse(process.env.CHROMIUM_ARGS):[]});
const page=await browser.newPage({viewport:{width:375,height:800}});
let available=false,excluded=false,automatic=false,failGet=false,failSet='',sets=[];
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.clock.install();
await page.route('**/fixture/rpc',async route=>{
 const {name,args}=route.request().postDataJSON();
 if(name==='get_techsafe_product_exclusion')return route.fulfill({json:failGet?{data:null,error:{code:'PGRST202'}}:{data:available?{available,excluded,automatic}:{available:false},error:null}});
 sets.push(args);
 if(failSet)return route.fulfill({json:{data:null,error:{code:failSet}}});
 excluded=args.p_excluded;await route.fulfill({json:{data:{available:true,excluded,automatic},error:null}});
});
const go=async(query='')=>{const loaded=page.waitForResponse(r=>r.url().endsWith('/fixture/rpc'));await page.goto(server.resolvedUrls.local[0]+'tests/techsafe/browser/index.html'+query);await loaded;};
const box=()=>page.getByRole('checkbox',{name:'Exclude from Techsafe'});
try{
 await go();assert.equal(await box().count(),0,'integration off must hide the control');
 available=true;await go();await box().waitFor();assert.equal(await box().isChecked(),false);
 await box().click();await page.getByText('Saved',{exact:true}).waitFor();assert.equal(await box().isChecked(),true);assert.equal(sets.at(-1).p_excluded,true);
 await box().click();await page.getByText('Saved',{exact:true}).waitFor();assert.equal(sets.at(-1).p_excluded,false);
 await go('?readonly');await box().waitFor();assert.equal(await box().isDisabled(),true);
 automatic=true;excluded=true;await go();await box().waitFor();assert.equal(await box().isChecked(),true);assert.equal(await box().isDisabled(),true);await page.getByText('Miscellaneous items are always excluded from Techsafe.').waitFor();
 automatic=false;excluded=false;failSet='55000';await go();await box().click();await box().waitFor({state:'hidden'});
 failSet='42501';await go();await box().waitFor();await box().click();await page.getByRole('alert').waitFor();assert.equal(await box().isChecked(),false);assert.equal(await box().isDisabled(),true);
 failSet='';failGet=true;await go();assert.equal(await box().count(),0,'unknown health must hide the control');
 failGet=false;available=true;await go();await box().waitFor();
 available=false;await page.clock.fastForward(61000);await box().waitFor({state:'hidden'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);console.log('Product exclusion browser checks passed: health gating, save/unset, read-only, automatic miscellaneous, failed writes and periodic disconnect hiding.');
}finally{await browser.close();await server.close();}
