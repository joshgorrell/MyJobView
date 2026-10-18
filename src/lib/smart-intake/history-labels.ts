export function intakeAuditExplanation(status: string, classification: string, hasServiceRequest: boolean): string {
  if (hasServiceRequest) return 'A service request was created and linked to this intake.';
  if (status === 'failed_retryable') return 'The message arrived, but automated processing failed. Staff review or retry is required.';
  if (status === 'awaiting_customer') return 'The message arrived; MJV is waiting for customer information.';
  if (status === 'awaiting_employee' || status === 'needs_review') return 'The message arrived and needs employee review.';
  if (status === 'dismissed') return 'The message was dismissed. Review its audit events for the reason.';
  if (status === 'received' || status === 'analyzing') return 'The message arrived and is awaiting processing.';
  if (classification === 'other') return 'The message was classified as something other than a service or sales request.';
  return 'No linked service request. Inspect the timeline to determine why.';
}
