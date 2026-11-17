import { queueTemplatedSms } from './sms-template-queue.ts';

// Trusted server-side bridge, not an HTTP endpoint or a scheduled reminder.
// The caller supplies a DB-backed appointment resolver and service-role SMS client.
// Never use client-supplied contact, organization, or message values.
type Appointment = {
  id: string;
  organizationId: string;
  contactId: string;
  customerName: string;
  companyName: string;
  appointmentDate: string;
  appointmentTime: string;
  status: 'scheduled' | 'confirmed' | 'cancelled' | 'completed';
  reminderRevision: string;
};
type SmsClient = Parameters<typeof queueTemplatedSms>[0];
type AppointmentResolver = (appointmentId: string) => Promise<Appointment | null>;
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export async function queueAppointmentReminder(
  db: SmsClient,
  resolveAppointment: AppointmentResolver,
  appointmentId: string,
  expectedOrganizationId: string,
): Promise<string> {
  if (!uuid.test(appointmentId) || !uuid.test(expectedOrganizationId))
    throw new Error('Invalid appointment scope');
  // Resolve from authoritative storage immediately before enqueueing.
  const appointment = await resolveAppointment(appointmentId);
  if (!appointment || appointment.id !== appointmentId ||
      appointment.organizationId !== expectedOrganizationId ||
      !uuid.test(appointment.contactId))
    throw new Error('Appointment unavailable for dealer');
  if (appointment.status !== 'scheduled' && appointment.status !== 'confirmed')
    throw new Error('Appointment is not eligible for reminders');
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(appointment.reminderRevision))
    throw new Error('Invalid appointment reminder revision');
  for (const value of [
    appointment.customerName, appointment.companyName,
    appointment.appointmentDate, appointment.appointmentTime,
  ]) if (typeof value !== 'string' || !value.trim())
    throw new Error('Missing appointment reminder details');

  return queueTemplatedSms(db, {
    organizationId: appointment.organizationId,
    contactId: appointment.contactId,
    category: 'appointment_reminder',
    // The revision must change when a rescheduled reminder is intentionally reissued.
    eventKey: `appointment:${appointment.id}:reminder:${appointment.reminderRevision}`,
    values: {
      customer_name: appointment.customerName,
      company_name: appointment.companyName,
      appointment_date: appointment.appointmentDate,
      appointment_time: appointment.appointmentTime,
    },
  });
}
