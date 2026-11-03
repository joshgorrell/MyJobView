/**
 * Download a provider-issued signed attachment URL only from an explicitly
 * configured set of HTTPS storage hosts. Never forward the Resend API key.
 */
export async function downloadSignedAttachment(
  signedUrl: string,
  allowedHosts: readonly string[],
  maxBytes: number,
): Promise<Uint8Array> {
  const url = new URL(signedUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      url.hash || !allowedHosts.includes(url.hostname.toLowerCase()) ||
      !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 15 * 1024 * 1024) {
    throw new Error("Untrusted attachment download");
  }
  const response = await fetch(url.toString(), {
    redirect: "error",
    signal: AbortSignal.timeout(20000),
    headers: { Accept: "application/octet-stream" },
  });
  if (!response.ok || !response.body) throw new Error("Attachment download failed");
  const length = response.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
    await response.body.cancel();
    throw new Error("Attachment exceeds size limit");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("Attachment exceeds size limit");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
