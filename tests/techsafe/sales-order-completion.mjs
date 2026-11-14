import assert from 'node:assert/strict';
import {inspectSalesOrderCompletion as inspect} from '../../src/lib/techsafe/salesOrderCompletion.mjs';
const open={order_status:'planning',techsafe_completion_history_verified:true,techsafe_completed_at:null};
assert.equal(inspect(open).ok,true);
assert.equal(inspect({...open,order_status:'completed'}).ok,false);
assert.equal(inspect({...open,techsafe_completion_history_verified:false}).ok,false);
assert.equal(inspect({...open,first_completion_date:'2000-01-01'}).completedOn,undefined);
const stamp='2026-01-15T17:00:00Z';
for(const order_status of ['planning','completed','complete']){
 assert.deepEqual(inspect({...open,order_status,techsafe_completed_at:stamp}),{ok:true,completedOn:'2026-01-15'});
}
for(const techsafe_completed_at of [undefined,'invalid'])
 assert.equal(inspect({...open,techsafe_completed_at}).ok,false);
console.log('PASS: native Sales Order completion remains bound through reopening; ambiguous history held');
