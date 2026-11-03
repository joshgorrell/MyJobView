// The dedicated cron token is server-only. Browser JWTs never authorize billing.
export async function authorizeSecurityWorker(req:Request, configuredSecret:string|undefined,
  verify:(secret:string)=>Promise<boolean>):Promise<boolean> {
  if(req.method!=='POST') return false;
  const authorization=req.headers.get('Authorization')||'';
  if(!authorization.startsWith('Bearer ')) return false;
  const secret=authorization.slice(7);
  if(secret.length<32 || secret.length>256) return false;
  if(configuredSecret && secret===configuredSecret) return true;
  try {return await verify(secret);} catch {return false;}
}
