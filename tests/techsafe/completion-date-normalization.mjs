import assert from 'node:assert/strict';
import {normalizeTechsafeCompletionDate as normalize} from '../../src/lib/techsafe/normalizeCompletionDate.mjs';
assert.equal(normalize(new Date('2026-01-15T23:59:59.000Z')),'2026-01-15');
assert.equal(normalize('2026-01-15T00:00:00+00:00'),'2026-01-15');
assert.equal(normalize('2026-01-15T23:00:00-06:00'),'2026-01-16');
for(const invalid of [null,undefined,'',42,{},new Date(NaN),'not-a-date'])
 assert.equal(normalize(invalid),null);
console.log('PASS: trusted PostgreSQL completion timestamp normalization');
