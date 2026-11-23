/**
 * Read-only profitability projection for an OPEN job.
 * Document snapshots remain immutable: only the remaining/unordered units
 * use current catalog cost. Received/ordered units retain committed cost.
 */
export interface JobCostProjectionLine {
  productId: string | null;
  quantity: number;
  soldUnitPrice: number;
  quotedUnitCost: number;
  orderedQuantity: number;
  orderedUnitCost: number | null;
}
export interface JobCostProjection {
  revenue: number;
  quotedCost: number;
  projectedCost: number;
  projectedGrossProfit: number;
  projectedMarginPercent: number | null;
  unverifiedUnits: number;
}
const money=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
const valid=(n:number)=>Number.isFinite(n)&&n>=0;
export function projectOpenJobCurrentCosts(
  lines:readonly JobCostProjectionLine[],
  currentCosts:ReadonlyMap<string,number>
):JobCostProjection {
  let revenue=0,quotedCost=0,projectedCost=0,unverifiedUnits=0;
  for(const line of lines){
    if(!valid(line.quantity)||!valid(line.soldUnitPrice)||!valid(line.quotedUnitCost)||
       !valid(line.orderedQuantity)||line.orderedQuantity>line.quantity||
       (line.orderedUnitCost!==null&&!valid(line.orderedUnitCost)))
      throw new Error('Invalid job cost line');
    if(line.orderedQuantity>0&&line.orderedUnitCost===null)
      throw new Error('Ordered units require a committed unit cost');
    const remaining=line.quantity-line.orderedQuantity;
    const catalogCost=line.productId===null?undefined:currentCosts.get(line.productId);
    const hasVerifiedCost=catalogCost!==undefined&&valid(catalogCost);
    if(remaining>0&&!hasVerifiedCost)unverifiedUnits+=remaining;
    revenue+=money(line.quantity*line.soldUnitPrice);
    quotedCost+=money(line.quantity*line.quotedUnitCost);
    projectedCost+=money(line.orderedQuantity*(line.orderedUnitCost??0)+
      remaining*(hasVerifiedCost?catalogCost:line.quotedUnitCost));
  }
  revenue=money(revenue);quotedCost=money(quotedCost);projectedCost=money(projectedCost);
  const projectedGrossProfit=money(revenue-projectedCost);
  return {revenue,quotedCost,projectedCost,projectedGrossProfit,
    projectedMarginPercent:revenue>0?money(100*projectedGrossProfit/revenue):null,
    unverifiedUnits};
}
