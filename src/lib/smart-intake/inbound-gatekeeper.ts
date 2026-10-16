/** Customer identity gate for external inbound messages only.
 * Manual entry requires an explicit existing or newly created customer and
 * must not be sent through this gate.
 */
export type InboundChannel = 'email' | 'sms' | 'mms';
export type CustomerCandidate = { id: string };
export type InboundCustomerDecision =
  | { status: 'matched'; contactId: string }
  | { status: 'needs_review'; reason: 'no_match' | 'ambiguous_match' };

export function decideInboundCustomer(
  channel: InboundChannel,
  candidates: readonly CustomerCandidate[],
): InboundCustomerDecision {
  if (!['email', 'sms', 'mms'].includes(channel)) throw new Error('Gatekeeper is only for external inbound messages.');
  const uniqueIds = new Set(candidates.map(candidate => candidate.id).filter(Boolean));
  if (uniqueIds.size === 1) return { status: 'matched', contactId: [...uniqueIds][0] };
  return { status: 'needs_review', reason: uniqueIds.size === 0 ? 'no_match' : 'ambiguous_match' };
}
