import { renderSmsTemplate, type SmsTemplateCategory } from './sms-template-render.ts';

// Server-only adapter; not exposed as an HTTP endpoint or scheduled job.
// The trusted event handler must verify tenant ownership and event authenticity first.
// enqueue_sms_dispatch independently checks dealer flags, contact consent and suppression.
type SmsDatabase = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          maybeSingle: () => Promise<{ data: { body: string } | null; error: unknown }>;
        };
      };
    };
  };
  rpc: (name: string, args: Record<string, string>) =>
    Promise<{ data: string | null; error: unknown }>;
};

export async function queueTemplatedSms(
  db: SmsDatabase,
  event: {
    organizationId: string;
    contactId: string;
    category: SmsTemplateCategory;
    eventKey: string;
    values: Record<string, string>;
  },
): Promise<string> {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(event.organizationId) ||
      !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(event.contactId) ||
      !event.eventKey || event.eventKey.length > 255)
    throw new Error('Invalid SMS event identity');
  const { data: template, error: lookupError } = await db.from('sms_message_templates')
    .select('body')
    .eq('organization_id', event.organizationId)
    .eq('category', event.category)
    .maybeSingle();
  if (lookupError) throw new Error('Could not load dealer SMS template');
  // No fallback to another dealer or global template: fail closed until configured.
  if (!template) throw new Error('Dealer SMS template not configured');
  const body = renderSmsTemplate(event.category, template.body, event.values);
  const { data: dispatchId, error: enqueueError } = await db.rpc('enqueue_sms_dispatch', {
    p_organization_id: event.organizationId,
    p_contact_id: event.contactId,
    p_category: event.category,
    p_event_key: event.eventKey,
    p_body: body,
  });
  if (enqueueError || !dispatchId) throw new Error('SMS queue rejected event');
  return dispatchId;
}
