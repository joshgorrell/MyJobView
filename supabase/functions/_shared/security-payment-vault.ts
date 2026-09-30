// Intuit Payments SDK endpoints: Cards/BankAccounts createFromToken and customer lists.
// Accept only short-lived processor tokens. PAN/CVV/account numbers never reach this API.
export function paymentsOrigin(environment: string): string {
  return environment === 'production' ? 'https://api.intuit.com' : 'https://sandbox.api.intuit.com';
}

export function paymentCollection(type: 'card' | 'ach'): string {
  return type === 'card' ? 'cards' : 'bank-accounts';
}

export function maskedPayment(method: Record<string, unknown>, type: 'card' | 'ach') {
  const number = String(type === 'card' ? method.number || '' : method.accountNumber || '');
  return {
    qbo_method_id: String(method.id || ''), payment_type: type,
    display_brand: String(type === 'card' ? method.cardType || 'Card' : method.bankName || 'Bank account').slice(0,80),
    display_last4: number.replace(/\D/g,'').slice(-4),
    exp_month: type === 'card' ? Number(method.expMonth) || null : null,
    exp_year: type === 'card' ? Number(method.expYear) || null : null,
  };
}

export async function vaultRequest(origin: string, accessToken: string, customerId: string,
  type: 'card' | 'ach', tokenValue?: string, methodId?: string, fetcher: typeof fetch = fetch) {
  const path = `/quickbooks/v4/customers/${encodeURIComponent(customerId)}/${paymentCollection(type)}`
    + (tokenValue ? '/createFromToken' : methodId ? '/' + encodeURIComponent(methodId) : '');
  const response = await fetcher(origin + path, {
    method: tokenValue ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json',
      'Content-Type': 'application/json', 'Request-Id': crypto.randomUUID() },
    body: tokenValue ? JSON.stringify({ value: tokenValue }) : undefined,
  });
  if (!response.ok) {
    // Never expose or log processor bodies: they may echo sensitive payment data.
    throw new Error(response.status === 401 || response.status === 403
      ? 'QuickBooks Payments access is unavailable. Ask your provider to reconnect QuickBooks with Payments access.'
      : 'QuickBooks could not verify the payment method. Please try again or contact your provider.');
  }
  return response.json();
}
