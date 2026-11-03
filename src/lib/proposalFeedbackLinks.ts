interface ProposalFeedbackTarget { emailId: string; eventId?: string; receivedAt?: string }

export function proposalFeedbackUrl({ emailId, eventId, receivedAt }: ProposalFeedbackTarget) {
  const params = new URLSearchParams({ tab: 'reviews', reviewType: 'proposal', proposalCheckEmailId: emailId });
  if (eventId) params.set('proposalCheckEventId', eventId);
  else if (receivedAt) params.set('proposalCheckReceivedAt', receivedAt);
  return `/?${params}`;
}
