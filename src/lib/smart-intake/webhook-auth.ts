/** Fail closed: a missing webhook secret never makes ingestion public. */
export function validateSharedWebhookSecret(
  expected: string | undefined,
  provided: string | null,
): boolean {
  if (!expected || !provided) return false;
  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(provided);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}
