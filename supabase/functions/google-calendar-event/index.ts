import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CalendarEventRequest {
  action: 'create' | 'update' | 'delete';
  entityType: 'lead' | 'task' | 'discussion_post';
  entityId: string;
  reminderDate?: string;
  title: string;
  description?: string;
  eventId?: string;
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID') || '',
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') || '',
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to refresh access token');
  }

  const data = await response.json();
  return data.access_token;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);

    if (userError || !user) {
      throw new Error('Invalid user token');
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('google_access_token, google_refresh_token, google_token_expires_at, google_calendar_connected')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      throw new Error('Failed to load profile');
    }

    if (!profile.google_calendar_connected || !profile.google_refresh_token) {
      throw new Error('Google Calendar not connected');
    }

    const requestData: CalendarEventRequest = await req.json();

    let accessToken = profile.google_access_token;
    const expiresAt = new Date(profile.google_token_expires_at);
    const now = new Date();

    if (expiresAt <= now) {
      accessToken = await refreshAccessToken(profile.google_refresh_token);
      const newExpiresAt = new Date();
      newExpiresAt.setSeconds(newExpiresAt.getSeconds() + 3600);

      await supabase
        .from('profiles')
        .update({
          google_access_token: accessToken,
          google_token_expires_at: newExpiresAt.toISOString(),
        })
        .eq('id', user.id);
    }

    const calendarId = 'primary';
    let result;

    if (requestData.action === 'create') {
      const reminderDate = new Date(requestData.reminderDate!);
      const endDate = new Date(reminderDate);
      endDate.setMinutes(endDate.getMinutes() + 30);

      const event = {
        summary: requestData.title,
        description: requestData.description || '',
        start: {
          dateTime: reminderDate.toISOString(),
          timeZone: 'America/New_York',
        },
        end: {
          dateTime: endDate.toISOString(),
          timeZone: 'America/New_York',
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 30 },
            { method: 'email', minutes: 60 },
          ],
        },
      };

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(event),
        }
      );

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Failed to create event:', errorData);
        throw new Error('Failed to create calendar event');
      }

      const createdEvent = await response.json();
      result = { eventId: createdEvent.id };

      const tableMap = {
        lead: 'leads',
        task: 'tasks',
        discussion_post: 'discussion_posts',
      };

      await supabase
        .from(tableMap[requestData.entityType])
        .update({
          google_calendar_event_id: createdEvent.id,
          reminder_date: requestData.reminderDate,
        })
        .eq('id', requestData.entityId);

    } else if (requestData.action === 'update' && requestData.eventId) {
      const reminderDate = new Date(requestData.reminderDate!);
      const endDate = new Date(reminderDate);
      endDate.setMinutes(endDate.getMinutes() + 30);

      const event = {
        summary: requestData.title,
        description: requestData.description || '',
        start: {
          dateTime: reminderDate.toISOString(),
          timeZone: 'America/New_York',
        },
        end: {
          dateTime: endDate.toISOString(),
          timeZone: 'America/New_York',
        },
      };

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${requestData.eventId}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(event),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update calendar event');
      }

      result = { success: true };

    } else if (requestData.action === 'delete' && requestData.eventId) {
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${requestData.eventId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok && response.status !== 404) {
        throw new Error('Failed to delete calendar event');
      }

      const tableMap = {
        lead: 'leads',
        task: 'tasks',
        discussion_post: 'discussion_posts',
      };

      await supabase
        .from(tableMap[requestData.entityType])
        .update({
          google_calendar_event_id: null,
          reminder_date: null,
        })
        .eq('id', requestData.entityId);

      result = { success: true };
    }

    return new Response(
      JSON.stringify(result),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Calendar event error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
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