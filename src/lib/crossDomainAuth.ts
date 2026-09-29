import { getSubdomainFromHostname, isReservedSubdomain } from './subdomainConfig';

const ROOT_DOMAIN = 'myjobview.com';

export function isDealerSubdomain(): boolean {
  const host = window.location.hostname.toLowerCase();
  if (!host.endsWith('.myjobview.com')) return false;
  if (host === 'www.myjobview.com' || host === 'myjobview.com') return false;
  return getSubdomainFromHostname(host) !== null;
}

export function getRootAuthBridgeUrl(returnPath?: string): string {
  const returnTo = window.location.hostname;
  const params = new URLSearchParams({ return_to: returnTo });
  if (returnPath) params.set('path', returnPath);
  return `https://${ROOT_DOMAIN}/auth-bridge?${params.toString()}`;
}

export function isValidReturnHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (!host.endsWith('.myjobview.com')) return false;
  if (host === 'www.myjobview.com' || host === 'myjobview.com') return false;
  const subdomain = getSubdomainFromHostname(host);
  if (!subdomain) return false;
  if (isReservedSubdomain(subdomain)) return false;
  return true;
}

function sanitizePath(path: string | null): string {
  if (!path) return '/';
  if (!path.startsWith('/') || path.startsWith('//')) return '/';
  return path;
}

export function buildAuthCallbackUrl(
  subdomainHost: string,
  accessToken: string,
  refreshToken: string,
  returnPath?: string,
): string {
  const payload = JSON.stringify({ access_token: accessToken, refresh_token: refreshToken });
  const encoded = btoa(payload);
  const path = sanitizePath(returnPath || '/');
  return `https://${subdomainHost}/auth-callback?path=${encodeURIComponent(path)}#auth_transfer=${encoded}`;
}

export function parseAuthCallbackTokens(): { accessToken: string; refreshToken: string } | null {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const encoded = params.get('auth_transfer');
  if (!encoded) return null;
  try {
    const decoded = JSON.parse(atob(encoded));
    if (!decoded.access_token || !decoded.refresh_token) return null;
    return { accessToken: decoded.access_token, refreshToken: decoded.refresh_token };
  } catch {
    return null;
  }
}

export function getReturnPath(): string {
  const params = new URLSearchParams(window.location.search);
  return sanitizePath(params.get('path'));
}

export function getAuthRedirectOrigin(): string {
  if (isDealerSubdomain()) {
    return `https://${ROOT_DOMAIN}`;
  }
  return window.location.origin;
}
