// Read-only adapter for a trusted, server-side appointment reminder scheduler.
// Does not queue or send SMS. All fields are loaded from work_orders and its dealer.
type WorkOrderRow = {
  id: string; organization_id: string; contact_id: string | null;
  status: string; start_date: string | null; start_time: string | null;
  scheduled_start_time: string | null; send_appointment_reminder: boolean;
  reminder_sms: boolean; reminder_sent_at: string | null;
  contacts: { full_name: string | null } | null;
  organizations: { name: string | null } | null;
};
type WorkOrderDb = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (field: string, value: string) => {
        eq: (field: string, value: string) => {
          maybeSingle: () => Promise<{ data: WorkOrderRow | null; error: unknown }>;
        };
      };
    };
  };
};
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export async function resolveWorkOrderSmsAppointment(
  db: WorkOrderDb,
  workOrderId: string,
  organizationId: string,
) {
  if (!uuid.test(workOrderId) || !uuid.test(organizationId)) throw new Error('Invalid work order scope');
  const { data: row, error } = await db.from('work_orders')
    .select('id,organization_id,contact_id,status,start_date,start_time,scheduled_start_time,send_appointment_reminder,reminder_sms,reminder_sent_at,contacts(full_name),organizations(name)')
    .eq('id', workOrderId).eq('organization_id', organizationId).maybeSingle();
  if (error || !row || row.id !== workOrderId || row.organization_id !== organizationId)
    throw new Error('Work order unavailable for dealer');
  if (!row.send_appointment_reminder || !row.reminder_sms || row.reminder_sent_at ||
      !['scheduled', 'confirmed'].includes(row.status))
    throw new Error('Work order SMS reminder not eligible');
  if (!row.contact_id || !uuid.test(row.contact_id) || !row.start_date ||
      !/^\\d{4}-\\d{2}-\\d{2}$/.test(row.start_date) ||
      !row.contacts?.full_name?.trim() || !row.organizations?.name?.trim())
    throw new Error('Incomplete work order SMS reminder');
  const time = row.scheduled_start_time || row.start_time;
  if (!time || !/^\\d{1,2}:\\d{2}(?::\\d{2})?$/.test(time))
    throw new Error('Work order appointment time required');
  // A stable revision derived from the appointment date/time changes on rescheduling.
  const reminderRevision = (row.start_date + '_' + time).replace(/[^a-zA-Z0-9_-]/g, '_');
  return {
    id: row.id, organizationId: row.organization_id, contactId: row.contact_id,
    customerName: row.contacts.full_name.trim(), companyName: row.organizations.name.trim(),
    appointmentDate: row.start_date, appointmentTime: time,
    status: row.status as 'scheduled' | 'confirmed', reminderRevision,
  };
}
