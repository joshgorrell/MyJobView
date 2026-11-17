/** Interactive Windows pilot recorder. Human-observed tests only, never a canary attestation. */
import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
import {writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {platform,arch,release} from 'node:os';
import {pathToFileURL} from 'node:url';
import {pilotCases,assessPilotEvidence} from './windows-pilot-evidence.mjs';
import {assessWindowsPilot,standardAgentPresent} from './windows-pilot-preflight.mjs';

export function buildPilotReport({tester,environment,answers,now=()=>new Date().toISOString()}){
 if(typeof tester!=='string'||!tester.trim()||typeof environment!=='string'||environment.trim().length<8)throw new Error('invalid_pilot_identity');
 const cases=pilotCases.map(id=>{
  const answer=answers[id]||{status:'BLOCKED',observed:'Not executed'};
  return {id,status:answer.status,tester,environment,checked_at:now(),observed:answer.observed||'',notes:answer.notes||''};
 });
 const result=assessPilotEvidence({cases});
 if(result.errors.length)throw new Error('invalid_evidence:'+result.errors.join(','));
 return {schema_version:1,report_id:randomUUID(),generated_at:now(),cases};
}
const questions={
 G01:'Generate and redeem a guest code on a clean Windows computer; verify Connect-only (no service)',
 G02:'Approve consent; prove actual desktop view AND mouse/keyboard input',
 G03:'Deny consent; verify no desktop or input',
 G04:'Close guest client; retry old code and link; verify no access',
 G05:'End from operator and guest in separate runs; verify viewer revoked',
 G06:'Reboot guest PC; verify no persistent guest connection',
 G07:'Try expired/used code and wrong dealer; verify rejection',
 E01:'Enroll authorized Windows test computer; verify dealer-scoped inventory',
 E02:'Rename and restart host; verify name persists',
 E03:'Connect enrolled PC; verify consent and desktop/input only',
 E04:'Remove enrollment with active viewer; verify revocation and inventory removal',
 E05:'Reboot removed PC; verify old enrollment remains blocked',
 E06:'Generate fresh guest code on removed PC; verify consent and temporary access',
 E07:'Re-enroll using new identity; verify old identity remains blocked',
 S01:'Revoke operator permission mid-session; verify access ends',
 S02:'Restart host mid-session; verify stale URLs cannot resume',
 S03:'Try cross-dealer credentials; verify all access denied',
 P01:'Measure guest code-to-view and code-to-control in seconds; record both',
 P02:'Measure enrolled click-to-view and click-to-control in seconds',
 A01:'On ARM64 Windows verify architecture-specific guest client and consent/control'
};
export async function runGuidedPilot({input=stdin,output=stdout}={}){
 if(platform()!=='win32')throw new Error('windows_only');
 const rl=createInterface({input,output});
 try{
  const tester=(await rl.question('Tester name: ')).trim();
  const environment=(await rl.question('Staging Windows build, operator/browser, agent version (no secrets): ')).trim();
  const operatorReady=(await rl.question('Separate operator computer/browser available? (yes/no): ')).trim().toLowerCase()==='yes';
  const preflight=assessWindowsPilot({hasAgent:standardAgentPresent(),operatorReady});
  if(preflight.status!=='READY_FOR_MANUAL_PILOT')throw new Error('pilot_preflight_blocked:'+preflight.checks.filter(c=>!c.pass).map(c=>c.id).join(','));
  const answers={};
  for(const id of pilotCases){
   output.write('\n'+id+' '+questions[id]+'\n');
   const raw=(await rl.question('Result (PASS/FAIL/BLOCKED, default BLOCKED): ')).trim().toUpperCase();
   const status=['PASS','FAIL','BLOCKED'].includes(raw)?raw:'BLOCKED';
   const observed=(await rl.question('Observed behavior (no codes, URLs, credentials or tokens): ')).trim();
   answers[id]={status,observed};
   if(status==='FAIL'&&['G03','G04','G05','E04','E05','S01','S02','S03'].includes(id)){
    output.write('SECURITY FAILURE: Stop pilot, do not enable Assist. Remaining cases recorded BLOCKED.\n');
    break;
   }
  }
  const report=buildPilotReport({tester,environment:environment+'; '+platform()+'/'+arch()+' '+release(),answers});
  const result=assessPilotEvidence(report);
  const filename='assist-windows-pilot-'+report.report_id+'.json';
  await writeFile(filename,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
  output.write('Saved '+filename+'\n'+JSON.stringify(result,null,2)+'\n');
  output.write('Human observations are NOT an automated Windows canary; no activation or approval has been granted.\n');
  return result;
 }finally{rl.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 runGuidedPilot().catch(e=>{console.error('Pilot blocked: '+e.message);process.exitCode=1;});
}
