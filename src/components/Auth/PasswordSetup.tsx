import { useState } from 'react';
import { CheckCircle2, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { passwordRecoveryLink } from '../../lib/supabase';
import { invalidRecoveryMessage } from '../../lib/passwordRecovery';

export function PasswordSetup() {
  const { updatePassword, resetPassword, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(passwordRecoveryLink.error);
  const [needsLink, setNeedsLink] = useState(!!passwordRecoveryLink.error || !(passwordRecoveryLink.tokenHash || passwordRecoveryLink.accessToken || passwordRecoveryLink.code));
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const welcome = passwordRecoveryLink.welcome;
  const input = 'w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400 disabled:opacity-60';

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setError(null);
    if (password !== confirmation) { setError('Your passwords do not match. Please try again.'); return; }
    setSaving(true);
    try {
      await updatePassword(password);
      setSaved(true);
      setPassword(''); setConfirmation('');
      window.history.replaceState(null, '', window.location.pathname);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save your password. Please try again.';
      setError(message);
      if (message === invalidRecoveryMessage || /session.*missing|refresh.*token|jwt.*expired/i.test(message)) setNeedsLink(true);
    } finally { setSaving(false); }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 flex items-center justify-center p-4">
      <main className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-6 sm:p-8 shadow-2xl">
        <img src="/MJV_icon.PNG" alt="MyJobView" className="mx-auto mb-6 h-16 w-16 rounded-xl object-contain" />
        <div className="mb-7 text-center">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-cyan-300">MyJobView • Account access</p>
          <h1 className="text-2xl font-semibold text-white">{saved ? 'Your password is ready' : needsLink ? 'Let’s get you a fresh link' : welcome ? 'Welcome to MyJobView' : 'Choose a new password'}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">{saved ? 'Sign in with your email and the password you just chose.' : needsLink ? 'Enter your account email and we’ll send a new password setup link.' : welcome ? 'Create your password to get started with your team.' : 'Enter and confirm the password you want to use.'}</p>
        </div>
        {error && <p role="alert" className="mb-5 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
        {saved ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto mb-6 h-12 w-12 text-emerald-400" aria-hidden="true" />
            <button disabled={saving} onClick={async () => {
              setSaving(true); setError(null);
              try { await signOut(); window.location.replace('/?password_updated=1'); }
              catch { setError('Could not finish signing out. Please try again.'); setSaving(false); }
            }} className="w-full rounded-xl bg-cyan-400 py-3 font-semibold text-slate-950 disabled:opacity-60">{saving ? 'Opening sign in…' : 'Go to Sign In'}</button>
          </div>
        ) : needsLink ? (
          <form onSubmit={async e => {
            e.preventDefault(); if (saving) return;
            setSaving(true); setError(null); setSent(false);
            try { await resetPassword(email); setSent(true); }
            catch (err) { setError(err instanceof Error ? err.message : 'Could not send the link. Please try again.'); }
            finally { setSaving(false); }
          }} className="space-y-4">
            <label className="block text-sm text-slate-200">Account email<input autoComplete="email" type="email" required value={email} disabled={saving} onChange={e => setEmail(e.target.value)} className={input + ' mt-2'} /></label>
            {sent && <p role="status" className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-200">If an account exists for this email, a new link is on its way. Check your inbox and spam folder, and use the newest email.</p>}
            <button disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 py-3 font-semibold text-slate-950 disabled:opacity-60"><Mail size={18} />{saving ? 'Sending…' : 'Send New Link'}</button>
          </form>
        ) : (
          <form onSubmit={save} className="space-y-5">
            <label className="block text-sm text-slate-200">New password
              <div className="relative mt-2"><input autoComplete="new-password" type={visible ? 'text' : 'password'} required minLength={6} value={password} disabled={saving} onChange={e => setPassword(e.target.value)} className={input + ' pr-12'} /><button type="button" aria-label={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(!visible)} className="absolute right-3 top-3 text-slate-300">{visible ? <EyeOff size={20} /> : <Eye size={20} />}</button></div>
            </label>
            <label className="block text-sm text-slate-200">Confirm password<input autoComplete="new-password" type={visible ? 'text' : 'password'} required minLength={6} value={confirmation} disabled={saving} onChange={e => setConfirmation(e.target.value)} className={input + ' mt-2'} /></label>
            <p className="text-xs leading-5 text-slate-400">Use at least 6 characters. A longer, unique password is best.</p>
            <button disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 py-3 font-semibold text-slate-950 disabled:opacity-60"><LockKeyhole size={18} />{saving ? 'Saving password…' : welcome ? 'Set My Password' : 'Save New Password'}</button>
          </form>
        )}
        {!saved && <a href="/" className="mt-6 block text-center text-sm text-slate-400 hover:text-white">Back to sign in</a>}
      </main>
    </div>
  );
}
