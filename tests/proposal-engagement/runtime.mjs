import { build } from 'esbuild';
import assert from 'node:assert/strict';
const result=await build({entryPoints:['src/lib/proposalEngagement.ts'],bundle:true,format:'esm',write:false,platform:'node'});
const {ProposalAttention,summarizeEngagement}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
const attention=new ProposalAttention(0); attention.setPresence(0,true,true); attention.setSection(0,'pricing');
for(let n=1;n<=90;n++)attention.tick(n*1000);
assert.equal(attention.snapshot().seconds,60,'Idle pauses after one minute');
attention.interact(90_000); attention.tick(91_000); assert.equal(attention.snapshot().seconds,61);
attention.setPresence(91_000,false,true); attention.tick(92_000); assert.equal(attention.snapshot().seconds,61,'Hidden tabs paused');
attention.setPresence(92_000,true,false); attention.tick(93_000); assert.equal(attention.snapshot().seconds,61,'Unfocused tabs paused');
attention.setPresence(93_000,true,true); attention.setSection(93_000,'room:test'); attention.tick(94_000);
attention.click(94_000,'approval_clicked'); assert.equal(attention.snapshot().clicks.approval_clicked,1);
assert.equal(attention.snapshot().sections.pricing,61); assert.equal(attention.snapshot().sections['room:test'],1,'Sections attributed once');
attention.tick(200_000); assert.equal(attention.snapshot().seconds,64,'Suspended browser cannot inflate time');
const other=new ProposalAttention(0); assert.equal(other.snapshot().seconds,0,'Independent visits');
const summary=summarizeEngagement([
{activity_type:'viewed',duration_seconds:62,viewer_user_id:'customer',metadata:{engagement:{trackingVersion:1,sections:{pricing:61},clicks:{approval_clicked:1}}}},
{activity_type:'viewed',duration_seconds:10,viewer_user_id:'customer',metadata:{engagement:{trackingVersion:1,sections:{pricing:10},clicks:{question_clicked:1}}}},
{activity_type:'viewed',duration_seconds:100,metadata:{ip:'Unknown'}},
{activity_type:'downloaded',duration_seconds:500,metadata:null}
]);
assert.equal(summary.activeSeconds,72); assert.equal(summary.legacySeconds,100); assert.equal(summary.verifiedViewers,1); assert.equal(summary.sections.pricing,71); assert.equal(summary.trackedVisits,2);
const reconsideration=new ProposalAttention(0);
reconsideration.setPresence(0,true,true);
reconsideration.click(100,'decline_clicked');
reconsideration.click(200,'decline_to_changes_clicked');
reconsideration.click(300,'decline_clicked');
reconsideration.click(400,'decline_to_approval_clicked');
reconsideration.click(500,'decline_clicked');
reconsideration.click(600,'decline_continue_clicked');
const reconsiderationSummary=summarizeEngagement([{activity_type:'viewed',duration_seconds:0,metadata:{engagement:{trackingVersion:1,sections:{promise:1},clicks:reconsideration.snapshot().clicks}}}]);
assert.equal(reconsiderationSummary.clicks.decline_clicked,3);
assert.equal(reconsiderationSummary.clicks.decline_to_changes_clicked,1);
assert.equal(reconsiderationSummary.clicks.decline_to_approval_clicked,1);
assert.equal(reconsiderationSummary.clicks.decline_continue_clicked,1);
assert.equal(reconsiderationSummary.sections.promise,1);
console.log('Proposal attention: idle, hidden/focus, suspension, section attribution, click semantics, and legacy separation pass');
