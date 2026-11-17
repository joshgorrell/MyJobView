/** Launch an independently installed Windows test harness.
 * The harness must execute real desktop/input/consent/isolation tests.
 * No bundled fake success path exists.
 */
import {spawn} from 'node:child_process';
import {platform} from 'node:os';
import {resolve,isAbsolute} from 'node:path';
import {stat,readFile} from 'node:fs/promises';
import {createHash,timingSafeEqual} from 'node:crypto';

export function createWindowsHarnessVerifier({executable,expectedSha256,os=platform(),spawnProcess=spawn,checkFile=stat,readExecutable=readFile}={}){
 if(os!=='win32')throw new Error('windows_harness_required');
 if(typeof executable!=='string'||!isAbsolute(executable)||!executable.toLowerCase().endsWith('.exe'))throw new Error('absolute_windows_harness_exe_required');
 if(typeof expectedSha256!=='string'||!/^[a-f0-9]{64}$/i.test(expectedSha256))throw new Error('pinned_harness_sha256_required');
 const expected=Buffer.from(expectedSha256,'hex');
 const file=resolve(executable);
 return async(request,{signal}={})=>{
  const info=await checkFile(file);
  if(!info.isFile())throw new Error('harness_not_file');
  const bytes=await readExecutable(file);
  const digest=createHash('sha256').update(bytes).digest();
  if(!timingSafeEqual(digest,expected))throw new Error('harness_hash_mismatch');
  if(signal?.aborted)throw new Error('harness_aborted');
  return await new Promise((done,fail)=>{
   let settled=false,output='',stderrBytes=0;
   const child=spawnProcess(file,[],{windowsHide:true,shell:false,stdio:['pipe','pipe','pipe'],signal});
   const finish=(err,value)=>{if(settled)return;settled=true;err?fail(err):done(value);};
   child.on('error',()=>finish(new Error('harness_execution_failed')));
   child.stdout.on('data',chunk=>{output+=chunk.toString('utf8');if(Buffer.byteLength(output)>32768){child.kill();finish(new Error('harness_output_oversized'));}});
   child.stderr.on('data',chunk=>{stderrBytes+=chunk.length;if(stderrBytes>32768){child.kill();finish(new Error('harness_stderr_oversized'));}});
   child.on('close',code=>{
    if(settled)return;
    if(code!==0)return finish(new Error('harness_failed'));
    try{finish(null,JSON.parse(output));}catch{finish(new Error('harness_invalid_json'));}
   });
   child.stdin.on('error',()=>finish(new Error('harness_input_failed')));
   child.stdin.end(JSON.stringify(request)+'\n');
  });
 };
}
export const verify=async(request,options)=>{
 const executable=process.env.ASSIST_WINDOWS_CANARY_HARNESS_EXE;
 const expectedSha256=process.env.ASSIST_WINDOWS_CANARY_HARNESS_SHA256;
 return createWindowsHarnessVerifier({executable,expectedSha256})(request,options);
};
