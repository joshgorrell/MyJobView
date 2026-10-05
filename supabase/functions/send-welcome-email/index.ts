import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { handleAccountEmail } from '../_shared/employee-account-email.ts';
Deno.serve(req => handleAccountEmail(req, 'welcome'));
