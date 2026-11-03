/** Same parts/labor definition as calculate_proposal_totals; no source amounts change. */
export interface ProposalAmountInput {
  line_total?: number | null;
  labor_total?: number | null;
  labor_hours?: number | null;
  labor_rate?: number | null;
  quantity?: number | null;
  item_type?: string | null;
  is_customer_supplied?: boolean;
}
export function proposalLineAmounts(item: ProposalAmountInput) {
  const number = (value: number | null | undefined) => {
    const result = Number(value ?? 0);
    if (!Number.isFinite(result)) throw new Error('Invalid proposal amount');
    return result;
  };
  const parts = item.item_type === 'labor' || item.is_customer_supplied ? 0 : number(item.line_total);
  const labor = item.labor_total != null ? number(item.labor_total)
    : item.item_type === 'labor' ? number(item.line_total)
    : number(item.labor_hours) * number(item.labor_rate) * number(item.quantity ?? 1);
  return { parts, labor, installed: parts + labor };
}
