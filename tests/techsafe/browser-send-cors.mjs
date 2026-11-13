import assert from 'node:assert/strict';
import {withTechsafeBrowserCors} from '../../supabase/functions/_shared/techsafe-browser-handler.mjs';
let calls=0;
const handler=withTechsafeBrowserCors(async()=>{calls++;return new Response('{"accepted":false}',{status:403,headers:{'Content-Type':'application/json'}});});
for(const origin of ['https://elife.myjobview.com','https://myjobview.com']) {
 const before=calls;
 const preflight=await handler(new Request('https://example.test',{method:'OPTIONS',headers:{origin}}));
 assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),origin);assert.equal(calls,before);
 const response=await handler(new Request('https://example.test',{method:'POST',headers:{origin}}));
 assert.equal(response.status,403);assert.equal(response.headers.get('access-control-allow-origin'),origin);assert.deepEqual(await response.json(),{accepted:false});
}
for(const origin of ['https://myjobview.com.evil.test','http://elife.myjobview.com','https://elife.myjobview.com:8443','null']) {
 const before=calls;assert.equal((await handler(new Request('https://example.test',{method:'POST',headers:{origin}}))).status,403);assert.equal(calls,before);
}
assert.equal((await handler(new Request('https://example.test',{method:'POST'}))).status,403);
console.log('PASS: browser CORS preflight never invokes sender, rejects foreign origins and preserves server authorization failures');
