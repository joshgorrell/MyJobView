import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface RequestBody {
  captureId: string;
  cardSlug: string;
  shareMethod?: 'vcard' | 'qr';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const twilioPhoneNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { captureId, cardSlug, shareMethod = 'vcard' }: RequestBody = await req.json();

    const { data: capture, error: captureError } = await supabase
      .from('contact_captures')
      .select(`
        *,
        business_cards (
          full_name,
          title,
          email,
          phone,
          photo_url,
          linkedin_url,
          bio
        )
      `)
      .eq('id', captureId)
      .single();

    if (captureError || !capture) {
      throw new Error('Contact capture not found');
    }

    const card = capture.business_cards;
    const cardUrl = `${supabaseUrl.replace('supabase.co', 'supabase.co')}/card/${cardSlug}`;

    let message: string;
    let mediaUrl: string | null = null;

    if (shareMethod === 'qr') {
      const qrResponse = await fetch(`${supabaseUrl}/functions/v1/generate-qr-vcard`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fullName: card.full_name,
          title: card.title,
          email: card.email,
          phone: card.phone,
          linkedinUrl: card.linkedin_url,
          photoUrl: card.photo_url,
          bio: card.bio,
        }),
      });

      if (!qrResponse.ok) {
        throw new Error('Failed to generate QR code');
      }

      const qrData = await qrResponse.json();
      mediaUrl = qrData.qrCode;

      message = `Hi${capture.contact_name ? ' ' + capture.contact_name : ''}! I'm ${card.full_name}, ${card.title} at Electronic Life.\n\nScan the QR code to save my contact info!\n\nEmail: ${card.email}\nPhone: ${card.phone}\n\nVisit us: https://www.electroniclife.com`;
    } else {
      message = `Hi${capture.contact_name ? ' ' + capture.contact_name : ''}! I'm ${card.full_name}, ${card.title} at Electronic Life.\n\nHere's my digital business card:\n${cardUrl}\n\nEmail: ${card.email}\nPhone: ${card.phone}\n\nVisit us: https://www.electroniclife.com\n\nLooking forward to connecting!`;
    }

    if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
      console.log('Twilio not configured. Message would be:', message);
      
      await supabase
        .from('contact_captures')
        .update({
          sms_sent: true,
          sms_sent_at: new Date().toISOString(),
        })
        .eq('id', captureId);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'SMS sending simulated (Twilio not configured)',
          previewMessage: message
        }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
    const auth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);

    const formData = new URLSearchParams();
    formData.append('To', capture.contact_phone);
    formData.append('From', twilioPhoneNumber);
    formData.append('Body', message);

    if (mediaUrl) {
      formData.append('MediaUrl', mediaUrl);
    }

    const twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData,
    });

    if (!twilioResponse.ok) {
      const errorText = await twilioResponse.text();
      throw new Error(`Twilio error: ${errorText}`);
    }

    await supabase
      .from('contact_captures')
      .update({
        sms_sent: true,
        sms_sent_at: new Date().toISOString(),
        sms_delivered: true,
      })
      .eq('id', captureId);

    return new Response(
      JSON.stringify({ success: true, message: 'SMS sent successfully' }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});