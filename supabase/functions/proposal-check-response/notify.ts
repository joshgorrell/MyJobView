import { sendSystemEmail } from '../_shared/system-email.ts';
import { proposalChoices, isProposalChoice } from '../_shared/proposalCheckOptions.ts';

const escape = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export async function notifyProposalMessage(db: any, email: any, eventId: string) {
  const { data: org, error: orgError } = await db.from('organizations').select('subdomain').eq('id', email.organization_id).single();
  if (orgError || !org) throw new Error('Could not resolve feedback organization.');
  const { data: settings, error: settingsError } = await db.from('company_settings')
    .select('company_name,company_email,from_email,from_name,app_url').eq('organization_id', email.organization_id).maybeSingle();
  if (settingsError || !settings) throw new Error('Could not resolve feedback sender.');
  // Electronic Life owner routing applies to both owner and sales email variants.
  const recipient = org.subdomain === 'elife' ? 'josh@electroniclife.com' : settings.company_email;
  const from = settings.from_email || settings.company_email;
  if (!recipient || !from) throw new Error('Configure feedback notification email delivery.');
  // Use the saved event, so retrying cannot change the contents of an existing alert.
  const { data: event, error: eventError } = await db.from('proposal_check_events')
    .select('choice,step,message,created_at').eq('id', eventId).eq('email_id', email.id)
    .eq('organization_id', email.organization_id).eq('kind', 'message').single();
  if (eventError || !event) throw new Error('Saved feedback could not load.');
  const choice = isProposalChoice(event.choice) ? proposalChoices[event.choice].label : event.choice;
  const base = settings.app_url || `https://${org.subdomain || 'app'}.myjobview.com`;
  const reportUrl = new URL(base);
  if (reportUrl.protocol !== 'https:') throw new Error('Configure a valid HTTPS application URL.');
  reportUrl.search = ''; reportUrl.hash = ''; reportUrl.searchParams.set('tab', 'reviews');
  reportUrl.searchParams.set('reviewType', 'proposal');
  reportUrl.searchParams.set('proposalCheckEmailId', email.id);
  reportUrl.searchParams.set('proposalCheckEventId', eventId);
  const subject = `Proposal check feedback — ${email.recipient_name}`.replace(/[\r\n]/g, ' ');
  const text = `New proposal check feedback\n\nCustomer: ${email.recipient_name}\nEmail: ${email.recipient_email}\nResponse: ${choice}\nNext step: ${event.step || 'Not selected'}\n\nMessage:\n${event.message || 'No written message provided.'}\n\nView customer response: ${reportUrl}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#111827;"><h1 style="color:#163d7a;font-size:26px;">New proposal check feedback</h1><p><strong>Customer:</strong> ${escape(email.recipient_name)}<br><strong>Email:</strong> ${escape(email.recipient_email)}<br><strong>Response:</strong> ${escape(choice)}<br><strong>Next step:</strong> ${escape(event.step || 'Not selected')}</p><div style="background:#f1f5f9;border-left:4px solid #dc2626;padding:20px;white-space:pre-wrap;">${escape(event.message || 'No written message provided.')}</div><p><a href="${escape(reportUrl.toString())}" style="display:inline-block;background:#163d7a;color:white;padding:14px 22px;border-radius:6px;text-decoration:none;">View customer response</a></p><p style="color:#64748b;font-size:12px;">${escape(settings.company_name || 'MyJobView')} · Customer feedback notification</p></div>`;
  const response = await sendSystemEmail({ method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `proposal-check-message-${eventId}` },
    body: JSON.stringify({ from: `${(settings.from_name || settings.company_name || 'MyJobView').replace(/[<>\r\n]/g, '')} <${from}>`, to: [recipient], reply_to: email.recipient_email, subject, text, html }),
  });
  if (!response.ok) throw new Error('Feedback saved, but email notification failed. Please retry.');
}
