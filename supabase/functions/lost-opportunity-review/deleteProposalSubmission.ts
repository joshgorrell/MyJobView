export async function deleteProposalSubmission(reader: any, writer: any, profile: any, eventId: unknown) {
  if (!['admin', 'owner', 'super_admin'].includes(profile.role)) return { status: 403, body: { error: 'Only administrators can delete proposal check submissions.' } };
  if (typeof eventId !== 'string' || !/^[0-9a-f-]{36}$/.test(eventId)) return { status: 400, body: { error: 'Choose a submission to delete.' } };
  const { data: event, error } = await reader.from('proposal_check_events').select('id,email_id')
    .eq('id', eventId).eq('organization_id', profile.organization_id).eq('kind', 'message').maybeSingle();
  if (error) throw error;
  if (!event) return { status: 404, body: { error: 'Submission not found.' } };
  const { data: deleted, error: deleteError } = await writer.from('proposal_check_events').delete()
    .eq('id', event.id).eq('email_id', event.email_id).eq('organization_id', profile.organization_id)
    .eq('kind', 'message').select('id').maybeSingle();
  if (deleteError) throw deleteError;
  if (!deleted) return { status: 404, body: { error: 'Submission was already deleted.' } };
  return { status: 200, body: { success: true } };
}

export async function deleteProposalEmail(reader: any, writer: any, profile: any, emailId: unknown) {
  if (!['admin', 'owner', 'super_admin'].includes(profile.role)) return { status: 403, body: { error: 'Only administrators can delete proposal check records.' } };
  if (typeof emailId !== 'string' || !/^[0-9a-f-]{36}$/.test(emailId)) return { status: 400, body: { error: 'Choose an email record to delete.' } };
  const { data: email, error } = await reader.from('proposal_check_emails').select('id')
    .eq('id', emailId).eq('organization_id', profile.organization_id).maybeSingle();
  if (error) throw error;
  if (!email) return { status: 404, body: { error: 'Email record not found.' } };
  const { data: deleted, error: deleteError } = await writer.from('proposal_check_emails').delete()
    .eq('id', email.id).eq('organization_id', profile.organization_id).select('id').maybeSingle();
  if (deleteError) throw deleteError;
  return deleted ? { status: 200, body: { success: true } } : { status: 404, body: { error: 'Email record was already deleted.' } };
}
