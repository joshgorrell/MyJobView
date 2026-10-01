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
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.goto('http://127.0.0.1:5189');
    await page.locator('article').getByText('NEW!', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.reviewCalls), 0, 'Loading list does not complete responses');
    await page.getByRole('combobox').selectOption('new');
    assert.equal(await page.getByText('Awaiting customer', { exact: true }).count(), 0);
    await page.getByRole('button', { name: /Home theater/ }).click();
    await page.locator('article').getByText('Complete', { exact: true }).waitFor();
    await page.getByRole('heading', { name: 'Competing bid attachments (1)' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'View John Valley.pdf' }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Download John Valley.pdf' }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Mark Reviewed' }).count(), 0);
    assert.equal(await page.evaluate(() => window.reviewCalls), 1);
    await page.getByRole('button', { name: /Home theater/ }).click();
    await page.getByRole('combobox').selectOption('complete');
    await page.getByRole('button', { name: /Home theater/ }).click();
    assert.equal(await page.evaluate(() => window.reviewCalls), 1, 'Reopening preserves first review');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Fits viewport');
    await page.close();
  }
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:5189');
  await page.locator('article').getByText('NEW!', { exact: true }).waitFor();
  await page.evaluate(() => { window.failReview = true; });
  await page.getByRole('button', { name: /Home theater/ }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await page.locator('article').getByText('NEW!', { exact: true }).count(), 1, 'Failed persistence never falsely shows Complete');
  await page.getByRole('button', { name: /Home theater/ }).click();
  await page.evaluate(() => { window.failReview = false; });
  await page.getByRole('button', { name: /Home theater/ }).click();
  await page.locator('article').getByText('Complete', { exact: true }).waitFor();
  const customer = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await customer.goto('http://127.0.0.1:5189/?customer=1&token=test');
  await customer.getByRole('checkbox', { name: 'Price was too high' }).check();
  await customer.getByRole('radio', { name: 'Maybe — reach out to me' }).check();
  const picker = customer.locator('input[type=file]');
  for (const extension of ['.doc', '.docx', '.xls', '.xlsx']) assert.ok((await picker.getAttribute('accept')).includes(extension));
  await picker.setInputFiles(['doc','docx','xls','xlsx'].map(ext => ({ name: `Competing bid.${ext}`, mimeType: '', buffer: Buffer.from(`original ${ext} bytes`) })));
  await customer.getByRole('button', { name: 'Send Private Feedback' }).click();
  await customer.getByRole('status').waitFor();
  const sentFiles = await customer.evaluate(() => window.submittedFiles);
  assert.equal(sentFiles.length, 4);
  assert.deepEqual(sentFiles.map(f => f.type), ['application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
  for (const file of sentFiles) assert.equal(Buffer.from(file.data, 'base64').toString(), `original ${file.name.split('.').pop()} bytes`);
  console.log('Word and Excel customer picker and byte-preserving submission checks passed.');
  console.log('Lost review browser checks passed at phone and desktop widths: list remains NEW, open completes, attachments visible, repeat viewing and save failure retry.');
} finally { await browser?.close(); server.kill(); }
