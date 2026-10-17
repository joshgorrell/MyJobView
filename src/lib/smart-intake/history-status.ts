export type IntakeHistoryState =
  | 'not_found' | 'received' | 'processing_failed' | 'needs_information'
  | 'needs_review' | 'request_created' | 'dismissed';

export function describeIntakeHistory(state: IntakeHistoryState): string {
  switch (state) {
    case 'not_found': return 'No matching inbound message found. This does not prove the sender did not send it.';
    case 'received': return 'Message received by MJV; processing is not yet complete.';
    case 'processing_failed': return 'Message received, but automated processing failed.';
    case 'needs_information': return 'Message received; additional information is required.';
    case 'needs_review': return 'Message received; awaiting employee review.';
    case 'request_created': return 'Message received and linked to a service request.';
    case 'dismissed': return 'Message received and dismissed with an audit reason.';
  }
}
