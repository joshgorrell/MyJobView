import { Eye, LockKeyhole, HelpCircle } from 'lucide-react';

export function SecurityFieldVisibility({ internal = false }: { internal?: boolean }) {
  const label = internal ? 'Internal only — not shown to customers' : 'Customer-visible — included in customer-facing documents';
  const Icon = internal ? LockKeyhole : Eye;
  return (
    <span className="inline-flex ml-1.5 align-middle" title={label}>
      <Icon role="img" aria-label={label} className={`h-4 w-4 ${internal ? 'text-gray-400' : 'text-blue-500'}`} />
    </span>
  );
}

export function SecurityVisibilityGuide() {
  return (
    <details className="group text-xs text-gray-500">
      <summary className="inline-flex items-center gap-1.5 cursor-pointer select-none list-none hover:text-gray-700">
        <HelpCircle className="h-4 w-4" aria-hidden="true" />
        <span>What do the visibility icons mean?</span>
      </summary>
      <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2 text-gray-600">
        <p className="flex items-center gap-2"><Eye className="h-4 w-4 text-blue-500" aria-hidden="true" /> Customer-visible: appears on the customer onboarding form or agreement.</p>
        <p className="flex items-center gap-2"><LockKeyhole className="h-4 w-4 text-gray-400" aria-hidden="true" /> Internal only: visible to staff, not customers.</p>
        <p>Selected service names and the total account price are customer-visible. Individual service prices remain internal.</p>
      </div>
    </details>
  );
}
