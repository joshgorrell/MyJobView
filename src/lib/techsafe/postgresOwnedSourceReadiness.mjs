// One server-owned, read-only source readiness operation. Uses existing
// authoritative PostgreSQL source inspection modules, not caller-supplied
// readiness flags. Never grants transport authority or returns customer rows.
import {createSerializableSourceTransaction} from './postgresSerializableTransaction.mjs';
import {inspectTechsafePostgresSourceSchema} from './postgresSourceSchemaPreflight.mjs';
import {createTransactionalCurrentEquipmentInspection} from './postgresCurrentEquipmentInspection.mjs';
import {createPrivateSqlCurrentContentReader} from './postgresPrivateSqlCurrentContentReader.mjs';
import {createLockedRevisionReader} from './postgresLockedRevisionReader.mjs';
const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const hold=reason=>Object.freeze({ok:false,authorized:false,snapshotReady:false,reason});
export function createOwnedTechsafeSourceReadiness(pool){
 if(!pool||typeof pool.connect!=='function')throw new TypeError('trusted_pool_required');
 const withTransaction=createSerializableSourceTransaction(pool,client=>({
  inspectCurrentEquipment:async ({connectionId,orderId,organizationId,proposalId})=>{
   // The source catalog and row-level evidence must come from the same
   // SERIALIZABLE PostgreSQL session. Do not disclose SQL schema details.
   const schema=await inspectTechsafePostgresSourceSchema(client);
   if(schema.requiredColumnsPresent!==true)
    return hold('source_schema_incomplete');
   const revision=await createLockedRevisionReader(client)({connectionId,orderId});
   if(revision.organizationId!==organizationId||revision.proposalId!==proposalId)
    return hold('approved_sales_order_binding_mismatch');
   const inspection=await createTransactionalCurrentEquipmentInspection(
    client,createPrivateSqlCurrentContentReader(client))({connectionId,orderId});
   // v1 private SQL reader is deliberately diagnostic. Report this actual
   // blocker rather than claiming the source has been certified.
   if(inspection.ok!==true)return hold(inspection.reason||'current_equipment_not_verified');
   return Object.freeze({ok:true,authorized:false,snapshotReady:false,
    reason:'approval_change_history_and_price_authority_pending'});
  }
 }));
 return async ({connectionId,orderId,organizationId,proposalId}={})=>{
  if(![connectionId,orderId,organizationId,proposalId].every(uuid))return hold('invalid_binding');
  try{
   return await withTransaction(tx=>tx.inspectCurrentEquipment({connectionId,orderId,organizationId,proposalId}));
  }catch{return hold('source_readiness_unavailable');}
 };
}
