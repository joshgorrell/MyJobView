export type PerformanceProject={project_id:string;project_name:string;customer_name?:string;hours_sold:number|null;hours_used:number|null;status?:string;warranty_review?:boolean;budget_used_override?:number};
export type ProjectPolicy={since?:string;quotedRate:number|null;warrantyInstallationPercent?:number;warrantyIds?:string[]};
// Compatibility with the approved historical iPoint report. These assumptions
// belong to Electronic Life's report only; never apply them to other dealers.
export function projectPolicy(organizationId:string):ProjectPolicy {
 return organizationId==='b324e4e3-cd2e-4c68-8df8-3e27c7e08f15'?{
  since:'2025-01-01',quotedRate:122.70,warrantyInstallationPercent:92,
  warrantyIds:['11463','11398','11212','12393','12061','12521','11733','11594','12323','12458','11975','12604','11530','11931','12554','11252','11637']
 }:{quotedRate:null};
}
const hours=(n:unknown):number|null=>typeof n==='number'&&Number.isFinite(n)&&n>=0?n:null;
export function projectPerformance(input:PerformanceProject[],policy:ProjectPolicy){
 const seen=new Set<string>();let duplicates=0;
 const projects=input.filter(p=>{if(!p.project_id||seen.has(p.project_id)){duplicates++;return false;}seen.add(p.project_id);return true;}).filter(p=>['completed','complete','closed'].includes(p.status??''));
 const rows=projects.map(p=>{
  const sold=hours(p.hours_sold),used=hours(p.hours_used);
  const warranty=!!p.warranty_review&&!!policy.warrantyIds?.includes(p.project_id)&&sold!==null&&sold>0&&policy.warrantyInstallationPercent!==undefined;
  const installation=warranty?sold!*policy.warrantyInstallationPercent!/100:used;
  const extra=warranty&&used!==null?Math.max(0,used-installation!):null;
  const inconsistent=warranty&&(used===null||installation!>used+1e-6);
  const percent=inconsistent||p.warranty_review&&!warranty?null:warranty?policy.warrantyInstallationPercent!:hours(p.budget_used_override)??(sold!==null&&sold>0&&installation!==null?installation/sold*100:null);
  const assessment=percent===null?'unassessed':percent<=100+1e-6?'onTarget':percent<=110+1e-6?'within10':'offTarget';
  return {...p,sold,used,installation,extra,warranty,inconsistent,percent,assessment};
 });
 const comparable=rows.filter(p=>p.sold!==null&&p.sold>0&&p.used!==null);
 const sold=comparable.reduce((n,p)=>n+p.sold!,0),used=comparable.reduce((n,p)=>n+p.used!,0);
 const assessed=rows.filter(p=>p.assessment!=='unassessed');
 const onTarget=assessed.filter(p=>p.assessment==='onTarget').length,within10=assessed.filter(p=>p.assessment==='within10').length,offTarget=assessed.length-onTarget-within10;
 const warrantyRows=rows.filter(p=>p.warranty&&!p.inconsistent),extra=warrantyRows.reduce((n,p)=>n+(p.extra??0),0);
 const revenue=policy.quotedRate===null?null:sold*policy.quotedRate;
 const earned=used>0&&revenue!==null?revenue/used:null;
 return {rows,duplicates,completed:rows.length,assessed:assessed.length,onTarget,within10,offTarget,unassessed:rows.length-assessed.length,sold,used,comparable:comparable.length,excludedRate:rows.length-comparable.length,budgetEfficiency:used>0?sold/used*100:null,earned,revenue,warrantyCount:warrantyRows.length,extra,beforeWarranty:used>extra&&revenue!==null?revenue/(used-extra):null};
}
