import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface PhotosNotification {
  requestId: string;
  requesterEmail: string;
  requesterName: string;
  customerName: string;
  projectName?: string;
  photoCount: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { requestId, requesterEmail, requesterName, customerName, projectName, photoCount }: PhotosNotification = await req.json();

    if (!requestId || !requesterEmail || !requesterName || !customerName) {
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
    const appUrl = Deno.env.get("APP_URL") || "https://yourdomain.com";

    const projectInfo = projectName ? ` for the ${projectName} project` : '';
    const photoCountText = photoCount > 0 ? `${photoCount} photo${photoCount === 1 ? '' : 's'}` : 'Photos';

    const htmlBody = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Photos Uploaded</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; max-width: 100%; border-collapse: collapse; background-color: #ffffff; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); border-radius: 8px; overflow: hidden;">

                  <!-- Header -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 30px; text-align: center;">
                      <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">
                        ✅ Photos Uploaded!
                      </h1>
                      <p style="margin: 10px 0 0 0; color: #f0f0f0; font-size: 16px;">
                        Your paparazzi request is complete
                      </p>
                    </td>
                  </tr>

                  <!-- Content -->
                  <tr>
                    <td style="padding: 40px 30px;">
                      <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333;">
                        Hi ${requesterName},
                      </p>

                      <p style="margin: 0 0 30px 0; font-size: 16px; line-height: 1.6; color: #333333;">
                        Great news! ${photoCountText} have been uploaded for <strong>${customerName}</strong>${projectInfo}.
                      </p>

                      <!-- Success Box -->
                      <div style="background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 20px; margin: 0 0 30px 0; border-radius: 4px;">
                        <h2 style="margin: 0 0 10px 0; font-size: 18px; color: #059669;">📸 Ready to View</h2>
                        <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #555555;">
                          The photos you requested are now available in the system and ready to share with the customer.
                        </p>
                      </div>

                      <!-- CTA Button -->
                      <table role="presentation" style="margin: 0 0 30px 0; width: 100%;">
                        <tr>
                          <td align="center">
                            <a href="${appUrl}/production/job-photos"
                               style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);">
                              View Photos
                            </a>
                          </td>
                        </tr>
                      </table>

                      <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #666666;">
                        Thank you for helping us showcase our great work! These photos will make a big difference in demonstrating the quality of our services.
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

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: requesterEmail,
        subject: `✅ Photos Uploaded: ${customerName}${projectName ? ` - ${projectName}` : ''}`,
        html: htmlBody,
      }),
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
    console.error("Error sending paparazzi photos notification:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
