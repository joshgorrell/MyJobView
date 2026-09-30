import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { isValidReturnHost, buildAuthCallbackUrl, getReturnPath } from '../../lib/crossDomainAuth';
import { BrandedLoading } from '../Shared/BrandedLoading';

export function AuthBridge() {
  const [error, setError] = useState<string | null>(null);
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    async function bridge() {
      const params = new URLSearchParams(window.location.search);
      const returnTo = params.get('return_to');

      if (!returnTo || !isValidReturnHost(returnTo)) {
        setError('Invalid return destination.');
        return;
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          const loginUrl = new URL('https://myjobview.com/');
          loginUrl.searchParams.set('redirect_to', returnTo);
          loginUrl.searchParams.set('return_path', getReturnPath());
          window.location.replace(loginUrl.toString());
          return;
        }

        const returnPath = getReturnPath();
        const callbackUrl = buildAuthCallbackUrl(
          returnTo,
          session.access_token,
          session.refresh_token,
          returnPath,
        );
        window.location.replace(callbackUrl);
      } catch (err) {
        console.error('Auth bridge error:', err);
        setError('Failed to transfer session. Please try logging in again.');
      }
    }

    bridge();
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-600/40 p-8 max-w-md w-full text-center">
          <p className="text-red-300 text-lg mb-4">{error}</p>
          <button
            onClick={() => window.location.replace('https://myjobview.com')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Return to login
          </button>
        </div>
      </div>
    );
  }

  return <BrandedLoading message="Connecting to your portal..." />;
}
