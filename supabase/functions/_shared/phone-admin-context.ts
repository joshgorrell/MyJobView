import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { RingCentralOAuthClient } from "./ringcentral-oauth.ts";
import { SupabaseRingCentralOAuthStore } from "./ringcentral-oauth-store.ts";
import { getRingCentralAccessToken } from "./ringcentral-token-provider.ts";
export async function phoneAdminContext(request: Request) {
  const url = Deno.env.get("SUPABASE_URL"),
    anon = Deno.env.get("SUPABASE_ANON_KEY"),
    service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) throw Error("not_configured");
  const bearer = request.headers.get("authorization");
  if (!bearer?.startsWith("Bearer ")) throw Error("unauthorized");
  const auth = createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: bearer } },
  });
  const {
    data: { user },
    error,
  } = await auth.auth.getUser();
  if (error || !user) throw Error("unauthorized");
  const db = createClient(url, service, { auth: { persistSession: false } });
  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("organization_id,role,is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (
    profileError ||
    !profile?.organization_id ||
    profile.role !== "admin" ||
    !profile.is_active
  )
    throw Error("admin_required");
  return { db, org: profile.organization_id as string, url };
}
export async function ringCentralAdminContext(request: Request) {
  const context = await phoneAdminContext(request);
  const { data: connections, error } = await context.db
    .from("ringcentral_oauth_connections")
    .select("ringcentral_account_id")
    .eq("organization_id", context.org)
    .eq("status", "connected");
  if (error || connections?.length !== 1)
    throw Error("expected_one_connected_account");
  const clientId = Deno.env.get("RINGCENTRAL_CLIENT_ID"),
    secret = Deno.env.get("RINGCENTRAL_CLIENT_SECRET"),
    key = Deno.env.get("PHONE_DISPATCHER_TOKEN_ENCRYPTION_KEY");
  if (!clientId || !secret || !key) throw Error("not_configured");
  const accountId = connections[0].ringcentral_account_id as string;
  const token = await getRingCentralAccessToken(
    new SupabaseRingCentralOAuthStore(context.db),
    new RingCentralOAuthClient(clientId, secret),
    key,
    context.org,
    accountId,
  );
  const provider = (path: string, init: RequestInit = {}) =>
    fetch("https://platform.ringcentral.com/restapi/v1.0/" + path, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        authorization: "Bearer " + token,
        accept: "application/json",
        "content-type": "application/json",
        ...init.headers,
      },
    });
  return { ...context, accountId, provider };
}
export function phoneAdminHTTP(request: Request, methods: string[]) {
  const origin = request.headers.get("origin"),
    allowed = Deno.env.get("PHONE_DISPATCHER_APP_ORIGIN");
  const cors: Record<string,string> =
    origin && allowed === origin
      ? {
          "access-control-allow-origin": allowed,
          vary: "Origin",
          "access-control-allow-headers":
            "authorization,apikey,content-type,x-client-info",
          "access-control-allow-methods": methods.join(",") + ",OPTIONS",
        }
      : {};
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        ...cors,
      },
    });
  const early =
    request.method === "OPTIONS"
      ? reply(allowed && allowed === origin ? 200 : 403, {})
      : origin && origin !== allowed
        ? reply(403, { error: "forbidden_origin" })
        : !methods.includes(request.method)
          ? reply(405, { error: "method_not_allowed" })
          : null;
  return { reply, early };
}
export function phoneAdminError(cause: unknown) {
  const code = cause instanceof Error ? cause.message : "request_failed";
  return /^[a-z0-9_]{1,100}$/.test(code) ? code : "request_failed";
}
