import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export function useSecurityPortalEnabled() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    const reload = () => { void supabase.rpc('security_portal_enabled').then(({ data, error }) => {
      if (active) setEnabled(!error && data === true);
    }); };
    reload();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { queueMicrotask(reload); });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  return enabled;
}
