import { supabase } from './supabase';
import { getEmployeeTimeContext, workDate } from './EmployeeTimeContext';
import { locationTrackingService } from './LocationTrackingService';

export type InternalTimeType = 'shop_time' | 'training';
export interface InternalTimeActor { id: string; organization_id: string | null }
export interface InternalSession {
  id: string;
  organization_id: string;
  assigned_to: string;
  session_type: InternalTimeType;
  title: string;
  description: string | null;
  session_date: string;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  predetermined_hours: number | null;
  denial_reason: string | null;
  employee_started: boolean;
}
export interface ActivityEntry {
  id: string;
  internal_session_id: string | null;
  entry_type: string;
  clock_in: string;
  clock_out: string | null;
  total_hours: number;
  status: string;
}
const entryColumns = 'id, internal_session_id, entry_type, clock_in, clock_out, total_hours, status';

function organization(actor: InternalTimeActor): string {
  if (!actor.organization_id) throw new Error('Your account needs an organization before recording internal time.');
  return actor.organization_id;
}
function checked<T extends { error: any; data: any }>(result: T): T['data'] {
  if (result.error) throw result.error;
  return result.data;
}
export async function activeActivity(actor: InternalTimeActor): Promise<ActivityEntry | null> {
  return checked(await supabase.from('time_entries').select(entryColumns)
    .eq('organization_id', organization(actor)).eq('technician_id', actor.id)
    .is('clock_out', null).in('status', ['draft', 'submitted']).limit(1).maybeSingle());
}
export async function assertNoInternalTimer(actor: InternalTimeActor) {
  const entry = await activeActivity(actor);
  if (entry?.internal_session_id) throw new Error('Stop Shop Time or Training before taking a break or clocking out for the day.');
  // Job timers use the same time_entries table but have no internal_session_id.
  // A payroll clock-out must not leave an active job timer running.
  if (entry) throw new Error('Stop your active job timer before taking a break or clocking out for the day.');
}
async function sessionFor(actor: InternalTimeActor, id: string): Promise<InternalSession> {
  const session = checked(await supabase.from('internal_time_sessions').select('*')
    .eq('organization_id', organization(actor)).eq('assigned_to', actor.id).eq('id', id).single());
  if (!session || !['shop_time', 'training'].includes(session.session_type)) throw new Error('Assigned session not found.');
  return session;
}
async function clockEvidence(clockOut: boolean, attemptedAt: string) {
  const location = await locationTrackingService.captureHighAccuracyLocation().catch(() => null);
  const prefix = clockOut ? 'clock_out' : 'clock_in';
  return {
    [prefix + '_gps_attempted_at']: attemptedAt,
    [prefix + '_gps_capture_method']: location ? ((location.coords as any).method === 'cached' ? 'cached' : 'high_accuracy') : 'failed',
    [prefix + '_latitude']: location?.coords.latitude ?? null,
    [prefix + '_longitude']: location?.coords.longitude ?? null,
    [prefix + '_gps_accuracy']: location?.coords.accuracy ?? null,
    [prefix + '_gps_captured_at']: location ? new Date(location.timestamp).toISOString() : null,
    [prefix + '_gps_duration_ms']: location ? (location.coords as any).duration_ms || 0 : Date.now() - Date.parse(attemptedAt),
  };
}
export async function loadInternalTime(actor: InternalTimeActor) {
  const context = await getEmployeeTimeContext(actor.id);
  const day = workDate(new Date(), context.timezone);
  const active = await activeActivity(actor);
  // Keep an overnight or partially saved start reachable even after its calendar day changes.
  const include = ['session_date.eq.' + day, 'status.eq.in_progress'];
  if (active?.internal_session_id) include.push('id.eq.' + active.internal_session_id);
  const sessions: InternalSession[] = checked(await supabase.from('internal_time_sessions').select('*')
    .eq('organization_id', organization(actor)).eq('assigned_to', actor.id)
    .or(include.join(',')).in('status', ['scheduled', 'in_progress', 'pending_approval', 'denied', 'completed'])
    .order('session_date').order('created_at')) || [];
  const entries: ActivityEntry[] = sessions.length ? checked(await supabase.from('time_entries').select(entryColumns)
    .eq('organization_id', organization(actor)).eq('technician_id', actor.id)
    .in('internal_session_id', sessions.map(s => s.id))) || [] : [];
  return { sessions, entries, active };
}
/** The server atomically creates the session and draft entry. Approval happens after work is recorded. */
export async function startNewInternalTime(actor: InternalTimeActor, type: InternalTimeType, notes: string, sessionId: string) {
  organization(actor);
  if (!['shop_time', 'training'].includes(type)) throw new Error('Choose Shop Time or Training.');
  const evidence = await clockEvidence(false, new Date().toISOString());
  const id = checked(await supabase.rpc('start_internal_time', {
    p_session_id: sessionId, p_session_type: type, p_reason: notes.trim() || null, p_evidence: evidence,
  }));
  if (!id) throw new Error('Timer start was not confirmed. Refresh before retrying.');
  return id as string;
}
export async function startInternalTime(actor: InternalTimeActor, sessionId: string) {
  const session = await sessionFor(actor, sessionId);
  return startNewInternalTime(actor, session.session_type, '', session.id);
}
export async function stopInternalTime(actor: InternalTimeActor, sessionId: string, notes: string) {
  organization(actor);
  const evidence = await clockEvidence(true, new Date().toISOString());
  const id = checked(await supabase.rpc('stop_internal_time', {
    p_session_id: sessionId, p_notes: notes.trim() || null, p_evidence: evidence,
  }));
  if (!id) throw new Error('Timer stop was not confirmed. Refresh before retrying.');
}
