import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const sql=await readFile(new URL('../../src/lib/techsafe/postgresCatalogSoldScopeReader.mjs',import.meta.url),'utf8');
assert.ok(sql.includes("THEN COALESCE(pli.labor_total,pli.line_total,0)"));
assert.equal(sql.includes('\\\\n       THEN COALESCE'),false);
assert.equal(sql.includes('\\\\n       ELSE COALESCE'),false);
console.log('PASS: source reader labor SQL contains real line breaks');
