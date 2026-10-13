import {build} from 'esbuild';
import assert from 'node:assert/strict';
const result=await build({entryPoints:['src/lib/workspaceRoutes.ts'],bundle:true,format:'esm',write:false,platform:'node'});
const {workspacePath,workspacePage,pageFromLocation,workspaceUrl,isPortalProposalRoute}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
for(const [page,path] of [['feed','/flow'],['leads','/leads'],['proposals','/proposals'],['calendar','/schedule'],['punchlist','/project-punchlist'],['settings_company','/settings/company'],['labor_dashboard','/labor-dashboard']]){
 assert.equal(workspacePath(page),path); assert.equal(workspacePage(path+'/'),page);
 assert.equal(pageFromLocation(new URL('https://elife.myjobview.com'+path)),page);
}
assert.equal(pageFromLocation(new URL('https://elife.myjobview.com/leads?tab=messages')),'feed');
assert.equal(workspaceUrl(new URL('https://elife.myjobview.com/?tab=proposals&proposalId=123&proposalActivity=true#details'),'proposals'),'/proposals?proposalId=123&proposalActivity=true#details');
for(const path of ['/portal','/calendar','/punchlist','/card/josh','/auth-callback','/unknown'])assert.equal(workspacePage(path),null);
assert.equal(isPortalProposalRoute('/proposals','',false,false),false);
for(const [path,search,portal,impersonating] of [['/proposals','',true,false],['/proposals','?portal_token=abc',false,false],['/proposals','',false,true],['/proposals/123','',false,false],['/portal/proposals','',false,false]])assert.equal(isPortalProposalRoute(path,search,portal,impersonating),true);
console.log('Workspace route resolution, legacy links, record/hash retention, and portal separation pass');
