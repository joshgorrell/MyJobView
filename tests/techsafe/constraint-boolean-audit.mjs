import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(),sql=fs.readFileSync('scripts/techsafe/constraint-boolean-audit.sql','utf8');
try{
const result=(await db.query(sql)).rows[0];
assert.equal(result.source_binding_matches,false);assert.equal(result.boolean_cases,27);assert.equal(result.boolean_mismatches,0);
assert.equal(result.predicate_cases,44);assert.equal(result.predicate_mismatches,0);
assert.equal(result.exact_definition_equality_claimed,false);assert.equal(result.restore_approved,false);assert.equal(result.quote_ready,false);
await db.exec('CREATE TABLE public.proposal_loss_feedback(reasons text[],CONSTRAINT proposal_loss_feedback_reasons_check CHECK(true))');
assert.equal((await db.query(sql)).rows[0].source_binding_matches,false,'A different source constraint must never inherit this specific-rule review');
console.log('Constraint Boolean audit passed: all 27 three-valued AND combinations, 44 array cases, missing/changed source hash binding and closed restore/quote flags. Native source binding is checked separately by SELECT only.');
}finally{await db.close();}
