import { notificationOptions, type NotificationPreferences } from '../../lib/notificationPreferences';

export function NotificationPreferenceFields({ value, onChange, disabled = false }: {
  value: NotificationPreferences; onChange: (preferences: NotificationPreferences) => void; disabled?: boolean;
}) {
  return <div className="space-y-2">
    {notificationOptions.map(option => <label key={option.key} className="flex items-center justify-between gap-4 rounded-xl border border-subtle bg-canvas p-3 sm:p-4 cursor-pointer">
      <div className="min-w-0"><span className="block text-sm font-semibold text-primary">{option.title}</span><span className="mt-1 block text-xs leading-5 text-secondary">{option.description}</span></div>
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" role="switch" aria-label={option.title} checked={value[option.key]} disabled={disabled} onChange={event => onChange({ ...value, [option.key]: event.target.checked })} className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed" />
        <span aria-hidden="true" className={`inline-flex h-6 w-11 items-center rounded-full p-0.5 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-cyan-500 peer-focus-visible:ring-offset-2 peer-disabled:opacity-50 ${value[option.key] ? 'bg-cyan-600' : 'bg-slate-500'}`}><span className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${value[option.key] ? 'translate-x-5' : 'translate-x-0'}`} /></span>
      </span>
    </label>)}
  </div>;
}
