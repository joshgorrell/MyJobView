interface ProposalState {
  status?: string;
  is_locked?: boolean;
  is_portal_visible?: boolean;
  is_active_revision?: boolean;
}

// Publishing, approval status, and the editing lock are separate states.
export function proposalPresentation(proposal?: ProposalState | null) {
  const status = proposal?.status || 'designing';
  const published = !!(proposal?.is_portal_visible && proposal?.is_active_revision);
  let portalLabel = 'Not on customer portal';
  if (published) {
    if (status === 'expired') portalLabel = 'Expired — customer approval closed';
    else if (status === 'declined') portalLabel = 'Declined — customer approval closed';
    else if (status === 'approved') portalLabel = 'Approved — on customer portal';
    else if (status === 'approved_pending_action') portalLabel = 'Accepted — billing action pending';
    else if (!proposal?.is_locked) portalLabel = 'Editing — changes not published';
    else portalLabel = 'On customer portal';
  }
  return { status, locked: !!proposal?.is_locked, expired: status === 'expired', portalLabel };
}
