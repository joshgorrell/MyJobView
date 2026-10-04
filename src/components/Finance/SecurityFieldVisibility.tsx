import React from 'react';

export function SecurityFieldVisibility({ internal = false }: { internal?: boolean }) {
  return <span className={`inline-block ml-2 px-2 py-0.5 rounded text-xs font-medium align-middle ${internal ? 'bg-gray-100 text-gray-700' : 'bg-blue-50 text-blue-800'}`}>
    {internal ? 'Internal only' : 'Customer-visible'}
  </span>;
}

export function SecurityVisibilityGuide() {
  return <p className="text-sm text-gray-700 bg-blue-50 border border-blue-200 rounded-lg p-3">
    Field labels show what appears on the customer onboarding form and contract copy. Internal only fields stay with staff. Selected service names and the overall account price are customer-visible; individual service prices stay internal.
  </p>;
}
