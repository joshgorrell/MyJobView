import { useEffect, useRef, useState } from 'react';
import { MapPin, MessageSquare, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

function proposalIdFromPath(pathname: string) {
  const match = pathname.match(/^\/portal\/proposals\/([a-f0-9-]+)/i);
  return match?.[1] || null;
}

interface PortalLocation {
  id: string;
  name: string;
  department: string | null;
  building_name: string | null;
  street_address: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
}

export function PortalProposalEngagement() {
  const [proposalId, setProposalId] = useState<string | null>(() => proposalIdFromPath(window.location.pathname));
  const [message, setMessage] = useState('');
  const [location, setLocation] = useState<PortalLocation | null>(null);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const activityId = useRef<string | null>(null);
  const activeSeconds = useRef(0);
  const lastTick = useRef(Date.now());

  useEffect(() => {
    const readRoute = () => setProposalId(proposalIdFromPath(window.location.pathname));
    window.addEventListener('popstate', readRoute);
    const interval = window.setInterval(readRoute, 750);
    return () => {
      window.removeEventListener('popstate', readRoute);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    setMessage('');
    setLocation(null);
    activityId.current = null;
    activeSeconds.current = 0;
    lastTick.current = Date.now();
    if (!proposalId) return;

    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from('proposals')
        .select('portal_customer_message,is_portal_visible,customer_location_id')
        .eq('id', proposalId)
        .maybeSingle();
      if (!cancelled && data?.is_portal_visible) {
        setMessage(data.portal_customer_message?.trim() || '');
        if (data.customer_location_id) {
          const { data: locationData } = await supabase
            .from('customer_locations')
            .select('id,name,department,building_name,street_address,address_line_2,city,state,zip_code')
            .eq('id', data.customer_location_id)
            .maybeSingle();
          if (!cancelled && locationData) setLocation(locationData as PortalLocation);
        }
      }

      // PortalProposalDetail creates the canonical view event. Wait briefly so this
      // tracker attaches duration to that event rather than creating a second view.
      await new Promise(resolve => window.setTimeout(resolve, 1200));
      const { data: view } = await supabase
        .from('proposal_activity')
        .select('id,duration_seconds')
        .eq('proposal_id', proposalId)
        .eq('activity_type', 'viewed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled && view?.id) {
        activityId.current = view.id;
        activeSeconds.current = Math.max(0, view.duration_seconds || 0);
        lastTick.current = Date.now();
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [proposalId]);

  useEffect(() => {
    if (!proposalId) return;

    const flush = async () => {
      if (!activityId.current) return;
      const now = Date.now();
      if (document.visibilityState === 'visible') {
        const delta = Math.min(20, Math.max(0, Math.round((now - lastTick.current) / 1000)));
        activeSeconds.current += delta;
      }
      lastTick.current = now;
      await supabase.rpc('update_proposal_activity_duration', {
        p_activity_id: activityId.current,
        p_duration_seconds: activeSeconds.current,
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void flush();
      else lastTick.current = Date.now();
    };
    const onPageHide = () => { void flush(); };
    const timer = window.setInterval(() => { void flush(); }, 15000);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      void flush();
    };
  }, [proposalId]);

  if (!proposalId || ((!message || dismissedFor === proposalId) && !location)) return null;

  const locationAddress = location
    ? [
        location.building_name,
        location.street_address,
        location.address_line_2,
        [location.city, location.state].filter(Boolean).join(', '),
        location.zip_code,
      ].filter(Boolean).join(' · ')
    : '';

  return (
    <div className="pointer-events-none fixed left-3 right-3 top-[72px] z-[60] flex justify-center sm:left-6 sm:right-6 sm:top-[88px]">
      <div className="pointer-events-auto w-full max-w-3xl space-y-2">
        {location && (
          <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur sm:px-5">
            <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700">
              <MapPin className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Project Location / Department</div>
              <div className="mt-0.5 text-sm font-semibold text-slate-900">{location.name}</div>
              {(location.department || locationAddress) && (
                <div className="mt-0.5 text-xs leading-relaxed text-slate-600">{[location.department, locationAddress].filter(Boolean).join(' · ')}</div>
              )}
            </div>
          </div>
        )}

        {message && dismissedFor !== proposalId && (
          <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-white/95 px-4 py-3 shadow-xl backdrop-blur sm:px-5">
            <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold uppercase tracking-wide text-blue-600">A note about your proposal</div>
              <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{message}</p>
            </div>
            <button type="button" onClick={() => setDismissedFor(proposalId)} className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Dismiss proposal note">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
