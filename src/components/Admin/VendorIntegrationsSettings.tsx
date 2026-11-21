import { Building2, LockKeyhole, PackageSearch, ShieldCheck } from 'lucide-react';

const vendors = [
  { name: 'ADI / Snap One', detail: 'Product catalog, dealer pricing, availability, and ordering', note: 'API access and brand entitlements must be confirmed with ADI.' },
  { name: 'Ingram Micro', detail: 'Catalog, dealer pricing, and availability', note: 'Connector not yet configured.' },
  { name: 'TD SYNNEX', detail: 'Catalog, dealer pricing, and availability', note: 'Connector not yet configured.' },
] as const;

/** Informational directory only. Never infer authorization from an account number or tenant name. */
export function VendorIntegrationsSettings() {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6 space-y-5" aria-labelledby="vendor-integrations-heading">
      <div className="flex items-start gap-3">
        <PackageSearch className="h-6 w-6 text-blue-600 shrink-0" aria-hidden="true" />
        <div>
          <h4 id="vendor-integrations-heading" className="text-lg font-semibold text-gray-900">Vendor Integrations</h4>
          <p className="text-sm text-gray-600 mt-1">Connect your own approved distributor accounts to access account-specific pricing and availability.</p>
        </div>
      </div>
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 flex items-start gap-2">
        <LockKeyhole className="h-5 w-5 shrink-0 text-blue-700" aria-hidden="true" />
        <p className="text-sm text-blue-900">Vendor access is not enabled yet. Electronic Life is the planned first pilot, subject to vendor verification. Other dealers will be able to request access once the secure approval workflow is available.</p>
      </div>
      <div className="divide-y divide-gray-200 rounded-lg border border-gray-200">
        {vendors.map(vendor => (
          <div key={vendor.name} className="flex items-start gap-3 p-4">
            <Building2 className="h-5 w-5 mt-0.5 shrink-0 text-gray-500" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h5 className="font-medium text-gray-900">{vendor.name}</h5>
              <p className="text-sm text-gray-600">{vendor.detail}</p>
              <p className="text-xs text-gray-500 mt-1">{vendor.note}</p>
            </div>
            <span className="text-xs whitespace-nowrap rounded-full bg-gray-100 text-gray-700 px-2 py-1">Coming soon</span>
          </div>
        ))}
      </div>
      <div className="flex items-start gap-2 text-sm text-gray-600">
        <ShieldCheck className="h-5 w-5 shrink-0 text-gray-500" aria-hidden="true" />
        <p>Dealer account numbers alone do not grant access. Vendor approval and any brand-specific authorization are required before pricing can be shown.</p>
      </div>
    </section>
  );
}
