/**
 * A scan result must come from a trusted scanner, not a filename, MIME type,
 * customer email, or AI classification. Until integrated, fail closed.
 */
export type ScanVerdict = "clean" | "blocked" | "failed";
export type ScanProvider = (bytes: Uint8Array) => Promise<ScanVerdict>;
export async function requireCleanScan(bytes: Uint8Array, provider?: ScanProvider): Promise<void> {
  if (!provider) throw new Error("Malware scanner is not configured");
  const verdict = await provider(bytes);
  if (verdict !== "clean") throw new Error("Attachment is not cleared for use");
}
