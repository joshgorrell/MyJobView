export function needsPersonalFollowup(
  review: {
    sent_at: string | null;
    responded_at: string | null;
    delivery_status: string;
  },
  now = Date.now(),
) {
  if (
    review.responded_at ||
    review.delivery_status !== "sent" ||
    !review.sent_at
  )
    return false;
  const sent = Date.parse(review.sent_at);
  return Number.isFinite(sent) && now - sent >= 30 * 86400000;
}
