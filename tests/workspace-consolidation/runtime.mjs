import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = await mkdtemp(join(tmpdir(), 'mjv-workspaces-'));
try {
  await build({ stdin: { loader: 'tsx', resolveDir: process.cwd(), contents: `
import React from 'react';
import {renderToString} from 'react-dom/server';
import assert from 'node:assert/strict';
import {showWorkspaceMenu, workspaceMenuKey} from './src/lib/workspaceNavigation';
import {MasterFeed} from './src/components/Feed/MasterFeed';
import Flow from './src/components/Flow/Flow';
import {WorkspaceTabs} from './src/components/Shared/WorkspaceTabs';
assert.equal(showWorkspaceMenu('tasks',k=>k==='feed'),false);
assert.equal(showWorkspaceMenu('tasks',()=>false),true);
assert.equal(showWorkspaceMenu('individual_dashboard',()=>true),false);
assert.equal(workspaceMenuKey('leads'),'pipeline_board');
globalThis.window={location:{search:''}};
globalThis.allowed=new Set(['tasks']);
const before=globalThis.flowLoads||0;
const tasksOnly=renderToString(<MasterFeed initialTaskView onLeadClick={()=>{}} tasksContent={<div>Task-only tools</div>}/>);
assert.ok(tasksOnly.includes('Task-only tools'));
assert.equal(globalThis.flowLoads||0,before);

let html=renderToString(<Flow initialTaskView tasksContent={<div>Assigned task details</div>}/>);
assert.ok(html.includes('Assigned task details'));
assert.ok(!html.includes('flow-column-head'));
assert.ok(!html.includes('Follow-ups'));
globalThis.allowed=new Set(['tasks','feed']);
window.location.search='?postId=old-post';
assert.ok(renderToString(<MasterFeed initialTaskView onLeadClick={()=>{}} tasksContent={<div>Notification task</div>}/>).includes('Notification task'));
window.location.search='';
html=renderToString(<Flow tasksContent={<div>Assigned task details</div>}/>);
assert.ok(html.includes('>Tasks</button>'));
assert.ok(!html.includes('Assigned task details'));
globalThis.allowed=new Set(['feed']);
html=renderToString(<Flow tasksContent={<div>Restricted tasks</div>}/>);
assert.ok(!html.includes('>Tasks</button>'));
assert.ok(!html.includes('Restricted tasks'));
html=renderToString(<WorkspaceTabs title="Pipeline" initial="leads" tabs={[{key:'leads',label:'Leads',content:<div>Lead tools</div>},{key:'fishbowl',label:'Fishbowl',content:<div>Claim tools</div>}]}/>);
assert.ok(html.includes('Lead tools'));assert.ok(!html.includes('Claim tools'));
html=renderToString(<WorkspaceTabs title="Time & Payroll" initial="payroll" tabs={[{key:'time_approval',label:'Review',content:<div>Review only</div>}]}/>);
assert.ok(html.includes('Review only'));
console.log('Flow task permission boundaries, legacy initial task view, and workspace initial/fallback tabs pass');
` }, bundle:true, platform:'node', format:'cjs', jsx:'automatic', outfile:join(dir,'test.cjs'), plugins:[{name:'fixtures',setup(b){
 b.onResolve({filter:/contexts\/(AuthContext|DepartmentContext)$|lib\/flow\/useFlow$|lib\/supabase$/},()=>({path:'fixture',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const useAuth=()=>({profile:{id:'user'}});export const useDepartments=()=>({hasModuleAccess:k=>globalThis.allowed.has(k)});export const useFlow=()=>{globalThis.flowLoads=(globalThis.flowLoads||0)+1;return {events:[],loading:false,connected:true};};export const supabase={};`}));
 b.onResolve({filter:/WeeklyProposalActivity$|FlowCreateModal$|FlowFollowUps$|FlowTargetPicker$|CustomerConversations$|DiscussionFeed$|DiscussionPostForm$/},a=>({path:a.path,namespace:'child'}));
 b.onLoad({filter:/.*/,namespace:'child'},()=>({contents:`export const DiscussionFeed=()=>null;export const DiscussionPostForm=()=>null;export const WeeklyProposalActivity=()=>null;export const FlowCreateModal=()=>null;export const FlowFollowUps=()=>null;export const FlowTargetPicker=()=>null;export const CustomerConversations=()=>null;`}));
 }}]});
 await import(pathToFileURL(join(dir,'test.cjs')));
} finally { await rm(dir,{recursive:true,force:true}); }
