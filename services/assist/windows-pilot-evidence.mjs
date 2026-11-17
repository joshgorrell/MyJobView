/** Offline pilot evidence checker. Never returns canary attestations. */
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';

export const pilotCases=['G01','G02','G03','G04','G05','G06','G07','E01','E02','E03','E04','E05','E06','E07','S01','S02','S03','P01','P02','A01'];
const states=new Set(['PASS','FAIL','BLOCKED']);
const unsafe=/(?:bearer\s+|claim_token|auth(?:orization)?\s*[:=]|[?&](?:login|token|meshid)=|#code=)/i;
export function assessPilotEvidence(report){
 if(!report||typeof report!=='object'||!Array.isArray(report.cases))throw new Error('invalid_pilot_report');
 const errors=[],seen=new Set(),rows=[];
 for(const row of report.cases){
  if(!row||typeof row!=='object'||!pilotCases.includes(row.id)||seen.has(row.id)){errors.push('unknown_or_duplicate_case');continue;}
  seen.add(row.id);
  if(!states.has(row.status)){errors.push(row.id+':invalid_status');continue;}
  if(row.status==='PASS'){
   if(typeof row.tester!=='string'||!row.tester.trim()||!Number.isFinite(Date.parse(row.checked_at))||
      typeof row.observed!=='string'||row.observed.trim().length<15||
      typeof row.environment!=='string'||row.environment.trim().length<8){
    errors.push(row.id+':missing_evidence');
   }
  }
  for(const key of ['tester','observed','environment','notes'])if(typeof row[key]==='string'&&unsafe.test(row[key]))errors.push(row.id+':potential_secret_in_'+key);
  rows.push({id:row.id,status:row.status});
 }
 const missing=pilotCases.filter(id=>!seen.has(id));
 const failed=rows.filter(row=>row.status==='FAIL').map(row=>row.id);
 const blocked=rows.filter(row=>row.status==='BLOCKED').map(row=>row.id);
 // ARM64 is a separate approval path. The general pilot requires all other cases.
 const core=pilotCases.filter(id=>id!=='A01');
 const passed=new Set(rows.filter(row=>row.status==='PASS').map(row=>row.id));
 const complete=core.every(id=>passed.has(id))&&errors.length===0;
 return {status:complete?'EVIDENCE_REVIEW_REQUIRED':'BLOCKED',missing,failed,blocked,errors,
  core_cases_passed:core.filter(id=>passed.has(id)).length,core_cases_required:core.length,
  arm64_case_passed:passed.has('A01')&&errors.length===0,
  canary_approved:false,production_approved:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.argv.length!==3)throw new Error('usage: node services/assist/windows-pilot-evidence.mjs report.json');
  const raw=await readFile(process.argv[2],'utf8');if(raw.length>1024*1024)throw new Error('report_too_large');
  const result=assessPilotEvidence(JSON.parse(raw));console.log(JSON.stringify(result,null,2));
  console.log('Manual review and real Windows canary execution remain mandatory; this tool cannot activate Assist.');
  if(result.status!=='EVIDENCE_REVIEW_REQUIRED')process.exitCode=1;
 }catch(error){console.error('Pilot evidence rejected: '+error.message);process.exitCode=1;}
}
