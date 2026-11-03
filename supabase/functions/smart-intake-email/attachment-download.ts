/**
 * Resend's attachment endpoint returns JSON metadata with a short-lived
 * signed download URL. It does NOT return the attachment bytes.
 * Never fetch that signed URL until its storage host has been allowlisted.
 */
export type ReceivedAttachmentDownload = {
  id: string;
  downloadUrl: string;
  expiresAt: string;
  size: number;
};

export async function getReceivedAttachmentDownload(
  emailId: string,
  attachmentId: string,
  bearerToken: string,
  maxBytes = 15 * 1024 * 1024,
): Promise<ReceivedAttachmentDownload> {
  const safeId = /^[a-zA-Z0-9_-]{1,255}$/;
  if (!safeId.test(emailId) || !safeId.test(attachmentId)) throw new Error("Invalid attachment identity");
  if (!/^re_[a-zA-Z0-9_]+$/.test(bearerToken)) throw new Error("Invalid provider credential");
  const response = await fetch(
    `https://api.resend.com/emails/receiving/${emailId}/attachments/${attachmentId}`,
    {
      headers: { Authorization: `Bearer ${bearerToken}`, Accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok || !response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new Error("Attachment metadata retrieval failed");
  }
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > 65536)) {
    throw new Error("Attachment metadata too large");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty attachment metadata");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 65536) throw new Error("Attachment metadata too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const buffer = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) { buffer.set(chunk, position); position += chunk.byteLength; }
  const raw = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  const metadata: unknown = JSON.parse(raw);
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw new Error("Invalid attachment metadata");
  const record = metadata as Record<string, unknown>;
  if (record.id !== attachmentId || typeof record.download_url !== "string" ||
      typeof record.expires_at !== "string" || !Number.isSafeInteger(record.size) ||
      (record.size as number) < 0 || (record.size as number) > maxBytes) {
    throw new Error("Invalid attachment metadata");
  }
  const url = new URL(record.download_url);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash ||
      !url.hostname || url.hostname === "localhost") {
    throw new Error("Untrusted signed download URL");
  }
  const expiry = Date.parse(record.expires_at);
  if (!Number.isFinite(expiry) || expiry <= Date.now()) throw new Error("Expired attachment URL");
  return { id: attachmentId, downloadUrl: url.toString(), expiresAt: record.expires_at, size: record.size as number };
}
