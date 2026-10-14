/** Shared, side-effect-free validation for manual intake drafts.
 * This does not create destination records or authorize routing.
 */
export type ManualIntakePurpose = 'service' | 'support' | 'task';

export type ManualIntakeDraft = {
  purpose: ManualIntakePurpose;
  organizationId: string | null | undefined;
  contactId: string;
  subject: string;
  description: string;
  priority: string;
  dueDate?: string;
  assignmentNotes?: string;
};

export type ValidatedManualIntakeDraft = {
  purpose: ManualIntakePurpose;
  organizationId: string;
  contactId: string;
  subject: string;
  description: string;
  priority: string;
  dueDate: string | null;
  assignmentNotes: string | null;
};

export function validateManualIntakeDraft(draft: ManualIntakeDraft):
  | { ok: true; value: ValidatedManualIntakeDraft }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const organizationId = draft.organizationId?.trim() ?? '';
  const contactId = draft.contactId.trim();
  const subject = draft.subject.trim();
  const description = draft.description.trim();
  const assignmentNotes = draft.assignmentNotes?.trim() || null;
  const dueDate = draft.purpose === 'task' ? draft.dueDate?.trim() || null : null;
  if (!['service', 'support', 'task'].includes(draft.purpose)) errors.push('Choose a valid intake purpose.');
  if (!organizationId) errors.push('Organization is required.');
  if (!contactId) errors.push('Select a customer.');
  if (!subject || subject.length > 200) errors.push('Subject must be 1–200 characters.');
  if (!description || description.length > 10000) errors.push('Details must be 1–10000 characters.');
  if (assignmentNotes && assignmentNotes.length > 1000) errors.push('Assignment notes must be at most 1000 characters.');
  if (dueDate && !isCalendarDate(dueDate)) errors.push('Enter a valid due date.');
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: {
    purpose: draft.purpose, organizationId, contactId, subject, description,
    priority: draft.priority, dueDate, assignmentNotes,
  } };
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00.000Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
