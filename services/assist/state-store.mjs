import {mkdir,readFile,readdir,rename,writeFile,unlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {hostname} from 'node:os';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function createStateStore(directory){
 const root=resolve(directory);let release;
 const path=id=>{if(!uuid.test(id))throw new Error('invalid_organization');return join(root,id+'.json');};
 return {
  root,
  async lock(){
   await mkdir(root,{recursive:true,mode:0o700});const lock=join(root,'host.lock');
   try{const old=JSON.parse(await readFile(lock,'utf8'));
    if(old.host!==hostname()||!Number.isInteger(old.pid)||old.pid<1)throw new Error('host_state_locked');
    let alive=true;try{process.kill(old.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;else throw new Error('host_state_locked');}
    if(alive)throw new Error('host_state_locked');await unlink(lock);
   }catch(e){if(e.code!=='ENOENT'&&e.message!=='host_state_locked')throw e;if(e.message==='host_state_locked')throw e;}
   await writeFile(lock,JSON.stringify({pid:process.pid,host:hostname()}),{flag:'wx',mode:0o600});
   release=async()=>{await unlink(lock).catch(()=>{});};return release;
  },
  async list(){await mkdir(root,{recursive:true,mode:0o700});const files=await readdir(root);return Promise.all(files.filter(f=>f.endsWith('.json')&&uuid.test(f.slice(0,-5))).map(f=>this.read(f.slice(0,-5))));},
  async read(id){try{return JSON.parse(await readFile(path(id),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}},
  async write(id,value){
   if(value.organization_id!==id)throw new Error('state_identity_mismatch');
   await mkdir(root,{recursive:true,mode:0o700});const destination=path(id),temporary=destination+'.'+randomUUID()+'.tmp';
   await writeFile(temporary,JSON.stringify(value),{mode:0o600,flag:'wx'});await rename(temporary,destination);
  },
 };
}
