import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync('src/components/Dispatch/ServiceRequestQueue.tsx','utf8');
assert.match(source,/\.on\('postgres_changes'/);
assert.match(source,/table: 'service_requests'/);
assert.match(source,/\.subscribe\(\)/);
assert.match(source,/channel\.unsubscribe\(\)/);
console.log('Existing service queue realtime subscription confirmed');
