import assert from 'node:assert/strict';
import {techsafeContentEqual} from '../../supabase/functions/_shared/techsafe-source-reread.mjs';
const original={orderId:'order',lines:[{id:'a',quantity:2,price:{cents:70000,currency:'USD'}},{id:'b',quantity:1}],customer:{id:'customer',name:'Test'}};
const reordered={customer:{name:'Test',id:'customer'},lines:[{price:{currency:'USD',cents:70000},quantity:2,id:'a'},{quantity:1,id:'b'}],orderId:'order'};
assert.equal(techsafeContentEqual(original,reordered),true,'JSON object key order must not change a reread');
assert.equal(techsafeContentEqual(original,{...reordered,lines:[...reordered.lines].reverse()}),false,'Equipment array order must remain significant');
assert.equal(techsafeContentEqual(original,{...reordered,lines:[{...reordered.lines[0],quantity:3},reordered.lines[1]]}),false,'Quantity drift must hold');
assert.equal(techsafeContentEqual(original,{...reordered,lines:[{...reordered.lines[0],price:{currency:'USD',cents:80000}},reordered.lines[1]]}),false,'Price drift must hold');
console.log('Techsafe canonical reread comparison passed');
