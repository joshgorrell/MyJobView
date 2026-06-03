import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase environment variables are not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const isScheduled = body?.scheduled === true;

    if (!isScheduled) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return new Response(
          JSON.stringify({ success: false, message: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

      if (authError || !user) {
        return new Response(
          JSON.stringify({ success: false, message: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if (!profile || !['admin', 'superadmin'].includes(profile.role)) {
        return new Response(
          JSON.stringify({ success: false, message: 'Forbidden: Admin access required' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const { data: activeSessions, error: sessionsError } = await supabase
      .from('user_sessions')
      .select('user_id, id')
      .eq('is_active', true);

    if (sessionsError) {
      throw new Error(`Failed to fetch active sessions: ${sessionsError.message}`);
    }

    const userIds = [...new Set((activeSessions || []).map((s: any) => s.user_id))];

    let revokedCount = 0;
    const revokeErrors: string[] = [];

    for (const userId of userIds) {
      try {
        const { error: signOutError } = await supabase.auth.admin.signOut(userId, 'global');
        if (signOutError) {
          revokeErrors.push(`User ${userId}: ${signOutError.message}`);
        } else {
          revokedCount++;
        }
      } catch (e) {
        revokeErrors.push(`User ${userId}: ${e instanceof Error ? e.message : 'unknown error'}`);
      }
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('user_sessions')
      .update({
        is_active: false,
        session_end: now,
      })
      .eq('is_active', true);

    if (updateError) {
      console.error('Failed to update session records:', updateError.message);
    }

    const sessionsClosedCount = activeSessions?.length || 0;

    await supabase.rpc('record_scheduled_logout_run', {
      sessions_closed: sessionsClosedCount,
    }).catch((e: any) => console.error('Failed to record logout run:', e));

    await supabase.from('session_cleanup_log').insert({
      sessions_closed: sessionsClosedCount,
      success: revokeErrors.length === 0,
      error_message: revokeErrors.length > 0 ? revokeErrors.join('; ') : null,
    }).catch((e: any) => console.error('Failed to write cleanup log:', e));

    console.log(`Force logout complete: ${revokedCount} users signed out, ${sessionsClosedCount} sessions closed`);

    return new Response(
      JSON.stringify({
        success: true,
        users_signed_out: revokedCount,
        sessions_closed: sessionsClosedCount,
        errors: revokeErrors.length > 0 ? revokeErrors : undefined,
        executed_at: now,
        message: `Successfully logged out ${revokedCount} user(s) and closed ${sessionsClosedCount} session(s).`,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in force-logout-all-users:', error);
    return new Response(
      JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        users_signed_out: 0,
        sessions_closed: 0,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
