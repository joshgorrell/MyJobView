/**
 * Conservative job-to-PO allocation for projected profitability.
 * No fuzzy matching by product name, model, job_reference or vendor.
 * Ambiguous or over-ordered allocations must be reviewed rather than silently
 * counted twice. All input records must already be tenant-scoped by the caller.
 */
export interface JobEquipmentLine {
  id: string;
  productId: string | null;
  quantity: number;
}
export interface CommittedPOLine {
  id: string;
  salesOrderId: string | null;
  projectId: string | null;
  productId: string | null;
  quantity: number;
  unitPrice: number;
  documentType: 'po' | 'rfq';
  status: string;
}
export interface JobAllocation {
  lineId: string;
  orderedQuantity: number;
  orderedUnitCost: number | null;
}
export interface AllocationResult {
  allocations: JobAllocation[];
  needsReview: string[];
}
export function allocateCommittedPOCosts(
  salesOrderId: string,
  projectId: string,
  lines: readonly JobEquipmentLine[],
  purchaseLines: readonly CommittedPOLine[]
): AllocationResult {
  const needsReview: string[] = [];
  const allocations: JobAllocation[] = lines.map(l=>({lineId:l.id,orderedQuantity:0,orderedUnitCost:null}));
  const productGroups=new Map<string,number[]>();
  for(let i=0;i<lines.length;i++){
    const l=lines[i];
    if(!Number.isFinite(l.quantity)||l.quantity<0)throw new Error('Invalid equipment quantity');
    if(l.productId)productGroups.set(l.productId,[...(productGroups.get(l.productId)||[]),i]);
  }
  const poGroups=new Map<string,CommittedPOLine[]>();
  for(const po of purchaseLines){
    if(po.documentType!=='po'||po.status==='draft'||po.status==='cancelled')continue;
    if(po.salesOrderId!==salesOrderId && po.projectId!==projectId)continue;
    if(po.salesOrderId&&po.salesOrderId!==salesOrderId ||
       po.projectId&&po.projectId!==projectId){needsReview.push(po.id+':conflicting-job-link');continue;}
    if(!po.productId){needsReview.push(po.id+':missing-product-link');continue;}
    if(!Number.isFinite(po.quantity)||po.quantity<=0||!Number.isFinite(po.unitPrice)||po.unitPrice<0){
      needsReview.push(po.id+':invalid-po-cost');continue;
    }
    poGroups.set(po.productId,[...(poGroups.get(po.productId)||[]),po]);
  }
  for(const [productId,poLines] of poGroups){
    const indices=productGroups.get(productId)||[];
    if(indices.length!==1){needsReview.push(productId+':ambiguous-equipment-match');continue;}
    const i=indices[0],total=poLines.reduce((s,p)=>s+p.quantity,0);
    if(total>lines[i].quantity){needsReview.push(productId+':over-ordered');continue;}
    const cost=poLines.reduce((s,p)=>s+p.quantity*p.unitPrice,0)/total;
    allocations[i]={lineId:lines[i].id,orderedQuantity:total,orderedUnitCost:Math.round(cost*10000)/10000};
  }
  return {allocations,needsReview};
}
