// Server-only orchestration. Own the SERIALIZABLE PostgreSQL transaction for
// current Sales Order inspection; never let a request supply a transaction.
import {createSerializableSourceTransaction} from './postgresSerializableTransaction.mjs';
import {createTransactionalCurrentEquipmentInspection} from './postgresCurrentEquipmentInspection.mjs';
import {createPrivateSqlCurrentContentReader} from './postgresPrivateSqlCurrentContentReader.mjs';
export function createOwnedCurrentEquipmentInspection(pool,makePrivateContentReader){
 if(!pool||typeof pool.connect!=='function'||typeof makePrivateContentReader!=='function')
  throw new TypeError('trusted_pool_and_private_reader_factory_required');
 const withTransaction=createSerializableSourceTransaction(pool,client=>{
  const privateReader=makePrivateContentReader(client);
  if(typeof privateReader!=='function')throw new TypeError('private_current_content_reader_required');
  const inspect=createTransactionalCurrentEquipmentInspection(client,privateReader);
  return {inspectCurrentEquipment:inspect};
 });
 // This is the same server-owned transaction client; no browser JSON, caller
 // callback or caller-provided source flags can create an authorization.
 return async ({connectionId,orderId}={})=>withTransaction(async tx=>{
  // Expose only a server-owned operation through the executor, not the client.
  return tx.inspectCurrentEquipment({connectionId,orderId});
 });
}

// Real existing SQL source bridge, deliberately held until MJV has verified
// original approval membership and actual per-unit selling price provenance.
export function createOwnedPrivateSqlEquipmentInspection(pool){
 return createOwnedCurrentEquipmentInspection(pool,createPrivateSqlCurrentContentReader);
}
