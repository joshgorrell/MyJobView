import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface PushPayload {
  userId?: string;
  userIds?: string[];
  title: string;
  body: string;
  data?: Record<string, any>;
  tag?: string;
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
    const vapidPublicKey = Deno.env.get('VITE_VAPID_PUBLIC_KEY')!;
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!;

    if (!vapidPublicKey || !vapidPrivateKey) {
      throw new Error('VAPID keys are not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: PushPayload = await req.json();
    const { userId, userIds, title, body, data, tag } = payload;

    let targetUserIds: string[] = [];
    if (userId) {
      targetUserIds = [userId];
    } else if (userIds && userIds.length > 0) {
      targetUserIds = userIds;
    } else {
      throw new Error('Either userId or userIds must be provided');
    }

    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('subscription')
      .in('user_id', targetUserIds);

    if (error) throw error;

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No subscriptions found for the specified users' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const pushPayload = JSON.stringify({
      title,
      body,
      data: data || {},
      tag: tag || 'default',
    });

    const sendPromises = subscriptions.map(async (sub) => {
      try {
        const subscription = sub.subscription;

        const vapidHeaders = {
          'Content-Type': 'application/json',
          'Authorization': `vapid t=${generateVAPIDToken(vapidPublicKey, vapidPrivateKey, subscription.endpoint)}, k=${vapidPublicKey}`,
        };

        const response = await fetch(subscription.endpoint, {
          method: 'POST',
          headers: vapidHeaders,
          body: pushPayload,
        });

        if (!response.ok && (response.status === 404 || response.status === 410)) {
          await supabase
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', subscription.endpoint);
          return { success: false, reason: 'subscription_expired' };
        }

        return { success: response.ok };
      } catch (err) {
        console.error('Error sending push notification:', err);
        return { success: false, error: err };
      }
    });

    const results = await Promise.all(sendPromises);
    const successCount = results.filter(r => r.success).length;

    return new Response(
      JSON.stringify({
        message: 'Push notifications sent',
        total: results.length,
        successful: successCount,
        failed: results.length - successCount,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in send-push-notification:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function generateVAPIDToken(publicKey: string, privateKey: string, audience: string): string {
  const urlParts = new URL(audience);
  const aud = `${urlParts.protocol}//${urlParts.host}`;

  const header = {
    typ: 'JWT',
    alg: 'ES256',
  };

  const payload = {
    aud,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: `mailto:admin@example.com`,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  return unsignedToken;
}

function base64UrlEncode(str: string): string {
  const base64 = btoa(str);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
