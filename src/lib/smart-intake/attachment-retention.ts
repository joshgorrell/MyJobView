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
  // Never purge while an attachment is pending review, pending scanning, or
  // retained as customer media / on a work order. Only explicit discards are eligible.
  return attachment.disposition === "discarded" && attachment.scan_status !== "pending";
}
