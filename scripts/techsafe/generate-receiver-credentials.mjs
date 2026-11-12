#!/usr/bin/env node
// Run locally, not in CI or a hosted terminal that retains logs.
// Generates one random bearer token and matching SHA-256 receiver hash.
// Never write output to source control, issues, PRs or chat.
import {randomBytes,createHash} from 'node:crypto';
const [connectionId,organizationId,generationRaw,endpoint] = process.argv.slice(2);
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const generation=Number(generationRaw);
let url;
try {url=new URL(endpoint);}catch {url=null;}
if(!uuid.test(connectionId??'')||!uuid.test(organizationId??'')||
 !Number.isSafeInteger(generation)||generation<1||!url||
 url.protocol!=='https:'||url.username||url.password||url.search||url.hash||
 url.pathname!=='/functions/v1/mjv-import'||url.hostname!=='ywvrmjfhixgzdyfuhdpv.supabase.co'){
 process.stderr.write('Usage: node scripts/techsafe/generate-receiver-credentials.mjs <connection-uuid> <organization-uuid> <generation> https://ywvrmjfhixgzdyfuhdpv.supabase.co/functions/v1/mjv-import\n');
 process.exitCode=1;
} else {
 const token=randomBytes(48).toString('base64url');
 const tokenSha256=createHash('sha256').update(token,'utf8').digest('hex');
 const mjv=[{connectionId,organizationId,generation,endpoint:url.href,token}];
 const techsafe=[{connectionId,generation,tokenSha256}];
 process.stdout.write('MJV Supabase Edge Function secret TECHSAFE_RECEIVER_CREDENTIALS:\n'+
  JSON.stringify(mjv)+'\n\nTechsafe Supabase Edge Function secret TECHSAFE_MJV_RECEIVER_CREDENTIALS:\n'+
  JSON.stringify(techsafe)+'\n\nKeep both values private. Do not enable imports until certification and sender are verified.\n');
}
