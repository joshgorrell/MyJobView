import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,readFile,writeFile,rename,rm,lstat} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL,fileURLToPath} from 'node:url';
export async function stageAgentCache({manifest,source,destination,runtimeVersion}){
 if(manifest?.schemaVersion!==1||!Array.isArray(manifest.releases)||!manifest.releases.length)throw new Error('invalid_manifest');
 const final=resolve(destination);await mkdir(dirname(final),{recursive:true});
 try{await lstat(final);throw new Error('cache_destination_exists');}catch(e){if(e.code!=='ENOENT')throw e;}
 const staging=await mkdtemp(join(dirname(final),'.agent-cache-'));const names=new Set();let count=0;
 try{
  for(const release of manifest.releases){
   if(!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,100}$/.test(release.tag)||!Array.isArray(release.files))throw new Error('invalid_release');
   const folder=join(staging,release.tag);await mkdir(folder,{recursive:true,mode:0o755});const sums=[];
   for(const file of release.files){
    if(!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(file.filename)||names.has(file.filename)||!Number.isSafeInteger(file.size)||file.size<=0||!/^[a-f0-9]{96}$/.test(file.sha384))throw new Error('invalid_asset');
    names.add(file.filename);const path=join(source,file.filename);if(!(await lstat(path)).isFile())throw new Error('invalid_asset_file');
    const bytes=await readFile(path);if(bytes.length!==file.size||createHash('sha384').update(bytes).digest('hex')!==file.sha384)throw new Error('agent_hash_mismatch');
    await writeFile(join(folder,file.filename),bytes,{flag:'wx',mode:0o644});sums.push(createHash('sha256').update(bytes).digest('hex')+'  '+file.filename);count++;
   }
   await writeFile(join(folder,'SHA256SUMS'),sums.join('\n')+'\n',{mode:0o644});
  }
  if(!count)throw new Error('empty_cache');
  await writeFile(join(staging,'mjv-release.json'),JSON.stringify({runtime_version:runtimeVersion,files:count,manifest_sha256:createHash('sha256').update(JSON.stringify(manifest)).digest('hex')}),{mode:0o644});
  await rename(staging,final);return {files:count};
 }catch(error){await rm(staging,{recursive:true,force:true});throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let temporary;
 try{
  if(process.argv.length!==3)throw new Error('usage');
  const root=fileURLToPath(new URL('./node_modules/meshcentral/',import.meta.url));
  const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));const manifest=JSON.parse(await readFile(join(root,'agents/agent-defaults.json'),'utf8'));
  temporary=await mkdtemp(join(tmpdir(),'mjv-agents-'));
  await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,[join(root,'agents/check-releases.js'),'--output',temporary],{stdio:['ignore','inherit','inherit']});
   child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('download_verification_failed')));
  });
  console.log(JSON.stringify(await stageAgentCache({manifest,source:temporary,destination:process.argv[2],runtimeVersion:pkg.version})));
 }catch{console.error('Agent cache preparation failed; destination must be new and every pinned file must verify');process.exitCode=1;}
 finally{if(temporary)await rm(temporary,{recursive:true,force:true});}
}
