// Private source readiness only; never a coverage/checkout authorization.
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const known=['pending_deposit','pending_po','planning','active','complete','closed'];
function date(v){
 if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;
 const [y,m,d]=v.split('-').map(Number),leap=y%4===0&&(y%100!==0||y%400===0);
 return y>=1&&m>=1&&m<=12&&d>=1&&d<=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31][m-1];
}
export function assessDraftEligibility(input){
 const deny=reason=>({eligible:false,reason});
 const o=input?.order,c=input?.completion;
 if(!object(input)||!id(input.organizationId)||!object(o)||!id(o.id)||!id(o.proposal_id)||o.organization_id!==input.organizationId
  ||!known.includes(o.status))return deny('draft_order_unverified');
 if(!object(c)||!date(c.asOfDate)||!Object.hasOwn(o,'project_id')||o.project_id!==null&&!id(o.project_id))return deny('completion_evidence_unavailable');
 let completedDate=null;
 if(o.project_id===null){if(c.project!==null)return deny('completion_project_mismatch');}
 else{
  const p=c.project;
  if(!object(p)||p.id!==o.project_id||p.organization_id!==input.organizationId||p.sales_order_id!==o.id)return deny('completion_project_mismatch');
  completedDate=p.substantial_completion_date;
  if(completedDate!==null&&!date(completedDate))return deny('completion_date_invalid');
 }
 if(completedDate!==null){
  if(completedDate>c.asOfDate)return deny('substantial_completion_pending');
  return {eligible:true,reason:'project_substantially_complete'};
 }
 return ['complete','closed'].includes(o.status)?{eligible:true,reason:'order_complete'}:deny('substantial_completion_required');
}
