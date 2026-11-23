/**
 * PO lines may supply multiple sales orders. Never infer allocations from
 * matching product IDs: use explicit persisted PO-line -> sales-order-line links.
 * The caller must supply records already scoped to the same organization.
 */
export interface JobEquipmentLine { id:string; productId:string|null; quantity:number }
export interface CommittedPOLine {
 id:string; productId:string|null; quantity:number; unitPrice:number;
 documentType:'po'|'rfq'; status:string
}
export interface POLineAllocation {
 poItemId:string; salesOrderId:string; salesOrderLineId:string;
 productId:string; quantity:number
}
export interface JobAllocation {
 lineId:string; orderedQuantity:number; orderedUnitCost:number|null
}
export interface AllocationResult { allocations:JobAllocation[]; needsReview:string[] }
const valid=(n:number)=>Number.isFinite(n)&&n>=0;
export function allocateCommittedPOCosts(
 salesOrderId:string,
 lines:readonly JobEquipmentLine[],
 purchaseLines:readonly CommittedPOLine[],
 links:readonly POLineAllocation[]
):AllocationResult {
 const needsReview:string[]=[];
 const byLine=new Map(lines.map(l=>[l.id,l]));
 const poById=new Map(purchaseLines.map(p=>[p.id,p]));
 const allocatedByPO=new Map<string,number>();
 const allocations=lines.map(l=>({lineId:l.id,orderedQuantity:0,orderedUnitCost:null as number|null}));
 const costTotals=new Map<string,number>();
 const quantities=new Map<string,number>();
 for(const l of lines)if(!valid(l.quantity))throw new Error('Invalid equipment quantity');
 for(const link of links){
  const po=poById.get(link.poItemId);
  if(!po){needsReview.push(link.poItemId+':missing-po');continue;}
  if(po.documentType!=='po'||po.status==='draft'||po.status==='cancelled')continue;
  if(!valid(link.quantity)||link.quantity<=0||!valid(po.quantity)||!valid(po.unitPrice)){
   needsReview.push(link.poItemId+':invalid-quantity-or-cost');continue;
  }
  if(link.productId!==po.productId){needsReview.push(link.poItemId+':product-mismatch');continue;}
  const consumed=(allocatedByPO.get(po.id)||0)+link.quantity;
  allocatedByPO.set(po.id,consumed);
  if(consumed>po.quantity)needsReview.push(po.id+':over-allocated-po');
  if(link.salesOrderId!==salesOrderId)continue;
  const line=byLine.get(link.salesOrderLineId);
  if(!line||line.productId!==link.productId){
   needsReview.push(link.salesOrderLineId+':invalid-job-line');continue;
  }
  quantities.set(line.id,(quantities.get(line.id)||0)+link.quantity);
  costTotals.set(line.id,(costTotals.get(line.id)||0)+link.quantity*po.unitPrice);
 }
 for(const po of purchaseLines){
  if(po.documentType==='po'&&po.status!=='draft'&&po.status!=='cancelled'&&
    (allocatedByPO.get(po.id)||0)<po.quantity)
   needsReview.push(po.id+':unallocated-quantity');
 }
 for(const [id,qty] of quantities){
  const line=byLine.get(id)!;
  if(qty>line.quantity){needsReview.push(id+':over-ordered-job-line');continue;}
  const result=allocations.find(a=>a.lineId===id)!;
  result.orderedQuantity=qty;
  result.orderedUnitCost=Math.round(costTotals.get(id)!/qty*10000)/10000;
 }
 if(needsReview.some(x=>x.includes('over-allocated-po'))){
  // Do not publish misleading costs when the same PO units were assigned twice.
  return {allocations:lines.map(l=>({lineId:l.id,orderedQuantity:0,orderedUnitCost:null})),needsReview};
 }
 return {allocations,needsReview};
}
