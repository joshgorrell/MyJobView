import assert from 'node:assert/strict';
import ts from 'typescript';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile('src/lib/sessionInactivity.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const exports = {};
vm.runInNewContext(compiled, { exports, Date });
const { MJV_IDLE_TIMEOUT_MS, MJV_IDLE_WARNING_MS, remainingIdleMs, mayResetOnReload } = exports;
assert.equal(MJV_IDLE_TIMEOUT_MS, 60 * 60_000);
assert.equal(MJV_IDLE_WARNING_MS, 5 * 60_000);
const now = Date.parse('2026-10-23T12:00:00Z');
const at = mins => now - mins * 60_000;
assert.equal(remainingIdleMs(at(54), now), 6 * 60_000);
assert.equal(remainingIdleMs(at(55), now), 5 * 60_000);
assert.equal(remainingIdleMs(at(59), now), 60_000);
assert.equal(remainingIdleMs(at(60), now), 0);
assert.equal(remainingIdleMs(at(75), now), 0);
assert.equal(remainingIdleMs(0, now), 0);
assert.equal(remainingIdleMs(now + 60_000, now), 0);
assert.equal(mayResetOnReload('reload', at(59), now, true), true);
assert.equal(mayResetOnReload('reload', at(60), now, true), false);
assert.equal(mayResetOnReload('reload', at(59), now, false), false);
assert.equal(mayResetOnReload('navigate', at(59), now, true), false);
assert.equal(mayResetOnReload('back_forward', at(59), now, true), false);
const auth = await readFile('src/contexts/AuthContext.tsx', 'utf8');
assert.match(auth, /role', 'alertdialog'/);
assert.match(auth, /setInterval\(checkIdle, 1000\)/);
assert.match(auth, /remainingIdleMs\(readLastInteraction\(\)\)/);
assert.match(auth, /document\.addEventListener\(event, trackIdleInteraction/);
assert.ok(auth.includes("closest?.('#mjv-idle-logout')"),
  'Log Out Now must be exempt from generic activity dismissal');
assert.ok(auth.includes("logout.id = 'mjv-idle-logout'"));
assert.ok(auth.includes("logout.addEventListener('click', expireSession)"));
assert.match(auth, /window\.addEventListener\('focus', checkIdle\)/);
assert.match(auth, /document\.addEventListener\('visibilitychange', checkIdle\)/);
assert.doesNotMatch(auth, /'mousemove'/);
const guardPosition = auth.indexOf('const idleCheck = setInterval(checkIdle, 1000)');
const sessionRpcPosition = auth.indexOf("supabase.rpc('start_browser_session'");
assert.ok(guardPosition > 0 && sessionRpcPosition > guardPosition,
  'Idle guard must install before analytics RPC so a tracking failure cannot disable logout');
assert.match(auth, /trackingGeneration !== sessionTrackingGenerationRef\.current/);
assert.match(auth, /sessionTrackingGenerationRef\.current\+\+/);

assert.ok(auth.includes('Customer portal accounts may not have a staff profile'), 'Portal users without staff profiles must receive the idle guard');
const legacyUi = await readFile('src/components/Admin/UserSessionsViewerEnhanced.tsx', 'utf8');
assert.ok(legacyUi.includes('Legacy daily logout (read-only)'), 'Legacy daily logout settings must be labeled read-only');
assert.ok(legacyUi.includes('aria-label="Legacy daily logout is read-only"'), 'Legacy schedule toggle must be disabled');
assert.ok(legacyUi.includes('Read-only Legacy Schedule'), 'Legacy save button must be disabled');
const ipMigration = await readFile('supabase/migrations/20261022220000_ip_location_classification.sql', 'utf8');
assert.match(ipMigration, /CREATE POLICY ip_nicknames_admin_update/);
assert.match(ipMigration, /p\.role IN \('admin', 'superadmin'\)/);
const sessionMigration = await readFile('supabase/migrations/20261023124000_secure_browser_session_writes.sql', 'utf8');
assert.match(sessionMigration, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE\s+ON public\.session_logout_schedule/);
assert.match(sessionMigration, /DROP POLICY IF EXISTS "Admins can update session logout schedule"/);
assert.match(sessionMigration, /DROP POLICY IF EXISTS user_sessions_select_same_org/);
assert.match(sessionMigration, /CREATE POLICY user_sessions_select_owner_or_org_admin/);
assert.match(sessionMigration, /user_id = \\(SELECT auth\\.uid\\(\\)\\)/);
assert.match(sessionMigration, /p\\.role IN \\('admin', 'superadmin'\\)/);

console.log('60-minute timeout, five-minute warning, reload eligibility and idle-dialog contract pass');
