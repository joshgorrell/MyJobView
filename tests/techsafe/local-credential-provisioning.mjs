import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const connection='02e394ef-9576-4a2a-b352-6506b23529d0';
const organization='b324e4e3-cd2e-4c68-8df8-3e27c7e08f15';
const endpoint='https://ywvrmjfhixgzdyfuhdpv.supabase.co/functions/v1/mjv-import';
const args=['scripts/techsafe/generate-receiver-credentials.mjs',connection,organization,'1',endpoint];
const run=()=>spawnSync(process.execPath,args,{encoding:'utf8'});
const a=run(),b=run();
assert.equal(a.status,0);
assert.equal(b.status,0);
const extract=(output,label,nextLabel)=>{
 const start=output.indexOf(label)+label.length;
 const end=nextLabel?output.indexOf(nextLabel,start):output.indexOf('\n\nKeep both',start);
 return JSON.parse(output.slice(start,end).trim());
};
const mjv=extract(a.stdout,'TECHSAFE_RECEIVER_CREDENTIALS:\n','Techsafe Supabase Edge Function secret');
const receiver=extract(a.stdout,'TECHSAFE_MJV_RECEIVER_CREDENTIALS:\n',null);
assert.equal(mjv.length,1);assert.equal(receiver.length,1);
assert.equal(mjv[0].connectionId,connection);
assert.equal(mjv[0].organizationId,organization);
assert.equal(mjv[0].generation,1);
assert.equal(mjv[0].endpoint,endpoint);
assert.match(mjv[0].token,/^[A-Za-z0-9_-]{64}$/);
assert.equal(receiver[0].tokenSha256,createHash('sha256').update(mjv[0].token).digest('hex'));
assert.notEqual(a.stdout,b.stdout);
for(const invalid of [
 ['bad',organization,'1',endpoint],
 [connection,organization,'0',endpoint],
 [connection,organization,'1','http://ywvrmjfhixgzdyfuhdpv.supabase.co/functions/v1/mjv-import'],
 [connection,organization,'1','https://evil.example.com/functions/v1/mjv-import']
]){
 const r=spawnSync(process.execPath,[args[0],...invalid],{encoding:'utf8'});
 assert.notEqual(r.status,0);assert.equal(r.stdout,'');
}
console.log('PASS: local Techsafe provisioning produces unique valid tokens and matching hashes; invalid inputs fail closed');
