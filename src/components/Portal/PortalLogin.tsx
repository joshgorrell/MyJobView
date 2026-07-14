import { useState, useEffect } from 'react';
import { Mail, CheckCircle, AlertCircle, Star, ArrowRight, Zap, Loader, LogIn } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export function PortalLogin() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState('');
  const [tokenFailed, setTokenFailed] = useState(false);
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [incompleteSignup, setIncompleteSignup] = useState(false);

  const searchParams = new URLSearchParams(window.location.search);
  const redirectParam = searchParams.get('redirect');
  const portalToken = searchParams.get('portal_token');

  useEffect(() => {
    async function checkExistingSession() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.user_metadata?.is_portal_user) {
        window.location.href = redirectParam || '/portal/punchlist';
      }
    }
    if (!portalToken) {
      checkExistingSession();
    }
  }, []);

  useEffect(() => {
    if (!portalToken) return;

    async function verifyToken() {
      setTokenLoading(true);
      setError('');
      try {
        const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-portal-token`;
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token: portalToken }),
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.error || 'This login link is invalid or has expired. Please request a new one.');
          setTokenFailed(true);
          setTokenLoading(false);
          window.history.replaceState(null, '', window.location.pathname);
          return;
        }

        const destination = redirectParam || '/portal/punchlist';

        const { error: sessionError } = await supabase.auth.verifyOtp({
          token_hash: data.token_hash,
          type: 'magiclink',
        });

        if (sessionError) {
          setError('Failed to sign in. Please request a new login link.');
          setTokenLoading(false);
          return;
        }

        await new Promise(resolve => setTimeout(resolve, 300));
        window.location.href = destination;
      } catch {
        setError('An error occurred while signing in. Please try again.');
        setTokenLoading(false);
      }
    }

    verifyToken();
  }, [portalToken]);

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setIsNewCustomer(false);
    setIncompleteSignup(false);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-portal-magic-link`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          redirectTo: redirectParam || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.isNewCustomer) setIsNewCustomer(true);
        if (data.incompleteSignup) setIncompleteSignup(true);
        throw new Error(data.error || 'Failed to send magic link');
      }

      setEmailSent(true);
    } catch (err) {
      console.error('Error sending magic link:', err);
      setError(err instanceof Error ? err.message : 'Failed to send magic link. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (tokenLoading) {
    return (
      <div className="min-h-screen bg-[#0a1628] flex items-center justify-center p-4 sm:p-6">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-cyan-500/8 rounded-full blur-3xl" />
        </div>
        <div className="relative bg-white rounded-2xl shadow-2xl p-8 sm:p-10 max-w-md w-full text-center">
          <div className="mx-auto w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-6 border-4 border-blue-100">
            <Loader className="w-10 h-10 text-blue-600 animate-spin" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Signing You In...</h2>
          <p className="text-gray-500 text-sm">Verifying your login link, please wait.</p>
        </div>
      </div>
    );
  }

  if (emailSent) {
    return (
      <div className="min-h-screen bg-[#0a1628] flex items-center justify-center p-4 sm:p-6">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-cyan-500/8 rounded-full blur-3xl" />
        </div>
        <div className="relative bg-white rounded-2xl shadow-2xl p-8 sm:p-10 max-w-md w-full">
          <div className="text-center">
            <div className="mx-auto w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-6 border-4 border-green-100">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Check Your Email</h2>
            <p className="text-gray-600 mb-2 leading-relaxed">
              We sent a secure login link to
            </p>
            <p className="text-gray-900 font-semibold mb-6 text-lg">{email}</p>
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6 text-left">
              <p className="text-sm text-blue-800 leading-relaxed">
                <span className="font-semibold block mb-1">What to do next:</span>
                Open your email and click the secure link to access your portal. The link is valid for <strong>30 days</strong> — save the email for easy access anytime!
              </p>
            </div>
            <button
              onClick={() => { setEmailSent(false); setEmail(''); }}
              className="text-blue-600 hover:text-blue-700 text-sm font-medium transition-colors"
            >
              Use a different email address
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a1628] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-cyan-500/8 rounded-full blur-3xl" />
        <div className="absolute top-1/2 right-10 w-64 h-64 bg-blue-800/15 rounded-full blur-2xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-[#0f2347] to-[#1a3a6e] px-6 sm:px-8 pt-10 pb-6 sm:pb-8 text-center">
            <img
              src="/el_logo_color_(2).png"
              alt="Electronic Life"
              className="mx-auto h-16 sm:h-20 mb-6 object-contain"
            />
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Customer Portal</h1>
            <p className="text-blue-200 text-sm sm:text-base">
              Electronic Life
            </p>
          </div>

          <div className="px-6 sm:px-8 py-6 sm:py-8">
            <p className="text-gray-600 text-sm sm:text-base text-center mb-6 leading-relaxed">
              Enter your email address and we'll send you a secure, password-free login link.
            </p>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-red-700 leading-relaxed">
                      {error.replace(' Click here to sign up now!', '')}
                    </p>
                    {tokenFailed && (
                      <p className="text-xs text-red-600 mt-2 leading-relaxed">
                        Enter your email below to receive a fresh login link.
                      </p>
                    )}
                    {isNewCustomer && (
                      <a
                        href="/portal/signup"
                        className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        Sign Up Now
                        <ArrowRight className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {incompleteSignup && (
                      <a
                        href="/portal/signup"
                        className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        Complete Signup
                        <ArrowRight className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleMagicLink} className="space-y-5">
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400 pointer-events-none" style={{width:'18px',height:'18px'}} />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="your.email@example.com"
                    className="w-full pl-10 pr-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 focus:bg-white transition-all text-gray-900 placeholder-gray-400"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl font-semibold transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 text-base"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Sending Link...
                  </>
                ) : (
                  <>
                    <Mail className="w-5 h-5" />
                    Send Secure Login Link
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-gray-100">
              <div className="bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200 rounded-xl p-5">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Star className="w-5 h-5 text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-amber-900 mb-1">Not a VIP Member Yet?</p>
                    <p className="text-xs text-amber-700 mb-3 leading-relaxed">
                      Get priority service, punchlist access, and exclusive member benefits.
                    </p>
                    <a
                      href="/portal/membership"
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold rounded-lg transition-colors"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      Join VIP Program
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-400 text-center mb-3">
                This portal is for Electronic Life customers only.
              </p>
              <div className="flex items-center justify-center gap-3 text-xs text-gray-400 mb-4">
                <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="hover:text-gray-600 underline underline-offset-2 transition-colors">
                  Privacy Policy
                </a>
                <span>·</span>
                <a href="/eula" target="_blank" rel="noopener noreferrer" className="hover:text-gray-600 underline underline-offset-2 transition-colors">
                  Terms of Service
                </a>
              </div>
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  window.location.href = '/';
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition-colors border border-gray-200"
              >
                <LogIn className="w-3.5 h-3.5" />
                Staff login
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-blue-300/60 text-xs mt-6">
          © {new Date().getFullYear()} Electronic Life. All rights reserved.
        </p>
      </div>
    </div>
  );
}
