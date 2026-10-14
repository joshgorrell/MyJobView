import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Bell, Camera, Check, CheckCircle2, Smartphone, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import type { Profile } from '../../lib/types';
import { readNotificationPreferences } from '../../lib/notificationPreferences';
import { checkPushSubscription, subscribeToPushNotifications, unsubscribeFromPushNotifications } from '../../lib/pushNotifications';
import { NotificationPreferenceFields } from '../Settings/NotificationPreferenceFields';
import { createWorkspacePortal } from '../ui/workspacePortal';

export function EmployeeWelcomeOnboarding() {
  const { profile, isPortalUser, isPasswordRecovery } = useAuth();
  const [eligible, setEligible] = useState<{ userId: string; photo: string | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setEligible(null);
    if (!profile?.is_active || isPortalUser || isPasswordRecovery) return;
    async function load() {
      const { data, error } = await supabase.from('employee_welcome_onboarding').select('completed_at').eq('user_id', profile!.id).maybeSingle();
      if (cancelled || error || !data || data.completed_at) return;
      let photo = profile!.avatar_url;
      if (!photo) {
        const card = await supabase.from('business_cards').select('photo_url').eq('user_id', profile!.id).maybeSingle();
        photo = card.data?.photo_url || null;
      }
      if (!cancelled) setEligible({ userId: profile!.id, photo });
    }
    void load().catch(() => { /* Optional onboarding never blocks access to the workspace. */ });
    return () => { cancelled = true; };
  }, [profile?.id, profile?.is_active, isPortalUser, isPasswordRecovery]);
  if (!profile || eligible?.userId !== profile.id) return null;
  return <WelcomeSetupModal profile={profile} initialPhoto={eligible.photo} onClose={() => setEligible(null)} />;
}

function WelcomeSetupModal({ profile, initialPhoto, onClose }: { profile: Profile; initialPhoto: string | null; onClose: () => void }) {
  const { setProfileAvatar, companySettings } = useAuth();
  const [step, setStep] = useState(0);
  const [preferences, setPreferences] = useState(() => readNotificationPreferences(profile));
  const [photo, setPhoto] = useState(initialPhoto);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [enablingPush, setEnablingPush] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initials = profile.full_name.trim().split(/\s+/).slice(0, 2).map(name => name[0]).join('').toUpperCase();
  const firstName = profile.first_name || profile.full_name.trim().split(/\s+/)[0] || 'there';
  const steps = ['Your photo', 'Notifications', 'Ready to go'];
  const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed';

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    let cancelled = false;
    void checkPushSubscription().then(value => { if (!cancelled) setPushEnabled(value); });
    return () => { cancelled = true; document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, []);
  useEffect(() => { headingRef.current?.focus(); panelRef.current?.querySelector('[data-step-body]')?.scrollTo(0, 0); }, [step]);
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function selectPhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const candidate = event.target.files?.[0]; event.target.value = '';
    if (!candidate) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(candidate.type) || candidate.size === 0 || candidate.size > 5 * 1024 * 1024) {
      setError('Choose a JPG, PNG, or WebP photo up to 5 MB.'); return;
    }
    setError(null); setFile(candidate);
  }

  async function finish(skip: boolean) {
    if (savingRef.current || enablingPush) return;
    savingRef.current = true; setSaving(true); setError(null);
    let uploadedPath: string | null = null;
    let saved = false;
    try {
      let avatar = photo;
      if (!skip && file) {
        const extension = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp';
        uploadedPath = `${profile.id}/onboarding-${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from('business-card-photos').upload(uploadedPath, file, { upsert: false, cacheControl: '3600' });
        if (uploadError) throw uploadError;
        avatar = supabase.storage.from('business-card-photos').getPublicUrl(uploadedPath).data.publicUrl;
      }
      const { data, error: saveError } = await supabase.rpc('complete_employee_welcome_onboarding', {
        p_avatar_url: skip ? null : avatar, p_preferences: skip ? {} : preferences, p_skip: skip,
      });
      if (saveError || !data?.completed_at) throw saveError || new Error('Setup could not be saved.');
      saved = true;
      if (!skip) setProfileAvatar(data.avatar_url || null);
      if (uploadedPath && data.avatar_url !== avatar) {
        await supabase.storage.from('business-card-photos').remove([uploadedPath]).catch(() => {});
      }
      onClose();
      if (!skip) window.dispatchEvent(new Event('permissions-changed'));
    } catch {
      // The transaction keeps completion unset when any profile change fails.
      setError('We couldn’t save your setup. Your choices are still here—please try again.');
    } finally {
      if (!saved && uploadedPath) {
        // An ambiguous network failure may have committed. Only remove a draft
        // photo after checking that the profile does not reference that upload.
        try {
          const [current, completion] = await Promise.all([
            supabase.from('profiles').select('avatar_url').eq('id', profile.id).single(),
            supabase.from('employee_welcome_onboarding').select('completed_at').eq('user_id', profile.id).single(),
          ]);
          if (!current.error && completion.data?.completed_at) {
            setProfileAvatar(current.data.avatar_url || null); onClose();
          }
          const publicUrl = supabase.storage.from('business-card-photos').getPublicUrl(uploadedPath).data.publicUrl;
          if (!current.error && current.data?.avatar_url !== publicUrl) await supabase.storage.from('business-card-photos').remove([uploadedPath]);
        } catch { /* Keep the upload when its ownership state cannot be verified. */ }
      }
      savingRef.current = false; setSaving(false);
    }
  }

  const avatar = <div className="relative mx-auto flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full bg-cyan-500/15 text-3xl font-semibold text-brand ring-4 ring-cyan-500/20">
    {preview || photo ? <img src={preview || photo!} alt="Your profile photo" className="h-full w-full object-cover" onError={() => { if (file) { setFile(null); setError('That image could not be opened. Please choose another photo.'); } }} /> : initials}
  </div>;

  return createWorkspacePortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-2 sm:p-5 backdrop-blur-sm" onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); if (!saving && !enablingPush) void finish(true); }
      if (event.key === 'Tab') {
        const controls = panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href]');
        if (!controls?.length) { event.preventDefault(); return; }
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === headingRef.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="welcome-onboarding-title" aria-describedby="welcome-onboarding-description" className="flex max-h-[calc(100dvh-1rem)] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-subtle bg-surface shadow-2xl sm:max-h-[calc(100dvh-2.5rem)]">
        <header className="relative shrink-0 border-b border-subtle px-5 pb-5 pt-6 sm:px-8">
          <button type="button" aria-label="Skip setup for now" disabled={saving || enablingPush} onClick={() => void finish(true)} className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-elevated disabled:opacity-40"><X size={18} /></button>
          <div className="mb-5 flex items-center gap-3 pr-9"><img src="/MJV_icon.PNG" alt="MyJobView" className="h-10 w-10 object-contain" /><div><p className="text-xs font-semibold uppercase tracking-widest text-brand">Welcome to MyJobView</p><p className="mt-1 text-xs text-muted">{companySettings?.company_name || 'Your team’s workspace'}</p></div></div>
          <ol aria-label="Setup progress" className="mb-5 flex items-center gap-2">{steps.map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined} className="min-w-0 flex-1"><div className={`mb-2 h-1.5 rounded-full ${index <= step ? 'bg-cyan-500' : 'bg-elevated'}`} /><span className={`whitespace-nowrap text-[10px] sm:text-xs ${index === step ? 'font-semibold text-primary' : 'text-muted'}`}><span className="hidden sm:inline">{index + 1}. </span>{label}</span></li>)}</ol>
          <h2 ref={headingRef} tabIndex={-1} id="welcome-onboarding-title" className="text-2xl font-semibold text-primary outline-none">{step === 0 ? `Welcome, ${firstName}.` : step === 1 ? 'Choose what keeps you in the loop.' : 'You’re ready to join your team.'}</h2>
          <p id="welcome-onboarding-description" className="mt-2 text-sm leading-6 text-secondary">{step === 0 ? 'Add a photo so teammates can recognize you. You can also keep your initials.' : step === 1 ? 'These are the same settings you can change later in your profile.' : 'Save your choices and get started. You can adjust everything from your profile anytime.'}</p>
        </header>
        <div data-step-body className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8">
          {error && <p role="alert" className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-danger">{error}</p>}
          {step === 0 && <div className="py-2 text-center">{avatar}<p className="mb-5 mt-4 text-sm font-semibold text-primary">{profile.full_name}</p><input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose profile photo" onChange={selectPhoto} className="hidden" /><div className="flex flex-wrap justify-center gap-2"><button type="button" disabled={saving} onClick={() => inputRef.current?.click()} className={button + ' bg-cyan-600 text-white hover:bg-cyan-700'}><Camera size={17} />{photo || file ? 'Change photo' : 'Choose a photo'}</button>{(photo || file) && <button type="button" disabled={saving} onClick={() => { setFile(null); setPhoto(null); setError(null); }} className={button + ' border border-subtle text-secondary hover:bg-elevated'}>Use initials</button>}</div><p className="mt-4 text-xs text-muted">JPG, PNG, or WebP · up to 5 MB</p><p className="mt-5 text-xs leading-5 text-muted">Your photo is shared with your profile and digital business card.</p></div>}
          {step === 1 && <div className="space-y-5"><NotificationPreferenceFields value={preferences} onChange={setPreferences} disabled={saving} /><section className="rounded-xl border border-subtle p-4"><div className="flex items-start gap-3"><Smartphone size={20} className="mt-0.5 shrink-0 text-brand" /><div><h3 className="text-sm font-semibold text-primary">Notifications on this device</h3><p className="mt-1 text-xs leading-5 text-secondary">Optional browser alerts. Your browser will ask permission when you enable them.</p></div></div>{pushEnabled && <p className="mt-3 flex items-center gap-2 text-sm text-brand"><Check size={17} />Enabled on this device</p>}<button type="button" disabled={saving || enablingPush} onClick={async () => {
            const wasEnabled = pushEnabled;
            setEnablingPush(true); setPushMessage(null);
            try {
              const changed = wasEnabled ? await unsubscribeFromPushNotifications(profile.id) : await subscribeToPushNotifications(profile.id);
              if (changed) setPushEnabled(!wasEnabled);
              else { setPushEnabled(await checkPushSubscription()); setPushMessage(wasEnabled ? 'We couldn’t finish turning off alerts. You can try again later from your profile.' : 'Alerts weren’t enabled. Check your browser’s notification permission, or try again later from your profile.'); }
            } catch { setPushMessage('Alerts are unavailable on this device. You can continue setup.'); }
            finally { setEnablingPush(false); }
          }} className={button + ' mt-3 border border-subtle text-secondary hover:bg-elevated'}><Bell size={17} />{enablingPush ? 'Updating…' : pushEnabled ? 'Turn off browser alerts' : 'Enable browser alerts'}</button>{pushMessage && <p role="status" className="mt-3 text-xs leading-5 text-secondary">{pushMessage}</p>}</section></div>}
          {step === 2 && <div className="space-y-5"><div className="rounded-2xl border border-subtle bg-canvas p-5 text-center">{avatar}<h3 className="mt-4 font-semibold text-primary">{profile.full_name}</h3><p className="mt-1 break-all text-sm text-muted">{profile.email}</p></div><div className="flex items-start gap-3 rounded-xl bg-cyan-500/10 p-4"><CheckCircle2 size={21} className="mt-0.5 shrink-0 text-brand" /><div><p className="text-sm font-semibold text-primary">Your preferences, your way</p><p className="mt-1 text-sm text-secondary">{Object.values(preferences).filter(Boolean).length} of 6 notification types selected.{pushEnabled ? ' Browser alerts are enabled on this device.' : ''}</p></div></div></div>}
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-subtle px-5 py-4 sm:px-8">
          <button type="button" disabled={saving || enablingPush} onClick={() => step > 0 ? setStep(step - 1) : void finish(true)} className={button + ' text-muted hover:bg-elevated'}>{step > 0 ? <><ArrowLeft size={16} />Back</> : 'Skip for now'}</button>
          <button type="button" disabled={saving || enablingPush} onClick={() => step < 2 ? setStep(step + 1) : void finish(false)} className={button + ' bg-cyan-600 text-white hover:bg-cyan-700'}>{saving ? 'Saving…' : step === 2 ? 'Finish Setup' : 'Continue'}{!saving && (step === 2 ? <Check size={16} /> : <ArrowRight size={16} />)}</button>
        </footer>
      </div>
    </div>, document.body,
  );
}
