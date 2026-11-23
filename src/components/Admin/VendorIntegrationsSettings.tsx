import { useState } from 'react';
import { Building2, ChevronDown, ExternalLink, LockKeyhole, PackageSearch, ShieldCheck } from 'lucide-react';

const vendors = [
  {
    name: 'ADI / Snap One',
    detail: 'Catalog, dealer pricing, availability and ordering',
    note: 'Vendor approval and brand entitlements must be confirmed.',
    website: 'https://www.adiglobaldistribution.us/',
    steps: ['Contact your ADI account representative and request supported integration options.', 'Ask whether catalog, account-specific pricing, availability and ordering are available through API, EDI or approved feeds.', 'Confirm permitted brands, credentials, rate limits, refresh requirements and sandbox access.', 'Have an administrator configure and test the connector once MyJobView supports it.'],
  },
  {
    name: 'Ingram Micro',
    detail: 'Catalog, dealer pricing and availability',
    note: 'Connector not yet configured.',
    website: 'https://developer.ingrammicro.com/',
    steps: ['Confirm your reseller account and developer-program eligibility.', 'Request the appropriate API access and sandbox credentials.', 'Confirm pricing, stock, order and rate-limit permissions.', 'Test the approved connector before enabling production sync.'],
  },
  {
    name: 'TD SYNNEX',
    detail: 'Catalog, dealer pricing and availability',
    note: 'Connector not yet configured.',
    website: 'https://www.tdsynnex.com/',
    steps: ['Ask your account representative for current API or electronic-commerce integration documentation.', 'Confirm dealer-specific catalog, pricing, stock and ordering permissions.', 'Obtain sandbox credentials and document rate limits.', 'Test the approved connector before enabling production sync.'],
  },
  {
    name: 'D&H',
    detail: 'Catalog, pricing and availability',
    note: 'Integration options require distributor confirmation.',
    website: 'https://www.dandh.com/',
    steps: ['Contact your D&H representative about supported API, EDI or product-feed options.', 'Verify dealer-specific pricing and inventory entitlements.', 'Request integration documentation and test credentials.', 'Validate the connector before any automated ordering.'],
  },
] as const;

/** Discovery and setup guidance only. No fabricated connection status or background polling. */
export function VendorIntegrationsSettings() {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6 space-y-5" aria-labelledby="vendor-integrations-heading">
      <div className="flex items-start gap-3">
        <PackageSearch className="h-6 w-6 text-blue-600 shrink-0" aria-hidden="true" />
        <div>
          <h4 id="vendor-integrations-heading" className="text-lg font-semibold text-gray-900">Vendor API Directory</h4>
          <p className="text-sm text-gray-600 mt-1">Explore potential distributor integrations and the steps required to activate approved access.</p>
        </div>
      </div>
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 flex items-start gap-2">
        <LockKeyhole className="h-5 w-5 shrink-0 text-blue-700" aria-hidden="true" />
        <p className="text-sm text-blue-900">Directory entries are candidates, not active connections. Vendor access is not enabled here. Credentials, pricing and API availability must be verified with each provider.</p>
      </div>
      <div className="divide-y divide-gray-200 rounded-lg border border-gray-200">
        {vendors.map(vendor => (
          <div key={vendor.name} className="p-4 space-y-3">
            <button type="button" aria-expanded={expanded === vendor.name}
              onClick={() => setExpanded(current => current === vendor.name ? null : vendor.name)}
              className="flex w-full items-start gap-3 text-left">
              <Building2 className="h-5 w-5 mt-0.5 shrink-0 text-gray-500" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-gray-900">{vendor.name}</span>
                <span className="block text-sm text-gray-600">{vendor.detail}</span>
                <span className="block text-xs text-gray-500 mt-1">{vendor.note}</span>
              </span>
              <span className="text-xs whitespace-nowrap rounded-full bg-gray-100 text-gray-700 px-2 py-1">Not configured</span>
              <ChevronDown className={`h-4 w-4 mt-1 shrink-0 transition-transform ${expanded === vendor.name ? 'rotate-180' : ''}`} />
            </button>
            {expanded === vendor.name && (
              <div className="ml-8 space-y-2 text-sm text-gray-700">
                <p className="font-medium">Setup checklist</p>
                <ol className="list-decimal pl-5 space-y-1">
                  {vendor.steps.map(step => <li key={step}>{step}</li>)}
                </ol>
                <a href={vendor.website} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-700 hover:underline">
                  Provider website <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-start gap-2 text-sm text-gray-600">
        <ShieldCheck className="h-5 w-5 shrink-0 text-gray-500" aria-hidden="true" />
        <p>Future health monitoring should use existing sync results, record failures and last-success timestamps, and skip disconnected integrations. No recurring provider polling is enabled by this directory.</p>
      </div>
    </section>
  );
}
