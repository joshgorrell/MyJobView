import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5173','--strictPort'],{
 cwd:new URL('../../',import.meta.url),stdio:'ignore',env:{...process.env,VITE_SUPABASE_URL:'https://security-test.supabase.co',VITE_SUPABASE_ANON_KEY:'test-key'},
});
process.on('exit',()=>server.kill());
let serverReady=false;
for(let attempt=0;attempt<50;attempt++) {
 try {serverReady=(await fetch('http://127.0.0.1:5173/tests/catalog/product-dialog.html')).ok;} catch { /* Starting */ }
 if(serverReady) break;
 await new Promise(resolve=>setTimeout(resolve,200));
}
assert.ok(serverReady,'Test Vite server started');
const require=createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/' : import.meta.url);
const { chromium }=require('playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH || undefined,args:['--no-sandbox']});
try {
// Catalog modal: long content remains readable at phone, tablet and desktop widths.
const productContext=await browser.newContext();
const productDescription='(2025) 85" QLED 4K TV Supreme UHD Dimming Quantum HDR+\n'+ 'A complete product description with installation details. '.repeat(30)+'DESCRIPTION END';
await productContext.route('https://security-test.supabase.co/**',async route=>{
 if(route.request().url().includes('/rest/v1/products'))return route.fulfill({json:{id:'product-fixture',name:'QN85Q8F',manufacturer_model_number:'QN85Q8F',manufacturers:{name:'Samsung'},catalog_category:{name:"TV's"},default_vendor:{vendor_name:'Pioneer Music with a longer vendor name'},description:productDescription,inventory_type:'Non-Inventory',cost:1235.28,our_price:1999.81,default_labor_hours:2,labor_phases:{name:'Trim',default_price:135},created_at:'2026-10-01',updated_at:'2026-10-01'}});
 return route.fulfill({json:[]});
});
const productPage=await productContext.newPage();
for(const width of [320,390,768,1440]) {
 await productPage.setViewportSize({width,height:844});
 await productPage.goto('http://127.0.0.1:5173/tests/catalog/product-dialog.html?product');
 await productPage.getByRole('heading',{name:'QN85Q8F',exact:true}).waitFor();
 const description=productPage.getByText(productDescription,{exact:true});
 assert.equal(await description.evaluate(el=>getComputedStyle(el).webkitLineClamp),'3','Overview shows a concise preview');
 await productPage.getByRole('button',{name:'Details',exact:true}).click();
 await productPage.getByRole('heading',{name:'Sales description',exact:true}).waitFor();
 assert.equal(await description.evaluate(el=>getComputedStyle(el).webkitLineClamp),'none','Details exposes the full description');
 assert.ok((await description.innerText()).endsWith('DESCRIPTION END'));
 assert.ok(await productPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Product modal fits '+width);
 const close=productPage.getByRole('button',{name:'Close',exact:true});
 const rect=await close.boundingBox();assert.ok(rect.y+rect.height<=844,'Close stays inside visible viewport');
 await close.click();assert.equal(await productPage.title(),'Product closed');
}

for(const width of [320,390,768,1440]) {
 await productPage.setViewportSize({width,height:844});
 await productPage.goto('http://127.0.0.1:5173/tests/catalog/product-dialog.html?add-product');
 await productPage.getByRole('heading',{name:'New Product',exact:true}).waitFor();
 const controls=productPage.locator('.product-form-controls input:not([type="hidden"]):not([type="file"]):not(:disabled), .product-form-controls select:not(:disabled), .product-form-controls textarea:not(:disabled)');
 assert.ok(await controls.count()>10);
 // Product forms follow the workspace palette; security agreement fields above stay white.
 for(const [theme,background,text] of [
  ['light','rgb(255, 255, 255)','rgb(17, 24, 39)'],
  ['dark','rgb(17, 24, 39)','rgb(249, 250, 251)'],
 ]) {
  await productPage.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;},theme);
  for(const control of await controls.all()) {
   assert.deepEqual(await control.evaluate(el=>{const s=getComputedStyle(el);return [s.colorScheme,s.backgroundColor,s.color];}),[theme,background,text],`Product controls follow ${theme} theme at ${width}px`);
  }
 }
 const description=productPage.getByPlaceholder('Description that customers will see on proposals');
 await description.fill('A full product description. '.repeat(20));
 assert.equal(await description.getAttribute('rows'),'5');
 await productPage.getByRole('button',{name:'New',exact:true}).first().click();
 await productPage.getByPlaceholder('Enter manufacturer name').fill('New manufacturer');
 assert.ok(await productPage.getByRole('dialog',{name:'New Product',exact:true}).evaluate(el=>el.scrollWidth<=el.clientWidth),'Add product dialog fits '+width);
 assert.ok(await productPage.locator('.product-form-controls .overflow-y-auto').first().evaluate(el=>el.scrollWidth<=el.clientWidth),'Add product content fits '+width);
 const saveRect=await productPage.getByRole('button',{name:'Save Product',exact:true}).boundingBox();
 assert.ok(saveRect.y+saveRect.height<=844,'Save stays visible while editing description');
 await productPage.getByRole('button',{name:'Close product form',exact:true}).click();
 assert.equal(await productPage.title(),'Product form closed');
}
await productContext.close();
} finally { await browser.close(); server.kill(); }
console.log('Product detail and form checks passed at phone, tablet and desktop widths.');
