import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export function BillingPrefBadge({ contactId }: { contactId: string }) {
  const [pref, setPref] = useState<'monthly' | 'annual' | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('customer_billing_preferences')
        .select('billing_preference')
        .eq('contact_id', contactId)
        .maybeSingle();
      if (!cancelled) setPref(data?.billing_preference || null);
    })();
    return () => { cancelled = true; };
  }, [contactId]);

  if (!pref) return <span className="text-xs text-gray-400">—</span>;

  if (pref === 'annual') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
        Annual
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
      Monthly
    </span>
  );
}
