import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface ArchiveResult {
  success: boolean;
  archived_count: number;
  proposal_ids: string[];
  cutoff_date: string;
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

    // Execute the auto-archive function
    const { data: result, error: rpcError } = await supabase
      .rpc('auto_archive_declined_proposals');

    if (rpcError) {
      throw new Error(`Failed to execute auto-archive: ${rpcError.message}`);
    }

    const archiveResult = result as ArchiveResult;

    console.log('Auto-archive proposals completed:', archiveResult);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Auto-archive proposals executed successfully',
        result: archiveResult,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in auto-archive-declined-proposals:', error);

    return new Response(
      JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        archived_count: 0,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
