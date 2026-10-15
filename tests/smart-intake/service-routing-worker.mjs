import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync('supabase/functions/smart-intake-route-service/index.ts','utf8');
for (const [label, expression] of [
  ['feature flag off by default', /SMART_INTAKE_ROUTING_ENABLED/],
  ['separate worker token', /SMART_INTAKE_ROUTING_WORKER_TOKEN/],
  ['reject missing token', /!token \|\| !supplied \|\| token\.length < 32/],
  ['reject unsupported HTTP methods', /request\.method !== "POST"/],
  ['UUID validation', /Invalid intake_id/],
  ['queue lookup', /from\("intake_routing_claims"\)/],
  ['service-only routing', /item\.classification !== "service"/],
  ['atomic database RPC', /rpc\("smart_intake_route_service"/],
  ['no destination insertion in worker', /^((?!\.from\("service_requests"\)).)*$/s],
]) assert.match(source, expression, label);
console.log('Smart Intake routing worker contract passed');
