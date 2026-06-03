import { useState } from 'react';
import { Lock, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { BrowserDiagnostics } from '../Shared/BrowserDiagnostics';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const { signIn, signUp, resetPassword, resendConfirmation } = useAuth();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (isForgotPassword) {
        await resetPassword(email);
        setSuccess('Password reset email sent! Check your inbox for the reset link.');
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
        errorMessage = 'Invalid email or password. If you just signed up, please check your email for a confirmation link first.';
      } else if (errorMessage.includes('Email not confirmed')) {
        errorMessage = 'Please confirm your email address before signing in. Check your inbox for the confirmation link.';
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-900 via-purple-900 to-fuchsia-900 flex items-center justify-center p-4">
      <div className="bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-purple-500/30 p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <img
            src="/el_logo_color_(2).png"
            alt="MyJobView"
            className="h-24 mx-auto mb-6"
          />
          <h1 className="text-3xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent mb-2">MyJobView</h1>
          <p className="text-gray-300">
            {isForgotPassword ? 'Reset your password' : isSignUp ? 'Create your account' : 'Sign in to your account'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder-gray-500"
              placeholder="you@company.com"
              disabled={loading}
            />
          </div>

          {!isForgotPassword && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder-gray-500"
                placeholder="••••••••"
                disabled={loading}
                minLength={6}
              />
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
            className="w-full bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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

        <div className="mt-6 text-center space-y-2">
          {!isForgotPassword && (
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors block w-full"
            >
              {isSignUp ? 'Already have an account? Sign in' : 'Need an account? Sign up'}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setIsForgotPassword(!isForgotPassword);
              setIsSignUp(false);
              setError(null);
              setSuccess(null);
            }}
            className="text-sm text-gray-400 hover:text-gray-300 transition-colors block w-full"
          >
            {isForgotPassword ? 'Back to sign in' : 'Forgot password?'}
          </button>
          <button
            type="button"
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="text-sm text-yellow-400 hover:text-yellow-300 transition-colors flex items-center justify-center gap-2 w-full"
          >
            <AlertCircle className="w-4 h-4" />
            {showDiagnostics ? 'Hide Diagnostics' : 'Having trouble logging in?'}
          </button>
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
