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

/** Parse ordinary decimal currency input without rounding or exponent notation. */
export function parsePaymentCents(input: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!match) return null;
  const cents = BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
  return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : null;
}

/** A configured quote is not a collected fee. Only a matching actual gross can confirm it. */
export function confirmRecordedFee(principalCents: number | null, quotedFeeCents: number, grossInput: string): number | null {
  if (principalCents === null || !Number.isSafeInteger(principalCents) || principalCents <= 0
    || !Number.isSafeInteger(quotedFeeCents) || quotedFeeCents < 0
    || !Number.isSafeInteger(principalCents + quotedFeeCents)) return null;
  const gross = parsePaymentCents(grossInput);
  if (gross === principalCents) return 0;
  if (gross === principalCents + quotedFeeCents) return quotedFeeCents;
  return null;
}
