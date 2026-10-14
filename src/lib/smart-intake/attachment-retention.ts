export type AttachmentRetentionCandidate = {
  id: string;
  scan_status: "pending" | "clean" | "blocked" | "failed";
  disposition: "pending" | "discarded" | "customer_media" | "work_order" | "both";
  expires_at: string | null;
  deleted_at: string | null;
};

export function canPurgeQuarantine(
  attachment: AttachmentRetentionCandidate,
  now: Date,
  linkedWorkOrders: number,
): boolean {
  if (attachment.deleted_at || linkedWorkOrders !== 0 || !Number.isSafeInteger(linkedWorkOrders)) return false;
  if (!attachment.expires_at || !Number.isFinite(Date.parse(attachment.expires_at))) return false;
  if (Date.parse(attachment.expires_at) > now.getTime()) return false;
  // Expired unreviewed quarantine objects are eligible for cleanup, as are
  // explicit discards. Retained media and work-order references are protected.
  // A scan still in progress must never race with storage deletion.
  return (attachment.disposition === "pending" || attachment.disposition === "discarded") &&
    attachment.scan_status !== "pending";
}
