import { attachmentSha256 } from "./attachment-checksum.ts";
import { scanWithPrivateService } from "./private-malware-scanner.ts";

type AttachmentRow = {
  id: string;
  storage_key: string;
  sha256: string | null;
  byte_size: number | null;
  scan_status: "pending" | "clean" | "blocked" | "failed";
};

type ScanDatabase = {
  storage: { from: (bucket: string) => {
    download: (key: string) => Promise<{ data: Blob | null; error: unknown }>;
  } };
  from: (table: string) => {
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => Promise<{ data: unknown; error: unknown }>;
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
    await scanWithPrivateService(bytes, config.endpoint, config.token, config.allowedHost);
    verdict = "clean";
  } catch (error) {
    // A positive malware verdict is distinguishable only if the scanner
    // explicitly reports it; scanner errors remain failed, never clean.
    if (error instanceof Error && error.message === "Attachment is not cleared for use") {
      verdict = "blocked";
    }
  }
  const { error: updateError } = await db.from("intake_attachments")
    .update({ scan_status: verdict, scan_completed_at: new Date().toISOString() })
    .eq("id", attachment.id).eq("scan_status", "pending");
  if (updateError) throw new Error("Unable to persist scan verdict");
  return verdict;
}
