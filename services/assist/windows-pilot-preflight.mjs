/** Read-only Windows pilot prerequisite check. Never grants canary approval. Node 22+. */
import {platform,arch,release,hostname} from 'node:os';
import {pathToFileURL} from 'node:url';
import {existsSync} from 'node:fs';
import {join} from 'node:path';

export function assessWindowsPilot({os=platform(),cpu=arch(),version=release(),hasAgent=false,operatorReady=false}={}){
 const checks=[
  {id:'windows_host',pass:os==='win32',detail:os==='win32'?'Windows detected':'Run this on the Windows test computer'},
  {id:'supported_architecture',pass:['x64','arm64'].includes(cpu),detail:cpu},
  {id:'clean_guest_baseline',pass:!hasAgent,detail:hasAgent?'Existing agent detected; use a disposable clean VM/computer':'No existing agent found at standard installation paths'},
  {id:'second_operator',pass:operatorReady,detail:operatorReady?'Operator workstation confirmed by tester':'Operator workstation must be verified manually'}
 ];
 return {status:checks.every(c=>c.pass)?'READY_FOR_MANUAL_PILOT':'BLOCKED',release:version,architecture:cpu,checks,canary_approved:false,production_approved:false};
}
export function standardAgentPresent({exists=existsSync,programFiles=process.env.ProgramFiles,programFilesX86=process.env['ProgramFiles(x86)']}={}){
 return [programFiles,programFilesX86].filter(Boolean).some(dir=>exists(join(dir,'Mesh Agent','MeshAgent.exe'))||exists(join(dir,'Mesh Agent','Mesh Agent.exe')));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=assessWindowsPilot({hasAgent:standardAgentPresent(),operatorReady:process.argv.includes('--operator-ready')});
 console.log(JSON.stringify({computer:hostname(),...result},null,2));
 console.log('This checks prerequisites only. Desktop, input, consent, revocation and dealer isolation MUST be verified in the actual Windows pilot.');
 if(result.status!=='READY_FOR_MANUAL_PILOT')process.exitCode=1;
}
