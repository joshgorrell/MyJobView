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
