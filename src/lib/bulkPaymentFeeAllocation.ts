// Calculation only; no ledger mutations or payment authorization.
export function allocateRecordedFee(principalCents: readonly number[], feeCents: number): number[] {
  if (!principalCents.length || principalCents.some(n=>!Number.isSafeInteger(n)||n<=0) || !Number.isSafeInteger(feeCents)||feeCents<0) throw new Error('Invalid allocation');
  const total=principalCents.reduce((a,b)=>a+b,0);
  if(!Number.isSafeInteger(total)||!Number.isSafeInteger(total+feeCents))throw new Error('Invalid total');
  const denominator=BigInt(total);
  const parts=principalCents.map((n,index)=>{
    const product=BigInt(n)*BigInt(feeCents);
    return {index,fee:Number(product/denominator),remainder:product%denominator};
  });
  const remaining=feeCents-parts.reduce((sum,p)=>sum+p.fee,0);
  const ranked=[...parts].sort((a,b)=>a.remainder===b.remainder?a.index-b.index:a.remainder>b.remainder?-1:1);
  for(let i=0;i<remaining;i++)ranked[i].fee++;
  return parts.map(p=>p.fee);
}
