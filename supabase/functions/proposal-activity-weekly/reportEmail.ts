export interface ActivityReportRow {
  proposal_id: string; proposal_number: string; title: string; customer: string;
  bucket: 'engaged' | 'unopened'; visits: number; last_viewed_at: string | null; active_seconds: number;
  sections: { key: string; label: string; seconds: number }[];
  clicks: Record<string, number>;
}
export interface WeeklyReport {
  id: string; organization_id: string; recipient_user_id: string; recipient_email: string; recipient_name: string;
  week_start: string; timezone: string; period_start: string; period_end: string;
  report_data: ActivityReportRow[]; email_payload: Record<string, unknown> | null; lease_token: string;
}
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const actions: Record<string, string> = { approval_clicked: 'Approval opened', payment_clicked: 'Payment clicked', question_clicked: 'Questions opened', download_clicked: 'Download clicked', change_request_clicked: 'Change request opened', decline_clicked: 'Decline opened', video_opened: 'Video opened', video_played: 'Video played' };
export function activityLink(base: string, proposalId: string) {
  const url = new URL(base);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Configure a secure application URL');
  url.pathname = '/'; url.search = ''; url.hash = '';
  url.searchParams.set('tab', 'proposals'); url.searchParams.set('proposalId', proposalId); url.searchParams.set('proposalActivity', 'true');
  return url.toString();
}
function duration(seconds: number) { return seconds >= 60 ? `${Math.floor(seconds / 60)}m${seconds % 60 ? ` ${seconds % 60}s` : ''}` : `${seconds}s`; }
export function prepareReportEmail(report: WeeklyReport, settings: Record<string, string | null>, subdomain: string | null) {
  const sender = settings.from_email || settings.company_email || '';
  if (!/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(sender) || sender.endsWith('@resend.dev')) throw new Error('Configure a verified report email sender');
  const base = settings.app_url || (subdomain && /^[a-z0-9-]+$/i.test(subdomain) ? `https://${subdomain}.myjobview.com` : 'https://myjobview.com');
  const date = (value: string, includeTime = false) => new Date(value).toLocaleString('en-US', { timeZone: report.timezone, month: 'short', day: 'numeric', ...(includeTime ? { hour: 'numeric', minute: '2-digit' } : {}) });
  const range = `${date(report.period_start)}–${date(new Date(Date.parse(report.period_end) - 1).toISOString())}`;
  const engaged = report.report_data.filter(row => row.bucket === 'engaged');
  const unopened = report.report_data.filter(row => row.bucket === 'unopened');
  const text: string[] = [`Hello ${report.recipient_name || 'there'},`, '', `Your proposal Activity for ${range} (${report.timezone}).`, `${engaged.length} engaged proposal${engaged.length === 1 ? '' : 's'}; ${unopened.length} sent proposal${unopened.length === 1 ? '' : 's'} not yet opened.`, ''];
  const render = (rows: ActivityReportRow[], title: string) => {
    if (!rows.length) return '';
    text.push(title);
    const items = rows.map(row => {
      const link = activityLink(base, row.proposal_id);
      const clicks = Object.entries(row.clicks || {}).filter(([key, count]) => actions[key] && count > 0).map(([key, count]) => `${actions[key]} (${count})`).join(' · ');
      const detail = row.bucket === 'engaged'
        ? `${row.visits} visit${row.visits === 1 ? '' : 's'} · ${row.active_seconds > 0 ? `${duration(row.active_seconds)} approximate active viewing` : 'Active viewing time not reported'}${row.last_viewed_at ? ` · Last visit: ${date(row.last_viewed_at, true)}` : ''}${row.sections[0] ? ` · Most viewed: ${row.sections[0].label}` : ''}`
        : 'Sent; no recorded opens.';
      text.push(`${row.customer} — ${row.proposal_number}: ${row.title || 'Proposal'}`, detail, ...(clicks ? [clicks] : []), `View Activity: ${link}`, '');
      return `<tr><td style="padding:14px 0;border-bottom:1px solid #e2e8f0"><strong>${escape(row.customer)}</strong><br>${escape(row.proposal_number)} — ${escape(row.title || 'Proposal')}<br><span style="color:#475569;font-size:13px">${escape(detail)}</span>${clicks ? `<br><span style="color:#475569;font-size:13px">${escape(clicks)}</span>` : ''}<br><a href="${escape(link)}" style="display:inline-block;margin-top:8px;color:#2563eb;font-weight:600">View Activity</a></td></tr>`;
    }).join('');
    return `<h2 style="font-size:17px;margin:24px 0 4px">${escape(title)}</h2><table role="presentation" style="width:100%;border-collapse:collapse">${items}</table>`;
  };
  const content = render(engaged, 'Engaged proposals') + render(unopened, 'Sent but not opened');
  const note = 'Visits are separate sessions, not unique people. Active time is approximate for visits started during the report week. Clicks do not mean an approval or payment was completed. Open Activity for the full history.';
  text.push(note);
  return {
    from: `${(settings.from_name || settings.company_name || 'MyJobView').replace(/[<>\r\n]/g, '')} <${sender}>`,
    to: [report.recipient_email], reply_to: settings.reply_to_email || settings.company_email || sender,
    subject: `Weekly Proposal Activity — ${range}`,
    text: text.join('\n'),
    html: `<div style="background:#f1f5f9;padding:24px;font-family:Arial,sans-serif;color:#0f172a"><div style="max-width:680px;margin:auto;background:#fff;padding:24px;border-radius:12px"><div style="font-size:12px;font-weight:700;color:#2563eb">MYJOBVIEW</div><h1 style="font-size:24px;margin:12px 0">Weekly Proposal Activity</h1><p>Hello ${escape(report.recipient_name || 'there')},</p><p>${escape(range)} · ${escape(report.timezone)}</p><p>${engaged.length} engaged proposals · ${unopened.length} sent but not opened</p>${content}<p style="font-size:12px;color:#64748b;margin-top:24px">${escape(note)}</p></div></div>`,
  };
}
