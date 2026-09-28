export const RESERVED_SUBDOMAINS = [
  'www', 'api', 'admin', 'mail', 'app', 'portal', 'support', 'help',
  'staging', 'dev', 'test', 'myjobview', 'bolt', 'mjjv', 'mjv', 'auth',
  'cdn', 'ns1', 'ns2', 'ftp', 'smtp', 'pop', 'imap', 'webmail',
  'dashboard', 'manage', 'panel', 'console', 'billing', 'payments',
  'status', 'assets', 'static', 'media', 'img', 'images', 'docs',
  'blog', 'shop', 'store', 'landing', 'home', 'secure', 'vpn',
  'remote', 'git', 'ci', 'cd', 'build', 'deploy', 'monitor', 'logs',
  'analytics', 'tracking', 'tags', 'pixels', 'go', 'link', 'redirect',
  'sso', 'oauth', 'login', 'signup', 'register', 'account',
  'settings', 'config', 'internal', 'staff', 'employee', 'agent',
  'bot', 'service', 'worker', 'cron', 'queue', 'job', 'task',
  'notification', 'alert', 'webhook', 'api-gateway', 'relay',
  'proxy', 'tunnel', 'edge', 'function', 'supabase', 'resend',
  'stripe', 'el', 'elc', 'electroniclife', 'electronic-life',
];

const SUBDOMAIN_REGEX = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

export function isValidSubdomainFormat(subdomain: string): boolean {
  if (!subdomain) return false;
  if (!SUBDOMAIN_REGEX.test(subdomain)) return false;
  if (subdomain.includes('--')) return false;
  return true;
}

export function isReservedSubdomain(subdomain: string): boolean {
  return RESERVED_SUBDOMAINS.includes(subdomain.toLowerCase());
}

export function validateSubdomain(subdomain: string): { valid: boolean; error?: string } {
  const trimmed = subdomain.trim().toLowerCase();

  if (!trimmed) return { valid: false, error: 'Subdomain is required' };
  if (trimmed.length < 3) return { valid: false, error: 'Must be at least 3 characters' };
  if (trimmed.length > 30) return { valid: false, error: 'Must be 30 characters or fewer' };
  if (!SUBDOMAIN_REGEX.test(trimmed)) return { valid: false, error: 'Use only lowercase letters, numbers, and hyphens. Must start and end with a letter or number.' };
  if (trimmed.includes('--')) return { valid: false, error: 'Cannot contain consecutive hyphens' };
  if (isReservedSubdomain(trimmed)) return { valid: false, error: 'This name is reserved and cannot be used' };

  return { valid: true };
}

const KNOWN_DOMAINS = ['myjobview.com', 'bolt.host', 'localhost', 'localtest.me'];

export function getSubdomainFromHostname(hostname: string): string | null {
  if (!hostname) return null;

  const host = hostname.toLowerCase().replace(/^www\./, '');

  for (const domain of KNOWN_DOMAINS) {
    if (host === domain || host === `www.${domain}`) return null;
    if (host.endsWith(`.${domain}`)) {
      const parts = host.slice(0, host.length - domain.length - 1);
      if (parts && !parts.includes('.')) return parts;
    }
  }

  if (host.includes('.')) {
    const parts = host.split('.');
    if (parts.length >= 3) {
      return parts[0];
    }
  }

  return null;
}
