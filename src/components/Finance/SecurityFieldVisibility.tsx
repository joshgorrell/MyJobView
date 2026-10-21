import { Eye, LockKeyhole } from 'lucide-react';

export function SecurityFieldVisibility({ internal = false }: { internal?: boolean }) {
  const label = internal ? 'Internal only — not shown to customers' : 'Customer-visible — appears on customer-facing documents';
  const Icon = internal ? LockKeyhole : Eye;
  return (
    <span className={`inline-flex ml-1.5 align-middle ${internal ? 'text-gray-500' : 'text-blue-600'}`} title={label} aria-label={label} role="img">
      <Icon className="w-4 h-4" aria-hidden="true" />
    </span>
  );
}

// Visibility details are available on each field icon without a large instructional banner.
export function SecurityVisibilityGuide() {
  return null;
}
