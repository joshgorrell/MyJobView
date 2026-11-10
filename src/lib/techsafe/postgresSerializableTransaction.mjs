// Trusted server-only PostgreSQL transaction executor. Never import into browser
// code or expose a public RPC. Does not authorize delivery or create certificates.
// pool is a server-owned pg-compatible Pool; never accept a user-supplied pool.
export function createSerializableSourceTransaction(pool, makeReader, persistCertificate) {
 if(persistCertificate!==undefined&&typeof persistCertificate!=='function')
  throw new TypeError('trusted_certificate_writer_required');
 if(!pool||typeof pool.connect!=='function'||typeof makeReader!=='function')
  throw new TypeError('trusted_pool_and_reader_required');
 return async callback=>{
  if(typeof callback!=='function')throw new TypeError('transaction_callback_required');
  const client=await pool.connect();
  if(!client||typeof client.query!=='function'||typeof client.release!=='function') {
   // A malformed client may still hold a pool slot; discard it if possible.
   if(typeof client?.release==='function')client.release(new Error('invalid_postgres_client'));
   throw new TypeError('invalid_postgres_client');
  }
  let begun=false,committed=false,failed=false;
  try {
   // Explicit read-write transaction: a future certificate writer must use
   // the SAME transaction for source reads, certificate insert and recheck.
   await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE READ WRITE');
   begun=true;
   const isolation=await client.query('SHOW transaction_isolation');
   if(isolation?.rows?.length!==1||
      isolation.rows[0].transaction_isolation!=='serializable')
    throw new Error('serializable_isolation_not_confirmed');
   // Only a trusted server module can construct the source reader. The client
   // is never exposed to the callback or to a request-supplied JSON object.
   const reader=makeReader(client);
   if(!reader||typeof reader.readConsistentSource!=='function'||
      typeof reader.readCompleteEquipmentDetails!=='function'||
      typeof reader.readCurrentRevision!=='function')
    throw new Error('trusted_source_reader_missing');
   const result=await callback(Object.freeze({
    ...(persistCertificate?{persistCertificate:evidence=>persistCertificate({client,evidence})}:{}),
    isolationLevel:'serializable',serverOwned:true,
    readConsistentSource:reader.readConsistentSource.bind(reader),
    readCompleteEquipmentDetails:reader.readCompleteEquipmentDetails.bind(reader),
    readCurrentRevision:reader.readCurrentRevision.bind(reader)
   }));
   // Fail closed: the coordinator never returns a delivery authorization.
   if(!result||result.authorized!==false||result.snapshotReady!==false)
    throw new Error('transaction_result_not_inert');
   // A held or incomplete source inspection must not commit any incidental
   // writes performed by a reader or a future certificate writer.
   if(result.ok!==true)throw new Error('transaction_source_held');
   await client.query('COMMIT');
   committed=true;
   return result;
  } catch(error) {
   failed=true;
   if(begun&&!committed) {
    try {await client.query('ROLLBACK');}
    catch { /* Preserve the original error and discard the connection. */ }
   }
   throw error;
  } finally {
   // A failed transaction is never reused by this integration.
   client.release(failed?new Error('techsafe_transaction_discarded'):undefined);
  }
 };
}
