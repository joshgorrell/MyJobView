import { attachmentSha256 } from "./attachment-checksum.ts";
import { scanWithPrivateService } from "./private-malware-scanner.ts";

type AttachmentRow = {
  id: string;
  storage_key: string;
  sha256: string | null;
  byte_size: number | null;
  scan_status: "pending" | "clean" | "blocked" | "failed";
  organization_id: string;
  intake_id: string;
};

type ScanDatabase = {
  storage: { from: (bucket: string) => {
    download: (key: string) => Promise<{ data: Blob | null; error: unknown }>;
  } };
  from: (table: string) => {
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          select: (columns: string) => Promise<{ data: Array<{ id: string }> | null; error: unknown }>;
        };
      };
    };
  };
};

/** Only a trusted service-role worker may call this function. No client-facing download. */
export async function scanPendingAttachment(
  db: ScanDatabase,
  attachment: AttachmentRow,
  config: { endpoint?: string; token?: string; allowedHost?: string },
): Promise<"clean" | "blocked" | "failed"> {
  if (attachment.scan_status !== "pending") throw new Error("Attachment is not pending scan");
  if (!attachment.sha256 || !/^[a-f0-9]{64}$/i.test(attachment.sha256) ||
      !Number.isSafeInteger(attachment.byte_size) || attachment.byte_size! < 1 ||
      attachment.byte_size! > 15 * 1024 * 1024) {
    throw new Error("Incomplete attachment metadata");
  }
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[a-zA-Z0-9_-]{1,255}$/i.test(attachment.storage_key)) {
    throw new Error("Invalid quarantine storage key");
  }
  const segments = attachment.storage_key.split("/");
  if (segments[0].toLowerCase() !== attachment.organization_id.toLowerCase() ||
      segments[1].toLowerCase() !== attachment.intake_id.toLowerCase()) {
    throw new Error("Attachment organization does not match quarantine path");
  }
  const { data: blob, error: storageError } = await db.storage.from("smart-intake-quarantine")
    .download(attachment.storage_key);
  if (storageError || !blob || blob.size !== attachment.byte_size) {
    throw new Error("Quarantined attachment unavailable or size mismatch");
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (await attachmentSha256(bytes) !== attachment.sha256) {
    throw new Error("Quarantined attachment checksum mismatch");
  }

  let verdict: "clean" | "blocked" | "failed" = "failed";
  try {
    verdict = await scanWithPrivateService(bytes, config.endpoint, config.token, config.allowedHost);
  } catch {
    // Transport, authentication and parsing failures are not malware findings.
    verdict = "failed";
  }
  const { data: updated, error: updateError } = await db.from("intake_attachments")
    .update({ scan_status: verdict, scan_completed_at: new Date().toISOString() })
    .eq("id", attachment.id).eq("scan_status", "pending").select("id");
  if (updateError || updated?.length !== 1) throw new Error("Scan verdict update was not confirmed");
  return verdict;
}
