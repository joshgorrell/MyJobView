/** RingCentral voicemail classification policy, deliberately free of side effects.
 * No phone routing, database writes, or caller creation occur here.
 */
export type VoicemailDepartment = 'sales' | 'service' | 'projects' | 'security' | 'accounting' | 'administration';
export type VoicemailDecision =
  | { kind: 'junk'; notifyAdmin: false; retentionDays: 30 }
  | { kind: 'review'; notifyAdmin: true; reason: 'uncertain_spam' | 'uncertain_department' | 'classification_error' }
  | { kind: 'route'; notifyAdmin: false; department: VoicemailDepartment };

export interface VoicemailClassification {
  spamConfidence: number | null;
  department: VoicemailDepartment | null;
  departmentConfidence: number | null;
  failed?: boolean;
}

/** Conservative defaults. Thresholds must be validated on pilot data before enabling auto-routing. */
export function decideVoicemail(
  input: VoicemailClassification,
  thresholds: Readonly<{ junk: number; route: number }> = { junk: 0.98, route: 0.95 },
): VoicemailDecision {
  const valid = (n: number | null): n is number => n !== null && Number.isFinite(n) && n >= 0 && n <= 1;
  if (input.failed || !valid(input.spamConfidence) || !valid(input.departmentConfidence)) {
    return { kind: 'review', notifyAdmin: true, reason: 'classification_error' };
  }
  if (input.spamConfidence >= thresholds.junk) {
    return { kind: 'junk', notifyAdmin: false, retentionDays: 30 };
  }
  // Even moderate spam risk must not silently route or discard a real caller.
  if (input.spamConfidence > 0.20) {
    return { kind: 'review', notifyAdmin: true, reason: 'uncertain_spam' };
  }
  if (!input.department || input.departmentConfidence < thresholds.route) {
    return { kind: 'review', notifyAdmin: true, reason: 'uncertain_department' };
  }
  return { kind: 'route', notifyAdmin: false, department: input.department };
}

/** Account-scoped stable dedupe key. Tenant must be resolved from verified OAuth connection. */
export function voicemailDedupeKey(organizationId: string, ringcentralAccountId: string, messageId: string): string {
  if (![organizationId, ringcentralAccountId, messageId].every(value => value.trim().length > 0)) {
    throw new Error('Missing voicemail deduplication identity');
  }
  return JSON.stringify([organizationId, ringcentralAccountId, messageId]);
}
