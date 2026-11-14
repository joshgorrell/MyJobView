import {normalizeTechsafeCompletionDate} from './normalizeCompletionDate.mjs';

// Read only the dedicated Sales Order lifecycle clock. A field Work Order
// completion is not proof of Sales Order completion. Historical orders without
// verified lifecycle history remain held instead of inventing a start date.
export function inspectSalesOrderCompletion(binding={}) {
 const held=reason=>({ok:false,reason});
 if(binding.techsafe_completion_history_verified!==true)
  return held('sales_order_completion_history_unverified');
 const stamp=binding.techsafe_completed_at;
 const completed=['complete','completed'].includes(binding.order_status);
 if(stamp===null){
  return completed?held('sales_order_completion_date_unverified'):{ok:true,completedOn:undefined};
 }
 const completedOn=normalizeTechsafeCompletionDate(stamp);
 if(completedOn===null)return held('sales_order_completion_date_unverified');
 // Keep the first completion date when the native order is reopened.
 return {ok:true,completedOn};
}
