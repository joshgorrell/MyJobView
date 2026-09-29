import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { parseAuthCallbackTokens, getReturnPath } from '../../lib/crossDomainAuth';

export function AuthCallback() {
  const [error, setError] = useState<string | null>(null);
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    async function handleCallback() {
      const tokens = parseAuthCallbackTokens();
      if (!tokens) {
        setError('Invalid session transfer. Please log in again.');
        return;
      }

      try {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
        });

        if (sessionError) throw sessionError;

        window.location.hash = '';
        const returnPath = getReturnPath();
        window.location.replace(returnPath);
      } catch (err) {
        console.error('Auth callback error:', err);
        setError('Failed to establish session. Please log in again.');
      }
    }

    handleCallback();
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-600/40 p-8 max-w-md w-full text-center">
          <p className="text-red-300 text-lg mb-4">{error}</p>
          <button
            onClick={() => window.location.replace('/')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-600/40 p-8 max-w-md w-full text-center">
        <div className="inline-block animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent mb-4"></div>
        <p className="text-gray-300 text-lg">Signing you in...</p>
      </div>
    </div>
  );
}
