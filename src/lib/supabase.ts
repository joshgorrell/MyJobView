import { createClient } from '@supabase/supabase-js';
import { parsePasswordRecoveryLink } from './passwordRecovery';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

let recoveryVerifier = '';
try {
  recoveryVerifier = window.localStorage.getItem(`sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token-code-verifier`) || '';
} catch { /* The login screen reports unavailable browser storage. */ }
// Capture before the SDK can remove callback parameters. Recovery is verified
// explicitly on submit; other OAuth and session-transfer callbacks stay intact.
export const passwordRecoveryLink = parsePasswordRecoveryLink(new URL(window.location.href), recoveryVerifier);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: !passwordRecoveryLink.active,
    flowType: 'pkce',
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});
