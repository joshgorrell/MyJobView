// Server-only orchestration. Own the SERIALIZABLE PostgreSQL transaction for
// current Sales Order inspection; never let a request supply a transaction.
import {createSerializableSourceTransaction} from './postgresSerializableTransaction.mjs';
import {createTransactionalCurrentEquipmentInspection} from './postgresCurrentEquipmentInspection.mjs';
export function createOwnedCurrentEquipmentInspection(pool,makePrivateContentReader){
 if(!pool||typeof pool.connect!=='function'||typeof makePrivateContentReader!=='function')
  throw new TypeError('trusted_pool_and_private_reader_factory_required');
 const withTransaction=createSerializableSourceTransaction(pool,client=>{
  // The existing executor insists on its three legacy reader capabilities;
  // these are deliberately unavailable for this current-equipment path.
  const unavailable=async()=>{throw new Error('legacy_source_reader_not_available');};
  const privateReader=makePrivateContentReader(client);
  if(typeof privateReader!=='function')throw new TypeError('private_current_content_reader_required');
  const inspect=createTransactionalCurrentEquipmentInspection(client,privateReader);
  return {readConsistentSource:unavailable,readCompleteEquipmentDetails:unavailable,
   readCurrentRevision:unavailable,inspectCurrentEquipment:inspect};
 });
 // This is the same server-owned transaction client; no browser JSON, caller
 // callback or caller-provided source flags can create an authorization.
 return async ({connectionId,orderId}={})=>withTransaction(async tx=>{
  // Expose only a server-owned operation through the executor, not the client.
  // The executor currently hides extra reader methods; see the explicit
  // current-inspection capability in postgresSerializableTransaction.
  return tx.inspectCurrentEquipment({connectionId,orderId});
 });
}
