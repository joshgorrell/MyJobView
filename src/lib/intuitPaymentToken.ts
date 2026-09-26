/**
 * Send payment credentials straight from the browser to Intuit. Never send or
 * log card/bank details through an MJV endpoint. The returned single-use token
 * is the only payment credential the MJV charge endpoint may receive.
 */
export type CardTokenInput = {
  name: string;
  number: string;
  expMonth: string;
  expYear: string;
  cvc: string;
  address: { streetAddress: string; city: string; region: string; postalCode: string; country: 'US' };
};

export type BankTokenInput = {
  name: string;
  routingNumber: string;
  accountNumber: string;
  accountType: 'PERSONAL_CHECKING' | 'PERSONAL_SAVINGS' | 'BUSINESS_CHECKING' | 'BUSINESS_SAVINGS';
  phone: string;
};

export async function tokenizeIntuitPayment(
  payment: { card: CardTokenInput } | { bankAccount: BankTokenInput },
  environment: 'sandbox' | 'production',
): Promise<string> {
  const host = environment === 'production' ? 'https://api.intuit.com' : 'https://sandbox.api.intuit.com';
  const response = await fetch(`${host}/quickbooks/v4/payments/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Request-Id': crypto.randomUUID() },
    body: JSON.stringify(payment),
  });
  // Do not surface the provider response body: it can contain payment details.
  if (!response.ok) throw new Error('Payment details could not be verified. Please check them and try again.');
  const result: unknown = await response.json();
  if (!result || typeof result !== 'object' || !('value' in result) ||
      typeof result.value !== 'string' || result.value.length === 0) {
    throw new Error('Payment details could not be verified. Please try again.');
  }
  return result.value;
}
