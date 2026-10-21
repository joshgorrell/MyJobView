export const LOSS_REASONS: Record<string, string> = {
  price_too_high: "Price too high",
  went_with_competitor: "Chose another company",
  value: "Another company offered better value",
  budget_cut: "Budget reduced",
  scope_change: "Solution / scope did not fit",
  equipment: "Products / equipment did not fit",
  communication: "Communication / follow-up",
  process: "Process took too long",
  timing: "Project postponed",
  project_cancelled: "Project cancelled",
  changed_mind: "Changed mind",
  dont_want_rep: "Representative relationship",
  dont_want_company: "Company relationship",
  no_response: "No response",
  other: "Other",
  unknown: "Unknown / feedback needed",
  duplicate: "Duplicate",
  customer_request: "Customer requested cancellation",
  error: "Created in error",
  replaced_by_revision: "Replaced by revision",
};
export const CUSTOMER_REASON_MAP: Record<string, string> = {
  price: "price_too_high",
  value: "value",
  company: "went_with_competitor",
  design: "scope_change",
  equipment: "equipment",
  communication: "communication",
  process: "process",
  timing: "timing",
  cancelled: "project_cancelled",
  other: "other",
};
export type FeedbackSource =
  | "customer"
  | "phone"
  | "email"
  | "staff_assessment"
  | "legacy_staff"
  | "unknown";
export const SOURCE_LABELS: Record<FeedbackSource, string> = {
  customer: "Customer online",
  phone: "Customer by phone",
  email: "Customer by email",
  staff_assessment: "Staff assessment",
  legacy_staff: "Staff entry (unverified)",
  unknown: "No feedback",
};
export interface LossEvidence {
  reasons: string[];
  notes: string;
  source: FeedbackSource;
  created_at: string;
  recorded_by?: string | null;
}
export interface LossRow {
  id: string;
  proposalId: string | null;
  name: string;
  number: string;
  rep: string | null;
  repName: string;
  status: "declined" | "cancelled";
  total: number;
  valueKnown: boolean;
  date: string | null;
  history: LossEvidence[];
  evidence: LossEvidence;
  reminderSent: boolean;
  canRecord: boolean;
  proposalStatus?: string;
}
export interface ProposalLossRecord {
  id: string;
  proposal_number: string;
  title: string;
  status: string;
  total: string | number | null;
  declined_at: string | null;
  decline_reason: string | null;
  decline_notes: string | null;
  declined_by: string | null;
  created_by: string | null;
  created_by_name: string | null;
  auto_archived: boolean;
  archived_loss_status: string | null;
  contact: { full_name: string | null; company_name: string | null } | null;
}
export interface ManualLossRecord extends LossEvidence {
  id: string;
  proposal_id: string;
  organization_id: string;
}
export interface ReviewDetail {
  request_id: string;
  proposal_id: string | null;
  opportunity_name: string;
  follow_up_sent_at: string | null;
}
export interface ReviewRequest {
  id: string;
  recipient_name: string | null;
  recipient_email: string | null;
  sent_at: string | null;
  sent_by: string | null;
}
export interface ReviewResponse {
  request_id: string;
  reasons: string[];
  message: string;
  source: "customer" | "phone" | "email";
  created_at: string;
  recorded_by: string | null;
}
export const isConfirmed = (source: FeedbackSource) =>
  ["customer", "phone", "email"].includes(source);
export const needsLossFeedback = (e: LossEvidence) =>
  !isConfirmed(e.source) ||
  !e.reasons.some((r) => !["unknown", "no_response"].includes(r));
export function selectLossEvidence(entries: LossEvidence[]): LossEvidence {
  return (
    [...entries].sort(
      (a, b) =>
        Number(isConfirmed(b.source)) - Number(isConfirmed(a.source)) ||
        Date.parse(b.created_at) - Date.parse(a.created_at) ||
        Number(b.source !== "legacy_staff") -
          Number(a.source !== "legacy_staff"),
    )[0] || {
      reasons: ["unknown"],
      notes: "",
      source: "unknown",
      created_at: "",
    }
  );
}
export function lossDateRange(filter: string, now = new Date()) {
  const y = now.getFullYear(),
    m = now.getMonth();
  const start =
    filter === "last_month"
      ? new Date(y, m - 1, 1)
      : filter === "this_month"
        ? new Date(y, m, 1)
        : filter === "this_quarter"
          ? new Date(y, Math.floor(m / 3) * 3, 1)
          : filter === "this_year"
            ? new Date(y, 0, 1)
            : null;
  return {
    start: start?.toISOString() || null,
    end: (filter === "last_month"
      ? new Date(y, m, 1)
      : new Date(now.getTime() + 1)
    ).toISOString(),
  };
}
export function lossReasonStats(
  rows: { total: number; evidence: LossEvidence }[],
) {
  const stats = new Map<
    string,
    { reason: string; count: number; value: number }
  >();
  for (const row of rows)
    for (const reason of new Set(
      row.evidence.reasons.length ? row.evidence.reasons : ["unknown"],
    )) {
      const s = stats.get(reason) || { reason, count: 0, value: 0 };
      s.count++;
      s.value += row.total;
      stats.set(reason, s);
    }
  return [...stats.values()].sort((a, b) => b.count - a.count);
}
export function assembleLossRows(
  proposals: ProposalLossRecord[],
  manual: ManualLossRecord[],
  details: ReviewDetail[],
  requests: ReviewRequest[],
  responses: ReviewResponse[],
): LossRow[] {
  const requestMap = new Map(requests.map((r) => [r.id, r])),
    responseMap = new Map(responses.map((r) => [r.request_id, r]));
  const responseEvidence = (d: ReviewDetail): LossEvidence[] => {
    const a = responseMap.get(d.request_id);
    return a
      ? [
          {
            reasons: a.reasons.length
              ? a.reasons.map((k) => CUSTOMER_REASON_MAP[k] || k)
              : ["unknown"],
            notes: a.message,
            source: a.source || "customer",
            created_at: a.created_at,
            recorded_by: a.recorded_by,
          },
        ]
      : [];
  };
  const result: LossRow[] = proposals
    .filter(
      (p) =>
        !["approved", "approved_pending_action"].includes(p.status) &&
        (p.status !== "archived" ||
          p.archived_loss_status ||
          p.auto_archived ||
          details.some((d) => d.proposal_id === p.id)),
    )
    .map((p) => {
      const linked = details.filter((d) => d.proposal_id === p.id);
      const history: LossEvidence[] = [
        ...(p.decline_reason || p.decline_notes
          ? [
              {
                reasons: [p.decline_reason || "unknown"],
                notes: p.decline_notes || "",
                source:
                  p.declined_by === "customer" ? "customer" : "legacy_staff",
                created_at: p.declined_at || "1970-01-01",
              } as LossEvidence,
            ]
          : []),
        ...manual.filter((m) => m.proposal_id === p.id),
        ...linked.flatMap(responseEvidence),
      ];
      return {
        id: p.id,
        proposalId: p.id,
        name:
          p.contact?.full_name ||
          p.contact?.company_name ||
          p.title ||
          "Unknown customer",
        number: p.proposal_number,
        rep: p.created_by,
        repName: p.created_by_name || "Unassigned",
        status:
          p.status === "cancelled" || p.archived_loss_status === "cancelled"
            ? "cancelled"
            : "declined",
        total: Number(p.total) || 0,
        valueKnown: true,
        date:
          p.declined_at ||
          linked
            .map((d) => requestMap.get(d.request_id)?.sent_at)
            .filter(Boolean)
            .sort()[0] ||
          null,
        history,
        evidence: selectLossEvidence(history),
        reminderSent: linked.some((d) => !!d.follow_up_sent_at),
        canRecord:
          p.status === "declined" ||
          (p.status === "archived" && p.archived_loss_status === "declined"),
        proposalStatus: p.status,
      };
    });
  for (const d of details.filter((d) => !d.proposal_id)) {
    const q = requestMap.get(d.request_id),
      history = responseEvidence(d);
    result.push({
      id: d.request_id,
      proposalId: null,
      name: q?.recipient_name || q?.recipient_email || d.opportunity_name,
      number: d.opportunity_name,
      rep: null,
      repName: "Rep not recorded (external)",
      status: "declined",
      total: 0,
      valueKnown: false,
      date: q?.sent_at || null,
      history,
      evidence: selectLossEvidence(history),
      reminderSent: !!d.follow_up_sent_at,
      canRecord: false,
    });
  }
  return result;
}
