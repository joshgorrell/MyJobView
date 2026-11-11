/** Explicit voicemail ACL. Department names are not interchangeable with MJV navigation departments. */
export const PHONE_DEPARTMENTS = [
  'sales', 'service', 'projects', 'security', 'accounting', 'administration',
] as const;
export type PhoneDepartment = typeof PHONE_DEPARTMENTS[number];
export function permittedVoicemailDepartments(
  role: string | null, grants: readonly string[],
): PhoneDepartment[] {
  if (role === 'admin') return [...PHONE_DEPARTMENTS];
  return PHONE_DEPARTMENTS.filter(d => grants.includes(d));
}
export function canReadVoicemail(
  role: string | null, grants: readonly string[], department: string | null,
  state: string,
): boolean {
  if (state !== 'ready' && state !== 'review') return false;
  if (role === 'admin') return true;
  // Unclassified review messages stay in the admin review queue.
  return department !== null && permittedVoicemailDepartments(role, grants).includes(department as PhoneDepartment);
}
