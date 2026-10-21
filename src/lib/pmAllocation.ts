// The PM allowance is included in quoted labor, not added on top.
export function splitQuotedLabor(quotedHours: number, pmPercentage = 5) {
 if (!Number.isFinite(quotedHours) || quotedHours < 0 || !Number.isFinite(pmPercentage) || pmPercentage < 0 || pmPercentage > 50) throw new Error('Invalid quoted labor or PM allocation');
 const pmHours = quotedHours * pmPercentage / 100;
 return {quotedHours, pmHours, fieldHours: quotedHours - pmHours, pmPercentage};
}
