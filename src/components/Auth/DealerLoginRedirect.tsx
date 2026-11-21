import { useEffect, useState } from 'react';
import { resolveAuthenticatedDealerHost, navigateToDealerBridge } from '../../lib/dealerLoginRouting';
import { BrandedLoading } from '../Shared/BrandedLoading';

export function DealerLoginRedirect({ userId }: { userId: string }) {
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    resolveAuthenticatedDealerHost(userId).then(host => {
      if (cancelled) return;
      if (host) navigateToDealerBridge(host);
      else setError(true);
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [userId]);

  if (error) return <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center gap-4 p-6 text-center">
    <p>We couldn't find an active dealer workspace for this account.</p>
    <a href="/" className="text-sky-400 underline">Return to MyJobView</a>
  </div>;
  return <BrandedLoading message="Opening your dealer workspace..." />;
}
