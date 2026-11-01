// Approved sales-order draft candidacy, including work not yet complete.
// Approval/application evidence is validated separately. No checkout authority.
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const known=['pending_deposit','pending_po','planning','active','complete','closed'];
export function assessDraftEligibility(input){
 const deny=reason=>({eligible:false,reason});
 const o=input?.order;
 if(!object(input)||!id(input.organizationId)||!object(o)||!id(o.id)||!id(o.proposal_id)||o.organization_id!==input.organizationId
  ||!known.includes(o.status))return deny('draft_order_unverified');
 return {eligible:true,reason:'sales_order_draft_candidate'};
}

