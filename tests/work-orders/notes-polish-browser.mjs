import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createServer} from 'vite';
const server=await createServer({configFile:'tests/work-orders/notes-polish-browser/vite.config.mjs'});await server.listen();
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
try{
for(const viewport of [{width:320,height:568},{width:390,height:420},{width:768,height:1024},{width:1280,height:800}]){
const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5196');
const notes=page.getByRole('textbox',{name:'Work Order Notes',exact:true});const original=await notes.inputValue();
await page.getByRole('button',{name:'Polish notes with AI',exact:true}).click();
await page.getByRole('dialog',{name:'Polish your notes with AI?',exact:true}).waitFor();
await page.getByRole('button',{name:'Cancel',exact:true}).click();assert.equal(await notes.inputValue(),original);
await page.getByRole('button',{name:'Polish notes with AI',exact:true}).click();await page.getByRole('button',{name:'Polish Notes',exact:true}).click();
await page.getByRole('dialog',{name:'Review polished notes',exact:true}).waitFor();assert.equal(await notes.inputValue(),original);
await page.getByRole('textbox',{name:'Polished notes',exact:true}).fill('Reviewed: Replaced HDMI cable. Return for speaker issue.');
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
await page.getByRole('button',{name:'Use These Notes',exact:true}).click();assert.equal(await notes.inputValue(),'Reviewed: Replaced HDMI cable. Return for speaker issue.');
assert.deepEqual(errors,[]);await page.close();
}
console.log('Notes polish browser passed at phone, landscape phone, tablet and desktop sizes.');
}finally{await browser.close();await server.close();}
