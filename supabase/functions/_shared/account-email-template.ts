export interface AccountEmailTemplate {
  kind: 'welcome' | 'reset';
  companyName: string;
  companyLogoUrl?: string | null;
  fullName: string;
  email: string;
  actionUrl: string;
  loginUrl: string;
  supportEmail?: string | null;
  mjvLogoUrl?: string | null;
}
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function renderAccountEmail(p: AccountEmailTemplate): { html: string; text: string } {
  const welcome = p.kind === 'welcome';
  const title = welcome ? 'Welcome to your team’s workspace.' : 'Let’s reset your password.';
  const button = welcome ? 'Set Up My Account' : 'Reset My Password';
  const introduction = welcome
    ? `${p.companyName} uses MyJobView to keep projects, tasks, schedules, and team communication in one place. Your account is ready—choose your password to get started.`
    : 'Use the secure button below to choose a new password for your MyJobView account.';
  let logo = '';
  try {
    const url = new URL(p.companyLogoUrl || '');
    if (url.protocol === 'https:' && !url.username && !url.password) logo = url.toString();
  } catch { /* A dealer without a logo gets its company name, never another dealer's logo. */ }
  const brand = logo
    ? `<img src="${escape(logo)}" alt="${escape(p.companyName)}" width="220" style="display:block;max-width:220px;width:100%;height:auto;margin:0 auto;border:0;" />`
    : `<p style="margin:0;color:#ffffff;font-size:26px;font-weight:700;">${escape(p.companyName)}</p>`;
  const steps = welcome ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 0;"><tr><td style="border-top:1px solid #e2e8f0;padding-top:22px;"><p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#0f172a;">Getting started is simple</p><p style="margin:0;font-size:14px;line-height:1.8;color:#475569;">1. Choose your password.<br>2. Sign in with the email above.<br>3. Open the tools your team has enabled for you.</p></td></tr></table>` : '';
  const support = p.supportEmail
    ? `<p style="margin:0 0 12px;font-size:13px;line-height:1.7;color:#475569;">Need a hand? Reply to this email or contact<br><a href="mailto:${escape(p.supportEmail)}" style="color:#163d7a;text-decoration:underline;">${escape(p.supportEmail)}</a>.</p>`
    : `<p style="margin:0 0 12px;font-size:13px;color:#475569;">Need a hand? Contact your team’s administrator.</p>`;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(button)} — ${escape(p.companyName)}</title></head>
<body style="margin:0;padding:0;background:#eef2f6;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escape(welcome ? `Your ${p.companyName} account is ready. Choose your password and get started.` : 'A secure link to reset your MyJobView password.')}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f6;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;">
<tr><td align="center" style="background:#111827;padding:30px 28px;border-radius:14px 14px 0 0;border-bottom:4px solid #0e7490;">${brand}<p style="margin:18px 0 0;font-size:11px;line-height:1.6;letter-spacing:2px;color:#cbd5e1;">YOUR TEAM. ONE WORKSPACE.</p></td></tr>
<tr><td style="background:#ffffff;padding:30px 26px;">
<p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:1px;color:#0e7490;">${welcome ? 'WELCOME TO MYJOBVIEW' : 'MYJOBVIEW ACCOUNT SUPPORT'}</p>
<h1 style="margin:0 0 22px;font-size:28px;line-height:1.25;letter-spacing:-0.5px;color:#0f172a;">${title}</h1>
<p style="margin:0 0 12px;font-size:16px;line-height:1.7;color:#334155;">Hello ${escape(p.fullName)},</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#475569;">${escape(introduction)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;padding:16px;"><p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:1px;color:#64748b;">YOUR LOGIN EMAIL</p><p style="margin:0;font-size:15px;font-weight:700;color:#0f172a;word-break:break-all;">${escape(p.email)}</p></td></tr></table>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 18px;"><tr><td bgcolor="#163d7a" style="background:#163d7a;border-radius:7px;text-align:center;"><a href="${escape(p.actionUrl)}" style="display:inline-block;padding:16px 28px;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none;">${button}</a></td></tr></table>
<p style="margin:0;font-size:12px;line-height:1.7;color:#64748b;">This secure link can be used once and expires. If you need a fresh link, ask your administrator to send a new email.</p>
${steps}
<p style="margin:24px 0 0;font-size:12px;line-height:1.7;color:#64748b;">Button not working? <a href="${escape(p.actionUrl)}" style="color:#163d7a;text-decoration:underline;">Open your secure account link</a>.</p>
</td></tr>
<tr><td align="center" style="background:#f8fafc;padding:22px 24px;border-top:1px solid #e2e8f0;border-radius:0 0 14px 14px;">
<p style="margin:0 0 9px;font-size:14px;font-weight:700;color:#0f172a;">${escape(p.companyName)}</p>${support}
<p style="margin:0 0 12px;font-size:12px;color:#64748b;"><a href="${escape(p.loginUrl)}" style="color:#163d7a;text-decoration:underline;">MyJobView sign in</a></p>
${p.mjvLogoUrl ? `<img src="${escape(p.mjvLogoUrl)}" alt="MyJobView" width="54" style="display:block;width:54px;height:auto;margin:0 auto 6px;border:0;" />` : ''}
<p style="margin:0;font-size:11px;color:#94a3b8;">Powered by MyJobView</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = `Hello ${p.fullName},\n\n${introduction}\n\nYour login email: ${p.email}\n\n${button}: ${p.actionUrl}\n\nThis one-time link expires. Ask your administrator for a new email if needed.\n\nLogin: ${p.loginUrl}\n\n${p.supportEmail ? `Questions? Reply to this email or contact ${p.supportEmail}.\n\n` : ''}${p.companyName}\nPowered by MyJobView`;
  return { html, text };
}
