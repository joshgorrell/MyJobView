import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { handleAccountEmail } from '../_shared/employee-account-email.ts';
// Redeployed 2026-10-05 to pick up welcome_support_email + updated template.
Deno.serve(req => handleAccountEmail(req, 'reset'));
