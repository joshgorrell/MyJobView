import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { randomUUID, X509Certificate } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from 'playwright';

const run = promisify(execFile);
const script = name => fileURLToPath(new URL(name, import.meta.url));

async function poll(check, message) {
  const end = Date.now() + 20_000;
  while (Date.now() < end) {
    const result = await check();
    if (result) return result;
    await delay(200);
  }
  throw new Error(message);
}

async function readOptional(path) {
  try { return await readFile(path, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
}

// Sample the actual decoded canvas to locate the synthetic guest-side window.
function findTargetPixel() {
  const display = document.getElementById('Desk');
  if (!display?.width || !display.height) return null;
  const { width, height } = display;
  const pixels = display.getContext('2d').getImageData(0, 0, width, height).data;
  for (let y = 20; y < height - 20; y += 10) {
    for (let x = 20; x < width - 20; x += 10) {
      const test = (dx, dy) => {
        const offset = 4 * ((y + dy) * width + x + dx);
        return Math.abs(pixels[offset] - 38) < 14 && Math.abs(pixels[offset + 1] - 198) < 14 &&
          Math.abs(pixels[offset + 2] - 127) < 14 && pixels[offset + 3] === 255;
      };
      if (test(-15, -15) && test(15, -15) && test(-15, 15) && test(15, 15)) return { x: x / width, y: y / height };
    }
  }
  return null;
}

export async function exerciseDesktopSession({ viewerUrl, executable, certPath, root }) {
  const certificate = new X509Certificate(await readFile(certPath));
  const readyFile = join(root, 'target-ready.txt');
  const inputFile = join(root, 'target-input.json');
  const target = spawn('pwsh', ['-NoProfile', '-STA', '-File', script('./desktop-target.ps1'),
    '-ReadyFile', readyFile, '-InputFile', inputFile], { stdio: 'ignore' });
  const targetExited = once(target, 'exit');
  targetExited.catch(() => {});
  let browser;
  let trusted = false;
  let stage = 'open the synthetic Windows target';
  try {
    await once(target, 'spawn');
    await poll(async () => {
      assert.equal(target.exitCode, null, 'The synthetic desktop target exited');
      return await readOptional(readyFile) === 'ready';
    }, 'The synthetic desktop target did not start');

    stage = 'open the authorized viewer';
    await run('certutil.exe', ['-user', '-addstore', 'Root', certPath], { timeout: 15_000 });
    trusted = true;
    browser = await chromium.launch();
    const page = await browser.newPage();
    const response = await page.goto(viewerUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => {
      throw new Error('The browser failed to open the HTTPS viewer');
    });
    assert.equal(response.status(), 200, 'The viewer could not be loaded');
    const connect = page.locator('#connectbutton1');
    const consoleMessage = page.locator('#p11DeskConsoleMsg');
    const connectAndWaitForConsent = async () => {
      await connect.click({ timeout: 20_000 });
      await consoleMessage.filter({ hasText: /waiting for user to grant access/i }).waitFor({ timeout: 15_000 });
    };
    const respond = decision => run('pwsh', ['-NoProfile', '-File', script('./desktop-consent.ps1'),
      '-Executable', executable, '-Decision', decision], { timeout: 25_000 });

    stage = 'confirm the guest can refuse desktop access';
    await connectAndWaitForConsent();
    assert.equal(await page.evaluate(findTargetPixel), null, 'A guest screen appeared before consent');
    await respond('Deny');
    await page.locator('#deskstatus').filter({ hasText: /^Disconnected$/ }).waitFor({ timeout: 15_000 });
    assert.equal(await page.evaluate(findTargetPixel), null, 'A refused guest screen was shown');
    assert.equal(await readOptional(inputFile), '', 'The guest target received unexpected input');

    stage = 'verify the approved guest screen and remote input';
    await connectAndWaitForConsent();
    await respond('Allow');
    const point = await poll(() => page.evaluate(findTargetPixel), 'The approved guest screen did not show the synthetic target');
    const display = page.locator('#Desk');
    const bounds = await display.boundingBox();
    assert.ok(bounds?.width && bounds?.height, 'The viewer canvas is not visible');
    await page.mouse.click(bounds.x + point.x * bounds.width, bounds.y + point.y * bounds.height);
    const challenge = 'mjv' + randomUUID().replaceAll('-', '').replace(/[0-9]/g, 'k').slice(0, 12);
    await page.keyboard.type(challenge, { delay: 60 });
    const observed = await poll(async () => {
      const raw = await readOptional(inputFile);
      if (!raw) return null;
      try {
        const input = JSON.parse(raw);
        return input.clicked && input.keys === challenge ? input : null;
      } catch (error) { if (error instanceof SyntaxError) return null; throw error; }
    }, 'The approved guest did not receive the browser mouse and keyboard input');
    assert.equal(observed.keys, challenge);
  } catch (error) {
    console.error(`Windows viewer failed at: ${stage}`);
    // Playwright errors can include the credential-bearing viewer URL.
    throw new Error(String(error.message).replaceAll(viewerUrl, '[viewer URL]'), { cause: undefined });
  } finally {
    try { await browser?.close(); }
    finally {
      if (target.pid && target.exitCode === null && target.signalCode === null) target.kill();
      await targetExited;
      if (trusted) {
        await run('certutil.exe', ['-user', '-delstore', 'Root', certificate.fingerprint.replaceAll(':', '')], { timeout: 15_000 });
      }
    }
  }
}
