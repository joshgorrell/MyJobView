import { getReceivedAttachmentDownload } from "./attachment-download.ts";
import { downloadSignedAttachment } from "./signed-download.ts";
import { quarantineObjectKey } from "./quarantine-key.ts";
import { attachmentSha256 } from "./attachment-checksum.ts";
import { uploadQuarantinedAttachment } from "./attachment-quarantine.ts";
import type { AttachmentManifest } from "./attachment-manifest.ts";

/**
 * Preserve all attachment bytes in private quarantine before acknowledging
 * the inbound provider event. This intentionally does NOT clear malware scans,
 * expose downloads to staff, or promote files into permanent media.
 */
export async function quarantineReceivedAttachments(
  db: Parameters<typeof uploadQuarantinedAttachment>[0] & {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => {
            maybeSingle: () => Promise<{ data: { id: string; sha256: string | null } | null; error: { code?: string } | null }>;
          };
        };
      };
      insert: (record: Record<string, unknown>) => Promise<{ error: { code?: string } | null }>;
    };
  },
  input: {
    organizationId: string;
    intakeId: string;
    messageId: string;
    providerEmailId: string;
    apiKey: string;
    attachments: AttachmentManifest[];
    allowedDownloadHosts: readonly string[];
  },
): Promise<void> {
  if (!input.allowedDownloadHosts.length) throw new Error("Attachment host allowlist is not configured");
  if (input.attachments.length > 20) throw new Error("Too many attachments");
  for (const attachment of input.attachments) {
    const storageKey = quarantineObjectKey(input.organizationId, input.intakeId, attachment.id);
    const existing = await db.from("intake_attachments").select("id,sha256")
      .eq("intake_message_id", input.messageId).eq("storage_key", storageKey).maybeSingle();
    if (existing.error) throw new Error("Unable to check quarantined attachment");
    if (existing.data) {\n      if (!existing.data.sha256) throw new Error("Incomplete quarantine record");\n      continue;\n    }

    const metadata = await getReceivedAttachmentDownload(input.providerEmailId, attachment.id, input.apiKey);
    const bytes = await downloadSignedAttachment(metadata.downloadUrl, input.allowedDownloadHosts, 15 * 1024 * 1024);
    if (bytes.byteLength !== metadata.size) throw new Error("Attachment size mismatch");
    const sha256 = await attachmentSha256(bytes);
    try {\n      await uploadQuarantinedAttachment(db, storageKey, bytes, attachment.contentType);\n    } catch {\n      // Storage may already contain an orphan from a prior interrupted attempt.\n      // Do not overwrite it or assume its contents match the provider.\n      throw new Error("Quarantine upload requires reconciliation");\n    }
    const { error } = await db.from("intake_attachments").insert({
      intake_message_id: input.messageId,
      storage_key: storageKey,
      original_filename: attachment.filename,
      mime_type: attachment.contentType,
      byte_size: bytes.byteLength,
      sha256,
      scan_status: "pending",
      disposition: "pending",
    });
    if (error) {
      // A retry may have inserted the same attachment concurrently; the
      // storage object must remain quarantined until reconciliation.
      throw new Error("Unable to record quarantined attachment");
    }
  }
}
