import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const require = createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES + '/' : import.meta.url);
const { chromium } = require('playwright');
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'tests/reviews/browser/vite.config.mjs'], { cwd: new URL('../../', import.meta.url), stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch('http://127.0.0.1:5189')).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined });
  for (const width of [390,768,1280]) {
    const previewPage = await browser.newPage({viewport:{width,height:800}});
    await previewPage.goto('http://127.0.0.1:5189/?email-preview=1');
    await previewPage.getByPlaceholder('Search customers').fill('Preview');
    await previewPage.getByRole('button',{name:/Preview Customer.*preview@example.com/}).click();
    await previewPage.getByLabel('Review Title / Email Subject').fill('Home theater');
    await previewPage.getByRole('button',{name:'Preview Email',exact:true}).click();
    const dialog=previewPage.getByRole('dialog',{name:'Email Preview'});
    await dialog.waitFor();
    const region=dialog.getByRole('region',{name:'Full email preview'});
    const frame=previewPage.frameLocator('iframe[title="Lost Opportunity email preview"]');
    await previewPage.waitForFunction(()=>parseFloat(document.querySelector('iframe[title="Lost Opportunity email preview"]').style.height)>1500);
    await region.evaluate(el=>{el.scrollTop=el.scrollHeight});
    const bottom=await frame.getByText('EMAIL FOOTER').boundingBox();const viewport=await region.boundingBox();
    assert.ok(bottom.y>=viewport.y&&bottom.y+bottom.height<=viewport.y+viewport.height,'Footer reachable at '+width);
    const button=await frame.getByRole('link',{name:'Share Your Feedback'}).boundingBox();
    assert.ok(button.y>=viewport.y&&button.y+button.height<=viewport.y+viewport.height,'Email button reachable');
    const close=dialog.getByRole('button',{name:'Close',exact:true});const closeBounds=await close.boundingBox();
    assert.ok(closeBounds.y>=0&&closeBounds.y+closeBounds.height<=800,'Close remains visible');
    await close.click();assert.equal(await previewPage.getByRole('dialog',{name:'Email Preview'}).count(),0);
    await previewPage.close();
  }
  console.log('Full email preview scrolls to the footer and action buttons at phone, tablet and desktop widths.');
} finally { await browser?.close(); server.kill(); }
