import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=ts.transpileModule(await readFile('supabase/functions/lost-opportunity-review/deleteProposalSubmission.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {deleteProposalSubmission}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const id='00000000-0000-0000-0000-000000000001';let readable=true;let deleted=0;let failDelete=false;
function db(writer){return{from(table){assert.equal(table,'proposal_check_events');const filters={};let removing=false;const q={select:()=>q,eq:(k,v)=>{filters[k]=v;return q},delete:()=>{assert.ok(writer);removing=true;return q},maybeSingle:async()=>{assert.equal(filters.organization_id,'org');assert.equal(filters.kind,'message');assert.equal(filters.id,id);if(removing){assert.equal(filters.email_id,'email');if(failDelete)return{error:new Error('Delete failed')};deleted++;return{data:{id}}}return{data:readable?{id,email_id:'email'}:null}}};return q}}}
const profile={role:'admin',organization_id:'org'};
assert.equal((await deleteProposalSubmission(db(false),db(true),{...profile,role:'sales'},id)).status,403);assert.equal(deleted,0);
assert.equal((await deleteProposalSubmission(db(false),db(true),profile,'invalid')).status,400);
readable=false;assert.equal((await deleteProposalSubmission(db(false),db(true),profile,id)).status,404);assert.equal(deleted,0,'Unreadable or foreign submissions cannot be deleted');
readable=true;assert.equal((await deleteProposalSubmission(db(false),db(true),profile,id)).status,200);assert.equal(deleted,1);
failDelete=true;await assert.rejects(()=>deleteProposalSubmission(db(false),db(true),profile,id),/Delete failed/);
console.log('Submission deletion: admin-only, valid IDs, RLS visibility, tenant/message scope and delete failures passed.');
