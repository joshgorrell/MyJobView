/** Approximate attention, never proof that a customer read or understood content. */
export const ENGAGEMENT_ACTIONS = {
  download_clicked: 'Download clicked',
  approval_clicked: 'Approval opened',
  payment_clicked: 'Payment clicked',
  question_clicked: 'Questions opened',
  change_request_clicked: 'Change request opened',
  decline_clicked: 'Decline opened',
  video_opened: 'Video opened',
  video_played: 'Video played',
} as const;
export type EngagementAction = keyof typeof ENGAGEMENT_ACTIONS;
export interface EngagementSnapshot {
  seconds: number;
  sections: Record<string, number>;
  clicks: Partial<Record<EngagementAction, number>>;
}

export class ProposalAttention {
  private lastTick: number;
  private lastInteraction: number;
  private visible = false;
  private focused = false;
  private section: string | null = null;
  private milliseconds = 0;
  private sectionMilliseconds: Record<string, number> = {};
  private clicks: EngagementSnapshot['clicks'] = {};
  constructor(now: number) { this.lastTick = now; this.lastInteraction = now; }
  tick(now: number) {
    // No timer catch-up after browser suspension. Idle expires at 60 seconds.
    const end = Math.min(now, this.lastInteraction + 60_000);
    const delta = Math.max(0, Math.min(2_000, end - this.lastTick));
    if (this.visible && this.focused) {
      this.milliseconds += delta;
      if (this.section) this.sectionMilliseconds[this.section] = (this.sectionMilliseconds[this.section] || 0) + delta;
    }
    this.lastTick = now;
  }
  setPresence(now: number, visible: boolean, focused: boolean) {
    this.tick(now);
    const wasActive = this.visible && this.focused;
    this.visible = visible; this.focused = focused;
    if (visible && focused && !wasActive) this.lastInteraction = now;
  }
  interact(now: number) { this.tick(now); this.lastInteraction = now; }
  setSection(now: number, section: string | null) { this.tick(now); this.section = section; }
  click(now: number, action: EngagementAction) {
    this.interact(now);
    if (this.visible && this.focused) this.clicks[action] = Math.min(10_000, (this.clicks[action] || 0) + 1);
  }
  snapshot(): EngagementSnapshot {
    return {
      seconds: Math.floor(this.milliseconds / 1000),
      sections: Object.fromEntries(Object.entries(this.sectionMilliseconds).map(([key, value]) => [key, Math.floor(value / 1000)])),
      clicks: { ...this.clicks },
    };
  }
}

export function sectionLabel(key: string, rooms: Record<string, string>): string {
  if (key.startsWith('room:')) return rooms[key.slice(5)] || 'Room / area';
  return ({ scope: 'Scope', pricing: 'Pricing', actions: 'Approval and questions', notes: 'Additional notes', video: 'Proposal video' } as Record<string, string>)[key] || 'Proposal';
}

export interface ProposalEngagementRow {
  activity_type: string;
  duration_seconds: number | null;
  viewer_user_id?: string | null;
  metadata: Record<string, unknown> | null;
}
export function summarizeEngagement(rows: ProposalEngagementRow[]) {
  const sections: Record<string, number> = {};
  const clicks: Partial<Record<EngagementAction, number>> = {};
  let activeSeconds = 0;
  let legacySeconds = 0;
  let trackedVisits = 0;
  const viewers = new Set<string>();
  for (const row of rows.filter(row => row.activity_type === 'viewed')) {
    if (row.viewer_user_id) viewers.add(row.viewer_user_id);
    const engagement = row.metadata?.engagement as { trackingVersion?: number; sections?: Record<string, number>; clicks?: Record<string, number> } | undefined;
    if (engagement?.trackingVersion !== 1) { legacySeconds += Math.max(0, row.duration_seconds || 0); continue; }
    trackedVisits++;
    activeSeconds += Math.max(0, row.duration_seconds || 0);
    for (const [key, seconds] of Object.entries(engagement.sections || {})) {
      if (Number.isFinite(seconds) && seconds >= 0) sections[key] = (sections[key] || 0) + seconds;
    }
    for (const action of Object.keys(ENGAGEMENT_ACTIONS) as EngagementAction[]) {
      const count = engagement.clicks?.[action];
      if (count && Number.isFinite(count) && count > 0) clicks[action] = (clicks[action] || 0) + count;
    }
  }
  return { activeSeconds, legacySeconds, trackedVisits, verifiedViewers: viewers.size, sections, clicks };
}
