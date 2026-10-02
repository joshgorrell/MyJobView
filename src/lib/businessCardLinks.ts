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
  const publicMatch = pathname.match(/^\/([^/]+)$/);
  return publicMatch ? decodeURIComponent(publicMatch[1]) : null;
}
