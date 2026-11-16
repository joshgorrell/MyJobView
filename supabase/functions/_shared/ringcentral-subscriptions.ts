import {
  isManagedVoicemailSubscription,
  listRingCentralRecords,
  voicemailFilters,
  type RCRequest,
} from "./ringcentral-directory.ts";
/** Touch only this MJV callback's voicemail-only subscription. Never modify foreign subscriptions. */
export async function syncVoicemailSubscription(
  provider: RCRequest,
  accountId: string,
  extensionIds: string[],
  address: string,
  verificationToken: string,
  allowCreate: boolean,
) {
  const filters = voicemailFilters(accountId, extensionIds);
  const records = await listRingCentralRecords(provider, "subscription");
  const managed = records.filter((r) =>
    isManagedVoicemailSubscription(r, address),
  );
  if (managed.length > 1)
    throw Error("multiple_managed_subscriptions_require_review");
  const match = managed[0];
  if (!match && !allowCreate) throw Error("subscription_missing");
  if (match && !/^[-a-zA-Z0-9]{1,128}$/.test(String(match.id)))
    throw Error("invalid_subscription_id");
  const path = match ? "subscription/" + match.id : "subscription";
  const response = await provider(path, {
    method: match ? "PUT" : "POST",
    body: JSON.stringify({
      eventFilters: filters,
      expiresIn: 604800,
      deliveryMode: { transportType: "WebHook", address, verificationToken },
    }),
  });
  if (!response.ok) throw Error(`subscription_http_${response.status}`);
  const result = await response.json();
  return {
    status: match ? "renewed" : "created",
    expiration_time: result.expirationTime ?? null,
    mailboxes: filters.length,
  };
}
