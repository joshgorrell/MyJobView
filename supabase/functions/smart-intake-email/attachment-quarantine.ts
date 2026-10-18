/** Private quarantine upload: never make pending files publicly readable. */
export async function uploadQuarantinedAttachment(
  db: { storage: { from: (bucket: string) => { upload: (path: string, body: Uint8Array, options: { contentType: string; upsert: boolean }) => Promise<{ error: { message: string } | null }> } } },
  storageKey: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[a-zA-Z0-9_-]{1,255}$/i.test(storageKey)) {
    throw new Error("Invalid quarantine storage key");
  }
  const { error } = await db.storage.from("smart-intake-quarantine").upload(storageKey, bytes, {
    contentType: "application/octet-stream",
    upsert: false,
  });
  if (error) throw new Error("Quarantine upload failed");
  void contentType; // Never trust sender-provided MIME for serving pending objects.
}
