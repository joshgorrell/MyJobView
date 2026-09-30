import { supabase } from "../../lib/supabase";
export const lossReasons = [
  ["price", "Price was too high"],
  ["value", "Another company offered a better value"],
  ["company", "I preferred another company"],
  ["design", "The design / solution wasn’t what I wanted"],
  ["equipment", "The products or equipment weren’t what I wanted"],
  ["communication", "Communication / follow-up could have been better"],
  ["process", "The process took too long"],
  ["timing", "Timing changed / project is on hold"],
  ["cancelled", "We decided not to do the project"],
  ["other", "Something else"],
] as const;
export async function lostReviewAction(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(
    "lost-opportunity-review",
    { body },
  );
  if (error) {
    let message = error.message;
    try {
      const result = await error.context?.json();
      message = result?.error || message;
    } catch { /* Fall back to transport error. */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
