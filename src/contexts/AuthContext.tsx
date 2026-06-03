import { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Profile, CompanySettings } from '../lib/types';
import { parseUserAgent } from '../lib/userAgentParser';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  companySettings: CompanySettings | null;
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [isPortalUser, setIsPortalUser] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes('type=recovery')) {
      setIsPasswordRecovery(true);
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setLoading(false);
      }
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
        setIsPasswordRecovery(false);
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
        setUser(session.user);
        setIsPasswordRecovery(false);
        loadProfile(session.user.id);
        if (window.location.hash) {
          window.history.replaceState(null, '', window.location.pathname);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadProfile(userId: string) {
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
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      const portalUser = currentUser?.user_metadata?.is_portal_user === true;

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
        supabase
          .from('company_settings')
          .select('*')
          .maybeSingle()
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

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

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
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
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

      const deviceInfo = parseUserAgent(navigator.userAgent);

      const { data, error } = await supabase.rpc('start_user_session', {
        p_user_id: userId,
        p_ip_address: null,
        p_user_agent: navigator.userAgent,
        p_device_type: deviceInfo.deviceType,
        p_browser_name: deviceInfo.browserName,
        p_browser_version: deviceInfo.browserVersion,
        p_os_name: deviceInfo.osName,
        p_os_version: deviceInfo.osVersion,
        p_device_model: deviceInfo.deviceModel,
        p_device_vendor: deviceInfo.deviceVendor
      });

      if (error) {
        return;
      }

      if (data) {
        setCurrentSessionId(data);

        setTimeout(() => {
          fetch('https://api.ipify.org?format=json', {
            method: 'GET',
            signal: AbortSignal.timeout(3000)
          })
            .then(response => response.json())
            .then(ipData => {
              if (ipData.ip && data) {
                supabase
                  .from('user_sessions')
                  .update({ ip_address: ipData.ip })
                  .eq('id', data)
                  .catch(() => {});
              }
            })
            .catch(() => {});
        }, 0);

        // Update activity every 5 minutes
        const activityInterval = setInterval(async () => {
          if (document.visibilityState === 'visible') {
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
              await supabase.rpc('update_session_activity', {
                p_user_id: userId,
                p_page: null,
                p_session_id: data
              });
            } catch (err) {
              console.error('⚠️ Error updating session activity on visibility change:', err);
            }
          }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        (window as any).__visibilityHandler = handleVisibilityChange;

        // Handle visibility change to hidden — mark session inactive when tab is closed
        // We use visibilitychange instead of beforeunload because beforeunload fires
        // on every SPA navigation (React router), killing sessions constantly.
        const handleHide = () => {
          if (document.visibilityState === 'hidden') {
            try {
              const sessionIdToEnd = (window as any).__currentSessionId;
              const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/end_user_session`;
              const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
              const { data: { session } } = (supabase.auth as any)._session
                ? { data: { session: (supabase.auth as any)._session } }
                : { data: { session: null } };
              const token = session?.access_token || anonKey;
              const blob = new Blob(
                [JSON.stringify({ p_session_id: sessionIdToEnd })],
                { type: 'application/json' }
              );
              const headers = new Headers({
                'Authorization': `Bearer ${token}`,
                'apikey': anonKey,
                'Content-Type': 'application/json',
              });
              fetch(url, { method: 'POST', headers, body: blob, keepalive: true }).catch(() => {});
            } catch (err) {
              // non-critical
            }
          }
        };
        document.addEventListener('visibilitychange', handleHide);
        (window as any).__hideHandler = handleHide;
        (window as any).__currentSessionId = data;
      }
    } catch (error) {
      console.error('⚠️ Error in session tracking (non-critical):', error);
      // Don't throw - session tracking failures should not prevent login
    }
  }

  function cleanupSessionTracking() {
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
    <AuthContext.Provider value={{ user, profile, companySettings, loading, isPasswordRecovery, isPortalUser, signIn, signUp, signOut, resetPassword, resendConfirmation, updatePassword }}>
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