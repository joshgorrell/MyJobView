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

function generateVCard(data: VCardRequest): string {
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
    lines.push(`NOTE:${data.bio}`);
  }

  if (data.photoUrl) {
    lines.push(`PHOTO;VALUE=URL;TYPE=JPEG:${data.photoUrl}`);
  }

  lines.push("END:VCARD");

  return lines.join("\r\n");
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

    const vcard = generateVCard(data);

    return new Response(vcard, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/vcard",
        "Content-Disposition": `attachment; filename="${data.fullName.replace(/\s+/g, '_')}.vcf"`,
      },
    });
  } catch (error) {
    console.error("Error generating vCard:", error);
    return new Response(
      JSON.stringify({ error: "Failed to generate vCard" }),
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