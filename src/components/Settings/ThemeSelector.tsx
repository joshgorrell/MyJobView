import { useState } from 'react';
import { Check, Flag, Moon, Sparkles, Sun } from 'lucide-react';
import { useTheme, type ThemePreference } from '../../contexts/ThemeContext';

const choices = [
  { value: 'classic', label: 'Classic Gradient', description: 'Purple workspace', icon: Sparkles, preview: 'from-slate-900 via-purple-900 to-slate-900' },
  { value: 'light', label: 'Light', description: 'Bright and clear', icon: Sun, preview: 'from-white to-slate-200' },
  { value: 'dark', label: 'Dark', description: 'Dim and focused', icon: Moon, preview: 'from-slate-900 to-slate-700' },
  { value: 'mjv', label: 'MJV', description: 'Red, white, blue & black', icon: Flag, preview: 'from-red-700 via-white to-blue-700' },
] satisfies { value: ThemePreference; label: string; description: string; icon: typeof Sun; preview: string }[];

export function ThemeSelector() {
  const { preference, setPreference } = useTheme();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function select(value: ThemePreference) {
    if (saving || preference === value) return;
    setSaving(true);
    setError('');
    try { await setPreference(value); }
    catch { setError('Could not save your theme. Please try again.'); }
    finally { setSaving(false); }
  }

  return (
    <section className="rounded-xl border border-subtle bg-canvas p-3 sm:p-4 text-primary" aria-labelledby="appearance-title">
      <h2 id="appearance-title" className="font-semibold">Appearance</h2>
      <p className="mt-1 text-sm text-muted">Choose your look. Your theme is saved to your account across devices.</p>
      <div className="mt-3 grid grid-cols-4 gap-2" role="group" aria-label="Color theme" aria-busy={saving}>
        {choices.map(({ value, label, description, icon: Icon, preview }) => (
          <button key={value} type="button" aria-pressed={preference === value} disabled={saving}
            onClick={() => select(value)}
            className={`min-w-0 rounded-lg border p-1.5 sm:p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-wait ${preference === value ? 'border-brand bg-infoSoft text-primary' : 'border-subtle bg-surface text-primary hover:bg-elevated'}`}>
            <span data-theme-fixed aria-hidden="true" className={`mb-2 flex h-7 items-center justify-end rounded-md bg-gradient-to-r ${preview} ${value === 'mjv' ? 'border-2 border-black' : ''}`}>
              {preference === value && <Check className="mr-1 h-5 w-5 rounded-full bg-blue-700 p-0.5 text-white" />}
            </span>
            <span className="flex flex-col sm:flex-row items-start gap-1 text-xs sm:text-sm font-semibold leading-4 sm:leading-5"><Icon aria-hidden="true" className="h-4 w-4 shrink-0" />{label}</span>
            <span className="mt-0.5 hidden sm:block text-xs text-muted">{description}</span>
          </button>
        ))}
      </div>
      <p role="status" className="mt-2 text-xs text-muted">{saving ? 'Saving preference…' : 'Changes apply throughout your workspace.'}</p>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </section>
  );
}
