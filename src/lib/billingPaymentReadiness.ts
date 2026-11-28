// Diagnostic only: provider configuration is not proof of merchant capability.
export type BillingPaymentMethod = 'credit_card'|'debit_card'|'ach'|'apple_pay'|'google_pay';
export interface PaymentCapabilityEvidence {
  method: BillingPaymentMethod;
  supported: boolean;
  merchantEnabled: boolean;
  deviceAvailable: boolean;
  feeEligibility: 'verified-eligible'|'verified-ineligible'|'unknown';
}
export function previewPaymentReadiness(connection: {connected:boolean;environment:string;paymentsEnabled:boolean}, methods: readonly PaymentCapabilityEvidence[], feeEnabled:boolean) {
  const seen=new Set<string>();
  return methods.map(method=>{
    if(seen.has(method.method))throw new Error('Duplicate payment method');
    seen.add(method.method);
    const reason=!connection.connected||!connection.paymentsEnabled?'connection-unavailable':
      connection.environment!=='production'?'not-live':
      !method.supported||!method.merchantEnabled||!method.deviceAvailable?'method-unavailable':
      feeEnabled&&method.feeEligibility==='unknown'?'fee-unverified':'review-ready';
    return {...method,reason,chargeAuthorized:false as const};
  });
}
