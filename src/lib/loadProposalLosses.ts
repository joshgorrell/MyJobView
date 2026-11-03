import { supabase } from "./supabase";
import {
  assembleLossRows,
  type ProposalLossRecord,
  type ManualLossRecord,
  type ReviewDetail,
  type ReviewRequest,
  type ReviewResponse,
} from "./proposalLoss";
async function allRows<T>(
  query: () => {
    range: (
      a: number,
      b: number,
    ) => PromiseLike<{
      data: unknown[] | null;
      error: { message: string } | null;
    }>;
  },
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await query().range(offset, offset + 499);
    if (error) throw new Error(error.message);
    rows.push(...((data || []) as T[]));
    if (!data || data.length < 500) return rows;
  }
}
const columns =
  "id,proposal_number,title,status,total,declined_at,decline_reason,decline_notes,declined_by,created_by,created_by_name,auto_archived,archived_loss_status,contact:contacts!proposals_contact_id_fkey(full_name,company_name)";
export async function loadProposalLosses(org: string, canViewPrivate: boolean) {
  const [proposals, manual, details, requests] = await Promise.all([
    allRows<ProposalLossRecord>(() =>
      supabase
        .from("proposals")
        .select(columns)
        .eq("organization_id", org)
        .in("status", ["declined", "cancelled", "archived"])
        .order("id"),
    ),
    allRows<ManualLossRecord>(() =>
      supabase
        .from("proposal_loss_feedback")
        .select("*")
        .eq("organization_id", org)
        .order("id"),
    ),
    canViewPrivate
      ? allRows<ReviewDetail>(() =>
          supabase
            .from("lost_review_details")
            .select("*")
            .eq("organization_id", org)
            .order("request_id"),
        )
      : Promise.resolve([]),
    canViewPrivate
      ? allRows<ReviewRequest>(() =>
          supabase
            .from("review_requests")
            .select("id,recipient_name,recipient_email,sent_at,sent_by")
            .eq("organization_id", org)
            .eq("request_type", "lost_opportunity")
            .order("id"),
        )
      : Promise.resolve([]),
  ]);
  const ids = new Set(proposals.map((p) => p.id));
  const missing = [
    ...new Set(
      details
        .map((d) => d.proposal_id)
        .filter((id): id is string => !!id && !ids.has(id)),
    ),
  ];
  for (let i = 0; i < missing.length; i += 100)
    proposals.push(
      ...(await allRows<ProposalLossRecord>(() =>
        supabase
          .from("proposals")
          .select(columns)
          .eq("organization_id", org)
          .in("id", missing.slice(i, i + 100))
          .order("id"),
      )),
    );
  const responses: ReviewResponse[] = [];
  for (let i = 0; i < details.length; i += 100)
    responses.push(
      ...(await allRows<ReviewResponse>(() =>
        supabase
          .from("lost_review_responses")
          .select("request_id,reasons,message,source,recorded_by,created_at")
          .in(
            "request_id",
            details.slice(i, i + 100).map((d) => d.request_id),
          )
          .order("request_id"),
      )),
    );
  return assembleLossRows(proposals, manual, details, requests, responses);
}
