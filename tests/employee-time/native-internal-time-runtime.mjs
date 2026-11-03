import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function compile(path, imports, globals = {}) {
  const module = { exports: {} };
  const source = fs.readFileSync(path, 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    reportDiagnostics: true,
  });
  assert.equal((result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, path);
  vm.runInNewContext(result.outputText, { module, exports: module.exports, console, Date,
    require(name) { if (name in imports) return imports[name]; throw Error('Unexpected import: ' + name); }, ...globals });
  return module.exports;
}
const actor = { id: 'tech', organization_id: 'org' };
const rpcCalls = [];
const fakeDb = {
  async rpc(name, args) { rpcCalls.push({ name, args }); return { data: 'entry', error: null }; },
};
const service = compile('mobile/src/services/InternalTime.ts', {
  './supabase': { supabase: fakeDb },
  './EmployeeTimeContext': { getEmployeeTimeContext: async () => ({ timezone: 'America/Chicago' }), workDate: () => '2026-10-20' },
  './LocationTrackingService': { locationTrackingService: { captureHighAccuracyLocation: async () => null } },
});
await service.startNewInternalTime(actor, 'shop_time', 'Organizing shelves', 'stable-session-id');
assert.equal(rpcCalls[0].name, 'start_internal_time');
assert.equal(rpcCalls[0].args.p_session_id, 'stable-session-id');
assert.equal(rpcCalls[0].args.p_evidence.clock_in_gps_capture_method, 'failed');
assert.equal(rpcCalls[0].args.p_evidence.clock_in_latitude, null);
assert.equal('approved_by' in rpcCalls[0].args, false);
await service.stopInternalTime(actor, 'stable-session-id', 'Done');
assert.equal(rpcCalls[1].name, 'stop_internal_time');
assert.equal(rpcCalls[1].args.p_evidence.clock_out_gps_capture_method, 'failed');
fakeDb.rpc = async () => ({ data: null, error: { message: 'Server rejected write' } });
await assert.rejects(() => service.startNewInternalTime(actor, 'training', '', 'stable-session-id'), e => e.message === 'Server rejected write');
await assert.rejects(() => service.startNewInternalTime({ id: 'tech', organization_id: null }, 'shop_time', '', 'stable-session-id'), /organization/);

const values = [], effects = [];
let cursor = 0;
const React = {
  useState(initial) { const i = cursor++; if (!(i in values)) values[i] = typeof initial === 'function' ? initial() : initial; return [values[i], v => { values[i] = typeof v === 'function' ? v(values[i]) : v; }]; },
  useRef(initial) { const i = cursor++; return values[i] ||= { current: initial }; },
  useCallback(fn) { cursor++; return fn; },
  useEffect(fn) { cursor++; effects.push(fn); },
};
const jsx = (type, props) => ({ type, props });
const nodes = t => Array.isArray(t) ? t.flatMap(nodes) : t && typeof t === 'object' ? [t, ...nodes(t.props?.children)] : [];
const text = t => Array.isArray(t) ? t.map(text).join('') : t && typeof t === 'object' ? text(t.props?.children) : t == null ? '' : String(t);
const serviceCalls = [], alerts = [];
let connected = true;
let data = { sessions: [], entries: [], active: null };
let changeHandler;
const palette = new Proxy({}, { get: () => new Proxy({}, { get: () => '#123456' }) });
const screen = compile('mobile/src/components/InternalTimeCard.tsx', {
  react: { ...React, default: React }, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
  'react-native': { View: 'View', Text: 'Text', TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity', ActivityIndicator: 'ActivityIndicator',
    StyleSheet: { create: x => x }, Alert: { alert: (...args) => alerts.push(args) },
    AppState: { addEventListener: (_event, callback) => { changeHandler = callback; return { remove() {} }; } } },
  '@react-navigation/native': { useFocusEffect: fn => { effects.push(fn); } },
  'expo-crypto': { randomUUID: () => 'stable-new-session-id' },
  '../contexts/AuthContext': { useAuth: () => ({ profile: actor }) },
  '../contexts/OfflineContext': { useOffline: () => ({ isConnected: connected }) },
  '../services/supabase': { supabase: { channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {} } },
  '../services/InternalTime': {
    loadInternalTime: async () => data,
    startNewInternalTime: async (...args) => serviceCalls.push(['start', ...args]),
    startInternalTime: async (...args) => serviceCalls.push(['assigned', ...args]),
    stopInternalTime: async (...args) => serviceCalls.push(['stop', ...args]),
  },
  '../theme/colors': { Colors: palette },
  '../theme/styles': { Spacing: {}, Radius: {}, Typography: {} },
  './UI': { Card: 'Card' },
}, { setInterval: () => 1, clearInterval() {} });
const render = () => { cursor = 0; return screen.InternalTimeCard(); };
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
let tree = render(); effects.splice(0).forEach(fn => fn()); await settle(); tree = render();
let start = nodes(tree).find(n => n.props?.accessibilityLabel === 'Start Shop Time');
assert.ok(start && !start.props.disabled);
start.props.onPress(); tree = render();
assert.ok(text(tree).includes('Recorded hours stay pending until a manager approves them for payroll.'));
nodes(tree).find(n => n.props?.accessibilityLabel === 'Start timer').props.onPress();
await settle(); tree = render();
assert.equal(serviceCalls[0][0], 'start');
assert.equal(serviceCalls[0][2], 'shop_time');
assert.equal(serviceCalls[0][4], 'stable-new-session-id');
assert.equal(text(tree).includes('Awaiting manager approval'), false);
data = {
  sessions: [{ id: 'live', session_type: 'training', title: 'Product training', status: 'in_progress', approved_by: null, approved_at: null }],
  entries: [{ id: 'entry', internal_session_id: 'live', clock_in: new Date().toISOString(), clock_out: null, status: 'draft' }],
  active: { id: 'entry', internal_session_id: 'live' },
};
changeHandler('active'); await settle(); tree = render();
const stop = nodes(tree).find(n => n.props?.accessibilityLabel === 'Stop Training');
assert.ok(stop && !stop.props.disabled, 'unapproved running work remains stoppable');
stop.props.onPress(); await settle();
assert.equal(serviceCalls.at(-1)[0], 'stop');
connected = false; tree = render();
assert.equal(nodes(tree).find(n => n.props?.accessibilityLabel === 'Stop Training').props.disabled, true);
const clock = fs.readFileSync('mobile/src/screens/TimeClockScreen.tsx', 'utf8');
assert.equal((clock.match(/<InternalTimeCard/g) || []).length, 2, 'daily-clock and allocation/salary branches both show controls');
assert.equal((clock.match(/await assertNoInternalTimer\(profile\)/g) || []).length, 3, 'break and both clock-out stages check active internal work');
console.log('Native internal time UI/service: start without authorization, stop before approval, stable retry IDs, offline state, GPS failure evidence and Daily Clock guards passed.');
