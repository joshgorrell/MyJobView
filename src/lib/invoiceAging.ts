// Read-only aging calculation; callers supply an authorized, complete invoice set.
export interface AgingInvoice { id:string; organizationId:string; status:string; balanceCents:number; dueDate:string|null }
function day(value:string):number {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('Invalid date');
  const ms=Date.parse(value+'T00:00:00Z');
  if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==value)throw new Error('Invalid date');
  return ms/86400000;
}
export function calculateInvoiceAging(organizationId:string, invoices:readonly AgingInvoice[], asOf:string){
  const today=day(asOf);
  const buckets={current:0,days1To30:0,days31To60:0,days61To90:0,daysOver90:0,unknownDueDate:0};
  const seen=new Set<string>();
  for(const invoice of invoices){
    if(!organizationId||invoice.organizationId!==organizationId||!invoice.id||seen.has(invoice.id))throw new Error('Invalid invoice scope');
    seen.add(invoice.id);
    if(!['submitted','sent','partial','overdue'].includes(invoice.status))continue;
    if(!Number.isSafeInteger(invoice.balanceCents))throw new Error('Invalid invoice balance');
    if(invoice.balanceCents<=0)continue;
    const age=invoice.dueDate===null?null:today-day(invoice.dueDate);
    const bucket=age===null?'unknownDueDate':age<=0?'current':age<=30?'days1To30':age<=60?'days31To60':age<=90?'days61To90':'daysOver90';
    buckets[bucket]+=invoice.balanceCents;
    if(!Number.isSafeInteger(buckets[bucket]))throw new Error('Invalid aging total');
  }
  const total=Object.values(buckets).reduce((a,b)=>a+b,0);
  if(!Number.isSafeInteger(total))throw new Error('Invalid aging total');
  return {...buckets,total};
}
