/**
 * Server-only RingCentral OAuth refresh adapter.
 * Tokens must be stored encrypted per connected account; never in the browser
 * or in voicemail records. The caller owns persistence and refresh locking.
 */
export interface RingCentralOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  refreshExpiresAt?: string;
}
export interface RingCentralOAuthTransport {
  fetch(url: string, init: RequestInit): Promise<Response>;
}
export class RingCentralOAuthClient {
  private readonly origin: string;
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly transport: RingCentralOAuthTransport = { fetch: (url, init) => fetch(url, init) },
    origin = 'https://platform.ringcentral.com',
  ) {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'https:' ||
        !['platform.ringcentral.com', 'platform.devtest.ringcentral.com'].includes(parsed.hostname) ||
        parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password) {
      throw Error('Unapproved RingCentral OAuth origin');
    }
    if (!clientId || !clientSecret) throw Error('Missing RingCentral OAuth client credentials');
    this.origin = parsed.origin;
  }
  async refresh(refreshToken: string, now = Date.now()): Promise<RingCentralOAuthTokens> {
    if (!refreshToken || refreshToken.length > 8192) throw Error('Invalid refresh token');
    const form = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken });
    const credentials = btoa(this.clientId + ':' + this.clientSecret);
    const response = await this.transport.fetch(this.origin + '/restapi/oauth/token', {
      method: 'POST', redirect: 'error',
      headers: {
        'authorization': 'Basic ' + credentials,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: form,
    });
    if (!response.ok) throw Error('RingCentral OAuth refresh HTTP ' + response.status);
    const result = await response.json() as Record<string, unknown>;
    if (typeof result.access_token !== 'string' || !result.access_token ||
        typeof result.refresh_token !== 'string' || !result.refresh_token ||
        typeof result.expires_in !== 'number' || !Number.isFinite(result.expires_in) ||
        result.expires_in <= 0 || result.expires_in > 86400) {
      throw Error('Invalid RingCentral OAuth token response');
    }
    const refreshSeconds = result.refresh_token_expires_in;
    if (refreshSeconds !== undefined && (typeof refreshSeconds !== 'number' ||
        !Number.isFinite(refreshSeconds) || refreshSeconds <= 0)) {
      throw Error('Invalid RingCentral OAuth refresh expiry');
    }
    return {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      expiresAt: new Date(now + result.expires_in * 1000).toISOString(),
      ...(typeof refreshSeconds === 'number'
        ? { refreshExpiresAt: new Date(now + refreshSeconds * 1000).toISOString() } : {}),
    };
  }
}
