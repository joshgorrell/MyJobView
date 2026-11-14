const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v);
/** @param {{pool: {connect: () => Promise<{query: (sql: string, parameters?: any[]) => Promise<{rows: any[]}>,release: () => void}>},environment: string,readEnvironmentSecret: (scope: any) => Promise<any>}} options */
export function createVaultTechsafeSecretReader({pool,environment,readEnvironmentSecret}={}){
 if(typeof pool?.connect!=='function'||typeof readEnvironmentSecret!=='function'||!['sandbox','production'].includes(environment))
  throw TypeError('trusted_credential_reader_configuration_required');
 return async scope=>{
  if(!uuid(scope?.connectionId)||!uuid(scope?.organizationId)||!Number.isSafeInteger(scope?.generation)||scope.generation<1)return null;
  if(environment!=='sandbox')return readEnvironmentSecret(scope);
  let client,rows;
  try{
   client=await pool.connect();
   rows=(await client.query(`SELECT b.status,b.organization_id,b.generation,c.connection_generation AS current_generation,
    c.dispatch_environment,c.enabled,c.status AS connection_status,v.decrypted_secret AS token
    FROM techsafe_source.sandbox_receiver_credentials b
    JOIN techsafe_source.integration_connections c ON c.connection_id=b.connection_id AND c.organization_id=b.organization_id
    LEFT JOIN vault.decrypted_secrets v ON v.id=b.vault_secret_id AND b.status='active'
     AND c.connection_generation=b.generation AND c.dispatch_environment='sandbox' AND c.enabled=true AND c.status='active'
     AND v.name='techsafe_receiver_'||b.connection_id::text||'_g'||b.generation::text
    WHERE b.connection_id=$1 AND b.organization_id=$2 AND b.generation=$3 AND b.environment='sandbox'`,
    [scope.connectionId,scope.organizationId,scope.generation])).rows;
  }catch{return null;}finally{if(client)client.release();}
  // An explicit managed record remains authoritative when staged/revoked;
  // never resurrect an old environment credential through fallback.
  if(rows.length){
   const row=rows[0];
   if(rows.length!==1||row.status!=='active'||Number(row.current_generation)!==scope.generation||row.dispatch_environment!=='sandbox'||
      row.enabled!==true||row.connection_status!=='active'||typeof row.token!=='string'||!/^[A-Za-z0-9_-]{43,512}$/.test(row.token))return null;
   return {...scope,endpoint:'https://ywvrmjfhixgzdyfuhdpv.supabase.co/functions/v1/mjv-import',token:row.token};
  }
  return readEnvironmentSecret(scope);
 };
}
