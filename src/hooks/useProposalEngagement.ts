import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { ENGAGEMENT_ACTIONS, ProposalAttention, type EngagementAction } from '../lib/proposalEngagement';

/** Runs only inside a successfully loaded customer proposal, never from a route guess. */
export function useProposalEngagement(proposalId: string, enabled: boolean) {
  const root = useRef<HTMLDivElement>(null);
  const visit = useRef<{ proposalId: string; id: string } | null>(null);
  useEffect(() => {
    const element = root.current;
    if (!enabled || !element) return;
    if (visit.current?.proposalId !== proposalId) visit.current = { proposalId, id: crypto.randomUUID() };
    const visitId = visit.current.id;
    const attention = new ProposalAttention(performance.now());
    let activityId: string | null = null;
    let stopped = false;
    let starting = false;
    let flushing = false;
    let pendingFlush = false;
    let lastSaved = '';
    let startAttempts = 0;

    const flush = async () => {
      if (!activityId) return;
      if (flushing) { pendingFlush = true; return; }
      const snapshot = attention.snapshot();
      const serialized = JSON.stringify(snapshot);
      if (serialized === lastSaved) return;
      flushing = true;
      try {
        const { data, error } = await supabase.rpc('report_proposal_engagement', {
          p_activity_id: activityId, p_seconds: snapshot.seconds,
          p_sections: snapshot.sections, p_clicks: snapshot.clicks,
        });
        if (error || data !== true) throw error || new Error('Engagement update denied');
        lastSaved = serialized;
      } catch (error) { console.warn('Proposal engagement update failed', error); }
      finally {
        flushing = false;
        if (pendingFlush) { pendingFlush = false; void flush(); }
      }
    };
    const start = async () => {
      if (stopped || starting || activityId || startAttempts >= 3 || document.visibilityState !== 'visible' || !document.hasFocus()) return;
      starting = true; startAttempts++;
      try {
        const { data, error } = await supabase.rpc('start_proposal_engagement', {
          p_proposal_id: proposalId, p_visit_id: visitId,
        });
        if (error) throw error;
        if (!data) { startAttempts = 3; return; } // Staff/unauthorized visitors are deliberately excluded.
        activityId = data;
        if (!stopped) attention.setPresence(performance.now(), document.visibilityState === 'visible', document.hasFocus());
        else void flush();
      } catch (error) { console.warn('Proposal engagement start failed', error); }
      finally { starting = false; }
    };
    const presence = () => {
      attention.setPresence(performance.now(), document.visibilityState === 'visible', document.hasFocus());
      void flush(); void start();
    };
    const interact = () => attention.interact(performance.now());
    const click = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-engagement-action]') : null;
      const action = target?.dataset.engagementAction;
      if (target && element.contains(target) && action && Object.prototype.hasOwnProperty.call(ENGAGEMENT_ACTIONS, action)) {
        attention.click(performance.now(), action as EngagementAction);
        void flush();
      }
    };
    // Attribute each second to ONE section: greatest visible viewport area, never double-count overlaps.
    const chooseSection = () => {
      let best: string | null = null;
      let largest = 0;
      for (const node of element.querySelectorAll<HTMLElement>('[data-engagement-section]')) {
        const rect = node.getBoundingClientRect();
        const area = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 80))
          * Math.max(0, Math.min(rect.right, innerWidth) - Math.max(rect.left, 0));
        if (area > largest) { largest = area; best = node.dataset.engagementSection || null; }
      }
      attention.setSection(performance.now(), best);
    };
    const pageHide = () => { attention.setPresence(performance.now(), false, false); void flush(); };
    const play = () => { attention.click(performance.now(), 'video_played'); void flush(); };
    const timer = window.setInterval(() => {
      attention.tick(performance.now()); chooseSection();
    }, 1000);
    const heartbeat = window.setInterval(() => { void start(); void flush(); }, 15_000);
    document.addEventListener('visibilitychange', presence);
    window.addEventListener('focus', presence);
    window.addEventListener('blur', presence);
    window.addEventListener('pagehide', pageHide);
    window.addEventListener('pageshow', presence);
    element.addEventListener('pointerdown', interact, { passive: true });
    element.addEventListener('pointermove', interact, { passive: true });
    element.addEventListener('keydown', interact);
    element.addEventListener('click', click);
    element.addEventListener('play', play, true);
    // Capture nested scroll containers as well as the page.
    document.addEventListener('scroll', interact, { capture: true, passive: true });
    chooseSection(); void start();
    return () => {
      stopped = true;
      attention.setPresence(performance.now(), false, false);
      clearInterval(timer); clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', presence);
      window.removeEventListener('focus', presence);
      window.removeEventListener('blur', presence);
      window.removeEventListener('pagehide', pageHide);
      window.removeEventListener('pageshow', presence);
      element.removeEventListener('pointerdown', interact);
      element.removeEventListener('pointermove', interact);
      element.removeEventListener('keydown', interact);
      element.removeEventListener('click', click);
      element.removeEventListener('play', play, true);
      document.removeEventListener('scroll', interact, true);
      void flush(); // Best effort on navigation; heartbeat preserves already reported time.
    };
  }, [proposalId, enabled]);
  return root;
}
