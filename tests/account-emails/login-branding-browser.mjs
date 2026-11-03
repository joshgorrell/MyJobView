import { build } from 'esbuild';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Exercise the real tenant provider and login UI with isolated fixture requests.
const bundle = await build({
  stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {TenantProvider} from './src/contexts/TenantContext'; import {LoginForm} from './src/components/Auth/LoginForm'; createRoot(document.getElementById('root')).render(<TenantProvider><LoginForm/></TenantProvider>);`, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, format: 'iife', jsx: 'automatic',
  define: { 'import.meta.env.VITE_SUPABASE_URL': '"https://fixture.supabase.co"', 'import.meta.env.VITE_SUPABASE_ANON_KEY': '"fixture-key"' },
  plugins: [{ name: 'auth-fixture', setup(b) {
    b.onResolve({ filter: /contexts\/AuthContext$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
    b.onResolve({ filter: /Shared\/BrowserDiagnostics$/ }, () => ({ path: 'diagnostics', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: path === 'auth' ? 'export const useAuth=()=>({signIn:async()=>{},signUp:async()=>{},resetPassword:async()=>{},resendConfirmation:async()=>{}});' : 'export function BrowserDiagnostics(){return null;}' }));
  } }],
});
const cssFile = (await readdir('dist/assets')).find(p => p.startsWith('index-') && p.endsWith('.css'));
const css = await readFile(`dist/assets/${cssFile}`);
const logo = await readFile('public/el_logo_color_(2).png');
const mjv = await readFile('public/MJV_icon.PNG');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  for (const scenario of ['dealer', 'missing-logo', 'broken-logo', 'generic', 'unknown']) {
    const host = scenario === 'generic' ? 'localhost' : 'elife.localhost';
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    let lookupCount = 0;
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === 'fixture.supabase.co') {
        const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        if (url.pathname.endsWith('/organizations')) {
          lookupCount++;
          assert.equal(url.searchParams.get('subdomain'), 'eq.elife');
          assert.equal(url.searchParams.get('select'), 'id,name,logo_url,subdomain');
        }
        return route.fulfill({ contentType: 'application/json', headers, body: JSON.stringify(scenario === 'unknown' || url.pathname.endsWith('/subdomain_changes') ? null : { id: 'dealer-id', name: 'Electronic Life', subdomain: 'elife', logo_url: scenario === 'missing-logo' ? null : '/dealer.png' }) });
      }
      if (url.pathname === '/app.js') return route.fulfill({ contentType: 'text/javascript', body: bundle.outputFiles[0].text });
      if (url.pathname === '/style.css') return route.fulfill({ contentType: 'text/css', body: css });
      if (url.pathname === '/MJV_icon.PNG') return route.fulfill({ contentType: 'image/png', body: mjv });
      if (url.pathname === '/dealer.png') return scenario === 'broken-logo' ? route.fulfill({ status: 404, body: '' }) : route.fulfill({ contentType: 'image/png', body: logo });
      return route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/app.js"></script>' });
    });
    await page.goto(`http://${host}`, { waitUntil: 'domcontentloaded' });
    const dealer = !['generic', 'unknown'].includes(scenario);
    await page.getByRole('heading', { name: dealer ? 'Electronic Life' : 'MyJobView', exact: true }).waitFor();
    await page.getByText('Sign in to your account', { exact: true }).waitFor();
    await page.waitForFunction(() => [...document.images].every(img => img.complete));
    assert.equal(lookupCount, scenario === 'generic' ? 0 : 1);
    const primary = page.locator('img').first();
    assert.equal(await primary.getAttribute('src'), scenario === 'dealer' ? '/dealer.png' : '/MJV_icon.PNG');
    assert.ok(await primary.evaluate(img => img.naturalWidth > 0));
    await page.getByRole('link', { name: 'Customer Portal', exact: true }).waitFor();
    await page.getByText('Powered by', { exact: true }).waitFor();
    for (const width of [320, 360, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      const links = [
        page.getByRole('link', { name: 'Customer Portal', exact: true }),
        page.getByRole('button', { name: 'Create an account', exact: true }),
        page.getByRole('button', { name: 'Login help', exact: true }),
      ];
      const boxes = await Promise.all(links.map(link => link.boundingBox()));
      assert.ok(boxes.every(box => box && Math.abs(box.y - boxes[0].y) < 1), `Footer links share a row at ${width}px`);
      assert.ok(boxes[0].x >= 0 && boxes[2].x + boxes[2].width <= width, `Footer fits at ${width}px`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.getByRole('button', { name: 'Forgot password?', exact: true }).click();
    await page.getByRole('button', { name: 'Send Reset Link', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Back to sign in', exact: true }).click();
    await page.getByRole('button', { name: 'Create an account', exact: true }).click();
    await page.getByRole('button', { name: 'Sign Up', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Back to sign in', exact: true }).click();
    await page.getByRole('button', { name: 'Login help', exact: true }).click();
    await page.getByRole('heading', { name: 'Browser Diagnostics' }).waitFor();
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('Login branding browser checks passed: dealer, missing/broken logo, generic/unknown dealer, mobile overflow, reset, signup and help.');
} finally {
  await browser.close();
}
