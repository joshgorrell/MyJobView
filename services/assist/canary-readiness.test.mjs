import test from 'node:test';
import assert from 'node:assert/strict';
import {checkAssistReadiness} from './canary-readiness.mjs';

test('missing configuration blocks readiness without printing secrets',async()=>{
 const report=await checkAssistReadiness({env:{ASSIST_CONTROL_TOKEN:'private-token-value'},root:'/nonexistent'});
 assert.equal(report.ready,false);
 assert.equal(report.checks.find(c=>c.name==='ASSIST_CANARY_ORIGIN').status,'block');
 assert.equal(JSON.stringify(report).includes('private-token-value'),false);
});
test('invalid HTTP canary endpoint and short token are blocked',async()=>{
 const report=await checkAssistReadiness({env:{ASSIST_CANARY_ORIGIN:'http://example.com',ASSIST_CANARY_TOKEN:'short'},root:'/nonexistent'});
 assert.equal(report.checks.find(c=>c.name==='ASSIST_CANARY_ORIGIN_HTTPS').status,'block');
 assert.equal(report.checks.find(c=>c.name==='ASSIST_CANARY_TOKEN_LENGTH').status,'block');
 assert.equal(report.checks.find(c=>c.name==='WINDOWS_CANARY_REAL_PROOF').status,'block');
});

test('automatic routing requires a distinct token, a reserved isolation dealer and a separate listener',async()=>{
 const env={
  ASSIST_CANARY_AUTOMATIC_DEALERS:'1',
  ASSIST_CANARY_FIXTURE_TOKEN:'f'.repeat(48),
  ASSIST_CANARY_TOKEN:'c'.repeat(48),
  ASSIST_CONTROL_TOKEN:'a'.repeat(48),
  ASSIST_CANARY_ISOLATION_ORGANIZATION_ID:'00000000-0000-0000-0000-000000000001',
  ASSIST_PILOT_LOOPBACK_PORT:'8444',
  ASSIST_CANARY_PROBE_TIMEOUT_MS:'50000',
 };
 const status=async overrides=>(await checkAssistReadiness({env:{...env,...overrides},root:'/nonexistent'}))
  .checks.find(c=>c.name==='CANARY_ROUTING_CONFIGURATION').status;
 assert.equal(await status({}),'pass');
 for(const overrides of [
  {ASSIST_CANARY_ISOLATION_ORGANIZATION_ID:''},
  {ASSIST_CANARY_FIXTURE_TOKEN:env.ASSIST_CANARY_TOKEN},
  {ASSIST_CANARY_FIXTURE_TOKEN:env.ASSIST_CONTROL_TOKEN},
  {ASSIST_PILOT_LOOPBACK_PORT:'8443'},
  {ASSIST_PILOT_ORGANIZATION_ID:env.ASSIST_CANARY_ISOLATION_ORGANIZATION_ID},
 ]) assert.equal(await status(overrides),'block');
});
