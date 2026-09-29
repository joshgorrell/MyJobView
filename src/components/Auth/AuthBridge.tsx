import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { isValidReturnHost, buildAuthCallbackUrl, getReturnPath } from '../../lib/crossDomainAuth';

export function AuthBridge() {
  const [status, setStatus] = useState<'loading' | 'redirecting' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    async function bridge() {
      const params = new URLSearchParams(window.location.search);
      const returnTo = params.get('return_to');

      if (!returnTo || !isValidReturnHost(returnTo)) {
        setStatus('error');
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
        setStatus('redirecting');
        window.location.replace(callbackUrl);
      } catch (err) {
        console.error('Auth bridge error:', err);
        setStatus('error');
        setError('Failed to transfer session. Please try logging in again.');
      }
    }

    bridge();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-600/40 p-8 max-w-md w-full text-center">
        {status === 'loading' && (
          <>
            <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent mb-4"></div>
            <p className="text-gray-300 text-lg">Transferring your session...</p>
          </>
        )}
        {status === 'redirecting' && (
          <p className="text-gray-300 text-lg">Redirecting to your dealer portal...</p>
        )}
        {status === 'error' && (
          <>
            <p className="text-red-300 text-lg mb-4">{error}</p>
            <button
              onClick={() => window.location.replace('https://myjobview.com')}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Return to login
            </button>
          </>
        )}
      </div>
    </div>
  );
}
