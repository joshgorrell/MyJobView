import assert from 'node:assert/strict';
import {checkPersistedEquipmentCertificate as check} from '../../src/lib/techsafe/persistedCertificateGate.mjs';
const fingerprint='a'.repeat(64);
const contentFingerprint='c'.repeat(64);
const connection={connectionId:'conn-1',salesOrderId:'order-1',organizationId:'org-1',proposalId:'proposal-1',generation:2,active:true,enabled:true};
const ledger={connectionId:'conn-1',orderId:'order-1',organizationId:'org-1',proposalId:'proposal-1',generation:2,revision:5,state:'candidate',fingerprint};
const certificate={connectionId:'conn-1',orderId:'order-1',organizationId:'org-1',proposalId:'proposal-1',generation:2,revision:5,state:'certified',sourceCommitted:true,approvalVerified:true,transactionVerified:true,fingerprint,contentFingerprint};
const freshEvidence={ok:true,authorized:false,snapshotReady:false,connectionId:'conn-1',orderId:'order-1',organizationId:'org-1',proposalId:'proposal-1',connectionGeneration:2,revision:5,fingerprint,contentFingerprint};
const args={connection,ledger,certificate,freshEvidence,lastDelivered:null};
const good=check(args);
assert.equal(good.ok,true);assert.equal(good.authorized,false);assert.equal(good.snapshotReady,false);
const rejects=[
 {connection:{...connection,active:false}},
 {connection:{...connection,enabled:false}},
 {connection:{...connection,generation:3}},
 {connection:{...connection,organizationId:'org-2'}},
 {ledger:{...ledger,state:'held'}},
 {ledger:{...ledger,revision:6}},
 {ledger:{...ledger,fingerprint:'0'.repeat(64)}},
 {ledger:{...ledger,orderId:'other'}},
 {certificate:{...certificate,revision:4}},
 {certificate:{...certificate,generation:3}},
 {certificate:{...certificate,transactionVerified:false}},
 {certificate:{...certificate,sourceCommitted:false}},
 {certificate:{...certificate,approvalVerified:false}},
 {certificate:{...certificate,state:'candidate'}},
 {certificate:{...certificate,fingerprint:'b'.repeat(64)}},
 {certificate:{...certificate,contentFingerprint:undefined}},
 {certificate:{...certificate,contentFingerprint:'0'.repeat(64)}},
 {certificate:{...certificate,contentFingerprint:'d'.repeat(64)}},
 {freshEvidence:{...freshEvidence,contentFingerprint:undefined}},
 {freshEvidence:{...freshEvidence,contentFingerprint:'d'.repeat(64)}},
 {certificate:{...certificate,organizationId:'other'}},
 {freshEvidence:{...freshEvidence,fingerprint:'b'.repeat(64)}},
 {freshEvidence:{...freshEvidence,revision:6}},
 {freshEvidence:{...freshEvidence,ok:false}},
 {freshEvidence:{...freshEvidence,authorized:true}},
 {freshEvidence:{...freshEvidence,orderId:'other'}},
 {lastDelivered:{connectionId:'conn-1',orderId:'order-1',generation:2,revision:6,fingerprint,contentFingerprint}},
 {lastDelivered:{connectionId:'conn-1',orderId:'order-1',generation:3,revision:1,fingerprint,contentFingerprint}},
 {lastDelivered:{connectionId:'conn-1',orderId:'order-1',generation:2,revision:5,fingerprint:'b'.repeat(64),contentFingerprint}},
 {lastDelivered:{connectionId:'conn-1',orderId:'order-1',generation:2,revision:5,fingerprint,contentFingerprint:'d'.repeat(64)}},
 {lastDelivered:{connectionId:'conn-1',orderId:'order-1',generation:2,revision:5,fingerprint}},
 {lastDelivered:{connectionId:'conn-2',orderId:'order-1',generation:2,revision:5,fingerprint,contentFingerprint}},
 {lastDelivered:{connectionId:'conn-1',orderId:'order-1',organizationId:'org-2',proposalId:'proposal-1',generation:2,revision:4,fingerprint,contentFingerprint}},
 {lastDelivered:{connectionId:'conn-1',orderId:'order-1',organizationId:'org-1',proposalId:'proposal-2',generation:2,revision:4,fingerprint,contentFingerprint}},
 {lastDelivered:{connectionId:'conn-1',orderId:'order-1',organizationId:null,generation:2,revision:4,fingerprint,contentFingerprint}},
 {lastDelivered:{connectionId:'conn-1',orderId:'order-1',proposalId:'',generation:2,revision:4,fingerprint,contentFingerprint}}
];
for(const mutation of rejects) {
 const result=check({...args,...mutation});
 assert.equal(result.ok,false,JSON.stringify(mutation));
 assert.equal(result.authorized,false);
 assert.equal(result.snapshotReady,false);
}
assert.equal(check({...args,lastDelivered:{connectionId:'conn-1',orderId:'order-1',generation:2,revision:4,fingerprint:'b'.repeat(64),contentFingerprint}}).ok,true);
assert.equal(check({...args,lastDelivered:{connectionId:'conn-1',orderId:'order-1',generation:2,revision:5,fingerprint,contentFingerprint}}).ok,true);
assert.equal(check({...args,lastDelivered:{connectionId:'conn-1',orderId:'order-1',organizationId:'org-1',proposalId:'proposal-1',generation:2,revision:4,fingerprint,contentFingerprint}}).ok,true);
assert.equal(check({...args,certificate:null}).ok,false);
console.log('Techsafe persisted certificate comparison: PASS (not dispatch authorization)');
