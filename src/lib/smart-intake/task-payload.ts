import type { ValidatedManualIntakeDraft } from './manual-draft';

/** Maps a validated intake task to the existing MJV tasks model.
 * This function has no database side effects; the caller must enforce authorization,
 * use the canonical task creation workflow, and record intake lineage.
 */
export function toTaskDraft(draft: ValidatedManualIntakeDraft) {
  if (draft.purpose !== 'task') throw new Error('Only task intake can become a task draft.');
  if (!draft.organizationId || !draft.contactId) throw new Error('Task intake requires organization and customer context.');
  const description = [draft.description, draft.assignmentNotes].filter(Boolean).join('\n\n');
  return {
    title: draft.subject,
    description,
    contact_id: draft.contactId,
    assigned_to: draft.assigneeId,
    due_date: draft.dueDate,
    priority: draft.priority === 'normal' ? 'medium' : draft.priority,
    status: 'pending' as const,
  };
}
