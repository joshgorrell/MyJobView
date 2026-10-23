import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase, passwordRecoveryLink } from '../lib/supabase';
import { verifyPasswordRecovery } from '../lib/passwordRecovery';
import { Profile, CompanySettings } from '../lib/types';
import { parseUserAgent } from '../lib/userAgentParser';
import { browserInstallationId } from '../lib/sessionDevices';
import { isValidReturnHost } from '../lib/crossDomainAuth';
import { MJV_IDLE_TIMEOUT_MS, MJV_IDLE_WARNING_MS, remainingIdleMs, mayResetOnReload } from '../lib/sessionInactivity';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  companySettings: CompanySettings | null;
  setProfileAvatar: (url: string | null) => void;
  setProfileTheme: (userId: string, theme: Profile['ui_theme']) => void;
  loading: boolean;
  isPasswordRecovery: boolean;
  isPortalUser: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  resendConfirmation: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// A navigation reload should only be counted once, even if tracking restarts on tab focus.
let reloadActivityHandled = false;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const setProfileAvatar = (url: string | null) => setProfile(current => current ? { ...current, avatar_url: url } : current);
  const setProfileTheme = useCallback((userId: string, theme: Profile['ui_theme']) => {
    setProfile(current => current?.id === userId ? { ...current, ui_theme: theme } : current);
  }, []);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(passwordRecoveryLink.active);
  const recoveryVerifiedRef = useRef(false);
  const [isPortalUser, setIsPortalUser] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const sessionTrackingGenerationRef = useRef(0);

  // Refs mirror the state values so the onAuthStateChange closure (which
  // is created once on mount) can read the *current* profile/loading state
  // instead of the stale captured values. Without this, INITIAL_SESSION
  // re-fires (e.g. when a tab regains focus) see profile as always-null
  // and flip loading back to true, unmounting the entire app.
  const profileRef = useRef<Profile | null>(null);
  const loadingProfileRef = useRef(false);
  profileRef.current = profile;
  loadingProfileRef.current = loadingProfile;

  useEffect(() => {
    const recoveryLink = passwordRecoveryLink.active;
    if (recoveryLink) setIsPasswordRecovery(true);

    // Wrap getSession in a timeout so a hanging session fetch doesn't
    // leave the app on the loading screen indefinitely.
    const sessionTimeout = setTimeout(() => {
      console.error('Session initialization timed out after 15 seconds');
      setUser(null);
      setProfile(null);
      setCompanySettings(null);
      setLoading(false);
      setLoadingProfile(false);
    }, 15000);

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        clearTimeout(sessionTimeout);
        setUser(session?.user ?? null);
        if (session?.user) {
          if (recoveryLink) setLoading(false);
          else loadProfile(session.user.id, session.user.user_metadata?.is_portal_user === true);
        } else {
          setLoading(false);
        }
      })
      .catch((error) => {
        clearTimeout(sessionTimeout);
        console.error('Session initialization error:', error);
        setUser(null);
        setProfile(null);
        setCompanySettings(null);
        setLoading(false);
        setLoadingProfile(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
        setUser(session?.user ?? null);
        setLoading(false);
        return;
      }

      if (event === 'SIGNED_OUT' || !session?.user) {
        cleanupSessionTracking();
        setUser(null);
        setProfile(null);
        setCompanySettings(null);
        setCurrentSessionId(null);
        setIsPasswordRecovery(recoveryLink);
        setIsPortalUser(false);
        setLoading(false);
        setLoadingProfile(false);
        return;
      }

      if (event === 'TOKEN_REFRESHED') {
        setUser(session.user);
        return;
      }

      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        if (recoveryLink) {
          setUser(session.user);
          setIsPasswordRecovery(true);
          setLoading(false);
          return;
        }
        setUser(session.user);
        setIsPasswordRecovery(false);
        // Only flip loading to true on the initial mount. If the app is
        // already loaded (e.g. a token refresh re-fires INITIAL_SESSION
        // after the tab regains focus), keep the current UI mounted so
        // users don't lose unsaved form state.
        if (!profileRef.current && !loadingProfileRef.current) {
          setLoading(true);
          loadProfile(session.user.id, session.user.user_metadata?.is_portal_user === true);
        }
        if (window.location.hash) {
          window.history.replaceState(null, '', window.location.pathname);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const refresh = () => { if (user) void loadProfile(user.id, isPortalUser); };
    window.addEventListener('permissions-changed', refresh);
    return () => window.removeEventListener('permissions-changed', refresh);
  }, [user?.id, isPortalUser]);

  async function loadProfile(userId: string, portalUser: boolean) {
    if (loadingProfile) return;

    setLoadingProfile(true);

    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      console.error('Profile loading timed out after 10 seconds');
      setLoading(false);
      setLoadingProfile(false);
    }, 10000);

    try {
      setIsPortalUser(portalUser);

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (timedOut) return;

      if (error) {
        console.error('Profile query error:', error);
        setProfile(null);
        clearTimeout(timeoutId);
        setLoading(false);
        setLoadingProfile(false);
        if (!portalUser) await supabase.auth.signOut();
        return;
      }

      if (!data) {
        if (portalUser) {
          setProfile(null);
          clearTimeout(timeoutId);
          setLoading(false);
          setLoadingProfile(false);
          return;
        }
        console.error('Profile not found for user:', userId);
        setProfile(null);
        clearTimeout(timeoutId);
        setLoading(false);
        setLoadingProfile(false);
        await supabase.auth.signOut();
        return;
      }

      setProfile(data);

      Promise.all([
        Promise.resolve(supabase
          .from('company_settings')
          .select('*')
          .eq('organization_id', data.organization_id)
          .maybeSingle())
          .then(({ data: settings, error: settingsError }) => {
            if (!settingsError && settings) {
              setCompanySettings(settings);
            }
          })
          .catch(() => {}),

        startSessionTracking(userId).catch(() => {})
      ]).catch(() => {});

    } catch (error) {
      console.error('Error loading profile:', error);
      setProfile(null);
      await supabase.auth.signOut();
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
      setLoadingProfile(false);
    }
  }

  async function signIn(email: string, password: string) {
    try {
      localStorage.setItem('__storage_test__', 'test');
      localStorage.removeItem('__storage_test__');
    } catch (e) {
      throw new Error(
        'Browser storage is blocked or unavailable.\n\n' +
        'Please enable cookies and site data in your browser settings, ' +
        'or try using a different browser.\n\n' +
        'Common causes:\n' +
        '- Private/Incognito browsing mode\n' +
        '- Strict privacy settings\n' +
        '- Browser extensions blocking storage\n' +
        '- Corporate security policies'
      );
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });

    if (error) throw error;

    if (!data.user) {
      throw new Error('Sign in failed. Please check your credentials.');
    }

    if (!data.session) {
      throw new Error(
        'Login succeeded but session could not be created.\n\n' +
        'This usually means browser storage is blocked.\n\n' +
        'Please enable cookies and site data in your browser settings.'
      );
    }

    // Explicit login begins a new idle window, even after an earlier expired session.
    localStorage.setItem(`mjv-last-interaction:${data.user.id}`, String(Date.now()));

    const urlParams = new URLSearchParams(window.location.search);
    const redirectTo = urlParams.get('redirect_to');
    if (redirectTo && isValidReturnHost(redirectTo)) {
      const returnPath = urlParams.get('return_path') || '/';
      const bridgeUrl = new URL('/auth-bridge', window.location.origin);
      bridgeUrl.searchParams.set('return_to', redirectTo);
      bridgeUrl.searchParams.set('path', returnPath);
      window.location.replace(bridgeUrl.toString());
    }
  }

  async function signUp(email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      console.error('Sign up error:', error);
      throw error;
    }

    console.log('Sign up response:', data);

    // Check if email confirmation is required
    if (data?.user && data.session === null) {
      throw new Error('Please check your email to confirm your account before signing in.');
    }
  }

  async function signOut() {
    // End session tracking before signing out
    if (user?.id) {
      await endSessionTracking(user.id);
    }
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  async function resetPassword(email: string) {
    const redirect = new URL('/', window.location.origin);
    redirect.searchParams.set('account_setup', 'reset');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: redirect.toString(),
    });

    if (error) {
      console.error('Password reset error:', error);
      throw error;
    }
  }

  async function resendConfirmation(email: string) {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      console.error('Resend confirmation error:', error);
      throw error;
    }
  }

  async function updatePassword(newPassword: string) {
    if (passwordRecoveryLink.active && !recoveryVerifiedRef.current) {
      const verifiedUser = await verifyPasswordRecovery(supabase, passwordRecoveryLink);
      recoveryVerifiedRef.current = true;
      setUser(verifiedUser);
      // Remove credentials from the address bar after verification succeeds.
      const cleanUrl = new URL(window.location.href);
      cleanUrl.hash = '';
      cleanUrl.searchParams.delete('code');
      window.history.replaceState(null, '', cleanUrl.pathname + cleanUrl.search);
    }
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      console.error('Update password error:', error);
      throw error;
    }
  }

  async function startSessionTracking(userId: string) {
    try {
      cleanupSessionTracking();
      const trackingGeneration = ++sessionTrackingGenerationRef.current;

      const interactionEvents = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const;
      // Always install idle enforcement before session analytics. An analytics
      // RPC failure must never disable the logout security policy.
        // Inactivity is based on interactions within MJV, not other browser tabs.
        // Persist across reloads and tabs in this browser to prevent timer resets.
        const idleKey = `mjv-last-interaction:${userId}`;
        const inactivityLimitMs = MJV_IDLE_TIMEOUT_MS;
        const warningMs = MJV_IDLE_TIMEOUT_MS - MJV_IDLE_WARNING_MS;
        const readLastInteraction = () => Number(localStorage.getItem(idleKey)) || 0;
        const dismissWarning = () => document.getElementById('mjv-idle-warning')?.remove();
        let idleSigningOut = false;
        const expireSession = () => {
          if (idleSigningOut) return;
          idleSigningOut = true;
          dismissWarning();
          void supabase.auth.signOut();
        };
        const recordIdleInteraction = () => {
          if (idleSigningOut) return;
          if (remainingIdleMs(readLastInteraction()) === 0) {
            expireSession();
            return;
          }
          localStorage.setItem(idleKey, String(Date.now()));
          dismissWarning();
        };
        const trackIdleInteraction = (event: Event) => {
          if (event.isTrusted) recordIdleInteraction();
        };
        const previousActivity = readLastInteraction();
        if (!previousActivity) localStorage.setItem(idleKey, String(Date.now()));
        // Navigation Timing identifies reloads but cannot distinguish a manual
        // browser refresh from an automatic one. Never revive an expired session.
        if (!reloadActivityHandled) {
          reloadActivityHandled = true;
          const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
          if (mayResetOnReload(navigation?.type, previousActivity, Date.now(), document.visibilityState === 'visible')) {
            recordIdleInteraction();
          }
        }
        interactionEvents.forEach(event => document.addEventListener(event, trackIdleInteraction, { passive: true }));

        const showWarning = () => {
          if (document.getElementById('mjv-idle-warning')) return;
          const overlay = document.createElement('div');
          overlay.id = 'mjv-idle-warning';
          overlay.setAttribute('role', 'alertdialog');
          overlay.setAttribute('aria-modal', 'true');
          overlay.setAttribute('aria-labelledby', 'mjv-idle-title');
          overlay.setAttribute('aria-describedby', 'mjv-idle-description');
          overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.65);padding:16px';
          const box = document.createElement('div');
          box.style.cssText = 'width:min(100%,440px);border-radius:16px;background:var(--background,#fff);color:var(--foreground,#111827);padding:28px;box-shadow:0 24px 70px rgba(0,0,0,.35);text-align:center';
          const title = document.createElement('h2');
          title.id = 'mjv-idle-title';
          title.textContent = 'Your session is about to expire';
          title.style.cssText = 'font-size:22px;font-weight:700;margin:0 0 12px';
          const description = document.createElement('p');
          description.id = 'mjv-idle-description';
          description.textContent = 'You have been inactive in MyJobView. Interact anywhere in MJV to stay signed in. Unsaved changes may be lost if your session expires.';
          description.style.cssText = 'font-size:14px;line-height:1.6;margin:0 0 18px';
          const countdown = document.createElement('p');
          countdown.id = 'mjv-idle-countdown';
          countdown.setAttribute('aria-live', 'off');
          countdown.style.cssText = 'font-size:30px;font-weight:700;font-variant-numeric:tabular-nums;margin:0 0 20px';
          const stay = document.createElement('button');
          stay.type = 'button';
          stay.textContent = 'Stay Signed In';
          stay.style.cssText = 'background:#2563eb;color:#fff;border:0;border-radius:8px;padding:12px 18px;font-weight:600;cursor:pointer;margin:4px';
          stay.addEventListener('click', recordIdleInteraction);
          const logout = document.createElement('button');
          logout.type = 'button';
          logout.textContent = 'Log Out Now';
          logout.style.cssText = 'background:transparent;color:inherit;border:1px solid #9ca3af;border-radius:8px;padding:12px 18px;cursor:pointer;margin:4px';
          logout.addEventListener('click', expireSession);
          box.append(title, description, countdown, stay, logout);
          overlay.appendChild(box);
          document.body.appendChild(overlay);
          // Pointer, touch, keyboard and wheel interactions are already
          // handled by the document listeners, including clicks on this modal.
          stay.focus();
        };
        const checkIdle = () => {
          if (idleSigningOut) return;
          const remainingMs = remainingIdleMs(readLastInteraction());
          if (remainingMs <= 0) {
            expireSession();
          } else if (remainingMs <= inactivityLimitMs - warningMs) {
            showWarning();
            const countdown = document.getElementById('mjv-idle-countdown');
            if (countdown) {
              const seconds = Math.ceil(remainingMs / 1000);
              countdown.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} remaining`;
            }
          } else {
            dismissWarning();
          }
        };
        const idleCheck = setInterval(checkIdle, 1000);
        // Timers are throttled while a laptop sleeps or MJV is backgrounded.
        // Check immediately on return; do not reset idle time on focus.
        window.addEventListener('focus', checkIdle);
        document.addEventListener('visibilitychange', checkIdle);
        checkIdle();
        const priorCleanup = (window as any).__sessionInteractionCleanup;
        (window as any).__sessionInteractionCleanup = () => {
          priorCleanup?.();
          clearInterval(idleCheck);
          window.removeEventListener('focus', checkIdle);
          document.removeEventListener('visibilitychange', checkIdle);
          document.getElementById('mjv-idle-warning')?.remove();
          interactionEvents.forEach(event => document.removeEventListener(event, trackIdleInteraction));
        };

      if (idleSigningOut) return;



      const deviceInfo = parseUserAgent(navigator.userAgent, navigator.maxTouchPoints);

      const { data, error } = await supabase.rpc('start_browser_session', {
        p_browser_id: browserInstallationId(),
        p_user_agent: navigator.userAgent,
        p_device_type: deviceInfo.deviceType,
        p_browser_name: deviceInfo.browserName,
        p_browser_version: deviceInfo.browserVersion,
        p_os_name: deviceInfo.osName,
        p_os_version: deviceInfo.osVersion,
        p_device_model: deviceInfo.deviceModel,
        p_device_vendor: deviceInfo.deviceVendor
      });

      // Another login, tab transition, or sign-out may have superseded this RPC.
      if (trackingGeneration !== sessionTrackingGenerationRef.current) return;
      if (error) {
        return;
      }

      if (data) {
        setCurrentSessionId(data);

        // Resolve public IP + approximate city/state/country server-side.
        // This intentionally does not request browser GPS/location permission.
        setTimeout(() => {
          supabase.functions.invoke('session-location', {
            body: { session_id: data },
          }).catch(() => {});
        }, 0);

        // A visible, unattended tab is not evidence of work. Only send a
        // heartbeat when the user interacted recently while the tab was visible.
        // Do not collect keys, pointer coordinates, or interaction content.
        let lastInteractionAt = 0;
        const noteInteraction = () => {
          if (document.visibilityState === 'visible') lastInteractionAt = Date.now();
        };
        interactionEvents.forEach(event => document.addEventListener(event, noteInteraction, { passive: true }));
        const idleCleanup = (window as any).__sessionInteractionCleanup;
        (window as any).__sessionInteractionCleanup = () => {
          idleCleanup?.();
          interactionEvents.forEach(event => document.removeEventListener(event, noteInteraction));
        };

        const activityInterval = setInterval(async () => {
          if (document.visibilityState === 'visible' && Date.now() - lastInteractionAt <= 5 * 60 * 1000) {
            try {
              await supabase.rpc('update_session_activity', {
                p_user_id: userId,
                p_page: null,
                p_session_id: data
              });
            } catch (err) {
              console.error('⚠️ Error updating session activity:', err);
            }
          }
        }, 5 * 60 * 1000);

        // Store interval ID for cleanup
        (window as any).__activityInterval = activityInterval;

        // Handle visibility changes - update activity when page becomes visible
        const handleVisibilityChange = async () => {
          if (document.visibilityState === 'visible') {
            try {
              await startSessionTracking(userId);
            } catch (err) {
              console.error('⚠️ Error updating session activity on visibility change:', err);
            }
          }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        (window as any).__visibilityHandler = handleVisibilityChange;

        (window as any).__currentSessionId = data;
      }
    } catch (error) {
      console.error('⚠️ Error in session tracking (non-critical):', error);
      // Don't throw - session tracking failures should not prevent login
    }
  }

  function cleanupSessionTracking() {
    sessionTrackingGenerationRef.current++;
    if ((window as any).__sessionInteractionCleanup) {
      (window as any).__sessionInteractionCleanup();
      delete (window as any).__sessionInteractionCleanup;
    }
    // Clear intervals and event listeners
    if ((window as any).__activityInterval) {
      clearInterval((window as any).__activityInterval);
      delete (window as any).__activityInterval;
    }
    if ((window as any).__visibilityHandler) {
      document.removeEventListener('visibilitychange', (window as any).__visibilityHandler);
      delete (window as any).__visibilityHandler;
    }
    if ((window as any).__hideHandler) {
      document.removeEventListener('visibilitychange', (window as any).__hideHandler);
      delete (window as any).__hideHandler;
    }
    if ((window as any).__currentSessionId) {
      delete (window as any).__currentSessionId;
    }
  }

  async function endSessionTracking(userId: string) {
    try {
      // Clear intervals and event listeners
      cleanupSessionTracking();

      // End the session in the database
      await supabase.rpc('end_user_session', { p_session_id: currentSessionId, p_user_id: userId });
      setCurrentSessionId(null);
    } catch (error) {
      console.error('Error ending session:', error);
      // Even if RPC fails, ensure we clean up local state
      setCurrentSessionId(null);
    }
  }

  return (
    <AuthContext.Provider value={{ user, profile, companySettings, setProfileAvatar, setProfileTheme, loading, isPasswordRecovery, isPortalUser, signIn, signUp, signOut, resetPassword, resendConfirmation, updatePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
