/** Private Windows canary HTTP host. Requires an independently implemented verifier.
 * Bind loopback only; deploy behind authenticated HTTPS ingress.
 */
import http from 'node:http';
import {timingSafeEqual} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {platform} from 'node:os';
import {createWindowsCanaryHandler} from './windows-canary-contract.mjs';

function authorized(header,secret){
 if(typeof header!=='string'||typeof secret!=='string'||secret.length<32)return false;
 const actual=Buffer.from(header),expected=Buffer.from('Bearer '+secret);
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
export function createWindowsCanaryServer({verify,token,os=platform(),maxBody=8192}={}){
 if(os!=='win32')throw new Error('windows_host_required');
 if(typeof token!=='string'||token.length<32)throw new Error('canary_token_required');
 const handle=createWindowsCanaryHandler({verify});
 return http.createServer(async(req,res)=>{
  const reply=(status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
  if(req.url!=='/v1/assist/probe')return reply(404,{error:'not_found'});
  if(req.method!=='POST')return reply(405,{error:'method_not_allowed'});
  if(!authorized(req.headers.authorization,token))return reply(401,{error:'unauthorized'});
  if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')return reply(415,{error:'unsupported_media_type'});
  try{
   let size=0,chunks=[];
   for await(const chunk of req){size+=chunk.length;if(size>maxBody)throw new Error('request_too_large');chunks.push(chunk);}
   const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   const proof=await handle(data);
   return reply(200,proof);
  }catch{return reply(503,{error:'canary_unavailable'});}
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(platform()!=='win32')throw new Error('windows_host_required');
  const file=process.env.ASSIST_WINDOWS_CANARY_VERIFIER;
  if(!file||!file.startsWith('file:///'))throw new Error('independent_verifier_module_required');
  const module=await import(file);
  if(typeof module.verify!=='function')throw new Error('independent_verifier_export_required');
  const server=createWindowsCanaryServer({verify:module.verify,token:process.env.ASSIST_CANARY_TOKEN});
  const port=Number(process.env.ASSIST_WINDOWS_CANARY_PORT||8787);
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('invalid_canary_port');
  server.listen(port,'127.0.0.1',()=>console.log('Windows canary host listening on loopback; independent verification required'));
 }catch(error){console.error('Windows canary host refused startup: '+error.message);process.exitCode=1;}
}
