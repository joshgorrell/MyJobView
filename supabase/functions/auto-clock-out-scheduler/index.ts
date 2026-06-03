import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface AutoClockOutResult {
  success: boolean;
  execution_log_id?: string;
  entries_processed: number;
  technician_ids?: string[];
  technician_names?: string[];
  total_points_deducted?: number;
  admin_notified?: boolean;
  notification_count?: number;
  executed_at?: string;
  execution_duration_ms?: number;
  message?: string;
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

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Supabase environment variables are not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if auto_clock_out_enabled is true (the SQL function also checks this,
    // but we do a quick guard here for a fast response when disabled)
    const { data: settings, error: settingsError } = await supabase
      .from('company_settings')
      .select('auto_clock_out_enabled, auto_clock_out_cutoff_time')
      .limit(1)
      .maybeSingle();

    if (settingsError) {
      throw new Error(`Failed to fetch settings: ${settingsError.message}`);
    }

    if (!settings?.auto_clock_out_enabled) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Auto clock-out is not enabled',
          entries_processed: 0,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Execute the auto clock-out function
    const { data: result, error: rpcError } = await supabase
      .rpc('auto_clock_out_forgotten_entries');

    if (rpcError) {
      throw new Error(`Failed to execute auto clock-out: ${rpcError.message}`);
    }

    const autoClockOutResult = result as AutoClockOutResult;

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Auto clock-out executed successfully',
        result: autoClockOutResult,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in auto-clock-out-scheduler:', error);

    return new Response(
      JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        entries_processed: 0,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
