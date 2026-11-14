import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createVaultTechsafeSecretReader} from '../../supabase/functions/_shared/techsafe-vault-secret-reader.mjs';
import {createTechsafeEnvironmentSecretReader} from '../../supabase/functions/_shared/techsafe-environment-secret-reader.mjs';
const db=new PGlite(),id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const [org,otherOrg,connection,otherConnection,order,otherOrder,proposal,secret,otherSecret]=[1,2,3,4,5,6,7,8,9].map(id);
const scope={connectionId:connection,organizationId:org,generation:1};
const endpoint='https://ywvrmjfhixgzdyfuhdpv.supabase.co/functions/v1/mjv-import';
let leased=false;
const pool={connect:async()=>{assert.equal(leased,false);leased=true;return {query:(s,p)=>db.query(s,p),release:()=>{leased=false;}};}};
const environmentReader=createTechsafeEnvironmentSecretReader({getEnv:()=>JSON.stringify([{...scope,endpoint,token:'b'.repeat(64)}])});
const read=createVaultTechsafeSecretReader({pool,environment:'sandbox',readEnvironmentSecret:environmentReader});
try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA vault;CREATE SCHEMA extensions;
  CREATE TABLE vault.secrets(id uuid PRIMARY KEY,name text UNIQUE,secret text);
  -- Plain fixture view only: encryption is provided by real Supabase Vault.
  CREATE VIEW vault.decrypted_secrets AS SELECT id,name,secret AS decrypted_secret FROM vault.secrets;
  CREATE FUNCTION extensions.gen_random_bytes(integer) RETURNS bytea LANGUAGE sql VOLATILE AS
   $$SELECT decode(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),'hex')$$;
  CREATE FUNCTION vault.create_secret(text,text,text) RETURNS uuid LANGUAGE sql AS
   $$INSERT INTO vault.secrets(id,name,secret) VALUES(gen_random_uuid(),$2,$1) RETURNING id$$;
  CREATE TABLE public.sales_orders(id uuid PRIMARY KEY);`);
 for(const file of ['20261108150000_techsafe_private_order_revision_ledger.sql'])
  await db.exec(await readFile(new URL('../../supabase/migrations/'+file,import.meta.url),'utf8'));
 await db.exec("ALTER TABLE techsafe_source.integration_connections ADD COLUMN dispatch_environment text");
 await db.exec(await readFile(new URL('../../supabase/migrations/20261114213754_techsafe_sandbox_vault_credentials.sql',import.meta.url),'utf8'));
 await db.query('INSERT INTO public.sales_orders VALUES($1),($2)',[order,otherOrder]);
 for(const [c,o,g] of [[connection,order,org],[otherConnection,otherOrder,otherOrg]])
  await db.query(`INSERT INTO techsafe_source.integration_connections(connection_id,sales_order_id,organization_id,proposal_id,status,enabled,dispatch_environment)
   VALUES($1,$2,$3,$4,'active',true,'sandbox')`,[c,o,g,proposal]);
 assert.equal((await read(scope)).token,'b'.repeat(64),'unmanaged scope retains the existing environment reader');
 await db.query('INSERT INTO vault.secrets VALUES($1,$2,$3),($4,$5,$6)',[secret,'techsafe_receiver_'+connection+'_g1','a'.repeat(64),otherSecret,'techsafe_receiver_'+otherConnection+'_g1','c'.repeat(64)]);
 await assert.rejects(db.query(`INSERT INTO techsafe_source.sandbox_receiver_credentials(connection_id,organization_id,generation,vault_secret_id)
  VALUES($1,$2,1,$3)`,[connection,otherOrg,secret]),/scope invalid/);
 await assert.rejects(db.query(`INSERT INTO techsafe_source.sandbox_receiver_credentials(connection_id,organization_id,generation,vault_secret_id)
  VALUES($1,$2,1,$3)`,[connection,org,otherSecret]),/ownership invalid/);
 await db.query(`INSERT INTO techsafe_source.sandbox_receiver_credentials(connection_id,organization_id,generation,vault_secret_id)
  VALUES($1,$2,1,$3)`,[connection,org,secret]);
 assert.equal(await read(scope),null,'staged managed authority cannot fall through to an environment key');
 await db.exec("UPDATE techsafe_source.sandbox_receiver_credentials SET status='active'");
 assert.equal((await read(scope)).token,'a'.repeat(64));assert.equal(leased,false);
 assert.equal(await read({...scope,organizationId:otherOrg}),null);
 await db.query("UPDATE techsafe_source.integration_connections SET status='paused',enabled=false WHERE connection_id=$1",[connection]);
 assert.equal(await read(scope),null);
 await db.query("UPDATE techsafe_source.integration_connections SET status='active',enabled=true,dispatch_environment='production' WHERE connection_id=$1",[connection]);
 assert.equal(await read(scope),null,'wrong environment cannot resurrect a legacy key');
 await db.query("UPDATE techsafe_source.integration_connections SET dispatch_environment='sandbox' WHERE connection_id=$1",[connection]);
 await db.exec("UPDATE techsafe_source.sandbox_receiver_credentials SET status='revoked'");
 assert.equal(await read(scope),null);
 await assert.rejects(db.query('DELETE FROM techsafe_source.sandbox_receiver_credentials'),/Revoke managed credentials/);
 await assert.rejects(db.query('DELETE FROM vault.secrets WHERE id=$1',[secret]),/foreign key constraint/);
 const prod=createVaultTechsafeSecretReader({pool,environment:'production',readEnvironmentSecret:environmentReader});
 assert.equal((await prod(scope)).token,'b'.repeat(64),'production environment behavior is unchanged');
 const thirdConnection=id(10),thirdOrder=id(11);
 await db.query('INSERT INTO public.sales_orders VALUES($1)',[thirdOrder]);
 await db.query(`INSERT INTO techsafe_source.integration_connections(connection_id,sales_order_id,organization_id,proposal_id,status,enabled,dispatch_environment)
  VALUES($1,$2,$3,$4,'active',true,'sandbox')`,[thirdConnection,thirdOrder,org,proposal]);
 const metadata=(await db.query('SELECT techsafe_source.stage_sandbox_receiver_credential($1) AS metadata',[thirdConnection])).rows[0].metadata;
 assert.deepEqual(Object.keys(metadata).sort(),['connectionId','environment','generation','organizationId','tokenSha256'].sort());
 assert.match(metadata.tokenSha256,/^[a-f0-9]{64}$/);
 assert.deepEqual((await db.query('SELECT techsafe_source.stage_sandbox_receiver_credential($1) AS metadata',[thirdConnection])).rows[0].metadata,metadata,'retry preserves the staged token');
 const raw=(await db.query('SELECT secret FROM vault.secrets WHERE name=$1',['techsafe_receiver_'+thirdConnection+'_g1'])).rows[0].secret;
 assert.equal(JSON.stringify(metadata).includes(raw),false,'operator metadata never exposes the raw token');
 await db.query("UPDATE techsafe_source.sandbox_receiver_credentials SET status='revoked' WHERE connection_id=$1",[thirdConnection]);
 await assert.rejects(db.query('SELECT techsafe_source.stage_sandbox_receiver_credential($1)',[thirdConnection]),/generation rotation/);
 await db.query('UPDATE techsafe_source.integration_connections SET connection_generation=2 WHERE connection_id=$1',[thirdConnection]);
 const rotated=(await db.query('SELECT techsafe_source.stage_sandbox_receiver_credential($1) AS metadata',[thirdConnection])).rows[0].metadata;
 assert.equal(rotated.generation,2);assert.notEqual(rotated.tokenSha256,metadata.tokenSha256);
 await db.exec('BEGIN');await db.query('DELETE FROM techsafe_source.integration_connections WHERE connection_id=$1',[connection]);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM vault.secrets WHERE id=$1',[secret])).rows[0].n,0);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM vault.secrets WHERE id=$1',[otherSecret])).rows[0].n,1);
 await db.exec('ROLLBACK');
 assert.equal((await db.query('SELECT count(*)::int AS n FROM vault.secrets WHERE id=$1',[secret])).rows[0].n,1);
 for(const role of ['anon','authenticated','service_role']){
  assert.equal((await db.query("SELECT has_function_privilege($1,'techsafe_source.stage_sandbox_receiver_credential(uuid)','EXECUTE') AS allowed",[role])).rows[0].allowed,false);
  await db.exec('SET ROLE '+role);await assert.rejects(db.query('SELECT * FROM techsafe_source.sandbox_receiver_credentials'),/permission denied/);await db.exec('RESET ROLE');
 }
 console.log('PASS: private sandbox Vault scope, staged/revoked fallback denial, production isolation and owned-secret cleanup/rollback');
}catch(e){console.error(e.message,e.where??'');process.exitCode=1;}finally{await db.close();}
