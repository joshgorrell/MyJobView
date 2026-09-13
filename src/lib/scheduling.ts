import { supabase } from './supabase';
import { notifyTechJobAssigned, notifyTechJobReassigned } from './dispatchNotifications';

export interface ConflictInfo {
  hasConflict: boolean;
  conflictingEvents: { id: string; title: string; type: 'work_order' | 'appointment'; start_time: string; end_time: string }[];
}

export interface RescheduleResult {
  success: boolean;
  error?: string;
  conflict?: ConflictInfo;
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function formatTime12(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

export async function checkSchedulingConflicts(
  date: string,
  startTime: string,
  endTime: string,
  technicianId: string,
  excludeId?: string
): Promise<ConflictInfo> {
  const [aptRes, woRes] = await Promise.all([
    supabase
      .from('appointments')
      .select('id, title, start_time, end_time')
      .eq('appointment_date', date)
      .eq('assigned_technician', technicianId)
      .neq('status', 'cancelled'),
    supabase
      .from('work_orders')
      .select('id, title, scheduled_start_time, scheduled_end_time, estimated_hours')
      .eq('scheduled_date', date)
      .eq('assigned_to', technicianId)
      .not('status', 'in', '("completed","cancelled","archived")'),
  ]);

  if (aptRes.error) throw new Error(aptRes.error.message);
  if (woRes.error) throw new Error(woRes.error.message);

  const startMin = toMinutes(startTime);
  const endMin = toMinutes(endTime);
  const conflicting: ConflictInfo['conflictingEvents'] = [];

  for (const apt of aptRes.data || []) {
    if (excludeId && apt.id === excludeId) continue;
    const eStart = toMinutes(apt.start_time || '09:00');
    const eEnd = toMinutes(apt.end_time || '10:00');
    if (startMin < eEnd && endMin > eStart) {
      conflicting.push({ id: apt.id, title: apt.title, type: 'appointment', start_time: apt.start_time, end_time: apt.end_time });
    }
  }

  for (const wo of woRes.data || []) {
    if (excludeId && wo.id === excludeId) continue;
    const sTime = wo.scheduled_start_time || '08:00';
    let eTime = wo.scheduled_end_time;
    if (!eTime) {
      const hours = wo.estimated_hours || 2;
      const endM = toMinutes(sTime) + hours * 60;
      eTime = `${Math.floor(endM / 60).toString().padStart(2, '0')}:${(endM % 60).toString().padStart(2, '0')}`;
    }
    const eStart = toMinutes(sTime);
    const eEnd = toMinutes(eTime);
    if (startMin < eEnd && endMin > eStart) {
      conflicting.push({ id: wo.id, title: wo.title, type: 'work_order', start_time: sTime, end_time: eTime });
    }
  }

  return { hasConflict: conflicting.length > 0, conflictingEvents: conflicting };
}

export async function checkPtoConflict(
  technicianId: string,
  date: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('pto_requests')
    .select('id')
    .eq('employee_id', technicianId)
    .eq('status', 'approved')
    .lte('start_date', date)
    .gte('end_date', date)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return !!data;
}

export async function rescheduleWorkOrder(
  workOrderId: string,
  newDate: string,
  newStartTime: string,
  newEndTime: string,
  newTechId?: string,
  options?: { skipConflictCheck?: boolean; force?: boolean }
): Promise<RescheduleResult> {
  try {
    if (!options?.skipConflictCheck && !options?.force) {
      const conflict = await checkSchedulingConflicts(newDate, newStartTime, newEndTime, newTechId || '', workOrderId);
      if (conflict.hasConflict && !options?.force) {
        return { success: false, conflict };
      }
    }

    const updateData: Record<string, string> = {
      scheduled_date: newDate,
      scheduled_start_time: newStartTime,
      scheduled_end_time: newEndTime,
    };
    if (newTechId) {
      updateData.assigned_to = newTechId;
    }

    const { error } = await supabase
      .from('work_orders')
      .update(updateData)
      .eq('id', workOrderId);

    if (error) throw new Error(error.message);

    if (newTechId) {
      const { data: wo } = await supabase
        .from('work_orders')
        .select('work_order_number, title, assigned_to')
        .eq('id', workOrderId)
        .maybeSingle();

      if (wo) {
        await notifyTechJobReassigned(newTechId, {
          work_order_number: wo.work_order_number,
          title: wo.title,
          scheduled_date: newDate,
        });
      }
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to reschedule work order' };
  }
}

export async function rescheduleAppointment(
  appointmentId: string,
  newDate: string,
  newStartTime: string,
  newEndTime: string,
  newTechId?: string,
  options?: { skipConflictCheck?: boolean; force?: boolean }
): Promise<RescheduleResult> {
  try {
    if (!options?.skipConflictCheck && !options?.force) {
      const conflict = await checkSchedulingConflicts(newDate, newStartTime, newEndTime, newTechId || '', appointmentId);
      if (conflict.hasConflict && !options?.force) {
        return { success: false, conflict };
      }
    }

    const updateData: Record<string, string> = {
      appointment_date: newDate,
      start_time: newStartTime,
      end_time: newEndTime,
    };
    if (newTechId) {
      updateData.assigned_technician = newTechId;
    }

    const { error } = await supabase
      .from('appointments')
      .update(updateData)
      .eq('id', appointmentId);

    if (error) throw new Error(error.message);

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to reschedule appointment' };
  }
}

export async function scheduleUnscheduledWorkOrder(
  workOrderId: string,
  workOrderNumber: string,
  title: string,
  newDate: string,
  newStartTime: string,
  newEndTime: string,
  newTechId: string,
  customerName?: string,
  options?: { skipConflictCheck?: boolean; force?: boolean }
): Promise<RescheduleResult> {
  try {
    if (!options?.skipConflictCheck && !options?.force) {
      const conflict = await checkSchedulingConflicts(newDate, newStartTime, newEndTime, newTechId, workOrderId);
      if (conflict.hasConflict && !options?.force) {
        return { success: false, conflict };
      }
    }

    const { error } = await supabase
      .from('work_orders')
      .update({
        scheduled_date: newDate,
        scheduled_start_time: newStartTime,
        scheduled_end_time: newEndTime,
        status: 'scheduled',
        assigned_to: newTechId,
      })
      .eq('id', workOrderId);

    if (error) throw new Error(error.message);

    await notifyTechJobAssigned(newTechId, {
      work_order_number: workOrderNumber,
      title,
      customer_name: customerName,
      scheduled_date: newDate,
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to schedule work order' };
  }
}

export { formatTime12, toMinutes };
