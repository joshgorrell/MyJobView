/**
 * Compute a content checksum for duplicate detection after successful download.
 * This helper does not mark a file safe: malware scanning remains mandatory.
 */
export async function attachmentSha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
