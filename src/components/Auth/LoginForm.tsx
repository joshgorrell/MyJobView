import { useState, useEffect } from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { BrowserDiagnostics } from '../Shared/BrowserDiagnostics';
import { isValidReturnHost } from '../../lib/crossDomainAuth';
import { useTenant } from '../../contexts/TenantContext';

export function LoginForm() {
  const { tenant, loading: tenantLoading } = useTenant();
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const dealerName = tenant?.organizationName || 'MyJobView';
  const dealerLogo = tenant?.logoUrl && tenant.logoUrl !== failedLogoUrl ? tenant.logoUrl : null;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(new URLSearchParams(window.location.search).get('password_updated') === '1' ? 'Password saved. Sign in with your new password.' : null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const { signIn, signUp, resetPassword, resendConfirmation } = useAuth();
  const [returnToDealer, setReturnToDealer] = useState<string | null>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const redirect = urlParams.get('redirect_to');
    if (redirect && isValidReturnHost(redirect)) {
      setReturnToDealer(redirect);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (isForgotPassword) {
        await resetPassword(email);
        setSuccess('If an account exists for this email, a password reset link is on its way. Check your inbox and spam folder, and use the newest email.');
        setIsForgotPassword(false);
      } else if (isSignUp) {
        await signUp(email, password);
        setSuccess('Account created! Please check your email for a confirmation link, then sign in.');
        setIsSignUp(false);
        setPassword('');
      } else {
        console.log('Attempting sign in with:', email);
        try {
          await signIn(email, password);
          console.log('Sign in successful');
        } catch (signInError: any) {
          if (signInError.message?.includes('Email not confirmed')) {
            throw new Error('Please check your email and click the confirmation link before signing in.');
          }
          throw signInError;
        }
      }
    } catch (error: any) {
      console.error('Authentication error:', error);
      let errorMessage = error?.message || `Failed to ${isForgotPassword ? 'send reset email' : isSignUp ? 'sign up' : 'sign in'}. Please try again.`;

      if (errorMessage.includes('Invalid login credentials')) {
        errorMessage = 'The email or password is incorrect. Use Forgot password to choose a new password.';
      } else if (errorMessage.includes('Email not confirmed')) {
        errorMessage = 'Please confirm your email address before signing in. Check your inbox for the confirmation link.';
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-600/40 p-6 sm:p-8 max-w-md w-full">
        <div className="text-center mb-6" aria-busy={tenantLoading}>
          {tenantLoading ? (
            <div className="h-16 mb-4 rounded-xl bg-gray-800 animate-pulse" role="status" aria-label="Loading dealer branding" />
          ) : (
            <>
              <img
                src={dealerLogo || '/MJV_icon.PNG'}
                alt={dealerLogo ? dealerName : 'MyJobView'}
                className={dealerLogo ? 'h-16 sm:h-20 max-w-full mx-auto mb-4 object-contain' : 'h-16 w-16 mx-auto mb-4 object-contain rounded-xl'}
                onError={dealerLogo ? () => setFailedLogoUrl(dealerLogo) : undefined}
              />
              <h1 className="text-2xl font-bold text-white mb-2 break-words">{dealerName}</h1>
            </>
          )}
          <p className="text-gray-300">
            {isForgotPassword ? 'Reset your password' : isSignUp ? 'Create your account' : 'Sign in to your account'}
          </p>
          {returnToDealer && !isForgotPassword && !isSignUp && (
            <p className="text-blue-300 text-sm mt-2">
              You will be redirected back to {returnToDealer} after signing in.
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-sm font-medium text-gray-300 mb-2">
              Email Address
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-500"
              placeholder="you@company.com"
              disabled={loading}
            />
          </div>

          {!isForgotPassword && (
            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-gray-300 mb-2">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-500"
                placeholder="••••••••"
                disabled={loading}
                minLength={6}
              />
              {!isSignUp && (
                <div className="mt-1 text-right">
                  <button type="button" onClick={() => { setIsForgotPassword(true); setError(null); setSuccess(null); }} className="min-h-11 text-sm text-blue-300 hover:text-blue-200">
                    Forgot password?
                  </button>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 text-sm">
              <p>{error}</p>
              {error.includes('confirmation') && (
                <button
                  type="button"
                  onClick={async () => {
                    setLoading(true);
                    setError(null);
                    try {
                      await resendConfirmation(email);
                      setSuccess('Confirmation email resent! Please check your inbox.');
                    } catch (e: any) {
                      setError(e?.message || 'Failed to resend confirmation email.');
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="mt-2 text-xs underline hover:text-red-200"
                >
                  Resend confirmation email
                </button>
              )}
            </div>
          )}

          {success && (
            <div className="p-3 bg-green-500/20 border border-green-500/50 rounded-lg text-green-300 text-sm">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>Processing...</>
            ) : (
              <>
                <Lock className="w-5 h-5" />
                {isForgotPassword ? 'Send Reset Link' : isSignUp ? 'Sign Up' : 'Sign In'}
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-gray-700/60 flex items-center justify-center gap-x-3 text-[10px] min-[360px]:text-xs sm:text-sm">
          <a href="/portal" className="min-h-11 inline-flex items-center whitespace-nowrap text-blue-300 hover:text-blue-200 transition-colors">
            Customer Portal
          </a>
          {!isForgotPassword && (
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="min-h-11 whitespace-nowrap text-blue-300 hover:text-blue-200 transition-colors"
            >
              {isSignUp ? 'Back to sign in' : 'Create an account'}
            </button>
          )}
          {isForgotPassword && <button
            type="button"
            onClick={() => {
              setIsForgotPassword(!isForgotPassword);
              setIsSignUp(false);
              setError(null);
              setSuccess(null);
            }}
            className="min-h-11 whitespace-nowrap text-blue-300 hover:text-blue-200 transition-colors"
          >
            Back to sign in
          </button>}
          <button
            type="button"
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="min-h-11 whitespace-nowrap text-blue-300 hover:text-blue-200 transition-colors"
          >
            {showDiagnostics ? 'Hide login help' : 'Login help'}
          </button>
        </div>
        <div className="mt-5 flex items-center justify-center gap-2 text-xs text-gray-400">
          <span>Powered by</span>
          <img src="/MJV_icon.PNG" alt="" className="h-5 w-5 object-contain" />
          <span className="font-medium">MyJobView</span>
        </div>
      </div>

      {showDiagnostics && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between rounded-t-2xl">
              <h3 className="text-lg font-semibold text-gray-900">Browser Diagnostics</h3>
              <button
                onClick={() => setShowDiagnostics(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                Close
              </button>
            </div>
            <BrowserDiagnostics />
          </div>
        </div>
      )}
    </div>
  );
}
