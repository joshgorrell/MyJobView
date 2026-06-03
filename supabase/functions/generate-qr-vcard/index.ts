import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface VCardRequest {
  fullName: string;
  title?: string;
  email: string;
  phone: string;
  company?: string;
  website?: string;
  linkedinUrl?: string;
  photoUrl?: string;
  bio?: string;
}

function generateVCardData(data: VCardRequest): string {
  const lines: string[] = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${data.fullName}`,
    `N:${data.fullName.split(' ').reverse().join(';')};;;`,
  ];

  if (data.title && data.company) {
    lines.push(`TITLE:${data.title}`);
    lines.push(`ORG:${data.company}`);
  } else if (data.title) {
    lines.push(`TITLE:${data.title}`);
  } else if (data.company) {
    lines.push(`ORG:${data.company}`);
  }

  lines.push(`EMAIL;TYPE=INTERNET:${data.email}`);
  lines.push(`TEL;TYPE=CELL:${data.phone}`);

  if (data.website) {
    lines.push(`URL:${data.website}`);
  }

  if (data.linkedinUrl) {
    lines.push(`URL:${data.linkedinUrl}`);
  }

  if (data.bio) {
    lines.push(`NOTE:${data.bio.substring(0, 200)}`);
  }

  if (data.photoUrl) {
    lines.push(`PHOTO;VALUE=URL;TYPE=JPEG:${data.photoUrl}`);
  }

  lines.push("END:VCARD");

  return lines.join("\n");
}

async function generateQRCode(text: string): Promise<string> {
  const QRCode = await import("npm:qrcode@1.5.3");

  const qrDataUrl = await QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    type: 'image/png',
    width: 512,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    }
  });

  return qrDataUrl;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const data: VCardRequest = await req.json();

    if (!data.fullName || !data.email || !data.phone) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: fullName, email, phone" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const vcardData = generateVCardData(data);
    const qrCodeDataUrl = await generateQRCode(vcardData);

    return new Response(
      JSON.stringify({ qrCode: qrCodeDataUrl }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error generating QR code:", error);
    return new Response(
      JSON.stringify({ error: "Failed to generate QR code" }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});