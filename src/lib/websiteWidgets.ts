export const websiteWidgetKinds = ['sales-lead', 'chat', 'service', 'feedback', 'portal', 'analytics'] as const;
export type WebsiteWidgetKind = typeof websiteWidgetKinds[number];

export function normalizeWebsiteOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('An HTTPS website origin is required');
  }
  return url.origin;
}

export function websiteWidgetEmbed(kind: WebsiteWidgetKind, publicId: string, assetOrigin: string, configOrigin: string): string {
  if (!websiteWidgetKinds.includes(kind) || !/^[a-zA-Z0-9_-]{16,128}$/.test(publicId)) {
    throw new Error('Invalid widget identifier');
  }
  const origin = normalizeWebsiteOrigin(assetOrigin);
  const config = normalizeWebsiteOrigin(configOrigin) + '/functions/v1/website-widget-config';
  return '<script async src="' + origin + '/website-widgets/' + kind + '.js" data-widget="' + publicId + '" data-config="' + config + '"></script>';
}

export function websiteWidgetAllowed(config: { enabled: boolean; allowedOrigins: readonly string[] }, origin: string): boolean {
  if (!config.enabled) return false;
  try {
    const normalized = normalizeWebsiteOrigin(origin);
    return config.allowedOrigins.some(value => {
      try { return normalizeWebsiteOrigin(value) === normalized; } catch { return false; }
    });
  } catch { return false; }
}
