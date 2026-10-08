interface LeadEmail {
  lead: Record<string, any>; leadUrl: string; isFishbowl: boolean; repName: string;
  companyName: string; companyLogoUrl?: string | null; officeName?: string; creatorName?: string; assignedName?: string;
}
const escape = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const label = (v: string) => v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
function safeUrl(value?: string | null) {
  try { const u = new URL(value || ''); return u.protocol === 'https:' && !u.username && !u.password ? u.toString() : ''; } catch { return ''; }
}
export function buildLeadUrl(appUrl: string | null | undefined, id: string, fishbowl: boolean): string {
  const safe = safeUrl(appUrl);
  if (!safe) throw new Error('Configure a valid HTTPS application URL in company settings.');
  const u = new URL(safe); u.search = ''; u.hash = '';
  u.searchParams.set('tab', fishbowl ? 'fishbowl' : 'leads'); u.searchParams.set('leadId', id);
  return u.toString();
}
export function renderLeadEmail(p: LeadEmail): { subject: string; html: string; text: string } {
  const l = p.lead;
  const title = p.isFishbowl ? 'WooHoo! A new lead is up for grabs!' : 'WooHoo! You got a new Lead!';
  const intro = p.isFishbowl ? 'A fresh opportunity just landed in the Fishbowl. Open it in MyJobView to review and claim it.' : 'A fresh opportunity just landed in your pipeline. Your next great project starts here.';
  const button = p.isFishbowl ? 'View & Claim Lead' : 'Open My Lead';
  const rows = [
    ['Contact', l.contact_name || 'Not provided'], ['Company', l.company_name || ''],
    ['Email', l.email || 'Not provided'], ['Phone', l.phone || 'Not provided'],
    ['Source', l.lead_source ? label(l.lead_source) : 'Not specified'], ['Status', label(l.status || 'unclaimed')],
    ['Office', p.officeName || ''], ['Assigned to', p.isFishbowl ? 'Fishbowl — available to claim' : p.assignedName || p.repName],
    ['Created by', p.creatorName || ''], ['Created', l.created_at ? new Date(l.created_at).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC') : ''],
  ].filter(([, v]) => Boolean(v));
  const details = rows.map(([k,v]) => `<tr><td style="padding:11px 0;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b;vertical-align:top;width:90px;">${escape(k)}</td><td style="padding:11px 0 11px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;font-weight:600;color:#0f172a;overflow-wrap:anywhere;">${escape(v)}</td></tr>`).join('');
  const logo = safeUrl(p.companyLogoUrl);
  const subject = `${p.isFishbowl ? 'WooHoo! New Fishbowl Lead' : title} — ${l.contact_name || 'New opportunity'}`.replace(/[\r\n]/g, ' ');
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;">${escape(l.contact_name)} — ${escape(intro)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
<tr><td align="center" style="padding:26px;background:#fff;border-radius:16px 16px 0 0;border-bottom:4px solid #dc2626;">${logo ? `<img src="${escape(logo)}" alt="${escape(p.companyName)}" width="200" style="display:block;max-width:200px;width:100%;height:auto;">` : `<strong style="color:#0f172a;font-size:24px;">${escape(p.companyName)}</strong>`}</td></tr>
<tr><td align="center" bgcolor="#163d7a" style="padding:32px 24px;background:#163d7a;">
<p style="margin:0 0 12px;color:#bfdbfe;font-size:11px;letter-spacing:2px;font-weight:700;">NEW OPPORTUNITY &nbsp; ✦ &nbsp; BIG POSSIBILITIES</p>
<p style="font-size:36px;margin:0 0 8px;">🎉</p><h1 style="margin:0;color:#fff;font-size:30px;line-height:1.2;">${title}</h1>
<p style="margin:16px 0 0;color:#dbeafe;font-size:15px;line-height:1.6;">${escape(intro)}</p></td></tr>
<tr><td style="background:#fff;padding:26px 24px;">
<p style="margin:0 0 18px;color:#334155;font-size:16px;">Hey ${escape(p.repName || 'team')}, let’s make it happen.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;">${details}</table>
<p style="margin:24px 0 8px;font-size:11px;letter-spacing:2px;color:#163d7a;font-weight:700;">THE OPPORTUNITY</p>
<div style="padding:16px;background:#f1f5f9;border-left:4px solid #dc2626;color:#334155;font-size:14px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere;">${escape(l.opportunity_description || 'No opportunity notes yet. Open the lead to add details.')}</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px auto;"><tr><td bgcolor="#dc2626" style="border-radius:8px;background:#dc2626;"><a href="${escape(p.leadUrl)}" style="display:inline-block;padding:17px 30px;color:#fff;text-decoration:none;font-size:16px;font-weight:700;">${button} &rarr;</a></td></tr></table>
<p style="margin:0;text-align:center;font-size:13px;line-height:1.6;color:#64748b;">Reach out, make a connection, and keep the momentum going.</p>
<p style="margin:20px 0 0;font-size:11px;line-height:1.6;color:#64748b;overflow-wrap:anywhere;">Button not working? Open this link:<br><a href="${escape(p.leadUrl)}" style="color:#163d7a;">${escape(p.leadUrl)}</a></p></td></tr>
<tr><td align="center" style="padding:22px;background:#f8fafc;border-top:1px solid #e2e8f0;border-radius:0 0 16px 16px;">
<img src="${escape(new URL('/MJV_icon.PNG', p.leadUrl).toString())}" alt="MyJobView" width="48" style="display:block;width:48px;height:auto;margin:0 auto 8px;"><p style="margin:0;color:#64748b;font-size:11px;">${escape(p.companyName)} · Powered by MyJobView</p>
<p style="margin:8px 0 0;color:#64748b;font-size:11px;">You received this internal alert because Lead Emails is enabled in your user settings.</p></td></tr>
</table></td></tr></table></body></html>`;
  const text = `${title}\n\nHey ${p.repName || 'team'},\n${intro}\n\n${rows.map(([k,v]) => `${k}: ${v}`).join('\n')}\n\nThe opportunity:\n${l.opportunity_description || 'No opportunity notes yet.'}\n\n${button}: ${p.leadUrl}\n\n${p.companyName} · Powered by MyJobView\nLead Emails is enabled in your user settings.`;
  return { subject, html, text };
}
