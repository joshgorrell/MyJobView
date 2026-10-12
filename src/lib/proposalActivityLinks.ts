export function proposalActivityPath(proposalId: string) {
  const query = new URLSearchParams({ proposalId, proposalActivity: 'true' });
  return `/proposals?${query}`;
}
export function linkedProposalActivity(search: string): string | null {
  const params = new URLSearchParams(search);
  if (params.get('proposalActivity') !== 'true') return null;
  const id = params.get('proposalId') || params.get('id');
  return id && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id) ? id : null;
}
