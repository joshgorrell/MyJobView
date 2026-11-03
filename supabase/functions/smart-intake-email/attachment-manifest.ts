/** Validate provider attachment metadata before any file download. */
export type AttachmentManifest = { id: string; filename: string; contentType: string };
export function parseAttachmentManifest(value: unknown): AttachmentManifest[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) return null;
  const seen = new Set<string>();
  const result: AttachmentManifest[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    const { id, filename } = record;
    const contentType = record.content_type;
    if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,255}$/.test(id) || seen.has(id)) return null;
    if (typeof filename !== "string" || !filename || filename.length > 255 || /[\\/\x00-\x1f\x7f]/.test(filename)) return null;
    if (typeof contentType !== "string" || contentType.length > 150 || !/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(contentType)) return null;
    seen.add(id);
    result.push({ id, filename, contentType });
  }
  return result;
}
