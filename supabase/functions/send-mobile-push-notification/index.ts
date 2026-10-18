import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface MobilePushPayload {
  userId?: string;
  userIds?: string[];
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: boolean;
  badge?: number;
}

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  sound?: string;
  badge?: number;
  channelId?: string;
}

interface ExpoPushReceipt {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: MobilePushPayload = await req.json();
    const { userId, userIds, title, body, data, sound, badge } = payload;

    let targetUserIds: string[] = [];
    if (userId) targetUserIds = [userId];
    else if (userIds && userIds.length > 0) targetUserIds = userIds;
    else throw new Error('Either userId or userIds must be provided');

    const { data: tokens, error } = await supabase
      .from('push_tokens')
      .select('token, user_id')
      .in('user_id', targetUserIds)
      .eq('is_active', true)
      .eq('notifications_enabled', true);

    if (error) throw error;

    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No active push tokens found', total: 0, successful: 0, failed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const messages: ExpoPushMessage[] = tokens.map((t) => ({
      to: t.token,
      title,
      body,
      data: data || {},
      sound: sound ? 'default' : undefined,
      badge,
      channelId: 'work-orders',
    }));

    const chunkSize = 100;
    const chunks: ExpoPushMessage[][] = [];
    for (let i = 0; i < messages.length; i += chunkSize) {
      chunks.push(messages.slice(i, i + chunkSize));
    }

    const allTickets: ExpoPushTicket[] = [];
    for (const chunk of chunks) {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(chunk),
      });

      if (!response.ok) {
        console.error('Expo push send failed:', response.status, await response.text());
        continue;
      }

      const result = await response.json();
      if (Array.isArray(result.data)) {
        allTickets.push(...result.data);
      }
    }

    const receiptIds: string[] = [];
    for (const ticket of allTickets) {
      if (ticket.status === 'ok' && ticket.id) {
        receiptIds.push(ticket.id);
      } else if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
        await supabase
          .from('push_tokens')
          .update({ is_active: false })
          .eq('token', ticket.id || '');
      }
    }

    let failedCount = 0;
    if (receiptIds.length > 0) {
      const receiptResponse = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ ids: receiptIds }),
      });

      if (receiptResponse.ok) {
        const receiptData = await receiptResponse.json();
        if (receiptData.data) {
          for (const [id, receipt] of Object.entries(receiptData.data) as [string, ExpoPushReceipt][]) {
            if (receipt.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') {
              const tokenEntry = tokens.find((t, idx) => allTickets[idx]?.id === id);
              if (tokenEntry) {
                await supabase
                  .from('push_tokens')
                  .update({ is_active: false })
                  .eq('token', tokenEntry.token);
              }
              failedCount++;
            }
          }
        }
      }
    }

    const successCount = allTickets.filter(t => t.status === 'ok').length;

    return new Response(
      JSON.stringify({
        message: 'Mobile push notifications sent',
        total: messages.length,
        successful: successCount,
        failed: messages.length - successCount,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in send-mobile-push-notification:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
