export const adminLossReasons = [
  ['lowest_price', 'Customer chose the cheapest bid'],
  ['budget_mismatch', 'Budget / price mismatch'],
  ['value_not_understood', 'Customer did not understand our value'],
  ['personal_attention', 'Not enough personal attention'],
  ['discovery_walkthrough', 'Discovery / job walkthrough missed'],
  ['proposal_clarity', 'Proposal or scope was unclear'],
  ['follow_through', 'Communication / follow-through'],
  ['solution_fit', 'Solution did not fit customer needs'],
  ['competitor_relationship', 'Existing competitor relationship'],
  ['timing_cancelled', 'Timing changed / project cancelled'],
  ['other', 'Other'],
  ['unknown', 'Not enough information'],
] as const;
export const adminRatingFields = [
  ['discovery_rating', 'Discovery / job walkthrough'],
  ['attention_rating', 'Personal attention'],
  ['explanation_rating', 'Proposal / scope explanation'],
  ['communication_rating', 'Communication / follow-through'],
  ['value_rating', 'Solution fit / value explanation'],
] as const;
export function validateAssessment(input: Record<string, unknown>) {
  const reasons: readonly string[] = adminLossReasons.map(([key]) => key);
  if (!reasons.includes(input.primary_reason as string)) throw new Error('Choose a primary reason.');
  if (!Array.isArray(input.contributing_reasons) || input.contributing_reasons.length > reasons.length || input.contributing_reasons.some(r => !reasons.includes(r))) throw new Error('Invalid contributing reasons.');
  if (!['yes', 'possibly', 'no', 'unknown'].includes(input.preventability as string)) throw new Error('Invalid preventability.');
  const output: Record<string, unknown> = {
    sales_rep_id: input.sales_rep_id || null,
    primary_reason: input.primary_reason,
    contributing_reasons: [...new Set(input.contributing_reasons)],
    preventability: input.preventability,
  };
  for (const [key] of adminRatingFields) {
    const value = input[key];
    if (value !== null && (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 5)) throw new Error('Ratings must be 1–5 or N/A.');
    output[key] = value;
  }
  for (const key of ['strengths', 'improvements', 'findings']) {
    if (typeof input[key] !== 'string' || input[key].length > 10000) throw new Error('Notes must be text, up to 10,000 characters.');
    output[key] = input[key].trim();
  }
  return output;
}
