import { getSubdomainFromHostname } from './subdomainConfig';

const PUBLIC_DOMAIN = 'myjobview.com';

export function getBusinessCardUrl(slug: string, subdomain?: string | null): string {
  const normalizedSubdomain = subdomain?.trim().toLowerCase();
  if (normalizedSubdomain) {
    return `https://${normalizedSubdomain}.${PUBLIC_DOMAIN}/${encodeURIComponent(slug)}`;
  }

  return `https://${PUBLIC_DOMAIN}/card/${encodeURIComponent(slug)}`;
}

export function getBusinessCardSlugFromLocation(pathname: string, hostname: string): string | null {
  const legacyMatch = pathname.match(/^\/card\/([^/]+)$/);
  if (legacyMatch) return decodeURIComponent(legacyMatch[1]);

  if (!getSubdomainFromHostname(hostname)) return null;
  // Dedicated application routes must take precedence over short public
  // business-card URLs on dealer subdomains. App.tsx resolves cards before
  // these pages, so an unguarded single-segment match hijacks the route.
  const applicationRoutes = new Set([
    '/sales-tv-dashboard',
    '/tv-dashboard',
    '/sales-order-fullscreen',
    '/assist',
    '/kiosk',
    '/privacy-policy',
    '/eula',
    '/auth-bridge',
    '/dealer-login',
  ]);
  if (applicationRoutes.has(pathname.toLowerCase().replace(/\/$/, ''))) return null;
  const publicMatch = pathname.match(/^\/([^/]+)$/);
  return publicMatch ? decodeURIComponent(publicMatch[1]) : null;
}
