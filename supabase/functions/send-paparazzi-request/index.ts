import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface PaparazziRequest {
  requestId: string;
  description: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  projectName?: string;
  requesterName: string;
  sendToSelf?: boolean;
  recipientEmail?: string;
}

function generateWaiverHtml(customerName: string, companyName: string, requestDate: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 11pt;
      color: #1a1a1a;
      background: #fff;
      padding: 48px 56px;
      line-height: 1.55;
    }
    .header {
      text-align: center;
      border-bottom: 2px solid #1a1a1a;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .company-name {
      font-size: 18pt;
      font-weight: bold;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .doc-title {
      font-size: 13pt;
      font-weight: bold;
      margin-top: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .doc-subtitle {
      font-size: 9pt;
      color: #555;
      margin-top: 4px;
    }
    .prefill-block {
      background: #f7f7f7;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 14px 18px;
      margin-bottom: 20px;
      display: flex;
      gap: 40px;
    }
    .prefill-item label {
      font-size: 8.5pt;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #777;
      display: block;
    }
    .prefill-item span {
      font-size: 11pt;
      font-weight: bold;
    }
    .section-title {
      font-size: 10.5pt;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
      margin-top: 20px;
      border-bottom: 1px solid #ccc;
      padding-bottom: 4px;
    }
    p {
      margin-bottom: 10px;
      font-size: 10.5pt;
    }
    .grant-list {
      margin: 0 0 12px 20px;
    }
    .grant-list li {
      font-size: 10.5pt;
      margin-bottom: 5px;
    }
    .signature-block {
      margin-top: 36px;
      border-top: 1px solid #ccc;
      padding-top: 24px;
    }
    .sig-row {
      display: flex;
      gap: 40px;
      margin-bottom: 28px;
    }
    .sig-field {
      flex: 1;
    }
    .sig-line {
      border-bottom: 1px solid #333;
      height: 32px;
      margin-bottom: 4px;
    }
    .sig-label {
      font-size: 8pt;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #666;
    }
    .footer-note {
      margin-top: 28px;
      font-size: 8.5pt;
      color: #888;
      text-align: center;
      border-top: 1px solid #eee;
      padding-top: 14px;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="company-name">${companyName}</div>
    <div class="doc-title">Photo &amp; Media Release Authorization</div>
    <div class="doc-subtitle">Please read carefully before signing</div>
  </div>

  <div class="prefill-block">
    <div class="prefill-item">
      <label>Customer Name</label>
      <span>${customerName}</span>
    </div>
    <div class="prefill-item">
      <label>Date</label>
      <span>${requestDate}</span>
    </div>
  </div>

  <div class="section-title">Grant of Rights</div>
  <p>
    I, the undersigned ("Authorizing Party"), hereby grant ${companyName} and its authorized representatives, agents, employees, and assigns (collectively, "Company") a non-exclusive, royalty-free, worldwide, perpetual license to photograph, film, record, and otherwise capture images and/or video of the completed work performed at my property or job site ("Media").
  </p>
  <p>The Company is authorized to use the Media for any of the following purposes:</p>
  <ul class="grant-list">
    <li>Social media platforms (including but not limited to Facebook, Instagram, TikTok, YouTube, LinkedIn)</li>
    <li>Company website, blog, and digital marketing materials</li>
    <li>Print advertisements, brochures, flyers, and promotional collateral</li>
    <li>Trade show and exhibition displays</li>
    <li>Sales presentations and portfolio use</li>
    <li>Any other lawful promotional or marketing purpose</li>
  </ul>

  <div class="section-title">Acknowledgements</div>
  <p>
    The Authorizing Party acknowledges and agrees that: (a) no compensation will be paid for this authorization; (b) the Company may edit, crop, composite, or otherwise modify the Media at its sole discretion; (c) this release is given freely and voluntarily; and (d) this authorization may not be revoked once Media has been published.
  </p>
  <p>
    The Authorizing Party represents that they have the legal authority to grant these rights with respect to the property or location depicted in the Media.
  </p>

  <div class="section-title">Limitation</div>
  <p>
    This release does not grant the Company the right to use the Authorizing Party's personal name or likeness in any defamatory or misleading manner. The Company agrees to use the Media in a professional and respectful context consistent with its marketing activities.
  </p>

  <div class="signature-block">
    <div class="sig-row">
      <div class="sig-field">
        <div class="sig-line"></div>
        <div class="sig-label">Authorized Signature</div>
      </div>
      <div class="sig-field">
        <div class="sig-line"></div>
        <div class="sig-label">Date Signed</div>
      </div>
    </div>
    <div class="sig-row">
      <div class="sig-field">
        <div class="sig-line"></div>
        <div class="sig-label">Printed Name</div>
      </div>
      <div class="sig-field">
        <div class="sig-line"></div>
        <div class="sig-label">Relationship to Property (if not owner)</div>
      </div>
    </div>
  </div>

  <div class="footer-note">
    This document is valid as a standalone release when signed. Retain a copy for your records. &mdash; ${companyName}
  </div>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const {
      requestId,
      description,
      customerName,
      customerPhone,
      customerEmail,
      projectName,
      requesterName,
      sendToSelf,
      recipientEmail,
    }: PaparazziRequest = await req.json();

    if (!requestId || !description || !customerName) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const fromEmail = Deno.env.get("FROM_EMAIL") || "noreply@yourdomain.com";
    const photographerEmail = Deno.env.get("PHOTOGRAPHER_EMAIL");

    const toEmail = sendToSelf && recipientEmail ? recipientEmail : photographerEmail;

    if (!toEmail) {
      return new Response(
        JSON.stringify({ error: "Recipient email not configured" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const projectInfo = projectName ? `<p><strong>Project:</strong> ${projectName}</p>` : '';

    const selfBadge = sendToSelf
      ? `<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:12px 16px;margin:0 0 24px 0;font-size:14px;color:#856404;">
           <strong>You indicated you'll be taking these photos yourself.</strong> This email contains the job details for your reference, along with a printable media release waiver attached as an HTML file.
         </div>`
      : '';

    const greeting = sendToSelf
      ? `<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333;">Hi <strong>${requesterName}</strong>,</p>`
      : `<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333;">Hi there,</p>`;

    const bodyIntro = sendToSelf
      ? `<p style="margin: 0 0 30px 0; font-size: 16px; line-height: 1.6; color: #333333;">
           Here are the details for the photo job you've taken on yourself. A printable media waiver is attached - get it signed on-site before you start shooting!
         </p>`
      : `<p style="margin: 0 0 30px 0; font-size: 16px; line-height: 1.6; color: #333333;">
           <strong>${requesterName}</strong> has requested professional photography for some impressive work that was recently completed. Here are the details:
         </p>`;

    const footerCta = sendToSelf
      ? `<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333;">
           Make sure to get the media waiver signed before photographing. Upload your photos to the system once you're done and mark the request as complete.
         </p>`
      : `<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333;">
           Please reach out to the customer directly to schedule the photo shoot. Once you've taken the photos, upload them to the system and mark this request as complete.
         </p>`;

    const htmlBody = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Paparazzi Photo Request</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); border-radius: 8px; overflow: hidden;">

                  <!-- Header -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
                      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">
                        📸 ${sendToSelf ? 'Your Photo Job Details' : 'New Photo Request'}
                      </h1>
                      <p style="margin: 10px 0 0 0; color: #f0f0f0; font-size: 16px;">
                        Paparazzi Service Request
                      </p>
                    </td>
                  </tr>

                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px 30px;">
                      ${greeting}
                      ${selfBadge}
                      ${bodyIntro}

                      <!-- Details Box -->
                      <div style="background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin: 0 0 30px 0; border-radius: 4px;">
                        <h2 style="margin: 0 0 15px 0; font-size: 18px; color: #667eea;">Work Description</h2>
                        <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #555555; white-space: pre-wrap;">${description}</p>
                      </div>

                      <!-- Customer Information -->
                      <div style="background-color: #fff8e1; border-left: 4px solid #ffc107; padding: 20px; margin: 0 0 30px 0; border-radius: 4px;">
                        <h2 style="margin: 0 0 15px 0; font-size: 18px; color: #f57c00;">Customer Contact Information</h2>
                        <p style="margin: 0 0 8px 0; font-size: 15px; color: #555555;"><strong>Name:</strong> ${customerName}</p>
                        ${projectInfo}
                        ${customerPhone ? `<p style="margin: 0 0 8px 0; font-size: 15px; color: #555555;"><strong>Phone:</strong> <a href="tel:${customerPhone}" style="color: #667eea; text-decoration: none;">${customerPhone}</a></p>` : ''}
                        ${customerEmail ? `<p style="margin: 0; font-size: 15px; color: #555555;"><strong>Email:</strong> <a href="mailto:${customerEmail}" style="color: #667eea; text-decoration: none;">${customerEmail}</a></p>` : ''}
                      </div>

                      ${footerCta}

                      <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #666666;">
                        Thank you for helping us showcase our great work!
                      </p>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #f8f9fa; padding: 20px 30px; text-align: center; border-top: 1px solid #e0e0e0;">
                      <p style="margin: 0; font-size: 12px; color: #999999;">
                        This is an automated message from your company management system.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;

    const requestDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const waiverHtml = generateWaiverHtml(customerName, 'Your Company', requestDate);
    const waiverBase64 = btoa(unescape(encodeURIComponent(waiverHtml)));

    const emailPayload: Record<string, unknown> = {
      from: fromEmail,
      to: toEmail,
      subject: `📸 Photo Request: ${customerName}${projectName ? ` - ${projectName}` : ''}`,
      html: htmlBody,
      attachments: [
        {
          filename: `media-waiver-${customerName.replace(/\s+/g, '-').toLowerCase()}.html`,
          content: waiverBase64,
          content_type: "text/html",
        },
      ],
    };

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify(emailPayload),
    });

    if (!resendResponse.ok) {
      const error = await resendResponse.text();
      throw new Error(`Resend API error: ${error}`);
    }

    const data = await resendResponse.json();

    return new Response(
      JSON.stringify({ success: true, messageId: data.id }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error sending paparazzi request email:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
