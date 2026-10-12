import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { sendSystemEmail } from '../_shared/system-email.ts';
import { handleWeeklyActivity } from './worker.ts';
Deno.serve(req => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false, autoRefreshToken: false } });
  return handleWeeklyActivity(req, db, sendSystemEmail);
});
