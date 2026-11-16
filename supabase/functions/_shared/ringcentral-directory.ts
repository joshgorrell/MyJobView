/** Bounded provider discovery. Never follows URLs returned in pagination. */
export type RCRequest = (path: string, init?: RequestInit) => Promise<Response>;
export async function listRingCentralRecords(
  request: RCRequest,
  path: string,
  maxPages = 10,
): Promise<Record<string, unknown>[]> {
  const records: Record<string, unknown>[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const response = await request(
      `${path}${path.includes("?") ? "&" : "?"}page=${page}&perPage=100`,
    );
    if (!response.ok)
      throw Error(
        response.status === 403
          ? "provider_permission_required"
          : `provider_http_${response.status}`,
      );
    const body = await response.json();
    if (!Array.isArray(body.records)) throw Error("invalid_provider_records");
    records.push(...body.records);
    const total = body.paging?.totalPages;
    if (typeof total === "number" && total <= page) return records;
    if (
      !body.navigation?.nextPage &&
      (typeof total !== "number" || total <= page)
    )
      return records;
  }
  throw Error("provider_result_incomplete");
}
export function voicemailFilters(
  accountId: string,
  extensionIds: string[],
): string[] {
  if (
    !/^\d{1,32}$/.test(accountId) ||
    !extensionIds.length ||
    extensionIds.length > 100 ||
    extensionIds.some((id) => !/^\d{1,32}$/.test(id))
  )
    throw Error("invalid_mailboxes");
  return [...new Set(extensionIds)]
    .sort()
    .map(
      (id) => `/restapi/v1.0/account/${accountId}/extension/${id}/voicemail`,
    );
}
export function isManagedVoicemailSubscription(
  record: Record<string, unknown>,
  address: string,
): boolean {
  const mode = record.deliveryMode as Record<string, unknown> | undefined;
  return (
    mode?.transportType === "WebHook" &&
    mode.address === address &&
    Array.isArray(record.eventFilters) &&
    record.eventFilters.length > 0 &&
    record.eventFilters.every(
      (f) =>
        typeof f === "string" &&
        /^\/restapi\/v1\.0\/account\/(?:\d+|~)\/extension\/(?:\d+|~)\/voicemail$/.test(
          f,
        ),
    )
  );
}
