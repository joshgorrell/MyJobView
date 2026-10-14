/**
 * Bounded binary retrieval for inbound attachment quarantine.
 * Caller must authenticate the provider and verify the attachment belongs
 * to the previously validated message before calling this helper.
 */
export async function downloadBoundedAttachment(
  url: string,
  bearerToken: string,
  maxBytes = 15 * 1024 * 1024,
): Promise<Uint8Array> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "api.resend.com" ||
      parsed.port || parsed.username || parsed.password) {
    throw new Error("Untrusted attachment download URL");
  }
  if (!/^re_[a-zA-Z0-9_]+$/.test(bearerToken)) throw new Error("Invalid provider credential");
  const response = await fetch(parsed.toString(), {
    headers: { Authorization: `Bearer ${bearerToken}` },
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok || !response.body) throw new Error("Attachment retrieval failed");
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    await response.body.cancel();
    throw new Error("Attachment exceeds size limit");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new Error("Attachment exceeds size limit");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}
