import type { SupabaseClient } from '@supabase/supabase-js';

export interface PasswordRecoveryLink {
  active: boolean;
  welcome: boolean;
  tokenHash: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  code: string | null;
  error: string | null;
}

export const invalidRecoveryMessage = 'This password link has expired or has already been used. Request a new link below.';

export function parsePasswordRecoveryLink(url: URL, verifier = ''): PasswordRecoveryLink {
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const setup = url.searchParams.get('account_setup');
  const tokenHash = hash.get('account_token_hash');
  const legacy = hash.get('type') === 'recovery';
  const code = url.searchParams.get('code');
  const error = hash.get('error_description') || url.searchParams.get('error_description') || hash.get('error') || url.searchParams.get('error');
  return {
    active: !!(tokenHash || legacy || setup === 'welcome' || setup === 'reset' || error || (code && verifier.includes('/PASSWORD_RECOVERY'))),
    welcome: setup === 'welcome', tokenHash,
    accessToken: legacy ? hash.get('access_token') : null,
    refreshToken: legacy ? hash.get('refresh_token') : null,
    code, error: error ? invalidRecoveryMessage : null,
  };
}

// Called only when the person submits the password form. Loading an email link
// never consumes its token, including when an email security scanner opens it.
export async function verifyPasswordRecovery(client: SupabaseClient, link: PasswordRecoveryLink) {
  if (link.error) throw new Error(link.error);
  const result = link.tokenHash
    ? await client.auth.verifyOtp({ token_hash: link.tokenHash, type: 'recovery' })
    : link.accessToken && link.refreshToken
      ? await client.auth.setSession({ access_token: link.accessToken, refresh_token: link.refreshToken })
      : link.code
        ? await client.auth.exchangeCodeForSession(link.code)
        : null;
  if (result?.error) {
    if (/otp_expired|flow_state|pkce|refresh_token_not_found|refresh_token_already_used|session_not_found/i.test(result.error.code || '') || /expired|invalid.*token|code verifier/i.test(result.error.message)) {
      throw new Error(invalidRecoveryMessage);
    }
    throw result.error;
  }
  if (!result || !result.data.session || !result.data.user) {
    throw new Error(invalidRecoveryMessage);
  }
  return result.data.user;
}
