import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getEmailTemplate, getCompanySettings, replacePlaceholders, convertTextToHtml, wrapInEmailLayout } from '../_shared/emailTemplates.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function buildMagicLinkNotice(accentColor: string): string {
  return `
        <!-- Magic Link Notice -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px 0;">
          <tr><td style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:18px 22px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="28" style="vertical-align:top;padding-right:12px;">
                  <div style="width:22px;height:22px;background:${accentColor};border-radius:50%;text-align:center;line-height:22px;font-size:13px;font-weight:800;color:#ffffff;">!</div>
                </td>
                <td>
                  <p style="color:#0c4a6e;font-size:14px;font-weight:700;margin:0 0 4px 0;line-height:1.4;">Keep this email &mdash; your personal access link is inside</p>
                  <p style="color:#075985;font-size:13px;margin:0;line-height:1.6;">The button above is a private magic link created just for you. No username or password needed &mdash; it logs you in automatically. Do not share this email with others.</p>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>`;
}

function buildTestTuneEmail(params: {
  contactName: string;
  companyName: string;
  companyEmail: string;
  companyLogoUrl: string;
  portalUrl: string;
  projectName: string;
  expirationDate: string;
  offices: { office_name: string; phone: string }[];
  accentColor: string;
}): string {
  const { contactName, companyName, companyEmail, companyLogoUrl, portalUrl, projectName, expirationDate, offices, accentColor } = params;

  const logoBlock = companyLogoUrl
    ? `<img src="${companyLogoUrl}" alt="${companyName}" style="max-height:60px;max-width:220px;object-fit:contain;display:block;margin:0 auto;" />`
    : `<span style="color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;">${companyName}</span>`;

  const phonesHtml = offices.length > 0
    ? `<table cellpadding="0" cellspacing="0" style="margin:10px auto 0 auto;border-collapse:collapse;">
        ${offices.map(o =>
          `<tr>
            <td style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;padding:3px 12px 3px 0;text-align:right;white-space:nowrap;">${o.office_name}</td>
            <td style="color:#94a3b8;font-size:12px;padding:3px 0;text-align:left;white-space:nowrap;">${o.phone}</td>
          </tr>`
        ).join('')}
      </table>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Welcome to Your 90-Day Test &amp; Tune Experience</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

      <!-- Header -->
      <tr><td style="background:#111827;border-radius:16px 16px 0 0;padding:40px 44px 36px;text-align:center;border-bottom:3px solid ${accentColor};">
        <div style="margin-bottom:22px;">${logoBlock}</div>
        <h1 style="color:#ffffff;margin:0 0 10px 0;font-size:30px;font-weight:800;letter-spacing:-0.5px;line-height:1.2;">Welcome to Your 90-Day<br>Test &amp; Tune Experience</h1>
        <p style="color:#94a3b8;margin:0;font-size:15px;line-height:1.6;">Your project is substantially complete &mdash; congratulations!</p>
        <div style="margin-top:20px;">
          <span style="display:inline-block;background:${accentColor};color:#ffffff;font-size:13px;font-weight:700;letter-spacing:0.5px;padding:7px 20px;border-radius:20px;text-transform:uppercase;">You&rsquo;re Enrolled</span>
        </div>
      </td></tr>

      <!-- Body -->
      <tr><td style="background:#ffffff;padding:44px 44px 40px;">
        <p style="color:#111827;font-size:19px;font-weight:600;margin:0 0 24px 0;">Hi ${contactName},</p>

        <p style="color:#374151;font-size:16px;line-height:1.8;margin:0 0 20px 0;">
          Congratulations&mdash;your project is now substantially complete.
        </p>

        <p style="color:#374151;font-size:16px;line-height:1.8;margin:0 0 20px 0;">
          As part of our final commissioning process, your system is now in our <strong>90-Day Test &amp; Tune</strong> period, where we work with you to refine and optimize everything so it performs perfectly in your home or business. Adjustments, tuning, and support during this time are <strong>included at no additional charge</strong>.
        </p>

        <p style="color:#374151;font-size:16px;line-height:1.8;margin:0 0 20px 0;">
          You&rsquo;ll also receive complimentary access to our <strong>Customer Portal</strong> during this period. The portal allows you to easily submit punch-list items, request adjustments, and communicate directly with our team so we can keep everything running exactly the way you want it.
        </p>

        <!-- Portal CTA -->
        <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:12px 0 16px 0;">
          <a href="${portalUrl}" style="display:inline-block;background:${accentColor};color:#ffffff;text-decoration:none;padding:16px 48px;border-radius:10px;font-size:17px;font-weight:700;letter-spacing:0.01em;">Access Your Customer Portal</a>
          <p style="color:#94a3b8;font-size:13px;margin:10px 0 0 0;">Submit punch-list items, request adjustments, and message our team</p>
        </td></tr></table>

        ${buildMagicLinkNotice(accentColor)}

        <p style="color:#374151;font-size:16px;line-height:1.8;margin:0 0 20px 0;">
          After the 90-day Test &amp; Tune period, manufacturer warranties remain in effect, and you&rsquo;ll have the option to continue using the Customer Portal through an optional subscription if you&rsquo;d like ongoing access for service requests and support.
        </p>

        <p style="color:#374151;font-size:16px;line-height:1.8;margin:0;">
          Thank you for choosing ${companyName}. We look forward to helping you enjoy your system.
        </p>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#1e293b;border-radius:0 0 16px 16px;padding:28px 44px;text-align:center;border-top:1px solid #334155;">
        <p style="color:${accentColor};font-size:14px;font-weight:700;margin:0 0 4px 0;letter-spacing:0.3px;">${companyName}</p>
        ${companyEmail ? `<p style="color:#94a3b8;font-size:13px;margin:0 0 2px 0;">${companyEmail}</p>` : ''}
        ${phonesHtml}
        <p style="color:#475569;font-size:12px;margin:12px 0 0 0;line-height:1.6;">You received this email because you recently worked with us.<br>Thank you for your business.</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

function buildTestTuneNoPortalEmail(params: {
  contactName: string;
  companyName: string;
  companyEmail: string;
  companyLogoUrl: string;
  projectName: string;
  expirationDate: string;
  offices: { office_name: string; phone: string }[];
  accentColor: string;
}): string {
  const { contactName, companyName, companyEmail, companyLogoUrl, projectName, expirationDate, offices, accentColor } = params;

  const logoBlock = companyLogoUrl
    ? `<img src="${companyLogoUrl}" alt="${companyName}" style="max-height:60px;max-width:220px;object-fit:contain;display:block;margin:0 auto;" />`
    : `<span style="color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;">${companyName}</span>`;

  const phonesHtml = offices.length > 0
    ? `<table cellpadding="0" cellspacing="0" style="margin:10px auto 0 auto;border-collapse:collapse;">
        ${offices.map(o =>
          `<tr>
            <td style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;padding:3px 12px 3px 0;text-align:right;white-space:nowrap;">${o.office_name}</td>
            <td style="color:#94a3b8;font-size:12px;padding:3px 0;text-align:left;white-space:nowrap;">${o.phone}</td>
          </tr>`
        ).join('')}
      </table>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Welcome to Your 90-Day Test &amp; Tune Experience</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

      <!-- Header -->
      <tr><td style="background:#111827;border-radius:16px 16px 0 0;padding:40px 44px 36px;text-align:center;border-bottom:3px solid ${accentColor};">
        <div style="margin-bottom:22px;">${logoBlock}</div>
        <h1 style="color:#ffffff;margin:0 0 10px 0;font-size:30px;font-weight:800;letter-spacing:-0.5px;line-height:1.2;">Welcome to Your 90-Day<br>Test &amp; Tune Experience</h1>
        <p style="color:#94a3b8;margin:0;font-size:15px;line-height:1.6;">Your project is substantially complete &mdash; congratulations!</p>
        <div style="margin-top:20px;">
          <span style="display:inline-block;background:${accentColor};color:#ffffff;font-size:13px;font-weight:700;letter-spacing:0.5px;padding:7px 20px;border-radius:20px;text-transform:uppercase;">You&rsquo;re Enrolled</span>
        </div>
      </td></tr>

      <!-- Body -->
      <tr><td style="background:#ffffff;padding:44px 44px 40px;">
        <p style="color:#111827;font-size:19px;font-weight:600;margin:0 0 24px 0;">Hi ${contactName},</p>

        <p style="color:#374151;font-size:16px;line-height:1.8;margin:0 0 20px 0;">
          Congratulations&mdash;your project is now substantially complete.
        </p>

        <p style="color:#374151;font-size:16px;line-height:1.8;margin:0 0 20px 0;">
          As part of our final commissioning process, your system is now in our <strong>90-Day Test &amp; Tune</strong> period, where we work with you to refine and optimize everything so it performs perfectly in your home or business. Adjustments, tuning, and support during this time are <strong>included at no additional charge</strong>.
        </p>

        <p style="color:#374151;font-size:16px;line-height:1.8;margin:0 0 20px 0;">
          If something doesn&rsquo;t feel quite right, or you&rsquo;d like to make adjustments to how your system operates, simply reach out to our team and we&rsquo;ll take care of it.
        </p>

        <p style="color:#374151;font-size:16px;line-height:1.8;margin:0 0 20px 0;">
          After the 90-day Test &amp; Tune period, manufacturer warranties remain in effect for all applicable equipment.
        </p>

        <p style="color:#374151;font-size:16px;line-height:1.8;margin:0;">
          Thank you for choosing ${companyName}. We look forward to helping you enjoy your system.
        </p>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#1e293b;border-radius:0 0 16px 16px;padding:28px 44px;text-align:center;border-top:1px solid #334155;">
        <p style="color:${accentColor};font-size:14px;font-weight:700;margin:0 0 4px 0;letter-spacing:0.3px;">${companyName}</p>
        ${companyEmail ? `<p style="color:#94a3b8;font-size:13px;margin:0 0 2px 0;">${companyEmail}</p>` : ''}
        ${phonesHtml}
        <p style="color:#475569;font-size:12px;margin:12px 0 0 0;line-height:1.6;">You received this email because you recently worked with us.<br>Thank you for your business.</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

function buildVIPSignupEmail(params: {
  contactName: string;
  companyName: string;
  companyEmail: string;
  companyLogoUrl: string;
  signupUrl: string;
  offices: { office_name: string; phone: string }[];
  accentColor: string;
}): string {
  const { contactName, companyName, companyEmail, companyLogoUrl, signupUrl, offices, accentColor } = params;

  const logoBlock = companyLogoUrl
    ? `<img src="${companyLogoUrl}" alt="${companyName}" style="max-height:60px;max-width:220px;object-fit:contain;display:block;margin:0 auto;" />`
    : `<span style="color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;">${companyName}</span>`;

  const phonesHtml = offices.length > 0
    ? `<table cellpadding="0" cellspacing="0" style="margin:10px auto 0 auto;border-collapse:collapse;">
        ${offices.map(o =>
          `<tr>
            <td style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;padding:3px 12px 3px 0;text-align:right;white-space:nowrap;">${o.office_name}</td>
            <td style="color:#94a3b8;font-size:12px;padding:3px 0;text-align:left;white-space:nowrap;">${o.phone}</td>
          </tr>`
        ).join('')}
      </table>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Access the ${companyName} VIP Customer Portal</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

      <!-- Header -->
      <tr><td style="background:#111827;border-radius:16px 16px 0 0;padding:36px 44px 32px;text-align:center;border-bottom:3px solid ${accentColor};">
        <div style="margin-bottom:20px;">${logoBlock}</div>
        <h1 style="color:#ffffff;margin:0 0 8px 0;font-size:28px;font-weight:800;letter-spacing:-0.3px;line-height:1.25;">${companyName} VIP Customer Portal</h1>
        <p style="color:#94a3b8;margin:0;font-size:15px;">Stay connected with our team &mdash; from anywhere</p>
      </td></tr>

      <!-- Body -->
      <tr><td style="background:#ffffff;padding:44px 44px 40px;">
        <p style="color:#111827;font-size:19px;font-weight:600;margin:0 0 24px 0;">Hi ${contactName},</p>

        <p style="color:#374151;font-size:16px;line-height:1.8;margin:0 0 20px 0;">
          At ${companyName}, we offer our VIP Customer Portal as the easiest way to stay connected with our team and manage service requests for your system.
        </p>

        <p style="color:#374151;font-size:16px;line-height:1.8;margin:0 0 20px 0;">
          The portal provides a direct and organized way to communicate with us and keep everything related to your technology in one place.
        </p>

        <p style="color:#374151;font-size:16px;line-height:1.8;margin:0 0 20px 0;">
          Through the VIP Portal you can:
        </p>

        <!-- Bullet list -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
          ${[
            'Submit service requests and punch-list items',
            'Message our support team directly',
            'Track the status of your requests',
            'Keep notes and updates about your system organized',
          ].map(item => `
          <tr>
            <td width="22" style="vertical-align:top;padding:5px 10px 5px 0;color:${accentColor};font-size:18px;line-height:1.4;">&bull;</td>
            <td style="color:#374151;font-size:16px;line-height:1.8;padding:5px 0;">${item}</td>
          </tr>`).join('')}
        </table>

        <p style="color:#374151;font-size:16px;line-height:1.8;margin:0 0 20px 0;">
          Access to the VIP Customer Portal is available through a subscription service for clients who would like a more streamlined and responsive support experience.
        </p>

        <p style="color:#374151;font-size:16px;line-height:1.8;margin:0 0 28px 0;">
          If you&rsquo;d like to activate your access, simply use the link below.
        </p>

        <!-- CTA Button -->
        <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:0 0 16px 0;">
          <a href="${signupUrl}" style="display:inline-block;background:${accentColor};color:#ffffff;text-decoration:none;padding:16px 48px;border-radius:10px;font-size:17px;font-weight:700;letter-spacing:0.01em;">Activate VIP Portal Access</a>
        </td></tr></table>

        ${buildMagicLinkNotice(accentColor)}

        <p style="color:#374151;font-size:16px;line-height:1.8;margin:0 0 28px 0;">
          We appreciate the opportunity to support your system whenever you need us.
        </p>

        <p style="color:#374151;font-size:16px;line-height:1.8;margin:0;">
          ${companyName}
        </p>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#1e293b;border-radius:0 0 16px 16px;padding:28px 44px;text-align:center;border-top:1px solid #334155;">
        <p style="color:${accentColor};font-size:14px;font-weight:700;margin:0 0 4px 0;letter-spacing:0.3px;">${companyName}</p>
        ${companyEmail ? `<p style="color:#94a3b8;font-size:13px;margin:0 0 2px 0;">${companyEmail}</p>` : ''}
        ${phonesHtml}
        <p style="color:#475569;font-size:12px;margin:12px 0 0 0;line-height:1.6;">You received this email because you are a valued client of ours.<br>Thank you for your business.</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

function buildPromotionalEmail(params: {
  contactName: string;
  companyName: string;
  companyEmail: string;
  companyLogoUrl: string;
  portalUrl: string;
  expirationDate: string;
  offices: { office_name: string; phone: string }[];
  accentColor: string;
}): string {
  const { contactName, companyName, companyEmail, companyLogoUrl, portalUrl, expirationDate, offices, accentColor } = params;

  const logoBlock = companyLogoUrl
    ? `<img src="${companyLogoUrl}" alt="${companyName}" style="max-height:60px;max-width:220px;object-fit:contain;display:block;margin:0 auto;" />`
    : `<span style="color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;">${companyName}</span>`;

  const phonesHtml = offices.length > 0
    ? `<table cellpadding="0" cellspacing="0" style="margin:10px auto 0 auto;border-collapse:collapse;">
        ${offices.map(o =>
          `<tr>
            <td style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;padding:3px 12px 3px 0;text-align:right;white-space:nowrap;">${o.office_name}</td>
            <td style="color:#94a3b8;font-size:12px;padding:3px 0;text-align:left;white-space:nowrap;">${o.phone}</td>
          </tr>`
        ).join('')}
      </table>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Experience Our VIP Customer Portal</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

      <!-- Header -->
      <tr><td style="background:#111827;border-radius:16px 16px 0 0;padding:36px 44px 32px;text-align:center;border-bottom:3px solid ${accentColor};">
        <div style="margin-bottom:20px;">${logoBlock}</div>
        <h1 style="color:#ffffff;margin:0 0 8px 0;font-size:28px;font-weight:800;letter-spacing:-0.3px;line-height:1.25;">Introducing Our VIP Customer Portal Experience</h1>
        <p style="color:#94a3b8;margin:0;font-size:15px;">Complimentary 90-day access &mdash; exclusively for you</p>
        <div style="margin-top:18px;">
          <span style="display:inline-block;background:${accentColor};color:#ffffff;font-size:13px;font-weight:700;letter-spacing:0.5px;padding:6px 18px;border-radius:20px;text-transform:uppercase;">90-Day Free Access</span>
        </div>
      </td></tr>

      <!-- Body -->
      <tr><td style="background:#ffffff;padding:44px 44px 40px;">
        <p style="color:#111827;font-size:19px;font-weight:600;margin:0 0 24px 0;">Hi ${contactName},</p>

        <p style="color:#374151;font-size:16px;line-height:1.8;margin:0 0 20px 0;">
          At ${companyName}, we&rsquo;re always looking for ways to make supporting your technology easier, faster, and more personalized.
        </p>

        <p style="color:#374151;font-size:16px;line-height:1.8;margin:0 0 20px 0;">
          As part of a special promotion, we&rsquo;d like to invite you to experience our <strong>VIP Customer Portal</strong> with complimentary access for 90 days.
        </p>

        <p style="color:#374151;font-size:16px;line-height:1.8;margin:0 0 20px 0;">
          The portal gives you a direct line to our team and a simple way to manage anything related to your system. Through the portal you can:
        </p>

        <!-- Bullet list -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px 0;">
          ${[
            'Create punch-list tasks',
            'Request service or adjustments',
            'Send messages directly to our support team',
            'Track the progress of requests and updates',
          ].map(item => `
          <tr>
            <td width="22" style="vertical-align:top;padding:5px 10px 5px 0;color:${accentColor};font-size:18px;line-height:1.4;">&bull;</td>
            <td style="color:#374151;font-size:16px;line-height:1.8;padding:5px 0;">${item}</td>
          </tr>`).join('')}
        </table>

        <p style="color:#374151;font-size:16px;line-height:1.8;margin:0 0 20px 0;">
          Many of our clients find the portal to be the easiest way to keep their systems running exactly the way they want, while staying connected with our team.
        </p>

        <!-- CTA Button -->
        <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 16px 0;">
          <a href="${portalUrl}" style="display:inline-block;background:${accentColor};color:#ffffff;text-decoration:none;padding:16px 48px;border-radius:10px;font-size:17px;font-weight:700;letter-spacing:0.01em;">Access Your VIP Portal</a>
        </td></tr></table>

        ${buildMagicLinkNotice(accentColor)}

        <p style="color:#374151;font-size:16px;line-height:1.8;margin:0 0 20px 0;">
          After the 90-day promotional access, you&rsquo;ll have the option to continue using the VIP Customer Portal through an optional subscription if you find it valuable.
        </p>

        <p style="color:#374151;font-size:16px;line-height:1.8;margin:0 0 28px 0;">
          We&rsquo;d love for you to experience the convenience and support it provides.
        </p>

        <p style="color:#374151;font-size:16px;line-height:1.8;margin:0;">
          ${companyName}
        </p>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#1e293b;border-radius:0 0 16px 16px;padding:28px 44px;text-align:center;border-top:1px solid #334155;">
        <p style="color:${accentColor};font-size:14px;font-weight:700;margin:0 0 4px 0;letter-spacing:0.3px;">${companyName}</p>
        ${companyEmail ? `<p style="color:#94a3b8;font-size:13px;margin:0 0 2px 0;">${companyEmail}</p>` : ''}
        ${phonesHtml}
        <p style="color:#475569;font-size:12px;margin:12px 0 0 0;line-height:1.6;">You received this email because you are a valued client of ours.<br>Thank you for your business.</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

function buildMagicLinkOnlyEmail(params: {
  contactName: string;
  companyName: string;
  companyEmail: string;
  companyLogoUrl: string;
  portalUrl: string;
  offices: { office_name: string; phone: string }[];
  accentColor: string;
}): string {
  const { contactName, companyName, companyEmail, companyLogoUrl, portalUrl, offices, accentColor } = params;

  const logoBlock = companyLogoUrl
    ? `<img src="${companyLogoUrl}" alt="${companyName}" style="max-height:60px;max-width:220px;object-fit:contain;display:block;margin:0 auto;" />`
    : `<span style="color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;">${companyName}</span>`;

  const phonesHtml = offices.length > 0
    ? `<table cellpadding="0" cellspacing="0" style="margin:10px auto 0 auto;border-collapse:collapse;">
        ${offices.map(o =>
          `<tr>
            <td style="color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;padding:3px 12px 3px 0;text-align:right;white-space:nowrap;">${o.office_name}</td>
            <td style="color:#94a3b8;font-size:12px;padding:3px 0;text-align:left;white-space:nowrap;">${o.phone}</td>
          </tr>`
        ).join('')}
      </table>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Your Portal Access Link</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

      <!-- Header -->
      <tr><td style="background:#111827;border-radius:16px 16px 0 0;padding:36px 44px 32px;text-align:center;border-bottom:3px solid ${accentColor};">
        <div style="margin-bottom:20px;">${logoBlock}</div>
        <h1 style="color:#ffffff;margin:0 0 8px 0;font-size:28px;font-weight:800;letter-spacing:-0.3px;line-height:1.25;">Your Portal Access Link</h1>
        <p style="color:#94a3b8;margin:0;font-size:15px;">A fresh link just for you &mdash; no password needed</p>
      </td></tr>

      <!-- Body -->
      <tr><td style="background:#ffffff;padding:44px 44px 40px;">
        <p style="color:#111827;font-size:19px;font-weight:600;margin:0 0 24px 0;">Hi ${contactName},</p>

        <p style="color:#374151;font-size:16px;line-height:1.8;margin:0 0 20px 0;">
          Here is your personal link to access the ${companyName} customer portal. Just click the button below to log in instantly &mdash; no username or password required.
        </p>

        <!-- CTA Button -->
        <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:8px 0 16px 0;">
          <a href="${portalUrl}" style="display:inline-block;background:${accentColor};color:#ffffff;text-decoration:none;padding:16px 48px;border-radius:10px;font-size:17px;font-weight:700;letter-spacing:0.01em;">Access Your Portal</a>
        </td></tr></table>

        ${buildMagicLinkNotice(accentColor)}

        <p style="color:#374151;font-size:16px;line-height:1.8;margin:0 0 20px 0;">
          If you did not request this email, you can safely ignore it. Your portal link will expire after 90 days.
        </p>

        <p style="color:#374151;font-size:16px;line-height:1.8;margin:0;">
          ${companyName}
        </p>
      </td></tr>

      <!-- Footer -->
      <tr><td style="background:#1e293b;border-radius:0 0 16px 16px;padding:28px 44px;text-align:center;border-top:1px solid #334155;">
        <p style="color:${accentColor};font-size:14px;font-weight:700;margin:0 0 4px 0;letter-spacing:0.3px;">${companyName}</p>
        ${companyEmail ? `<p style="color:#94a3b8;font-size:13px;margin:0 0 2px 0;">${companyEmail}</p>` : ''}
        ${phonesHtml}
        <p style="color:#475569;font-size:12px;margin:12px 0 0 0;line-height:1.6;">You received this email because you have portal access with us.<br>Thank you for your business.</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}

function generateSecureToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

async function generateMagicLink(
  supabaseClient: ReturnType<typeof createClient>,
  contactEmail: string,
  redirectTo: string
): Promise<string | null> {
  try {
    const { data: contact } = await supabaseClient
      .from('contacts')
      .select('id, first_name, last_name, portal_user_id')
      .eq('email', contactEmail.toLowerCase())
      .maybeSingle();

    if (!contact) return null;

    let userId = contact.portal_user_id;

    if (!userId) {
      const { data: authUser, error: createError } = await supabaseClient.auth.admin.createUser({
        email: contactEmail.toLowerCase(),
        email_confirm: true,
        app_metadata: {
          contact_id: contact.id,
          first_name: contact.first_name,
          last_name: contact.last_name,
          is_portal_user: true,
        },
      });

      if (createError || !authUser?.user) {
        console.error('Error creating portal user for magic link:', createError);
        return null;
      }

      userId = authUser.user.id;

      await supabaseClient
        .from('contacts')
        .update({ portal_user_id: userId, portal_access_enabled: true })
        .eq('id', contact.id);
    } else {
      await supabaseClient
        .from('contacts')
        .update({ portal_access_enabled: true })
        .eq('id', contact.id);
    }

    // Invalidate any existing active tokens for this contact so older invite
    // links stop working once a new invite is sent
    await supabaseClient
      .from('portal_access_tokens')
      .update({ invalidated_at: new Date().toISOString() })
      .eq('contact_id', contact.id)
      .is('invalidated_at', null);

    // Generate a 90-day portal token to match the punchlist access grant window
    const token = generateSecureToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);

    const { error: insertError } = await supabaseClient
      .from('portal_access_tokens')
      .insert({
        token,
        contact_id: contact.id,
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error('Error inserting portal token:', insertError);
      return null;
    }

    // Build the portal URL with the token as a query parameter so
    // PortalLogin.tsx can verify it and create a session automatically
    const separator = redirectTo.includes('?') ? '&' : '?';
    return `${redirectTo}${separator}portal_token=${token}`;
  } catch (err) {
    console.error('Unexpected error generating magic link:', err);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    console.log("RESEND_API_KEY status:", RESEND_API_KEY ? "FOUND" : "NOT FOUND");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const body = await req.json();
    const { invite_id, contact_email, contact_name, project_name, expiration_date, access_type, preview, magic_link_only } = body;

    if (!contact_name) {
      throw new Error("contact_name is required");
    }
    if (!preview && !contact_email) {
      throw new Error("contact_email is required");
    }

    const settings = await getCompanySettings(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const rawPortalUrl = settings.portal_url || (settings.app_url ? settings.app_url.replace(/\/$/, '') + '/portal' : null) || Deno.env.get("SUPABASE_URL")?.replace('.supabase.co', '.app') + '/portal' || 'https://your-portal-url.com/portal';
    const portalUrl = rawPortalUrl.replace(/\/$/, '');
    const accentColor = '#06b6d4';
    const resolvedProjectName = project_name || 'your project';
    const resolvedExpiration = expiration_date
      ? new Date(expiration_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : '90 days from today';

    const isTestAndTune = !access_type || access_type === 'test_and_tune';
    const isTestAndTuneNoPortal = access_type === 'test_and_tune_no_portal';
    const isVIPSignup = access_type === 'vip_signup';
    const needsMagicLink = !isTestAndTuneNoPortal && !preview && !!contact_email;

    let resolvedPortalUrl = portalUrl;
    let resolvedSignupUrl = `${portalUrl}/membership`;

    if (needsMagicLink) {
      const magicLinkRedirect = isVIPSignup ? `${portalUrl}/membership` : `${portalUrl}?redirect=/portal/punchlist`;
      const magicLink = await generateMagicLink(supabaseClient, contact_email, magicLinkRedirect);
      if (magicLink) {
        if (isVIPSignup) {
          resolvedSignupUrl = magicLink;
        } else {
          resolvedPortalUrl = magicLink;
        }
        console.log('Magic link generated successfully for invite email');
      } else {
        console.warn('Magic link generation failed, falling back to generic portal URL');
      }
    }

    let subject: string;
    let emailHtml: string;

    // Magic-link-only resend: short "here's your link" email, same branding
    if (magic_link_only) {
      subject = `Your ${settings.company_name} Portal Access Link`;
      emailHtml = buildMagicLinkOnlyEmail({
        contactName: contact_name,
        companyName: settings.company_name,
        companyEmail: settings.company_email,
        companyLogoUrl: settings.company_logo_url,
        portalUrl: resolvedPortalUrl,
        offices: settings.offices,
        accentColor,
      });

      if (preview) {
        return new Response(
          JSON.stringify({ success: true, preview: true, subject, html: emailHtml }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!RESEND_API_KEY) {
        return new Response(
          JSON.stringify({ success: false, error: "Email service not configured." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const resendResp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({ from: settings.from_address, to: [contact_email], reply_to: settings.reply_to_email, subject, html: emailHtml }),
      });

      if (!resendResp.ok) {
        const err = await resendResp.text();
        throw new Error(`Failed to send email: ${err}`);
      }

      return new Response(
        JSON.stringify({ success: true, message: "Magic link email sent successfully" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (isVIPSignup) {
      const vipTemplate = await getEmailTemplate(
        'vip_signup',
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      if (vipTemplate) {
        const placeholders: Record<string, string> = {
          customer_name: contact_name,
          company_name: settings.company_name,
          signup_link: resolvedSignupUrl,
        };
        subject = replacePlaceholders(vipTemplate.subject, placeholders);
        const bodyText = replacePlaceholders(vipTemplate.body, placeholders);
        const bodyHtml = convertTextToHtml(bodyText);
        emailHtml = wrapInEmailLayout(bodyHtml, settings.company_name, settings.company_email, accentColor, settings.company_logo_url, settings.offices);
      } else {
        subject = `Access the ${settings.company_name} VIP Customer Portal`;
        emailHtml = buildVIPSignupEmail({
          contactName: contact_name,
          companyName: settings.company_name,
          companyEmail: settings.company_email,
          companyLogoUrl: settings.company_logo_url,
          signupUrl: resolvedSignupUrl,
          offices: settings.offices,
          accentColor,
        });
      }
    } else if (isTestAndTuneNoPortal) {
      const noPortalTemplate = await getEmailTemplate(
        'punchlist_test_and_tune_no_portal',
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      if (noPortalTemplate) {
        const placeholders: Record<string, string> = {
          customer_name: contact_name,
          company_name: settings.company_name,
          project_name: resolvedProjectName,
          expiration_date: resolvedExpiration,
        };
        subject = replacePlaceholders(noPortalTemplate.subject, placeholders);
        const bodyText = replacePlaceholders(noPortalTemplate.body, placeholders);
        const bodyHtml = convertTextToHtml(bodyText);
        emailHtml = wrapInEmailLayout(bodyHtml, settings.company_name, settings.company_email, accentColor, settings.company_logo_url, settings.offices);
      } else {
        subject = `Welcome to Your 90-Day Test & Tune Experience — ${settings.company_name}`;
        emailHtml = buildTestTuneNoPortalEmail({
          contactName: contact_name,
          companyName: settings.company_name,
          companyEmail: settings.company_email,
          companyLogoUrl: settings.company_logo_url,
          projectName: resolvedProjectName,
          expirationDate: resolvedExpiration,
          offices: settings.offices,
          accentColor,
        });
      }
    } else if (isTestAndTune) {
      const testTuneTemplate = await getEmailTemplate(
        'punchlist_test_and_tune',
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      if (testTuneTemplate) {
        const placeholders: Record<string, string> = {
          customer_name: contact_name,
          company_name: settings.company_name,
          portal_link: resolvedPortalUrl,
          project_name: resolvedProjectName,
          expiration_date: resolvedExpiration,
        };
        subject = replacePlaceholders(testTuneTemplate.subject, placeholders);
        const bodyText = replacePlaceholders(testTuneTemplate.body, placeholders);
        const bodyHtml = convertTextToHtml(bodyText);
        emailHtml = wrapInEmailLayout(bodyHtml, settings.company_name, settings.company_email, accentColor, settings.company_logo_url, settings.offices);
      } else {
        subject = `Welcome to Your 90-Day Test & Tune Experience — ${settings.company_name}`;
        emailHtml = buildTestTuneEmail({
          contactName: contact_name,
          companyName: settings.company_name,
          companyEmail: settings.company_email,
          companyLogoUrl: settings.company_logo_url,
          portalUrl: resolvedPortalUrl,
          projectName: resolvedProjectName,
          expirationDate: resolvedExpiration,
          offices: settings.offices,
          accentColor,
        });
      }
    } else {
      const template = await getEmailTemplate(
        'punchlist_invite',
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      if (template) {
        const placeholders: Record<string, string> = {
          customer_name: contact_name,
          company_name: settings.company_name,
          portal_link: resolvedPortalUrl,
          project_name: resolvedProjectName,
          expiration_date: resolvedExpiration,
        };
        subject = replacePlaceholders(template.subject, placeholders);
        const bodyText = replacePlaceholders(template.body, placeholders);
        const bodyHtml = convertTextToHtml(bodyText);
        emailHtml = wrapInEmailLayout(bodyHtml, settings.company_name, settings.company_email, accentColor, settings.company_logo_url, settings.offices);
      } else {
        subject = `Experience Our VIP Customer Portal — ${settings.company_name}`;
        emailHtml = buildPromotionalEmail({
          contactName: contact_name,
          companyName: settings.company_name,
          companyEmail: settings.company_email,
          companyLogoUrl: settings.company_logo_url,
          portalUrl: resolvedPortalUrl,
          expirationDate: resolvedExpiration,
          offices: settings.offices,
          accentColor,
        });
      }
    }

    if (preview) {
      return new Response(
        JSON.stringify({ success: true, preview: true, subject, html: emailHtml }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured - email cannot be sent");
      return new Response(
        JSON.stringify({
          success: false,
          error: "Email service not configured. Please set up RESEND_API_KEY in Supabase Edge Function secrets.",
          warning: "The punchlist access was granted, but the email notification could not be sent.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: settings.from_address,
        to: [contact_email],
        reply_to: settings.reply_to_email,
        subject,
        html: emailHtml,
      }),
    });

    if (!resendResponse.ok) {
      const error = await resendResponse.text();
      console.error("Resend API error:", error);
      throw new Error(`Failed to send email: ${error}`);
    }

    const data = await resendResponse.json();
    console.log("Email sent successfully:", data);

    return new Response(
      JSON.stringify({ success: true, message: "Punchlist invite email sent successfully" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
